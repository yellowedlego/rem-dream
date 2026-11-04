import { NextResponse } from "next/server";
import { withStore } from "../../_lib/mockStore";

// DELETE /api-mock/nodes/[id] — 노드 하나 삭제. 그 노드를 근거로 한 통찰은 남기고 근거 번호에서만 뺀다.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const found = await withStore((s) => {
    const idx = s.nodes.findIndex((n) => n.id === id);
    if (idx < 0) return false;
    s.nodes.splice(idx, 1);
    for (const i of s.insights) i.sourceNodeIds = i.sourceNodeIds.filter((x) => x !== id);
    for (const st of s.stories ?? []) st.nodeIds = st.nodeIds.filter((x) => x !== id);
    return true;
  }, true);
  if (!found) return NextResponse.json({ error: "그런 노드가 없어요." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
