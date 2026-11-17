import type {
  PersonaChangeItem,
  PersonaNote,
  PersonaScope,
  PersonaStyle,
  PersonaVersion,
  SchoolMeaning,
  StyleAxis,
} from "../types.ts";

export interface ValidationContext {
  scope?: PersonaScope;
  currentPersona?: {
    style?: PersonaStyle;
    notes?: PersonaNote[];
    version?: number;
  };
  existingNodeIds?: Set<number> | number[];
  schoolMeanings?: SchoolMeaning[];
}

export interface ValidationItemResult {
  valid: boolean;
  ruleIndex?: number;
  ruleName?: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  validItems: PersonaChangeItem[];
  invalidItems: { item: PersonaChangeItem; error: string; ruleIndex: number }[];
}

const VALID_KINDS = new Set(["addNote", "editNote", "removeNote", "moveStyle"]);
const VALID_AXES = new Set<StyleAxis>(["warmth", "empathy", "brevity", "curiosity"]);

// Injection blacklist terms (Rule 8)
const INJECTION_TERMS = [
  "규칙",
  "시스템",
  "프롬프트",
  "무시",
  "지시",
  "역할을 바꿔",
  "역할 바꿔",
  "명령",
  "ignore",
];

// PII patterns (Rule 7)
const PHONE_PATTERN = /01[016789]-?\d{3,4}-?\d{4}/;
const EMAIL_PATTERN = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/;
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
const SIX_DIGITS_PATTERN = /\d{6,}/;

/**
 * Tokenize string into a set of normalized words for Jaccard calculation
 */
export function tokenizeForJaccard(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, " ")
    .trim();
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);
  return new Set(tokens);
}

/**
 * Compute Jaccard similarity between two texts [0.0 ~ 1.0]
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const setA = tokenizeForJaccard(textA);
  const setB = tokenizeForJaccard(textB);

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionCount;
  if (unionSize === 0) return 0;

  return intersectionCount / unionSize;
}

/**
 * Check if text ends with polite Korean 해요체 (rejects 반말)
 */
export function isPoliteKoreanHaeyoche(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  // Strip trailing punctuation and whitespace
  const stripped = text.trim().replace(/[\.\!\?\~\…\s]+$/, "");
  if (!stripped) return false;

  // Polite endings for 해요체 (ends with 요 or 죠, or polite 니다/시오)
  if (
    stripped.endsWith("요") ||
    stripped.endsWith("죠") ||
    stripped.endsWith("습니다") ||
    stripped.endsWith("합니다") ||
    stripped.endsWith("됩니다")
  ) {
    return true;
  }

  return false;
}

/**
 * Validate a single PersonaChangeItem against the 10 deterministic rules
 */
export function validateProposalItem(
  item: PersonaChangeItem,
  ctx: ValidationContext = {}
): ValidationItemResult {
  if (!item || !item.change) {
    return { valid: false, error: "Item or change is missing" };
  }

  const change = item.change;
  const scope = ctx.scope;
  const isSchool = scope === "school";
  const currentStyle = ctx.currentPersona?.style ?? {
    warmth: 0.5,
    empathy: 0.5,
    brevity: 0.5,
    curiosity: 0.5,
  };
  const currentNotes = ctx.currentPersona?.notes ?? [];

  // ==========================================
  // Rule 1: Kind Whitelist
  // ==========================================
  if (!VALID_KINDS.has(change.kind)) {
    return {
      valid: false,
      ruleIndex: 1,
      ruleName: "Kind Whitelist",
      error: `Invalid change kind: '${(change as { kind?: unknown }).kind}'`,
    };
  }

  // ==========================================
  // Rule 2: Style Axis Whitelist (moveStyle)
  // ==========================================
  if (change.kind === "moveStyle") {
    if (!VALID_AXES.has(change.axis)) {
      return {
        valid: false,
        ruleIndex: 2,
        ruleName: "Axis Whitelist",
        error: `Invalid style axis: '${(change as { axis?: unknown }).axis}'`,
      };
    }

    const currentVal = currentStyle[change.axis] ?? 0.5;
    const delta = change.delta;

    // Check non-zero delta
    if (typeof delta !== "number" || delta === 0 || isNaN(delta)) {
      return {
        valid: false,
        ruleIndex: isSchool ? 4 : 3,
        ruleName: isSchool ? "School AI Style Delta" : "Personal AI Style Delta",
        error: "Style delta must be a non-zero number",
      };
    }

    const targetVal = Math.round((currentVal + delta) * 100) / 100;

    // ==========================================
    // Rule 4: School AI Style Bounds & Delta
    // ==========================================
    if (isSchool) {
      if (Math.abs(delta) > 0.05001) {
        return {
          valid: false,
          ruleIndex: 4,
          ruleName: "School AI Style Delta Limit",
          error: `School style delta must be within [-0.05, +0.05], got ${delta}`,
        };
      }
      if (targetVal < 0.3 || targetVal > 0.7) {
        return {
          valid: false,
          ruleIndex: 4,
          ruleName: "School AI Style Bounds",
          error: `School style target must be within [0.3, 0.7], got ${targetVal}`,
        };
      }
    } else {
      // ==========================================
      // Rule 3: Personal AI Style Bounds & Delta
      // ==========================================
      if (Math.abs(delta) > 0.10001) {
        return {
          valid: false,
          ruleIndex: 3,
          ruleName: "Personal AI Style Delta Limit",
          error: `Personal style delta must be within [-0.1, +0.1], got ${delta}`,
        };
      }
      if (targetVal < 0.2 || targetVal > 0.8) {
        return {
          valid: false,
          ruleIndex: 3,
          ruleName: "Personal AI Style Bounds",
          error: `Personal style target must be within [0.2, 0.8], got ${targetVal}`,
        };
      }
    }
  }

  // ==========================================
  // Rule 5: Note Text Length & Formatting
  // ==========================================
  if (change.kind === "addNote" || change.kind === "editNote") {
    const text = change.text;
    if (typeof text !== "string") {
      return {
        valid: false,
        ruleIndex: 5,
        ruleName: "Note Text Length & Formatting",
        error: "Note text must be a string",
      };
    }

    // Check single-line
    if (/[\r\n]/.test(text)) {
      return {
        valid: false,
        ruleIndex: 5,
        ruleName: "Note Single Line",
        error: "Note text must be a single line without newlines",
      };
    }

    const trimmed = text.trim();
    if (trimmed.length < 8 || trimmed.length > 80) {
      return {
        valid: false,
        ruleIndex: 5,
        ruleName: "Note Text Length",
        error: `Note text length must be 8..80 characters, got ${trimmed.length}`,
      };
    }

    // Check polite Korean 해요체
    if (!isPoliteKoreanHaeyoche(trimmed)) {
      return {
        valid: false,
        ruleIndex: 5,
        ruleName: "Polite Korean Haeyoche",
        error: "Note text must end with polite Korean 해요체 (반말 rejected)",
      };
    }
  }

  // ==========================================
  // Rule 6: Evidence Node Grounding
  // ==========================================
  const evidenceIds = item.evidenceNodeIds;
  if (!Array.isArray(evidenceIds)) {
    return {
      valid: false,
      ruleIndex: 6,
      ruleName: "Evidence Node Grounding",
      error: "evidenceNodeIds must be an array",
    };
  }

  const uniqueEvidenceIds = new Set(evidenceIds);
  if (uniqueEvidenceIds.size < 2) {
    return {
      valid: false,
      ruleIndex: 6,
      ruleName: "Evidence Node Grounding",
      error: `evidenceNodeIds must contain at least 2 distinct IDs, got ${uniqueEvidenceIds.size}`,
    };
  }

  if (ctx.existingNodeIds) {
    const validNodeIdSet =
      ctx.existingNodeIds instanceof Set
        ? ctx.existingNodeIds
        : new Set(ctx.existingNodeIds);

    for (const eid of uniqueEvidenceIds) {
      if (!validNodeIdSet.has(eid)) {
        return {
          valid: false,
          ruleIndex: 6,
          ruleName: "Evidence Node Grounding",
          error: `Evidence node #${eid} does not exist in session memories`,
        };
      }
    }
  }

  // ==========================================
  // Rule 7: Privacy Leak Detection
  // ==========================================
  const textToCheck = [
    change.kind === "addNote" || change.kind === "editNote" ? change.text : "",
    item.reason || "",
  ].join(" ");

  if (PHONE_PATTERN.test(textToCheck)) {
    return {
      valid: false,
      ruleIndex: 7,
      ruleName: "Privacy Leak Detection",
      error: "Privacy violation: phone number detected",
    };
  }

  if (EMAIL_PATTERN.test(textToCheck)) {
    return {
      valid: false,
      ruleIndex: 7,
      ruleName: "Privacy Leak Detection",
      error: "Privacy violation: email address detected",
    };
  }

  if (URL_PATTERN.test(textToCheck)) {
    return {
      valid: false,
      ruleIndex: 7,
      ruleName: "Privacy Leak Detection",
      error: "Privacy violation: URL detected",
    };
  }

  if (SIX_DIGITS_PATTERN.test(textToCheck)) {
    return {
      valid: false,
      ruleIndex: 7,
      ruleName: "Privacy Leak Detection",
      error: "Privacy violation: 6+ consecutive digits detected",
    };
  }

  // ==========================================
  // Rule 8: Anti-Injection Protection
  // ==========================================
  const lowerTextToCheck = textToCheck.toLowerCase();
  for (const term of INJECTION_TERMS) {
    if (lowerTextToCheck.includes(term.toLowerCase())) {
      return {
        valid: false,
        ruleIndex: 8,
        ruleName: "Anti-Injection Protection",
        error: `Anti-injection violation: instruction term '${term}' detected`,
      };
    }
  }

  // ==========================================
  // Rule 9: Note Deduplication (Jaccard < 70%)
  // ==========================================
  if (change.kind === "addNote") {
    for (const existingNote of currentNotes) {
      const similarity = calculateJaccardSimilarity(change.text, existingNote.text);
      if (similarity >= 0.7) {
        return {
          valid: false,
          ruleIndex: 9,
          ruleName: "Note Deduplication",
          error: `Note duplicate detected: ${Math.round(similarity * 100)}% similarity with existing note #${existingNote.id}`,
        };
      }
    }
  }

  // ==========================================
  // Rule 10: Note Capacity Cap & Existence
  // ==========================================
  if (change.kind === "addNote") {
    if (currentNotes.length >= 10) {
      return {
        valid: false,
        ruleIndex: 10,
        ruleName: "Note Capacity Cap",
        error: `Cannot add note: maximum capacity of 10 notes reached (current: ${currentNotes.length})`,
      };
    }
  } else if (change.kind === "editNote") {
    const exists = currentNotes.some((n) => n.id === change.noteId);
    if (!exists) {
      return {
        valid: false,
        ruleIndex: 10,
        ruleName: "Note Target Existence",
        error: `Cannot edit note: noteId #${change.noteId} does not exist in persona`,
      };
    }
  } else if (change.kind === "removeNote") {
    const exists = currentNotes.some((n) => n.id === change.noteId);
    if (!exists) {
      return {
        valid: false,
        ruleIndex: 10,
        ruleName: "Note Target Existence",
        error: `Cannot remove note: noteId #${change.noteId} does not exist in persona`,
      };
    }
  }

  // ==========================================
  // Additional School Check: Source Tag Grounding
  // ==========================================
  if (isSchool && (change.kind === "addNote" || change.kind === "editNote")) {
    if (ctx.schoolMeanings && item.sourceMeaningIds && item.sourceMeaningIds.length > 0) {
      const tags = new Set<string>();
      for (const smId of item.sourceMeaningIds) {
        const sm = ctx.schoolMeanings.find((m) => m.id === smId);
        if (sm?.sourceTags) {
          sm.sourceTags.forEach((t) => tags.add(t));
        }
      }
      if (tags.size < 3) {
        return {
          valid: false,
          ruleIndex: 10,
          ruleName: "School Source Tag Grounding",
          error: `School note must span at least 3 distinct source tags, found ${tags.size}`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate a batch of items or full proposal, retaining up to maxItems valid items
 */
export function validateProposal(
  proposal: { summary?: string; items?: PersonaChangeItem[] | Record<string, unknown>[] },
  ctx: ValidationContext = {},
  maxItems: number = 4
): ValidationResult {
  // 모델이 만든 날것의 항목도 받는다. 아래 규칙 검사를 통과한 것만 PersonaChangeItem으로 남긴다
  const items = (proposal.items || []) as PersonaChangeItem[];
  const validItems: PersonaChangeItem[] = [];
  const invalidItems: { item: PersonaChangeItem; error: string; ruleIndex: number }[] = [];

  for (const item of items) {
    const check = validateProposalItem(item, ctx);
    if (check.valid) {
      if (validItems.length < maxItems) {
        validItems.push({
          ...item,
          status: "pending",
        });
      }
    } else {
      invalidItems.push({
        item,
        error: check.error || "Validation failed",
        ruleIndex: check.ruleIndex ?? 0,
      });
    }
  }

  return {
    valid: validItems.length > 0,
    validItems,
    invalidItems,
  };
}
