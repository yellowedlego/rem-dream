import { assemblePersonaPrompt } from "../persona/assemble.ts";
import type {
  Comparison,
  MemoryNode,
  PersonaScope,
  PersonaVersion,
} from "../types.ts";

export const DEFAULT_PROBE_QUESTION = "나에 대해 어떻게 생각해?";

export interface SemanticShiftResult {
  jaccardDistance: number;
  jaccardSimilarity: number;
  charDelta: number;
  wordDelta: number;
  beforeWords: string[];
  afterWords: string[];
  addedWords: string[];
  removedWords: string[];
}

/**
 * Tokenize string into a normalized list/set of words
 */
function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Calculate Jaccard lexical distance and semantic shift metrics between two texts
 */
export function calculateSemanticShift(
  beforeText: string,
  afterText: string
): SemanticShiftResult {
  const beforeTokens = tokenizeWords(beforeText);
  const afterTokens = tokenizeWords(afterText);

  const beforeSet = new Set(beforeTokens);
  const afterSet = new Set(afterTokens);

  if (beforeSet.size === 0 && afterSet.size === 0) {
    return {
      jaccardDistance: 0,
      jaccardSimilarity: 1,
      charDelta: 0,
      wordDelta: 0,
      beforeWords: [],
      afterWords: [],
      addedWords: [],
      removedWords: [],
    };
  }

  let intersectionCount = 0;
  for (const token of beforeSet) {
    if (afterSet.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = beforeSet.size + afterSet.size - intersectionCount;
  const similarity = unionSize === 0 ? 1 : intersectionCount / unionSize;
  const distance = Math.round((1 - similarity) * 1000) / 1000;

  const addedWords: string[] = [];
  for (const token of afterSet) {
    if (!beforeSet.has(token)) {
      addedWords.push(token);
    }
  }

  const removedWords: string[] = [];
  for (const token of beforeSet) {
    if (!afterSet.has(token)) {
      removedWords.push(token);
    }
  }

  return {
    jaccardDistance: distance,
    jaccardSimilarity: Math.round(similarity * 1000) / 1000,
    charDelta: afterText.length - beforeText.length,
    wordDelta: afterTokens.length - beforeTokens.length,
    beforeWords: Array.from(beforeSet),
    afterWords: Array.from(afterSet),
    addedWords,
    removedWords,
  };
}

export interface ProbeOptions {
  persona: PersonaVersion;
  nodes?: MemoryNode[];
  question?: string;
  runId?: string;
}

/**
 * Probe a persona version with a standardized question to evaluate behavioral output
 */
export async function probePersona(opts: ProbeOptions): Promise<string> {
  const question = opts.question || DEFAULT_PROBE_QUESTION;
  const recentNodes = (opts.nodes || []).slice(-6);
  const recentUserMessages = recentNodes.map((n) => n.user);

  const assembled = assemblePersonaPrompt({
    persona: opts.persona,
    recentUserMessages,
    currentMessage: question,
  });

  const conversationHistory = recentNodes
    .map((n) => `사용자: ${n.user}\nAI: ${n.ai}`)
    .join("\n\n");

  const prompt = conversationHistory.length > 0
    ? `[버전 ${opts.persona.version}]\n${conversationHistory}\n\n사용자: ${question}\nAI:`
    : `[버전 ${opts.persona.version}]\n사용자: ${question}\nAI:`;

  const { callModel } = await import("../model/client.ts");
  const res = await callModel({
    prompt,
    systemInstruction: assembled.systemPrompt,
    temperature: 0.3,
    purpose: "rem-compare",
    runId: opts.runId,
  });

  return res.text ? res.text.trim() : "";
}

/**
 * Probe active persona before REM run and store the 'before' baseline in store.comparisons
 */
export async function createComparisonBefore(opts: {
  runId: string;
  sessionId: string;
  scope?: PersonaScope;
  question?: string;
}): Promise<Comparison | null> {
  const { readStore, updateStore } = await import("../store.ts");
  const store = await readStore();
  const sessionScope: PersonaScope =
    opts.scope || (opts.sessionId ? `session:${opts.sessionId}` : "school");

  let activeVersion = store.activePersona || 1;
  if (store.activePersonas && store.activePersonas[sessionScope]) {
    activeVersion = store.activePersonas[sessionScope];
  }

  const activePersona =
    (store.personas || []).find((p) => p.version === activeVersion) ||
    store.personas?.[0] || {
      version: 1,
      systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야.",
      approvedAt: new Date().toISOString(),
      parentVersion: 0,
      sourceInsightIds: [],
    };

  const sessionNodes = (store.nodes || [])
    .filter((n) => n.sessionId === opts.sessionId)
    .sort((a, b) => a.order - b.order);

  // 비교 질문 = 관람객이 마지막으로 한 말. 그 말은 질문으로 쓰고, 그 앞의 대화만 맥락으로 넣는다
  const last = sessionNodes[sessionNodes.length - 1];
  const lastAsk = last?.user?.trim();
  const question = opts.question || lastAsk || DEFAULT_PROBE_QUESTION;
  const history = !opts.question && lastAsk ? sessionNodes.slice(0, -1) : sessionNodes;

  // Probe persona OUTSIDE updateStore
  const beforeAnswer = await probePersona({
    persona: activePersona,
    nodes: history,
    question,
    runId: opts.runId,
  });

  let createdComparison: Comparison | null = null;

  await updateStore((s) => {
    if (!Array.isArray(s.comparisons)) {
      s.comparisons = [];
    }
    const nextId =
      (s.comparisons.reduce((max, c) => Math.max(max, c.id), 0) ?? 0) + 1;

    createdComparison = {
      id: nextId,
      runId: opts.runId,
      scope: sessionScope,
      question,
      historyNodeIds: history.map((n) => n.id),
      before: {
        version: activePersona.version,
        answer: beforeAnswer,
        at: new Date().toISOString(),
      },
      after: null,
    };

    s.comparisons.push(createdComparison);
  });

  return createdComparison;
}

/**
 * Probe new persona version after proposal approval and update 'after' in store.comparisons
 */
export async function updateComparisonAfter(opts: {
  runId: string;
  scope?: PersonaScope;
  newPersona: PersonaVersion;
  sessionId?: string;
}): Promise<Comparison | null> {
  const { readStore, updateStore } = await import("../store.ts");
  const store = await readStore();
  const pendingComparison = (store.comparisons || []).find(
    (c) => c.runId === opts.runId && c.after === null
  );

  if (!pendingComparison) {
    return null;
  }

  // 잠들기 전과 똑같은 대화 맥락으로 묻는다 (예전 기록에 historyNodeIds가 없으면 그 세션 대화 전체)
  const run = (store.runs || []).find((r) => r.id === opts.runId);
  const sessionId = opts.sessionId ?? run?.sessionId;
  const ids = pendingComparison.historyNodeIds ? new Set(pendingComparison.historyNodeIds) : null;
  const sessionNodes = (store.nodes || [])
    .filter((n) => (ids ? ids.has(n.id) : !!sessionId && n.sessionId === sessionId))
    .sort((a, b) => a.order - b.order);

  // Probe new persona OUTSIDE updateStore
  const afterAnswer = await probePersona({
    persona: opts.newPersona,
    nodes: sessionNodes,
    question: pendingComparison.question,
    runId: opts.runId,
  });

  let updatedComparison: Comparison | null = null;

  await updateStore((s) => {
    const comp = (s.comparisons || []).find(
      (c) => c.runId === opts.runId && c.after === null
    );
    if (comp) {
      comp.after = {
        version: opts.newPersona.version,
        answer: afterAnswer,
        at: new Date().toISOString(),
      };
      updatedComparison = comp;
    }
  });

  return updatedComparison;
}
