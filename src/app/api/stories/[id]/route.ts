import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";
import { deleteImages } from "@/lib/uploads";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);

  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid story ID" }, { status: 400 });
  }

  let imageIds: string[] = [];
  const result = await updateStore((store) => {
    if (!Array.isArray(store.stories)) {
      store.stories = [];
    }

    const storyIndex = store.stories.findIndex((s) => s.id === numId);
    if (storyIndex === -1) {
      return { found: false };
    }

    const story = store.stories[storyIndex];
    const nodeIdsToDelete = new Set(story.nodeIds || []);

    // Also include any nodes that reference this storyId
    for (const node of store.nodes) {
      if (node.storyId === numId) {
        nodeIdsToDelete.add(node.id);
      }
    }

    // Remove the story
    store.stories.splice(storyIndex, 1);

    // Cascade delete associated nodes (노드에 붙은 이미지 파일도 같이 지운다)
    imageIds = store.nodes
      .filter((n) => nodeIdsToDelete.has(n.id))
      .flatMap((n) => (n.images ?? []).map((i) => i.id));
    store.nodes = store.nodes.filter((n) => !nodeIdsToDelete.has(n.id));

    // Remove deleted node IDs from insight sourceNodeIds
    for (const insight of store.insights) {
      if (insight.sourceNodeIds) {
        insight.sourceNodeIds = insight.sourceNodeIds.filter(
          (nid) => !nodeIdsToDelete.has(nid)
        );
      }
    }

    // 이 이야기에서 나온 의미 파일도 지운다
    if (Array.isArray(store.meanings)) {
      store.meanings = store.meanings.filter((m) => m.storyId !== numId);
    }

    return { found: true };
  });

  if (!result.found) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  await deleteImages(imageIds);

  return NextResponse.json({ ok: true }, { status: 200 });
}
