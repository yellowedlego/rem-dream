import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);

  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid insight ID" }, { status: 400 });
  }

  const result = await updateStore((store) => {
    const insightIndex = store.insights.findIndex((i) => i.id === numId);
    if (insightIndex === -1) {
      return { found: false };
    }

    // Remove the insight
    store.insights.splice(insightIndex, 1);

    // Clean up references to this insight ID in proposals
    if (Array.isArray(store.proposals)) {
      for (const proposal of store.proposals) {
        if (proposal.sourceInsightIds && proposal.sourceInsightIds.includes(numId)) {
          proposal.sourceInsightIds = proposal.sourceInsightIds.filter((iid) => iid !== numId);
        }
      }
    }

    // Clean up references to this insight ID in personas
    if (Array.isArray(store.personas)) {
      for (const persona of store.personas) {
        if (persona.sourceInsightIds && persona.sourceInsightIds.includes(numId)) {
          persona.sourceInsightIds = persona.sourceInsightIds.filter((iid) => iid !== numId);
        }
      }
    }

    // Clean up references to this insight ID in runs
    if (Array.isArray(store.runs)) {
      for (const run of store.runs) {
        if (run.insightIds && run.insightIds.includes(numId)) {
          run.insightIds = run.insightIds.filter((iid) => iid !== numId);
        }
      }
    }

    return { found: true };
  });

  if (!result.found) {
    return NextResponse.json({ error: "Insight not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
