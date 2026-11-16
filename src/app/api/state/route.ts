import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { resolvePersona, sessionScope } from "@/lib/persona";

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
      (store.runs || []).filter((r) => r.sessionId === sessionId).map((r) => r.id)
    );
    const sessionRunInsightIds = new Set(
      (store.runs || [])
        .filter((r) => r.sessionId === sessionId)
        .flatMap((r) => r.insightIds)
    );

    insights = (store.insights || []).filter(
      (i) =>
        sessionRunInsightIds.has(i.id) ||
        i.sourceNodeIds.some((id) => sessionNodeIds.has(id))
    );

    proposals = (store.proposals ?? []).filter((p) =>
      sessionRunIds.has(p.runId)
    );
  }

  // 5-1. Stories and meanings
  const stories = (
    sessionId
      ? (store.stories ?? []).filter((s) => s.sessionId === sessionId)
      : store.stories ?? []
  ).map(({ rawText, ...rest }) => ({ ...rest, length: rawText.length }));

  const meanings = sessionId
    ? (store.meanings ?? []).filter((m) => m.sessionId === sessionId)
    : store.meanings ?? [];

  // 6. Resolve active run (status: "running" for this session or globally)
  const activeRun =
    store.runs?.find(
      (r) =>
        r.status === "running" && (!sessionId || r.sessionId === sessionId)
    ) ?? null;

  // 7. Active persona object
  const persona = resolvePersona(store, sessionId ? sessionScope(sessionId) : null);

  // 8. remSuggest calculation
  const sessionRuns = sessionId
    ? (store.runs ?? []).filter((r) => r.sessionId === sessionId)
    : store.runs ?? [];

  const lastRun =
    sessionRuns.length > 0
      ? sessionRuns.reduce(
          (latest, r) =>
            new Date(r.startedAt) > new Date(latest.startedAt) ? r : latest,
          sessionRuns[0]
        )
      : null;

  const threshold = Number(process.env.REM_SUGGEST_THRESHOLD ?? 5);
  const unanalyzedCount = lastRun
    ? nodes.filter((n) => new Date(n.createdAt) > new Date(lastRun.startedAt))
        .length
    : nodes.length;

  const remSuggest = unanalyzedCount >= threshold;

  // 9. Return unified state
  return NextResponse.json(
    {
      nodes,
      insights,
      personas: store.personas,
      proposals,
      // 세션을 주면 그 관람객이 지금 쓰는 인격 버전, 안 주면 기본 인격 버전
      activePersona: sessionId ? persona.version : store.activePersona,
      defaultPersona: store.activePersona,
      persona,
      activeRun,
      run: activeRun,
      stories,
      meanings,
      // 다른 관람객의 전후 답은 보이지 않게 그 세션의 실행 것만
      comparisons: sessionId
        ? (store.comparisons ?? []).filter((c) => sessionRuns.some((r) => r.id === c.runId))
        : store.comparisons ?? [],
      remSuggest,
      mode: (sessionId && store.sessionModes?.[sessionId]) || "personal",
    },
    { status: 200 }
  );
}
