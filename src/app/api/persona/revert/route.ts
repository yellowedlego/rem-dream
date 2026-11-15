import { NextResponse } from "next/server";
import { revertPersona, PersonaError } from "@/lib/persona";

interface RevertRequestBody {
  version?: unknown;
}

export async function POST(req: Request) {
  let body: RevertRequestBody;
  try {
    body = (await req.json()) as RevertRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
  }

  if (
    body.version === undefined ||
    body.version === null ||
    typeof body.version !== "number" ||
    Number.isNaN(body.version) ||
    !Number.isInteger(body.version) ||
    body.version <= 0
  ) {
    return NextResponse.json({ error: "Valid version number is required" }, { status: 400 });
  }

  try {
    const result = await revertPersona(body.version);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/persona/revert] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
