import { NextResponse } from "next/server";
import { connection } from "next/server";
import { withStore } from "../_lib/mockStore";

// GET /api-mock/state → 통찰·인격 버전·이야기·개수 (디버그 화면용. 노드 본문은 /nodes로 따로 받는다)
export async function GET() {
  await connection();
  const state = await withStore((s) => ({
    nodeCount: s.nodes.length,
    insights: s.insights,
    personas: s.personas,
    activePersona: s.activePersona,
    stories: (s.stories ?? []).map(({ rawText, ...rest }) => ({ ...rest, chars: rawText.length })),
  }));
  return NextResponse.json(state);
}
