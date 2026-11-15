import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROBE_QUESTION,
  calculateSemanticShift,
  probePersona,
} from "../../src/lib/rem/compare.ts";
import type { PersonaVersion, MemoryNode } from "../../src/lib/types.ts";

test("calculateSemanticShift - Identical texts: zero distance, similarity 1.0, zero deltas", () => {
  const text = "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야.";
  const res = calculateSemanticShift(text, text);

  assert.equal(res.jaccardDistance, 0);
  assert.equal(res.jaccardSimilarity, 1);
  assert.equal(res.charDelta, 0);
  assert.equal(res.wordDelta, 0);
  assert.deepEqual(res.addedWords, []);
  assert.deepEqual(res.removedWords, []);
  assert.ok(res.beforeWords.length > 0);
  assert.deepEqual(res.beforeWords.sort(), res.afterWords.sort());
});

test("calculateSemanticShift - Completely disjoint texts: distance 1.0, similarity 0.0", () => {
  const textBefore = "사과 바나나 포도 딸기 수박";
  const textAfter = "컴퓨터 모니터 키보드 마우스 스피커";
  const res = calculateSemanticShift(textBefore, textAfter);

  assert.equal(res.jaccardDistance, 1);
  assert.equal(res.jaccardSimilarity, 0);
  assert.equal(res.addedWords.length, 5);
  assert.equal(res.removedWords.length, 5);
  assert.deepEqual(res.addedWords.sort(), ["컴퓨터", "모니터", "키보드", "마우스", "스피커"].sort());
  assert.deepEqual(res.removedWords.sort(), ["사과", "바나나", "포도", "딸기", "수박"].sort());
});

test("calculateSemanticShift - Empty vs Empty: distance 0, similarity 1.0, zero deltas", () => {
  const res = calculateSemanticShift("", "");

  assert.equal(res.jaccardDistance, 0);
  assert.equal(res.jaccardSimilarity, 1);
  assert.equal(res.charDelta, 0);
  assert.equal(res.wordDelta, 0);
  assert.deepEqual(res.beforeWords, []);
  assert.deepEqual(res.afterWords, []);
  assert.deepEqual(res.addedWords, []);
  assert.deepEqual(res.removedWords, []);
});

test("calculateSemanticShift - Whitespace only vs Whitespace only: treated as empty", () => {
  const res = calculateSemanticShift("   \n\t  \r\n  ", "  \t  ");

  assert.equal(res.jaccardDistance, 0);
  assert.equal(res.jaccardSimilarity, 1);
  assert.deepEqual(res.beforeWords, []);
  assert.deepEqual(res.afterWords, []);
});

test("calculateSemanticShift - Empty before vs Non-empty after: distance 1.0, similarity 0.0", () => {
  const res = calculateSemanticShift("", "새로운 단어들 등장");

  assert.equal(res.jaccardDistance, 1);
  assert.equal(res.jaccardSimilarity, 0);
  assert.equal(res.addedWords.length, 3);
  assert.equal(res.removedWords.length, 0);
  assert.equal(res.charDelta, "새로운 단어들 등장".length);
  assert.equal(res.wordDelta, 3);
});

test("calculateSemanticShift - Non-empty before vs Empty after: distance 1.0, similarity 0.0", () => {
  const res = calculateSemanticShift("사라진 단어들", "");

  assert.equal(res.jaccardDistance, 1);
  assert.equal(res.jaccardSimilarity, 0);
  assert.equal(res.addedWords.length, 0);
  assert.equal(res.removedWords.length, 2);
  assert.equal(res.charDelta, -"사라진 단어들".length);
  assert.equal(res.wordDelta, -2);
});

test("calculateSemanticShift - Punctuation stripping and case normalization", () => {
  const before = "Hello, World! (TEST) 123";
  const after = "hello... world??? [test] 123";
  const res = calculateSemanticShift(before, after);

  // Both should normalize to ["hello", "world", "test", "123"]
  assert.equal(res.jaccardDistance, 0);
  assert.equal(res.jaccardSimilarity, 1);
  assert.deepEqual(res.addedWords, []);
  assert.deepEqual(res.removedWords, []);
});

test("calculateSemanticShift - Korean punctuation normalization", () => {
  const before = "오늘도 많이, 애쓴 사람이야...!";
  const after = "오늘도 많이 애쓴 사람이야";
  const res = calculateSemanticShift(before, after);

  assert.equal(res.jaccardDistance, 0);
  assert.equal(res.jaccardSimilarity, 1);
  assert.deepEqual(res.addedWords, []);
  assert.deepEqual(res.removedWords, []);
});

test("calculateSemanticShift - Word repetition in text (multiset vs unique set)", () => {
  const before = "반복 반복 반복 사과";
  const after = "반복 사과 사과 사과";
  const res = calculateSemanticShift(before, after);

  // Unique sets are identical: {"반복", "사과"}
  assert.equal(res.jaccardDistance, 0);
  assert.equal(res.jaccardSimilarity, 1);
  // Word delta counts raw tokens: before has 4, after has 4 -> delta 0
  assert.equal(res.wordDelta, 0);
});

test("DEFAULT_PROBE_QUESTION constant conforms to specification", () => {
  assert.equal(DEFAULT_PROBE_QUESTION, "나에 대해 어떻게 생각해?");
});
