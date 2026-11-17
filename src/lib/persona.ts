import "server-only";
import { readStore, updateStore } from "./store";
import { removeSession } from "./records";
import { deleteImages } from "./uploads";
import type { PersonaScope, PersonaVersion, Store } from "./types";

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
 * 세션(관람객) 하나가 지금 쓰는 개인 인격. 그 세션이 승인한 버전이 없으면 기본 인격(store.activePersona)에서 시작한다.
 * 개인 AI의 변화는 그 세션에만 남고, 다른 관람객의 대화에는 영향을 주지 않는다.
 */
export function sessionScope(sessionId: string): PersonaScope {
  return `session:${sessionId}`;
}
export function resolvePersona(store: Store, scope?: PersonaScope | null): PersonaVersion {
  const v = scope ? store.activePersonas?.[scope] : undefined;
  const found = v ? store.personas?.find((p) => p.version === v) : undefined;
  return found ?? getActivePersona(store);
}

export {
  approveProposal,
  rejectProposal,
  approveProposalItem,
  rejectProposalItem,
  decideProposal,
} from "./persona/apply.ts";

/**
 * Reverts active persona to an existing version:
 * - Validates version number (throws 400 if invalid)
 * - Checks if version exists in store.personas (throws 404 if not found)
 * - Updates store.activePersona = version
 * - If sessionId is provided, updates session activePersona
 */
export async function revertPersona(
  version: number,
  sessionId?: string
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

    // 세션을 주면 그 세션 인격만, 안 주면 기본 인격을 되돌린다
    if (sessionId) {
      if (!store.activePersonas) store.activePersonas = {};
      store.activePersonas[`session:${sessionId}`] = version;
    } else {
      store.activePersona = version;
    }

    return { ok: true, activePersona: version };
  });
}

/**
 * Resets visitor session:
 * - Clears session memory nodes, stories, meanings, profiles, mails, insights, proposals, runs
 * - Deletes associated uploaded image files
 * - Resets store.activePersona = 1
 * - Clears session activePersona
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
    // 기본 인격(store.activePersona)은 모든 관람객이 함께 쓰므로 건드리지 않고, 이 세션의 개인 인격만 지운다
    if (store.activePersonas && store.activePersonas[`session:${trimmedSessionId}`]) {
      delete store.activePersonas[`session:${trimmedSessionId}`];
    }
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
