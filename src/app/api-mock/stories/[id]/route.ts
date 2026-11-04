import { NextResponse } from "next/server";
import { withStore } from "../../_lib/mockStore";

// DELETE /api-mock/stories/[id] — 이야기와 거기서 나온 노드를 함께 삭제
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const removed = await withStore((s) => {
    const story = (s.stories ?? []).find((x) => x.id === id);
    if (!story) return null;
    const gone = new Set(s.nodes.filter((n) => n.storyId === id).map((n) => n.id));
    s.nodes = s.nodes.filter((n) => n.storyId !== id);
    s.stories = (s.stories ?? []).filter((x) => x.id !== id);
    for (const i of s.insights) i.sourceNodeIds = i.sourceNodeIds.filter((x) => !gone.has(x));
    return gone.size;
  }, true);
  if (removed === null) return NextResponse.json({ error: "그런 이야기가 없어요." }, { status: 404 });
  return NextResponse.json({ ok: true, removedNodes: removed });
}
