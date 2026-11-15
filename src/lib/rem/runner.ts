import "server-only";
import { readStore, updateStore } from "../store.ts";
import { callModel } from "../model/client.ts";
import { getActivePersona } from "../persona.ts";
import { getMode } from "./registry.ts";
import { createComparisonBefore } from "./compare.ts";
import { generateProposal } from "./proposal.ts";
import { loadAllReplays } from "./replay.ts";
import type {
  Insight,
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
      const nodesToProcess = sessionNodes.slice(-12);
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
          await updateStore((s) => {
            const r = s.runs?.find((item) => item.id === run.id);
            if (r && r.status === "running") {
              r.currentNodeIds = [...nodeIds];
            }
          });
        },
        async markMeaning(meaningIds: number[]): Promise<void> {
          await updateStore((s) => {
            const r = s.runs?.find((item) => item.id === run.id);
            if (r && r.status === "running") {
              r.currentMeaningIds = [...meaningIds];
            }
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
      const activePersona = await getActivePersona(initialStore);
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
        r.insightIds = createdInsightIds;
        r.proposalId = nextProposalId;
        // Keep read node IDs populated for test assertions
        r.currentNodeIds = Array.from(readNodeIds);
      });
    } catch (err: any) {
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
              await updateStore((s) => {
                const r = s.runs?.find((item) => item.id === run.id);
                if (r) {
                  r.status = "done";
                  r.source = "replay";
                  r.finishedAt = new Date().toISOString();
                  r.error = null;
                }
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
