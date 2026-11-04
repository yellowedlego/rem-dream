import { NextResponse } from "next/server";
import { withStore } from "../../_lib/mockStore";

// DELETE /api-mock/sessions/[sessionId] — 세션 통째 삭제 (노드·이 노드를 근거로 한 통찰 근거·이야기)
export async function DELETE(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const sessionId = decodeURIComponent((await params).sessionId);
  const removed = await withStore((s) => {
    const gone = new Set(s.nodes.filter((n) => n.sessionId === sessionId).map((n) => n.id));
    if (gone.size === 0 && !(s.stories ?? []).some((x) => x.sessionId === sessionId)) return null;
    s.nodes = s.nodes.filter((n) => n.sessionId !== sessionId);
    s.stories = (s.stories ?? []).filter((x) => x.sessionId !== sessionId);
    for (const i of s.insights) i.sourceNodeIds = i.sourceNodeIds.filter((x) => !gone.has(x));
    return gone.size;
  }, true);
  if (removed === null) return NextResponse.json({ error: "그런 세션이 없어요." }, { status: 404 });
  return NextResponse.json({ ok: true, removedNodes: removed });
}
