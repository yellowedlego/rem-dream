import { NextResponse } from "next/server";
import { readStore, updateStore } from "@/lib/store";
import { getMode } from "@/lib/rem/registry";
import { startRemRun } from "@/lib/rem/runner";
import type { RemModeId, RemRun } from "@/lib/types";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, mode, temperature } = body;

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  if (!mode || typeof mode !== "string") {
    return NextResponse.json({ error: "mode is required" }, { status: 400 });
  }

  const registeredMode = getMode(mode as RemModeId);
  if (!registeredMode) {
    return NextResponse.json(
      { error: `Invalid or unsupported REM mode: ${mode}` },
      { status: 400 }
    );
  }

  const trimmedSessionId = sessionId.trim();
  const store = await readStore();

  // Concurrency check: 409 Conflict if active run exists for this session or globally
  const isRunning = store.runs?.some(
    (r) =>
      r.status === "running" &&
      (!r.sessionId || r.sessionId === trimmedSessionId)
  );
  if (isRunning) {
    return NextResponse.json(
      { error: "A REM run is already in progress for this session." },
      { status: 409 }
    );
  }

  // Precondition: At least 1 memory node required
  const sessionNodes = (store.nodes || []).filter(
    (n) => n.sessionId === trimmedSessionId
  );
  if (sessionNodes.length === 0) {
    return NextResponse.json(
      { error: "At least 1 memory node is required to start REM." },
      { status: 422 }
    );
  }

  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const run: RemRun = {
    id: runId,
    sessionId: trimmedSessionId,
    mode: mode as RemModeId,
    temperature:
      typeof temperature === "number"
        ? temperature
        : registeredMode.defaultTemperature,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentNodeIds: [],
    insightIds: [],
    proposalId: null,
    error: null,
  };

  await updateStore((s) => {
    if (!Array.isArray(s.runs)) {
      s.runs = [];
    }
    s.runs.push(run);
  });

  // Launch asynchronous execution
  startRemRun(run);

  return NextResponse.json({ runId }, { status: 202 });
}
