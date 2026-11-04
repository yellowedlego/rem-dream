import { NextResponse } from "next/server";
import { withStore } from "../_lib/mockStore";

// GET /api-mock/nodes?sessionId=&q=&limit=
// q는 세션 번호·유저 입력·AI 답변·주제에 부분 일치(대소문자 무시). sessionId를 안 주면 전체.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const sessionId = sp.get("sessionId")?.trim() || null;
  const q = sp.get("q")?.trim().toLowerCase() || "";
  const limit = Math.min(Number(sp.get("limit")) || 500, 500);

  const nodes = await withStore((s) =>
    s.nodes
      .filter((n) => (sessionId ? n.sessionId === sessionId : true))
      .filter((n) =>
        q
          ? [n.sessionId, n.user, n.ai, n.topic ?? "", `#${n.id}`].some((f) => f.toLowerCase().includes(q))
          : true,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      .slice(0, limit),
  );
  return NextResponse.json({ nodes });
}
