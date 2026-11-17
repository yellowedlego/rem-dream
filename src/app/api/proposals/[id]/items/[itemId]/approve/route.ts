import { NextResponse } from "next/server";
import { approveProposalItem, PersonaApplyError } from "@/lib/persona/apply";
import { PersonaError } from "@/lib/persona";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await ctx.params;
    const numId = parseInt(id, 10);
    const numItemId = parseInt(itemId, 10);

    if (Number.isNaN(numId) || String(numId) !== id || numId <= 0) {
      return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
    }
    if (Number.isNaN(numItemId) || String(numItemId) !== itemId || numItemId <= 0) {
      return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
    }

    let scope: Parameters<typeof approveProposalItem>[2] = undefined;
    try {
      const body = await req.json();
      if (body && body.scope) {
        scope = body.scope;
      }
    } catch {}

    const result = await approveProposalItem(numId, numItemId, scope);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaApplyError || err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/proposals/[id]/items/[itemId]/approve] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
