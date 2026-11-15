import { NextResponse } from "next/server";
import { decideProposal, PersonaApplyError } from "@/lib/persona/apply";
import { PersonaError } from "@/lib/persona";

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

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid decision payload" }, { status: 400 });
    }

    const result = await decideProposal(numId, {
      approve: Array.isArray(body.approve) ? body.approve : undefined,
      reject: Array.isArray(body.reject) ? body.reject : undefined,
      scope: body.scope,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaApplyError || err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/proposals/[id]/decide] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
