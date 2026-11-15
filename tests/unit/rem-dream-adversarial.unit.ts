import { test } from "node:test";
import assert from "node:assert/strict";
import { dreamMode, buildDreamMeaningPairPrompt } from "../../src/lib/rem/modes/dream.ts";
import type { Meaning, MemoryNode } from "../../src/lib/types.ts";
import type { RemContext } from "../../src/lib/rem/types.ts";

function createMockMeaning(id: number, storyId: number, title: string, keywords: string[] = ["테스트"]): Meaning {
  return {
    id,
    storyId,
    sessionId: "test-session",
    nodeIds: [id * 10, id * 10 + 1],
    title,
    essence: `${title}의 핵심 내용입니다.`,
    keywords,
    createdAt: new Date().toISOString(),
  };
}

function createMockNode(id: number, user: string, ai: string): MemoryNode {
  return {
    id,
    sessionId: "test-session",
    order: id,
    createdAt: new Date().toISOString(),
    user,
    ai,
  };
}

test("dreamMode - Cross-story pairing prioritization: 4 meanings across 2 stories", async () => {
  const meanings: Meaning[] = [
    createMockMeaning(1, 10, "Story 10 - 의미 A"),
    createMockMeaning(2, 10, "Story 10 - 의미 B"),
    createMockMeaning(3, 20, "Story 20 - 의미 C"),
    createMockMeaning(4, 20, "Story 20 - 의미 D"),
  ];

  const markedPairs: number[][] = [];
  const askedPrompts: string[] = [];

  const ctx: RemContext = {
    runId: "run-test-1",
    sessionId: "test-session",
    nodes: [],
    meanings,
    temperature: 1.2,
    signal: new AbortController().signal,
    shouldStop: () => false,
    async markReading() {},
    async markMeaning(meaningIds: number[]) {
      markedPairs.push(meaningIds);
    },
    async ask(prompt) {
      askedPrompts.push(prompt);
      return {
        text: JSON.stringify({
          content: "새로운 연결 통찰",
          strength: 0.85,
        }),
      };
    },
  };

  const insights = await dreamMode.run(ctx);

  assert.equal(insights.length, 3, "Should produce max 3 pairs");
  assert.equal(markedPairs.length, 3, "Should mark 3 pairs of meanings");

  // Verify that all 3 pairs are cross-story pairs (story 10 paired with story 20)
  for (const [idA, idB] of markedPairs) {
    const mA = meanings.find((m) => m.id === idA)!;
    const mB = meanings.find((m) => m.id === idB)!;
    assert.notEqual(
      mA.storyId,
      mB.storyId,
      `Pair [${idA}, ${idB}] should be cross-story, got stories ${mA.storyId} and ${mB.storyId}`
    );
  }
});

test("dreamMode - Cross-story fill with same-story: 3 meanings (2 in story 1, 1 in story 2)", async () => {
  const meanings: Meaning[] = [
    createMockMeaning(1, 1, "의미 1 (이야기 1)"),
    createMockMeaning(2, 1, "의미 2 (이야기 1)"),
    createMockMeaning(3, 2, "의미 3 (이야기 2)"),
  ];

  const markedPairs: number[][] = [];

  const ctx: RemContext = {
    runId: "run-test-2",
    sessionId: "test-session",
    nodes: [],
    meanings,
    temperature: 1.2,
    signal: new AbortController().signal,
    shouldStop: () => false,
    async markReading() {},
    async markMeaning(meaningIds: number[]) {
      markedPairs.push(meaningIds);
    },
    async ask() {
      return {
        text: JSON.stringify({ content: "꿈 통찰", strength: 0.9 }),
      };
    },
  };

  const insights = await dreamMode.run(ctx);

  assert.equal(insights.length, 3);
  assert.equal(markedPairs.length, 3);

  // First 2 pairs must be cross-story: (1, 3) and (2, 3)
  const pair1 = markedPairs[0];
  const pair2 = markedPairs[1];
  const m1A = meanings.find((m) => m.id === pair1[0])!;
  const m1B = meanings.find((m) => m.id === pair1[1])!;
  assert.notEqual(m1A.storyId, m1B.storyId, "Pair 1 must be cross-story");

  const m2A = meanings.find((m) => m.id === pair2[0])!;
  const m2B = meanings.find((m) => m.id === pair2[1])!;
  assert.notEqual(m2A.storyId, m2B.storyId, "Pair 2 must be cross-story");

  // Third pair must be same-story: (1, 2)
  const pair3 = markedPairs[2];
  const m3A = meanings.find((m) => m.id === pair3[0])!;
  const m3B = meanings.find((m) => m.id === pair3[1])!;
  assert.equal(m3A.storyId, m3B.storyId, "Pair 3 must fill with same-story");
  assert.deepEqual(pair3.sort(), [1, 2]);
});

test("dreamMode - All meanings in same story: pairs up to 3 within the story", async () => {
  const meanings: Meaning[] = [
    createMockMeaning(1, 100, "A"),
    createMockMeaning(2, 100, "B"),
    createMockMeaning(3, 100, "C"),
  ];

  const markedPairs: number[][] = [];

  const ctx: RemContext = {
    runId: "run-test-3",
    sessionId: "test-session",
    nodes: [],
    meanings,
    temperature: 1.2,
    signal: new AbortController().signal,
    shouldStop: () => false,
    async markReading() {},
    async markMeaning(meaningIds: number[]) {
      markedPairs.push(meaningIds);
    },
    async ask() {
      return { text: JSON.stringify({ content: "동일 이야기 꿈", strength: 0.7 }) };
    },
  };

  const insights = await dreamMode.run(ctx);

  assert.equal(insights.length, 3);
  assert.equal(markedPairs.length, 3);
});

test("dreamMode - Fallback to nodes when meanings < 2 and nodes >= 2", async () => {
  const nodes: MemoryNode[] = [
    createMockNode(1, "질문 1", "답변 1"),
    createMockNode(2, "질문 2", "답변 2"),
  ];

  const readNodes: number[][] = [];

  const ctx: RemContext = {
    runId: "run-test-fallback",
    sessionId: "test-session",
    nodes,
    meanings: [], // 0 meanings
    temperature: 1.2,
    signal: new AbortController().signal,
    shouldStop: () => false,
    async markReading(nodeIds: number[]) {
      readNodes.push(nodeIds);
    },
    async markMeaning() {},
    async ask() {
      return { text: "노드 기반 꿈 통찰" };
    },
  };

  const insights = await dreamMode.run(ctx);

  assert.equal(insights.length, 1);
  assert.equal(insights[0].mode, "dream");
  assert.deepEqual(insights[0].sourceNodeIds, [1, 2]);
  assert.equal(readNodes.length, 1);
  assert.deepEqual(readNodes[0], [1, 2]);
});

test("dreamMode - Throws error when meanings < 2 and nodes < 2", async () => {
  const ctx: RemContext = {
    runId: "run-test-error",
    sessionId: "test-session",
    nodes: [createMockNode(1, "혼자 있는 대화", "답변")],
    meanings: [createMockMeaning(1, 10, "혼자 있는 의미")],
    temperature: 1.2,
    signal: new AbortController().signal,
    shouldStop: () => false,
    async markReading() {},
    async markMeaning() {},
    async ask() {
      return { text: "" };
    },
  };

  await assert.rejects(
    async () => {
      await dreamMode.run(ctx);
    },
    {
      message: /최소 2개 이상의 의미\(또는 대화 기억\)가 필요합니다\./,
    }
  );
});

test("dreamMode - Filters out insights with strength < 0.3", async () => {
  const meanings: Meaning[] = [
    createMockMeaning(1, 1, "의미 1"),
    createMockMeaning(2, 2, "의미 2"),
  ];

  let callCount = 0;
  const ctx: RemContext = {
    runId: "run-test-filter",
    sessionId: "test-session",
    nodes: [],
    meanings,
    temperature: 1.2,
    signal: new AbortController().signal,
    shouldStop: () => false,
    async markReading() {},
    async markMeaning() {},
    async ask() {
      callCount++;
      // Return low strength (< 0.3)
      return {
        text: JSON.stringify({
          content: "약한 통찰",
          strength: 0.25,
        }),
      };
    },
  };

  const insights = await dreamMode.run(ctx);

  assert.equal(callCount, 1);
  assert.equal(insights.length, 0, "Strength < 0.3 must be filtered out");
});

test("dreamMode - Prompt building includes essence and keywords", () => {
  const a = createMockMeaning(1, 10, "별 A", ["꿈", "우주"]);
  const b = createMockMeaning(2, 20, "별 B", ["바다", "모래"]);

  const prompt = buildDreamMeaningPairPrompt({ a, b });

  assert.ok(prompt.includes('<A 의미="별 A">'));
  assert.ok(prompt.includes("핵심: 별 A의 핵심 내용입니다."));
  assert.ok(prompt.includes("키워드: 꿈, 우주"));
  assert.ok(prompt.includes('<B 의미="별 B">'));
  assert.ok(prompt.includes("핵심: 별 B의 핵심 내용입니다."));
  assert.ok(prompt.includes("키워드: 바다, 모래"));
});

test("dreamMode - Graceful abort via shouldStop", async () => {
  const meanings: Meaning[] = [
    createMockMeaning(1, 1, "M1"),
    createMockMeaning(2, 2, "M2"),
    createMockMeaning(3, 3, "M3"),
    createMockMeaning(4, 4, "M4"),
  ];

  let loopCount = 0;
  let stopped = false;

  const ctx: RemContext = {
    runId: "run-test-abort",
    sessionId: "test-session",
    nodes: [],
    meanings,
    temperature: 1.2,
    signal: new AbortController().signal,
    shouldStop: () => stopped,
    async markReading() {},
    async markMeaning() {},
    async ask() {
      loopCount++;
      if (loopCount === 1) {
        stopped = true; // Trigger stop after first pair
      }
      return {
        text: JSON.stringify({ content: "첫 번째 통찰", strength: 0.8 }),
      };
    },
  };

  const insights = await dreamMode.run(ctx);

  assert.equal(loopCount, 1, "Should break after stop is signaled");
  assert.equal(insights.length, 1);
});
