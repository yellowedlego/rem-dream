import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await ctx.params;

  if (!sessionId || !sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const targetSessionId = sessionId.trim();

  await updateStore((store) => {
    // 1. Identify all node IDs belonging to this session
    const sessionNodeIds = new Set(
      store.nodes.filter((n) => n.sessionId === targetSessionId).map((n) => n.id)
    );

    // 2. Identify all run IDs belonging to this session
    const sessionRunIds = new Set(
      (store.runs || []).filter((r) => r.sessionId === targetSessionId).map((r) => r.id)
    );

    // 3. Delete nodes for this session
    store.nodes = store.nodes.filter((n) => n.sessionId !== targetSessionId);

    // 4. Delete stories for this session
    if (Array.isArray(store.stories)) {
      store.stories = store.stories.filter((s) => s.sessionId !== targetSessionId);
    }

    // 5. Delete insights belonging to this session (linked via runId or sourceNodeIds)
    const sessionRunInsightIds = new Set(
      (store.runs || [])
        .filter((r) => r.sessionId === targetSessionId)
        .flatMap((r) => r.insightIds || [])
    );

    store.insights = store.insights.filter((i) => {
      if (sessionRunInsightIds.has(i.id)) return false;
      // If all source nodes belonged to this session, drop the insight
      const hasRemainingSourceNode = i.sourceNodeIds.some((nid) => !sessionNodeIds.has(nid));
      if (!hasRemainingSourceNode && i.sourceNodeIds.length > 0) return false;
      // Clean up deleted node IDs from remaining insights
      i.sourceNodeIds = i.sourceNodeIds.filter((nid) => !sessionNodeIds.has(nid));
      return true;
    });

    // 6. Delete proposals belonging to this session
    if (Array.isArray(store.proposals)) {
      store.proposals = store.proposals.filter((p) => !sessionRunIds.has(p.runId));
    }

    // 7. Delete runs belonging to this session
    if (Array.isArray(store.runs)) {
      store.runs = store.runs.filter((r) => r.sessionId !== targetSessionId);
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
