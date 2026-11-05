import { NextResponse } from "next/server";
import { readStore, addNode, getActivePersona } from "@/lib/store";
import { callModel, ModelCallError, type ChatTurn } from "@/lib/model/client";
import { buildChatSystemPrompt } from "@/lib/prompts/safety";
import { PHOTO_ONLY_TEXT, checkImages } from "@/lib/images";
import { deleteImages, saveImages } from "@/lib/uploads";

/** 한 번에 보낼 수 있는 글자 수 (docs/backend-plan.md 10절: 관람객 장난 입력 대비) */
const MAX_MESSAGE_CHARS = 2000;
/** 모델에 함께 넣는 같은 세션의 최근 대화 수 (docs/prompts.md 1절) */
const HISTORY_NODES = 10;

interface ChatRequestBody {
  sessionId?: unknown;
  message?: unknown;
  model?: unknown;
  /** 첨부 이미지 [{ mimeType, data(base64) }] (최대 4장). 이미지가 있으면 message는 비어 있어도 된다 */
  images?: unknown;
}

export async function POST(req: Request) {
  // 1. JSON parsing edge-case guard
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
  }

  // 2. Field validation: sessionId
  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  const sessionId = body.sessionId.trim();

  // 3. 첨부 이미지 검사 (장 수·크기·실제 파일 모양)
  const checked = checkImages(body.images);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const incoming = checked.images;

  // 4. Field validation: message (사진이 있으면 글이 없어도 된다)
  const hasText = typeof body.message === "string" && body.message.trim().length > 0;
  if (!hasText && incoming.length === 0) {
    return NextResponse.json({ error: "message is required and cannot be empty" }, { status: 400 });
  }
  if (body.message !== undefined && body.message !== null && typeof body.message !== "string") {
    return NextResponse.json({ error: "message must be a string" }, { status: 400 });
  }
  const message = hasText ? (body.message as string) : PHOTO_ONLY_TEXT; // Preserve original spacing/content per test requirements
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `메시지는 ${MAX_MESSAGE_CHARS.toLocaleString()}자까지 보낼 수 있어요.` },
      { status: 413 },
    );
  }

  // 4. Read store for REM concurrency check and active persona resolution
  const store = await readStore();

  // 5. REM concurrency check: 409 Conflict if REM is in progress
  const isRemRunning = store.runs?.some(
    (r) => r.status === "running" && (!r.sessionId || r.sessionId === sessionId),
  );
  if (isRemRunning) {
    return NextResponse.json({ error: "REM is in progress. Input is blocked." }, { status: 409 });
  }

  // 6. 시스템 프롬프트 = 고정 안전 규칙 + 지금 쓰는 인격
  const activePersona = await getActivePersona(store);
  const systemInstruction = buildChatSystemPrompt(activePersona.systemPrompt);

  // 7. 같은 세션의 최근 대화를 기록으로 넣어 앞의 이야기를 기억하게 한다
  const history: ChatTurn[] = store.nodes
    .filter((n) => n.sessionId === sessionId)
    .sort((a, b) => a.order - b.order)
    .slice(-HISTORY_NODES)
    .flatMap((n): ChatTurn[] => [
      // 앞선 대화의 사진은 다시 보내지 않고(비용·속도) 보냈다는 사실만 글로 남긴다
      { role: "user", text: n.images?.length ? `${n.user} [사진 ${n.images.length}장을 함께 보냄]` : n.user },
      { role: "model", text: n.ai },
    ]);

  // 8. Invoke model client
  let modelResponseText: string;
  try {
    const modelRes = await callModel({
      prompt: hasText ? message : "(글 없이 사진만 보냈어요. 사진에 대해 짧게 반응해 주세요.)",
      images: incoming.map((i) => ({ mimeType: i.mimeType, data: i.data })),
      systemInstruction,
      history,
      temperature: 0.8,
      purpose: "chat",
      ...(typeof body.model === "string" && body.model.trim() ? { model: body.model.trim() } : {}),
    });
    modelResponseText = modelRes.text;
  } catch (err) {
    // 원문 오류는 ModelCall.error와 서버 로그에만 남기고, 화면에는 짧은 문장만 돌려준다
    console.error("[/api/chat] callModel failure:", err instanceof ModelCallError ? err.detail : err);
    const msg = err instanceof ModelCallError ? err.message : "모델 응답을 받지 못했어요.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 9. 모델 답을 받은 뒤에만 이미지를 파일로 저장하고 MemoryNode에 적는다 (실패한 대화에 파일이 남지 않게)
  let savedIds: string[] = [];
  try {
    const refs = await saveImages(incoming);
    savedIds = refs.map((r) => r.id);
    const node = await addNode(sessionId, message, modelResponseText, refs);
    return NextResponse.json({ node }, { status: 200 });
  } catch (err) {
    await deleteImages(savedIds);
    console.error("[/api/chat] persist failure:", err);
    return NextResponse.json({ error: "Failed to persist memory node" }, { status: 500 });
  }
}
