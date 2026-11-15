import { NextResponse } from "next/server";
import { resetSession, PersonaError } from "@/lib/persona";

interface ResetRequestBody {
  sessionId?: unknown;
}

export async function POST(req: Request) {
  let body: ResetRequestBody;
  try {
    body = (await req.json()) as ResetRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
  }

  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const result = await resetSession(body.sessionId.trim());
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/session/reset] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
