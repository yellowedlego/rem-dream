import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { callModel, ModelCallError, type ChatTurn } from "@/lib/model/client";
import { buildChatSystemPrompt } from "@/lib/prompts/safety";
import { BASIC_PERSONA } from "@/lib/prompts/profile";
import { searchWiki, wikiContext } from "@/lib/profile/build";

const MAX_MESSAGE_CHARS = 1000;
const HISTORY_TURNS = 6;

/** 앞선 비교 대화(화면이 들고 있다)를 모델 기록 모양으로. 이상한 값은 버린다 */
function turns(x: unknown): ChatTurn[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "model") && typeof t.text === "string")
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, text: t.text.slice(0, 1500) }));
}

/**
 * 같은 말을 "기본 AI"와 "내 AI"에게 동시에 보낸다. 둘 다 이 세션의 이전 대화 기록은 받지 않는다:
 * 내 AI가 나를 아는 것은 오직 사전 프롬프트(+ 이번 말로 찾은 위키 칸) 덕분이라는 것을 보여 주기 위해.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => null)) as
    | { message?: unknown; history?: { basic?: unknown; personal?: unknown } }
    | null;
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (body.message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: `메시지는 ${MAX_MESSAGE_CHARS}자까지 보낼 수 있어요.` }, { status: 413 });
  }
  const store = await readStore();
  const profile = (store.profiles ?? []).find((p) => p.id === id);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const hits = searchWiki(profile.wiki, body.message);
  const personalSystem = buildChatSystemPrompt([profile.prompt, wikiContext(hits)].filter(Boolean).join("\n\n"));
  try {
    const [basic, personal] = await Promise.all([
      callModel({
        prompt: body.message,
        systemInstruction: buildChatSystemPrompt(BASIC_PERSONA),
        history: turns(body.history?.basic),
        temperature: 0.8,
        purpose: "compare",
      }),
      callModel({
        prompt: body.message,
        systemInstruction: personalSystem,
        history: turns(body.history?.personal),
        temperature: 0.8,
        purpose: "compare",
      }),
    ]);
    return NextResponse.json({ basic: basic.text, personal: personal.text, looked: hits.map((h) => h.entry.id) });
  } catch (err) {
    console.error("[/api/profiles/compare] model failure:", err instanceof ModelCallError ? err.detail : err);
    const msg = err instanceof ModelCallError ? err.message : "모델 응답을 받지 못했어요.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
