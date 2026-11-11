import { NextResponse } from "next/server";
import { approveProposal, PersonaError } from "@/lib/persona";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId) || String(numId) !== id || numId <= 0) {
      return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
    }

    const result = await approveProposal(numId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/proposals/[id]/approve] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
