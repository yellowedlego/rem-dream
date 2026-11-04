import { NextResponse } from "next/server";
import { readStore, addNode, getActivePersona } from "@/lib/store";
import { callModel, ModelCallError, type ChatTurn } from "@/lib/model/client";
import { buildChatSystemPrompt } from "@/lib/prompts/safety";

/** 한 번에 보낼 수 있는 글자 수 (docs/backend-plan.md 10절: 관람객 장난 입력 대비) */
const MAX_MESSAGE_CHARS = 2000;
/** 모델에 함께 넣는 같은 세션의 최근 대화 수 (docs/prompts.md 1절) */
const HISTORY_NODES = 10;

interface ChatRequestBody {
  sessionId?: unknown;
  message?: unknown;
  model?: unknown;
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

  // 3. Field validation: message
  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "message is required and cannot be empty" }, { status: 400 });
  }
  const message = body.message; // Preserve original spacing/content per test requirements
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
      { role: "user", text: n.user },
      { role: "model", text: n.ai },
    ]);

  // 8. Invoke model client
  let modelResponseText: string;
  try {
    const modelRes = await callModel({
      prompt: message,
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

  // 9. Atomically persist MemoryNode in runtime store
  try {
    const node = await addNode(sessionId, message, modelResponseText);
    return NextResponse.json({ node }, { status: 200 });
  } catch (err) {
    console.error("[/api/chat] addNode failure:", err);
    return NextResponse.json({ error: "Failed to persist memory node" }, { status: 500 });
  }
}
