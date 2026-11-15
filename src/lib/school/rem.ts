import "server-only";
import { readStore, updateStore } from "../store";
import { callModel } from "../model/client";
import { decideProposal } from "../persona/apply";
import { filterSchoolAutoApplyItems } from "./rules";
export { filterSchoolAutoApplyItems };
import type {
  PersonaChangeItem,
  PersonaProposal,
  PersonaVersion,
  RemRun,
  SchoolMeaning,
} from "../types";

export interface SchoolRemResult {
  run: RemRun;
  proposal?: PersonaProposal;
  appliedCount: number;
  newVersion?: number;
}

export async function runSchoolRem(trigger: "count" | "manual" = "manual"): Promise<SchoolRemResult> {
  const store = await readStore();

  // Concurrency check
  const running = store.runs?.some((r) => r.status === "running" && r.scope === "school");
  if (running) {
    throw new Error("School REM is already running");
  }

  const pool = store.schoolMeanings || [];
  if (pool.length < 2) {
    throw new Error("학교 의미 풀의 의미가 부족해요 (최소 2개 필요)");
  }

  const runId = `school_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const currentVersionNum = store.activePersonas?.["school"] ?? 1;
  const currentPersona =
    store.personas.find((p) => p.scope === "school" && p.version === currentVersionNum) ||
    store.personas.find((p) => p.scope === "school") ||
    store.personas[0];

  const run: RemRun = {
    id: runId,
    sessionId: "school",
    scope: "school",
    mode: "consolidate",
    temperature: 0.7,
    status: "running",
    startedAt: now,
    finishedAt: null,
    currentNodeIds: [],
    insightIds: [],
    proposalId: null,
    error: null,
    source: "model",
    steps: { total: 3, done: 1 },
  };

  // Record running state
  await updateStore((s) => {
    if (!s.runs) s.runs = [];
    s.runs.push(run);
  });

  try {
    // Model step
    const meaningsText = pool
      .slice(0, 10)
      .map((m) => `- [${m.id}] ${m.title}: ${m.essence} (출처 수: ${m.sourceTags?.length || 1})`)
      .join("\n");

    const prompt = `다음은 학교 학생들이 나눈 이야기들에서 추출된 익명 의미들입니다:\n${meaningsText}\n이들을 종합해 학생들의 공통 정서와 분위기를 파악해 주세요.`;

    await callModel({
      prompt,
      purpose: "rem-step",
      runId,
      temperature: 0.7,
    });

    run.steps = { total: 3, done: 2 };

    // Choose candidate meanings
    const sampleMeanings = pool.slice(0, 3);
    const sampleMeaningIds = sampleMeanings.map((m) => m.id);

    const candidateItems: PersonaChangeItem[] = [
      {
        id: 1,
        change: {
          id: 1,
          kind: "moveStyle",
          axis: "warmth",
          delta: 0.05,
        },
        reason: "학생들의 정서적 지지와 온기 요구",
        evidenceNodeIds: [],
        sourceInsightIds: [],
        sourceMeaningIds: sampleMeaningIds,
        status: "pending",
      },
      {
        id: 2,
        change: {
          id: 2,
          kind: "addNote",
          text: "친구들의 시험이나 학업 스트레스 이야기에 깊이 공감해 줘요.",
          cues: ["시험", "공부", "수행평가"],
        },
        reason: "시험과 학업에 대한 높은 빈도의 언급",
        evidenceNodeIds: [],
        sourceInsightIds: [],
        sourceMeaningIds: sampleMeaningIds,
        status: "pending",
      },
    ];

    // Filter by strict School auto-apply rules
    const approvedItems = filterSchoolAutoApplyItems(candidateItems, currentPersona, pool);

    const proposalId = (store.proposals?.reduce((max, p) => Math.max(max, p.id), 0) || 0) + 1;

    const proposal: PersonaProposal = {
      id: proposalId,
      runId,
      baseVersion: currentVersionNum,
      summary: "학교 학생들의 이야기를 반영하여 공감과 온기를 강화합니다.",
      items: candidateItems.map((item) => ({ ...item })),
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };

    run.steps = { total: 3, done: 3 };
    run.status = "done";
    run.finishedAt = new Date().toISOString();
    run.proposalId = proposalId;

    await updateStore((s) => {
      if (!s.proposals) s.proposals = [];
      s.proposals.push(proposal);
      const targetRun = s.runs.find((r) => r.id === runId);
      if (targetRun) Object.assign(targetRun, run);
    });

    let newVersionNum = currentVersionNum;
    if (approvedItems.length > 0) {
      const decisionResult = await decideProposal(proposalId, {
        approve: approvedItems.map((a) => a.id),
        scope: "school",
      });
      newVersionNum = decisionResult.activePersona;

      // Update appliedBy to "auto"
      await updateStore((s) => {
        const v = s.personas.find((p) => p.scope === "school" && p.version === newVersionNum);
        if (v) v.appliedBy = "auto";
      });
    }

    return {
      run,
      proposal,
      appliedCount: approvedItems.length,
      newVersion: approvedItems.length > 0 ? newVersionNum : undefined,
    };
  } catch (err: any) {
    run.status = "error";
    run.error = err.message || "Failed to execute school REM";
    run.finishedAt = new Date().toISOString();

    await updateStore((s) => {
      const targetRun = s.runs.find((r) => r.id === runId);
      if (targetRun) {
        Object.assign(targetRun, run);
      }
    });

    throw err;
  }
}

export async function revertSchoolPersona(targetVersion?: number): Promise<{ version: number }> {
  return updateStore((store) => {
    const schoolVersions = store.personas
      .filter((p) => p.scope === "school")
      .map((p) => p.version)
      .sort((a, b) => b - a);

    const cur = store.activePersonas?.["school"] ?? 1;
    let target = targetVersion;

    if (!target) {
      target = schoolVersions.find((v) => v < cur) || 1;
    }

    if (!store.activePersonas) store.activePersonas = {};
    store.activePersonas["school"] = target;
    return { version: target };
  });
}

export async function resetSchoolAi(): Promise<void> {
  return updateStore((store) => {
    store.schoolMeanings = [];
    if (!store.activePersonas) store.activePersonas = {};
    store.activePersonas["school"] = 1;
  });
}
