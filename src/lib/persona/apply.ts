import { updateComparisonAfter } from "../rem/compare.ts";
import { assemblePersonaPrompt } from "./assemble.ts";
import { updateStore } from "../store.ts";
import type {
  PersonaChangeItem,
  PersonaNote,
  PersonaProposal,
  PersonaScope,
  PersonaStyle,
  PersonaVersion,
  Store,
} from "../types.ts";

export class PersonaApplyError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = "PersonaApplyError";
  }
}

function parseNumericId(val: number | string, name: string): number {
  const num = typeof val === "string" ? parseInt(val, 10) : val;
  if (typeof num !== "number" || Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
    throw new PersonaApplyError(`Invalid ${name}`, 400);
  }
  return num;
}

/**
 * 제안이 어느 인격(스코프)을 바꾸는지: 명시값 → 실행(run)의 scope → 실행 세션의 개인 인격.
 * 개인 AI 승인은 그 세션 인격만 바꾸고, 다른 관람객이 쓰는 기본 인격(store.activePersona)은 건드리지 않는다.
 */
function resolveScope(store: Store, proposal: PersonaProposal, explicit?: PersonaScope): PersonaScope | undefined {
  if (explicit) return explicit;
  const run = (store.runs || []).find((r) => r.id === proposal.runId);
  if (run?.scope) return run.scope;
  if (run?.sessionId) return `session:${run.sessionId}`;
  return undefined;
}

/** 그 스코프가 지금 쓰는 인격. 스코프에 버전이 없으면 기본 인격(store.activePersona) */
function scopedBase(store: Store, scope: PersonaScope | undefined): PersonaVersion | undefined {
  const v = scope ? store.activePersonas?.[scope] : undefined;
  return (
    (v ? store.personas.find((p) => p.version === v) : undefined) ||
    store.personas.find((p) => p.version === store.activePersona)
  );
}

/** 새 버전을 그 스코프의 활성 버전으로. 스코프가 없을 때(예전 방식)만 기본 인격을 바꾼다 */
function activate(store: Store, scope: PersonaScope | undefined, version: number): void {
  if (!scope) {
    store.activePersona = version;
    return;
  }
  if (!store.activePersonas) store.activePersonas = {};
  store.activePersonas[scope] = version;
}

export interface ItemDecisionResult {
  ok: boolean;
  activePersona: number;
  itemStatus?: "approved" | "rejected";
  proposalStatus: "pending" | "approved" | "rejected" | "done";
}

export interface BatchDecisionOptions {
  approve?: number[];
  reject?: number[];
  scope?: PersonaScope;
}

/**
 * Helper to apply approved changes to style and notes, returning updated snapshots
 */
function applyChangesToPersona(
  basePersona: PersonaVersion,
  approvedItems: PersonaChangeItem[],
  nextVersion: number,
  isSchool: boolean
): {
  style: PersonaStyle;
  notes: PersonaNote[];
  newSystemPrompt: string;
} {
  const style: PersonaStyle = {
    ...(basePersona.style ?? {
      warmth: 0.5,
      empathy: 0.5,
      brevity: 0.5,
      curiosity: 0.5,
    }),
  };

  const notes: PersonaNote[] = [...(basePersona.notes ?? [])];
  const minBound = isSchool ? 0.3 : 0.2;
  const maxBound = isSchool ? 0.7 : 0.8;

  for (const item of approvedItems) {
    const change = item.change;
    if (change.kind === "moveStyle") {
      const current = style[change.axis] ?? 0.5;
      const target = Math.round((current + change.delta) * 100) / 100;
      style[change.axis] = Math.max(minBound, Math.min(maxBound, target));
    } else if (change.kind === "addNote") {
      if (notes.length < 10) {
        const nextNoteId = (notes.reduce((max, n) => Math.max(max, n.id), 0) ?? 0) + 1;
        notes.push({
          id: nextNoteId,
          text: change.text,
          cues: change.cues || [],
          sourceMeaningIds: item.sourceMeaningIds || [],
          sourceInsightIds: item.sourceInsightIds || [],
          addedInVersion: nextVersion,
        });
      }
    } else if (change.kind === "editNote") {
      const targetNote = notes.find((n) => n.id === change.noteId);
      if (targetNote) {
        targetNote.text = change.text;
        targetNote.cues = change.cues || [];
      }
    } else if (change.kind === "removeNote") {
      const idx = notes.findIndex((n) => n.id === change.noteId);
      if (idx !== -1) {
        notes.splice(idx, 1);
      }
    }
  }

  // Assemble updated prompt for dynamic reflection
  const assembled = assemblePersonaPrompt({
    persona: {
      ...basePersona,
      version: nextVersion,
      style,
      notes,
    },
    currentMessage: "",
  });

  return {
    style,
    notes,
    newSystemPrompt: assembled.systemPrompt,
  };
}

/**
 * Approve a single item in a proposal
 */
export async function approveProposalItem(
  proposalId: number | string,
  itemId: number | string,
  scopeArg?: PersonaScope
): Promise<ItemDecisionResult> {
  const pId = parseNumericId(proposalId, "proposal ID");
  const iId = parseNumericId(itemId, "item ID");

  let scope: PersonaScope | undefined = scopeArg;
  let createdVersion: PersonaVersion | null = null;
  let runIdForCompare: string | null = null;

  const result = await updateStore((store) => {
    if (!Array.isArray(store.proposals)) store.proposals = [];
    const proposal = store.proposals.find((p) => p.id === pId);
    if (!proposal) throw new PersonaApplyError("Proposal not found", 404);
    scope = resolveScope(store, proposal, scopeArg);
    if (proposal.status !== "pending") {
      throw new PersonaApplyError("Proposal is not pending", 400);
    }

    if (!Array.isArray(proposal.items) || proposal.items.length === 0) {
      throw new PersonaApplyError("Proposal has no items to approve", 400);
    }

    const item = proposal.items.find((i) => i.id === iId);
    if (!item) throw new PersonaApplyError("Item not found", 404);
    if (item.status !== "pending") {
      throw new PersonaApplyError("Item is not pending", 400);
    }

    if (!Array.isArray(store.personas)) store.personas = [];
    const nextVersion =
      (store.personas.reduce((max, p) => Math.max(max, p.version), 0) ?? 0) + 1;
    const basePersona =
      scopedBase(store, scope) ||
      store.personas[store.personas.length - 1] || {
        version: 1,
        systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
        approvedAt: new Date().toISOString(),
        parentVersion: null,
      };

    const isSchool = scope === "school";
    item.status = "approved";

    const { style, notes, newSystemPrompt } = applyChangesToPersona(
      basePersona,
      [item],
      nextVersion,
      isSchool
    );

    const now = new Date().toISOString();
    const newPersona: PersonaVersion = {
      version: nextVersion,
      systemPrompt: proposal.proposedPrompt || newSystemPrompt,
      sourceInsightIds: Array.isArray(item.sourceInsightIds) ? [...item.sourceInsightIds] : [],
      sourceMeaningIds: Array.isArray(item.sourceMeaningIds) ? [...item.sourceMeaningIds] : [],
      approvedAt: now,
      parentVersion: basePersona.version,
      style,
      notes,
      appliedBy: "human",
      scope,
    };
    newPersona.createdAt = now;

    store.personas.push(newPersona);
    activate(store, scope, nextVersion);

    // Check if all items in proposal are decided
    const allDecided = proposal.items.every((i) => i.status !== "pending");
    if (allDecided) {
      proposal.status = "done";
      proposal.decidedAt = now;
    }

    createdVersion = newPersona;
    runIdForCompare = proposal.runId;

    return {
      ok: true,
      activePersona: nextVersion,
      itemStatus: "approved" as const,
      proposalStatus: proposal.status,
    };
  });

  if (createdVersion && runIdForCompare) {
    try {
      await updateComparisonAfter({
        runId: runIdForCompare,
        scope,
        newPersona: createdVersion,
      });
    } catch (err) {
      console.error("[approveProposalItem] updateComparisonAfter error:", err);
    }
  }

  return result;
}

/**
 * Reject a single item in a proposal
 */
export async function rejectProposalItem(
  proposalId: number | string,
  itemId: number | string,
  scope?: PersonaScope
): Promise<ItemDecisionResult> {
  const pId = parseNumericId(proposalId, "proposal ID");
  const iId = parseNumericId(itemId, "item ID");

  return updateStore((store) => {
    if (!Array.isArray(store.proposals)) store.proposals = [];
    const proposal = store.proposals.find((p) => p.id === pId);
    if (!proposal) throw new PersonaApplyError("Proposal not found", 404);
    if (proposal.status !== "pending") {
      throw new PersonaApplyError("Proposal is not pending", 400);
    }

    if (!Array.isArray(proposal.items) || proposal.items.length === 0) {
      throw new PersonaApplyError("Proposal has no items to reject", 400);
    }

    const item = proposal.items.find((i) => i.id === iId);
    if (!item) throw new PersonaApplyError("Item not found", 404);
    if (item.status !== "pending") {
      throw new PersonaApplyError("Item is not pending", 400);
    }

    item.status = "rejected";
    const now = new Date().toISOString();
    // 거절은 새 버전을 만들지 않는다. 돌려주는 값은 그 제안이 바꾸려던 인격(세션)의 지금 버전
    const current = scopedBase(store, resolveScope(store, proposal, scope));

    const allDecided = proposal.items.every((i) => i.status !== "pending");
    if (allDecided) {
      const anyApproved = proposal.items.some((i) => i.status === "approved");
      proposal.status = anyApproved ? "done" : "rejected";
      proposal.decidedAt = now;
    }

    return {
      ok: true,
      activePersona: current?.version ?? store.activePersona ?? 1,
      itemStatus: "rejected" as const,
      proposalStatus: proposal.status,
    };
  });
}

/**
 * Batch decide (approve / reject multiple items at once)
 */
export async function decideProposal(
  proposalId: number | string,
  decision: BatchDecisionOptions
): Promise<ItemDecisionResult> {
  const pId = parseNumericId(proposalId, "proposal ID");
  const approveIds = new Set(decision.approve || []);
  const rejectIds = new Set(decision.reject || []);

  if (approveIds.size === 0 && rejectIds.size === 0) {
    throw new PersonaApplyError("At least one approve or reject itemId must be provided", 400);
  }

  let scope: PersonaScope | undefined = decision.scope;
  let createdVersion: PersonaVersion | null = null;
  let runIdForCompare: string | null = null;

  const result = await updateStore((store) => {
    if (!Array.isArray(store.proposals)) store.proposals = [];
    const proposal = store.proposals.find((p) => p.id === pId);
    if (!proposal) throw new PersonaApplyError("Proposal not found", 404);
    scope = resolveScope(store, proposal, decision.scope);
    if (proposal.status !== "pending") {
      throw new PersonaApplyError("Proposal is not pending", 400);
    }

    if (!Array.isArray(proposal.items) || proposal.items.length === 0) {
      throw new PersonaApplyError("Proposal has no items", 400);
    }

    // Verify all specified IDs exist and are pending
    for (const id of approveIds) {
      const it = proposal.items.find((i) => i.id === id);
      if (!it) throw new PersonaApplyError(`Item #${id} not found`, 404);
      if (it.status !== "pending") throw new PersonaApplyError(`Item #${id} is not pending`, 400);
    }
    for (const id of rejectIds) {
      const it = proposal.items.find((i) => i.id === id);
      if (!it) throw new PersonaApplyError(`Item #${id} not found`, 404);
      if (it.status !== "pending") throw new PersonaApplyError(`Item #${id} is not pending`, 400);
    }

    const approvedItems: PersonaChangeItem[] = [];
    for (const item of proposal.items) {
      if (approveIds.has(item.id)) {
        item.status = "approved";
        approvedItems.push(item);
      } else if (rejectIds.has(item.id)) {
        item.status = "rejected";
      }
    }

    const now = new Date().toISOString();
    let currentActive = store.activePersona || 1;

    if (approvedItems.length > 0) {
      if (!Array.isArray(store.personas)) store.personas = [];
      const nextVersion =
        (store.personas.reduce((max, p) => Math.max(max, p.version), 0) ?? 0) + 1;
      const basePersona =
        scopedBase(store, scope) ||
        store.personas[store.personas.length - 1] || {
          version: 1,
          systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
          approvedAt: now,
          parentVersion: null,
        };

      const isSchool = scope === "school";
      const { style, notes, newSystemPrompt } = applyChangesToPersona(
        basePersona,
        approvedItems,
        nextVersion,
        isSchool
      );

      const allMeaningIds = Array.from(
        new Set(approvedItems.flatMap((i) => i.sourceMeaningIds || []))
      );
      const allInsightIds = Array.from(
        new Set(approvedItems.flatMap((i) => i.sourceInsightIds || []))
      );

      const newPersona: PersonaVersion = {
        version: nextVersion,
        systemPrompt: proposal.proposedPrompt || newSystemPrompt,
        sourceInsightIds: allInsightIds.length > 0 ? allInsightIds : proposal.sourceInsightIds || [],
        sourceMeaningIds: allMeaningIds,
        approvedAt: now,
        parentVersion: basePersona.version,
        style,
        notes,
        appliedBy: "human",
        scope,
      };
      newPersona.createdAt = now;

      store.personas.push(newPersona);
      activate(store, scope, nextVersion);

      currentActive = nextVersion;
      createdVersion = newPersona;
      runIdForCompare = proposal.runId;
    }

    const allDecided = proposal.items.every((i) => i.status !== "pending");
    if (allDecided) {
      const anyApproved = proposal.items.some((i) => i.status === "approved");
      proposal.status = anyApproved ? "done" : "rejected";
      proposal.decidedAt = now;
    }

    return {
      ok: true,
      activePersona: currentActive,
      proposalStatus: proposal.status,
    };
  });

  if (createdVersion && runIdForCompare) {
    try {
      await updateComparisonAfter({
        runId: runIdForCompare,
        scope,
        newPersona: createdVersion,
      });
    } catch (err) {
      console.error("[decideProposal] updateComparisonAfter error:", err);
    }
  }

  return result;
}

/**
 * Bulk approve proposal (backward compatible with M1 and tests/api-proposal.spec.ts)
 */
export async function approveProposal(
  proposalId: number | string,
  scopeArg?: PersonaScope
): Promise<{ ok: boolean; activePersona: number }> {
  const pId = parseNumericId(proposalId, "proposal ID");

  let scope: PersonaScope | undefined = scopeArg;
  let createdVersion: PersonaVersion | null = null;
  let runIdForCompare: string | null = null;

  const result = await updateStore((store) => {
    if (!Array.isArray(store.proposals)) store.proposals = [];
    const proposal = store.proposals.find((p) => p.id === pId);
    if (!proposal) throw new PersonaApplyError("Proposal not found", 404);
    scope = resolveScope(store, proposal, scopeArg);
    if (proposal.status !== "pending") {
      throw new PersonaApplyError("Proposal is not pending", 400);
    }

    if (!Array.isArray(store.personas)) store.personas = [];
    const nextVersion =
      (store.personas.reduce((max, p) => Math.max(max, p.version), 0) ?? 0) + 1;
    const now = new Date().toISOString();

    const basePersona =
      (proposal.baseVersion ? store.personas.find((p) => p.version === proposal.baseVersion) : undefined) ||
      scopedBase(store, scope) ||
      store.personas[store.personas.length - 1] || {
        version: 1,
        systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
        approvedAt: now,
        parentVersion: null,
      };

    const isSchool = scope === "school";
    let newStyle = basePersona.style;
    let newNotes = basePersona.notes;
    let newSystemPrompt = proposal.proposedPrompt || basePersona.systemPrompt;

    if (Array.isArray(proposal.items) && proposal.items.length > 0) {
      const pendingItems = proposal.items.filter((i) => i.status === "pending");
      for (const item of pendingItems) {
        item.status = "approved";
      }

      const applied = applyChangesToPersona(
        basePersona,
        pendingItems,
        nextVersion,
        isSchool
      );
      newStyle = applied.style;
      newNotes = applied.notes;
      if (!proposal.proposedPrompt) {
        newSystemPrompt = applied.newSystemPrompt;
      }
    }

    // Set proposal status to 'approved' for backward compatibility
    proposal.status = "approved";
    proposal.decidedAt = now;

    const newPersona: PersonaVersion = {
      version: nextVersion,
      systemPrompt: proposal.proposedPrompt ?? newSystemPrompt,
      sourceInsightIds: Array.isArray(proposal.sourceInsightIds) ? [...proposal.sourceInsightIds] : [],
      approvedAt: now,
      parentVersion: proposal.baseVersion ?? store.activePersona ?? null,
      style: newStyle,
      notes: newNotes,
      appliedBy: "human",
      scope,
    };
    newPersona.createdAt = now;

    store.personas.push(newPersona);
    activate(store, scope, nextVersion);

    createdVersion = newPersona;
    runIdForCompare = proposal.runId;

    return { ok: true, activePersona: nextVersion };
  });

  if (createdVersion && runIdForCompare) {
    try {
      await updateComparisonAfter({
        runId: runIdForCompare,
        scope,
        newPersona: createdVersion,
      });
    } catch (err) {
      console.error("[approveProposal] updateComparisonAfter error:", err);
    }
  }

  return result;
}

/**
 * Bulk reject proposal (backward compatible with M1)
 */
export async function rejectProposal(
  proposalId: number | string
): Promise<{ ok: boolean }> {
  const pId = parseNumericId(proposalId, "proposal ID");

  return updateStore((store) => {
    if (!Array.isArray(store.proposals)) store.proposals = [];
    const proposal = store.proposals.find((p) => p.id === pId);
    if (!proposal) throw new PersonaApplyError("Proposal not found", 404);
    if (proposal.status !== "pending") {
      throw new PersonaApplyError("Proposal is not pending", 400);
    }

    if (Array.isArray(proposal.items)) {
      for (const item of proposal.items) {
        if (item.status === "pending") {
          item.status = "rejected";
        }
      }
    }

    const now = new Date().toISOString();
    proposal.status = "rejected";
    proposal.decidedAt = now;

    return { ok: true };
  });
}
