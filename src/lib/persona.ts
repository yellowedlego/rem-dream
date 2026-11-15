import "server-only";
import { readStore, updateStore } from "./store";
import { removeSession } from "./records";
import { deleteImages } from "./uploads";
import type { PersonaVersion, Store } from "./types";

export class PersonaError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = "PersonaError";
  }
}

/**
 * Returns the currently active persona version object.
 * If store is provided, returns synchronously; otherwise reads from store asynchronously.
 */
export function getActivePersona(store: Store): PersonaVersion;
export function getActivePersona(store?: Store): Promise<PersonaVersion>;
export function getActivePersona(store?: Store): PersonaVersion | Promise<PersonaVersion> {
  if (store) {
    const found = store.personas?.find((p) => p.version === store.activePersona);
    if (found) return found;
    if (store.personas && store.personas.length > 0) return store.personas[0];
    return {
      version: 1,
      systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
      sourceInsightIds: [],
      approvedAt: new Date().toISOString(),
      parentVersion: null,
    };
  }
  return readStore().then((s) => getActivePersona(s));
}

/**
 * Approves a pending persona proposal:
 * - Finds proposal by ID (throws 404 if not found, 400 if not pending)
 * - Sets proposal status = 'approved', decidedAt = now
 * - Calculates nextVersion = max(persona.version) + 1
 * - Appends new PersonaVersion to store.personas
 * - Sets store.activePersona = nextVersion
 */
export async function approveProposal(
  proposalId: number | string
): Promise<{ ok: boolean; activePersona: number }> {
  const numId = typeof proposalId === "string" ? parseInt(proposalId, 10) : proposalId;
  if (typeof numId !== "number" || Number.isNaN(numId) || !Number.isInteger(numId) || numId <= 0) {
    throw new PersonaError("Invalid proposal ID", 400);
  }

  return updateStore((store) => {
    if (!Array.isArray(store.proposals)) {
      store.proposals = [];
    }
    const proposal = store.proposals.find((p) => p.id === numId);
    if (!proposal) {
      throw new PersonaError("Proposal not found", 404);
    }
    if (proposal.status !== "pending") {
      throw new PersonaError("Proposal is not pending", 400);
    }

    if (!Array.isArray(store.personas)) {
      store.personas = [];
    }

    const nextVersion = store.personas.reduce((max, p) => Math.max(max, p.version), 0) + 1;
    const now = new Date().toISOString();

    proposal.status = "approved";
    proposal.decidedAt = now;

    const newPersona: PersonaVersion = {
      version: nextVersion,
      systemPrompt: proposal.proposedPrompt,
      sourceInsightIds: Array.isArray(proposal.sourceInsightIds) ? [...proposal.sourceInsightIds] : [],
      approvedAt: now,
      parentVersion: proposal.baseVersion ?? store.activePersona ?? null,
    };
    (newPersona as unknown as Record<string, unknown>).createdAt = now;

    store.personas.push(newPersona);
    store.activePersona = nextVersion;

    return { ok: true, activePersona: nextVersion };
  });
}

/**
 * Rejects a pending persona proposal:
 * - Finds proposal by ID (throws 404 if not found, 400 if not pending)
 * - Sets proposal status = 'rejected', decidedAt = now
 * - store.activePersona remains unchanged
 */
export async function rejectProposal(
  proposalId: number | string
): Promise<{ ok: boolean }> {
  const numId = typeof proposalId === "string" ? parseInt(proposalId, 10) : proposalId;
  if (typeof numId !== "number" || Number.isNaN(numId) || !Number.isInteger(numId) || numId <= 0) {
    throw new PersonaError("Invalid proposal ID", 400);
  }

  return updateStore((store) => {
    if (!Array.isArray(store.proposals)) {
      store.proposals = [];
    }
    const proposal = store.proposals.find((p) => p.id === numId);
    if (!proposal) {
      throw new PersonaError("Proposal not found", 404);
    }
    if (proposal.status !== "pending") {
      throw new PersonaError("Proposal is not pending", 400);
    }

    const now = new Date().toISOString();
    proposal.status = "rejected";
    proposal.decidedAt = now;

    return { ok: true };
  });
}

/**
 * Reverts active persona to an existing version:
 * - Validates version number (throws 400 if invalid)
 * - Checks if version exists in store.personas (throws 404 if not found)
 * - Updates store.activePersona = version
 */
export async function revertPersona(
  version: number
): Promise<{ ok: boolean; activePersona: number }> {
  if (typeof version !== "number" || Number.isNaN(version) || !Number.isInteger(version) || version <= 0) {
    throw new PersonaError("Valid version number is required", 400);
  }

  return updateStore((store) => {
    if (!Array.isArray(store.personas)) {
      store.personas = [];
    }
    const exists = store.personas.some((p) => p.version === version);
    if (!exists) {
      throw new PersonaError("Persona version not found", 404);
    }

    store.activePersona = version;
    return { ok: true, activePersona: version };
  });
}

/**
 * Resets visitor session:
 * - Clears session memory nodes, stories, meanings, profiles, mails, insights, proposals, runs
 * - Deletes associated uploaded image files
 * - Resets store.activePersona = 1
 */
export async function resetSession(
  sessionId: string
): Promise<{ ok: boolean }> {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new PersonaError("sessionId is required", 400);
  }

  const trimmedSessionId = sessionId.trim();
  const imageIds = await updateStore((store) => {
    const cleanedImageIds = removeSession(store, trimmedSessionId);
    store.activePersona = 1;
    return cleanedImageIds;
  });

  if (Array.isArray(imageIds) && imageIds.length > 0) {
    try {
      await deleteImages(imageIds);
    } catch (err) {
      console.error("[resetSession] deleteImages error:", err);
    }
  }

  return { ok: true };
}
