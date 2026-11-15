import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

interface ModeRequestBody {
  sessionId?: unknown;
  mode?: unknown;
}

export async function POST(req: Request) {
  let body: ModeRequestBody;
  try {
    body = (await req.json()) as ModeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
  }

  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const validModes = ["personal", "school"];
  if (typeof body.mode !== "string" || !validModes.includes(body.mode)) {
    return NextResponse.json({ error: "mode must be 'personal' or 'school'" }, { status: 400 });
  }

  const sessionId = body.sessionId.trim();
  const mode = body.mode as "personal" | "school";

  await updateStore((store) => {
    if (!store.sessionModes) store.sessionModes = {};
    store.sessionModes[sessionId] = mode;
  });

  return NextResponse.json({ ok: true, sessionId, mode }, { status: 200 });
}
