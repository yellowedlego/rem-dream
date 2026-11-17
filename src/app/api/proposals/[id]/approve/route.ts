import { NextResponse } from "next/server";
import { approveProposal, PersonaError } from "@/lib/persona";
import { PersonaApplyError } from "@/lib/persona/apply";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId) || String(numId) !== id || numId <= 0) {
      return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
    }

    let scope: Parameters<typeof approveProposal>[1] = undefined;
    try {
      const body = await req.json();
      if (body && body.scope) {
        scope = body.scope;
      }
    } catch {}

    const result = await approveProposal(numId, scope);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError || err instanceof PersonaApplyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/proposals/[id]/approve] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
