import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

interface LegacyCallFields {
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  success?: boolean | null;
}

export async function GET() {
  await connection();
  const store = await readStore();
  const calls = store.calls ?? [];

  const callsCount = calls.length;

  const totalInputTokens = calls.reduce((sum, c) => {
    if (typeof c.inputTokens === "number") {
      return sum + c.inputTokens;
    }
    const legacy = c as unknown as LegacyCallFields;
    if (typeof legacy.promptTokens === "number") {
      return sum + legacy.promptTokens;
    }
    return sum;
  }, 0);

  const totalOutputTokens = calls.reduce((sum, c) => {
    if (typeof c.outputTokens === "number") {
      return sum + c.outputTokens;
    }
    const legacy = c as unknown as LegacyCallFields;
    if (typeof legacy.completionTokens === "number") {
      return sum + legacy.completionTokens;
    }
    return sum;
  }, 0);

  const totalTokens = totalInputTokens + totalOutputTokens;

  const totalDurationMs = calls.reduce((sum, c) => {
    if (typeof c.ms === "number") {
      return sum + c.ms;
    }
    const legacy = c as unknown as LegacyCallFields;
    if (typeof legacy.durationMs === "number") {
      return sum + legacy.durationMs;
    }
    return sum;
  }, 0);

  const averageLatencyMs =
    callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount);

  const errorCount = calls.reduce((count, c) => {
    const legacy = c as unknown as LegacyCallFields;
    const isError = Boolean(c.error) || legacy.success === false;
    return count + (isError ? 1 : 0);
  }, 0);

  const metrics = {
    nodesCount: store.nodes?.length ?? 0,
    insightsCount: store.insights?.length ?? 0,
    proposalsCount: store.proposals?.length ?? 0,
    runsCount: store.runs?.length ?? 0,
    callsCount,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    averageLatencyMs,
    errorCount,
    // Alias fields for backward compatibility and alternative specifications
    totalPromptTokens: totalInputTokens,
    totalCompletionTokens: totalOutputTokens,
  };

  return NextResponse.json(metrics, { status: 200 });
}
