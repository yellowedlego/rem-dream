import { NextResponse } from "next/server";
import { withStore } from "../../_lib/mockStore";

// DELETE /api-mock/insights/[id] — 통찰 하나 삭제 (디버그용)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const found = await withStore((s) => {
    const idx = s.insights.findIndex((i) => i.id === id);
    if (idx < 0) return false;
    s.insights.splice(idx, 1);
    return true;
  }, true);
  if (!found) return NextResponse.json({ error: "그런 통찰이 없어요." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
