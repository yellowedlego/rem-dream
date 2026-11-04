import { NextResponse } from "next/server";
import { readStore, addNode, getActivePersona } from "@/lib/store";
import { callModel } from "@/lib/model/client";


interface ChatRequestBody {
  sessionId?: unknown;
  message?: unknown;
  model?: unknown;
}

export async function POST(req: Request) {
  // 1. JSON parsing edge-case guard
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Request body must be a valid JSON object" },
      { status: 400 }
    );
  }

  // 2. Field validation: sessionId
  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }
  const sessionId = body.sessionId.trim();

  // 3. Field validation: message
  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json(
      { error: "message is required and cannot be empty" },
      { status: 400 }
    );
  }
  const message = body.message; // Preserve original spacing/content per test requirements

  // 4. Read store for REM concurrency check and active persona resolution
  const store = await readStore();

  // 5. REM concurrency check: 409 Conflict if REM is in progress
  const isRemRunning = store.runs?.some(
    (r) => r.status === "running" && (!r.sessionId || r.sessionId === sessionId)
  );
  if (isRemRunning) {
    return NextResponse.json(
      { error: "REM is in progress. Input is blocked." },
      { status: 409 }
    );
  }

  // 6. Resolve active persona system prompt
  const activePersona = await getActivePersona(store);
  const systemInstruction = activePersona.systemPrompt;

  // 7. Invoke model client
  let modelResponseText: string;
  try {
    const modelRes = await callModel({
      prompt: message,
      systemInstruction,
      purpose: "chat",
      ...(typeof body.model === "string" && body.model.trim()
        ? { model: body.model.trim() }
        : {}),
    });
    modelResponseText = modelRes.text;
  } catch (err) {
    console.error("[/api/chat] callModel failure:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Model call failed" },
      { status: 500 }
    );
  }

  // 8. Atomically persist MemoryNode in runtime store
  try {
    const node = await addNode(sessionId, message, modelResponseText);
    return NextResponse.json({ node }, { status: 200 });
  } catch (err) {
    console.error("[/api/chat] addNode failure:", err);
    return NextResponse.json(
      { error: "Failed to persist memory node" },
      { status: 500 }
    );
  }
}
