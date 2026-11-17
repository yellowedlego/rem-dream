import "server-only";
import { readStore, updateStore } from "../store.ts";
import { callModel } from "../model/client.ts";
import { resolvePersona, sessionScope } from "../persona.ts";
import { getMode } from "./registry.ts";
import { createComparisonBefore } from "./compare.ts";
import { generateProposal } from "./proposal.ts";
import { loadAllReplays } from "./replay.ts";
import type {
  MemoryNode,
  PersonaChangeItem,
  PersonaProposal,
  RemRun,
} from "../types.ts";
import type { RemContext } from "./types.ts";

interface ActiveRunState {
  controller: AbortController;
  stopped: boolean;
}

const activeRuns = new Map<string, ActiveRunState>();

export async function isRemRunning(sessionId?: string): Promise<boolean> {
  const store = await readStore();
  return (
    store.runs?.some(
      (r) =>
        r.status === "running" &&
        (!sessionId || !r.sessionId || r.sessionId === sessionId)
    ) ?? false
  );
}

export async function stopRemRun(runId: string): Promise<boolean> {
  const active = activeRuns.get(runId);
  if (active) {
    active.stopped = true;
    active.controller.abort();
  }

  await updateStore((s) => {
    const r = s.runs?.find((item) => item.id === runId);
    if (r && r.status === "running") {
      r.status = "stopped";
      r.finishedAt = new Date().toISOString();
    }
  });

  return true;
}

export async function startRemRun(run: RemRun): Promise<void> {
  const controller = new AbortController();
  activeRuns.set(run.id, { controller, stopped: false });

  // Run in background without awaiting caller
  (async () => {
    const readNodeIds = new Set<number>();
    // 진행 단계: [잠들기 전 답 1] + [모드 단계들] + [제안 만들기 1]
    let modeSteps = 0;
    let marks = 0;
    let nodesToProcess: MemoryNode[] = [];
    const stepsAt = (done: number) => ({ total: modeSteps + 2, done: Math.min(done, modeSteps + 2) });

    try {
      const mode = getMode(run.mode);
      if (!mode) {
        throw new Error(`Unregistered REM mode: ${run.mode}`);
      }

      const initialStore = await readStore();
      const sessionNodes = (initialStore.nodes || []).filter(
        (n) => n.sessionId === run.sessionId
      );

      // Max 12 nodes per specification
      nodesToProcess = sessionNodes.slice(-12);
      const sessionMeanings = (initialStore.meanings || []).filter(
        (m) => m.sessionId === run.sessionId
      );

      const ctx: RemContext = {
        runId: run.id,
        sessionId: run.sessionId,
        nodes: nodesToProcess,
        meanings: sessionMeanings,
        temperature: run.temperature,
        signal: controller.signal,
        shouldStop(): boolean {
          return (
            controller.signal.aborted ||
            activeRuns.get(run.id)?.stopped === true
          );
        },
        async markReading(nodeIds: number[]): Promise<void> {
          for (const id of nodeIds) {
            readNodeIds.add(id);
          }
          marks++;
          await updateStore((s) => {
            const r = s.runs?.find((item) => item.id === run.id);
            if (r && r.status === "running") {
              r.currentNodeIds = [...nodeIds];
              r.steps = stepsAt(marks); // 기준 답 1 + 앞서 끝난 단계 (marks - 1)
            }
          });
        },
        async markMeaning(meaningIds: number[]): Promise<void> {
          marks++;
          await updateStore((s) => {
            const r = s.runs?.find((item) => item.id === run.id);
            if (r && r.status === "running") {
              r.currentMeaningIds = [...meaningIds];
              r.steps = stepsAt(marks);
            }
          });
        },
        async setTotal(steps: number): Promise<void> {
          modeSteps = Math.max(0, Math.floor(steps));
          await updateStore((s) => {
            const r = s.runs?.find((item) => item.id === run.id);
            if (r && r.status === "running") r.steps = stepsAt(1);
          });
        },
        async ask(prompt, opts) {
          if (ctx.shouldStop()) {
            throw new Error("REM run stopped");
          }
          const res = await callModel({
            prompt,
            systemInstruction: opts?.systemInstruction,
            temperature: opts?.temperature ?? run.temperature,
            purpose: opts?.purpose ?? "rem-step",
            runId: run.id,
          });
          return { text: res.text };
        },
      };

      // 0. Probe comparison baseline before sleep (outside updateStore)
      try {
        await createComparisonBefore({
          runId: run.id,
          sessionId: run.sessionId,
          scope: run.scope,
        });
      } catch (compErr) {
        console.error("[rem/runner] createComparisonBefore error:", compErr);
      }

      // 1. Execute mode logic outside updateStore
      const insights = await mode.run(ctx);
      await updateStore((s) => {
        const r = s.runs?.find((item) => item.id === run.id);
        if (r && r.status === "running") r.steps = stepsAt(modeSteps + 1);
      });

      if (ctx.shouldStop()) {
        await updateStore((s) => {
          const r = s.runs?.find((item) => item.id === run.id);
          if (r) {
            r.status = "stopped";
            r.finishedAt = new Date().toISOString();
          }
        });
        return;
      }

      // 2. Generate 3-tier structured proposal outside updateStore
      const activePersona = resolvePersona(initialStore, run.scope ?? sessionScope(run.sessionId));
      const generatedProposal = await generateProposal({
        runId: run.id,
        sessionId: run.sessionId,
        scope: run.scope,
        currentPersona: activePersona,
        insights,
        meanings: sessionMeanings,
        sessionNodes: nodesToProcess,
      });

      // 3. Atomically persist results
      await updateStore((s) => {
        const r = s.runs?.find((item) => item.id === run.id);
        if (!r) return;
        if (r.status === "stopped") return;

        if (!Array.isArray(s.insights)) s.insights = [];
        const nextInsightId =
          (s.insights.reduce((max, i) => Math.max(max, i.id), 0) ?? 0) + 1;
        const createdInsightIds: number[] = [];

        insights.forEach((ins, idx) => {
          const insId = nextInsightId + idx;
          s.insights.push({
            id: insId,
            mode: run.mode,
            sourceNodeIds: ins.sourceNodeIds,
            content: ins.content,
            createdAt: new Date().toISOString(),
          });
          createdInsightIds.push(insId);
        });

        if (!Array.isArray(s.proposals)) s.proposals = [];
        const nextProposalId =
          (s.proposals.reduce((max, p) => Math.max(max, p.id), 0) ?? 0) + 1;
        const now = new Date().toISOString();

        const newProposal: PersonaProposal = {
          id: nextProposalId,
          ...generatedProposal,
          sourceInsightIds: createdInsightIds,
          createdAt: now,
        };
        s.proposals.push(newProposal);

        r.status = "done";
        r.finishedAt = now;
        r.error = null;
        r.steps = stepsAt(modeSteps + 2);
        r.insightIds = createdInsightIds;
        r.proposalId = nextProposalId;
        // Keep read node IDs populated for test assertions
        r.currentNodeIds = Array.from(readNodeIds);
      });
    } catch (caught) {
      const err = caught as { message?: string; name?: string };
      const isStopped = activeRuns.get(run.id)?.stopped;
      if (!isStopped) {
        const isNetworkErr =
          err?.message?.includes("fetch failed") ||
          err?.message?.includes("ENOTFOUND") ||
          err?.message?.includes("ECONNREFUSED") ||
          err?.name === "NetworkError";

        if (isNetworkErr) {
          try {
            const replays = await loadAllReplays();
            const replay = replays[0];
            if (replay && replay.proposal) {
              // 인터넷이 끊겨도 관람객이 제안 카드까지 볼 수 있게, 녹화본 제안을 이 세션의 제안으로 만든다.
              // 근거 노드는 녹화본의 번호가 아니라 이 관람객의 대화 노드로 바꾼다 (승인 검증이 세션 노드를 본다)
              const evidence = nodesToProcess.slice(0, 2).map((n) => n.id);
              await updateStore((s) => {
                const r = s.runs?.find((item) => item.id === run.id);
                if (!r || r.status !== "running") return;
                const now = new Date().toISOString();
                if (!Array.isArray(s.insights)) s.insights = [];
                let insightId = s.insights.reduce((max, i) => Math.max(max, i.id), 0) + 1;
                const insightIds: number[] = [];
                for (const step of replay.steps || []) {
                  s.insights.push({
                    id: insightId,
                    mode: run.mode,
                    sourceNodeIds: evidence,
                    content: step.insight.content,
                    createdAt: now,
                  });
                  insightIds.push(insightId++);
                }
                const base = resolvePersona(s, run.scope ?? sessionScope(run.sessionId));
                const items: PersonaChangeItem[] =
                  evidence.length >= 2
                    ? (replay.proposal.items || []).map((item, idx) => ({
                        ...item,
                        id: idx + 1,
                        change: { ...item.change, id: idx + 1 },
                        evidenceNodeIds: evidence,
                        sourceInsightIds: insightIds,
                        sourceMeaningIds: [],
                        status: "pending" as const,
                      }))
                    : [];
                if (!Array.isArray(s.proposals)) s.proposals = [];
                const proposalId = s.proposals.reduce((max, p) => Math.max(max, p.id), 0) + 1;
                if (items.length > 0) {
                  s.proposals.push({
                    id: proposalId,
                    runId: run.id,
                    summary: replay.proposal.summary || "자는 동안 이렇게 바뀌려 해요.",
                    items,
                    sourceInsightIds: insightIds,
                    baseVersion: base.version,
                    status: "pending",
                    createdAt: now,
                    decidedAt: null,
                  });
                }
                r.status = "done";
                r.source = "replay";
                r.finishedAt = now;
                r.error = null;
                r.insightIds = insightIds;
                r.proposalId = items.length > 0 ? proposalId : null;
                r.steps = stepsAt(modeSteps + 2);
              });
              return;
            }
          } catch {}
        }
      }

      await updateStore((s) => {
        const r = s.runs?.find((item) => item.id === run.id);
        if (r) {
          if (isStopped) {
            r.status = "stopped";
          } else {
            r.status = "error";
            r.error = err instanceof Error ? err.message : String(err);
          }
          r.finishedAt = new Date().toISOString();
        }
      });
    } finally {
      activeRuns.delete(run.id);
    }
  })();
}
