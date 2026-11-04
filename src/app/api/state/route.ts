import { connection } from "next/server";
import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";


export async function GET(req: Request) {
  // 1. Next.js 16 cache compliance: assert request-time dynamic execution
  await connection();

  // 2. Parse query parameters
  const { searchParams } = new URL(req.url);
  const rawSessionId = searchParams.get("sessionId");
  const sessionId = rawSessionId?.trim() || null;

  // 3. Read runtime store
  const store = await readStore();

  // 4. Session filtering for nodes
  const nodes = sessionId
    ? store.nodes.filter((n) => n.sessionId === sessionId)
    : store.nodes;

  // 5. Session filtering for insights & proposals
  let insights = store.insights;
  let proposals = store.proposals ?? [];

  if (sessionId) {
    const sessionNodeIds = new Set(nodes.map((n) => n.id));
    const sessionRunIds = new Set(
      store.runs.filter((r) => r.sessionId === sessionId).map((r) => r.id)
    );
    const sessionRunInsightIds = new Set(
      store.runs
        .filter((r) => r.sessionId === sessionId)
        .flatMap((r) => r.insightIds)
    );

    insights = store.insights.filter(
      (i) =>
        sessionRunInsightIds.has(i.id) ||
        i.sourceNodeIds.some((id) => sessionNodeIds.has(id))
    );

    proposals = (store.proposals ?? []).filter((p) =>
      sessionRunIds.has(p.runId)
    );
  }

  // 6. Resolve active run (status: "running" for this session or globally)
  const activeRun =
    store.runs?.find(
      (r) =>
        r.status === "running" && (!sessionId || r.sessionId === sessionId)
    ) ?? null;

  // 7. Return unified state
  return NextResponse.json(
    {
      nodes,
      insights,
      personas: store.personas,
      proposals,
      activePersona: store.activePersona,
      activeRun,
    },
    { status: 200 }
  );
}
