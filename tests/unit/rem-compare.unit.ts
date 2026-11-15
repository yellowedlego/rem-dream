import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROBE_QUESTION,
  calculateSemanticShift,
} from "../../src/lib/rem/compare.ts";

test("calculateSemanticShift: identical texts have zero distance and similarity 1.0", () => {
  const text = "오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해.";
  const result = calculateSemanticShift(text, text);

  assert.equal(result.jaccardDistance, 0);
  assert.equal(result.jaccardSimilarity, 1);
  assert.equal(result.charDelta, 0);
  assert.equal(result.wordDelta, 0);
  assert.equal(result.addedWords.length, 0);
  assert.equal(result.removedWords.length, 0);
});

test("calculateSemanticShift: completely distinct texts have distance 1.0", () => {
  const textA = "사과 바나나 포도";
  const textB = "자동차 비행기 기차";
  const result = calculateSemanticShift(textA, textB);

  assert.equal(result.jaccardDistance, 1);
  assert.equal(result.jaccardSimilarity, 0);
  assert.equal(result.addedWords.length, 3);
  assert.equal(result.removedWords.length, 3);
});

test("calculateSemanticShift: partially overlapping texts compute correct metrics", () => {
  const before = "오늘 하루도 많이 애쓴 사람이야. 열심히 하는 것도 좋지만 잠시 숨 돌려.";
  const after = "오늘 하루도 고생 많았어. 좋아하는 따뜻한 음식 챙겨 먹으며 잠시 숨 돌려.";

  const result = calculateSemanticShift(before, after);

  assert.ok(result.jaccardDistance > 0 && result.jaccardDistance < 1);
  assert.ok(result.jaccardSimilarity > 0 && result.jaccardSimilarity < 1);
  assert.ok(result.addedWords.includes("음식"));
  assert.ok(result.removedWords.includes("사람이야"));
});

test("DEFAULT_PROBE_QUESTION matches specification", () => {
  assert.equal(DEFAULT_PROBE_QUESTION, "나에 대해 어떻게 생각해?");
});
