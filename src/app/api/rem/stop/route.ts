import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { stopRemRun } from "@/lib/rem/runner";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { runId } = body;

  if (!runId || typeof runId !== "string" || !runId.trim()) {
    return NextResponse.json(
      { error: "runId is required" },
      { status: 400 }
    );
  }

  const trimmedRunId = runId.trim();
  const store = await readStore();
  const run = store.runs?.find((r) => r.id === trimmedRunId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  await stopRemRun(trimmedRunId);

  return NextResponse.json({ ok: true }, { status: 200 });
}
