import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);

  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid node ID" }, { status: 400 });
  }

  const result = await updateStore((store) => {
    const nodeIndex = store.nodes.findIndex((n) => n.id === numId);
    if (nodeIndex === -1) {
      return { found: false };
    }

    // Remove the node from nodes list
    store.nodes.splice(nodeIndex, 1);

    // Remove node ID from any insights' sourceNodeIds
    for (const insight of store.insights) {
      if (insight.sourceNodeIds && insight.sourceNodeIds.includes(numId)) {
        insight.sourceNodeIds = insight.sourceNodeIds.filter((nid) => nid !== numId);
      }
    }

    // Remove node ID from any story's nodeIds
    if (Array.isArray(store.stories)) {
      for (const story of store.stories) {
        if (story.nodeIds && story.nodeIds.includes(numId)) {
          story.nodeIds = story.nodeIds.filter((nid) => nid !== numId);
        }
      }
    }

    return { found: true };
  });

  if (!result.found) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
