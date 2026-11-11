// 붙여 넣은 대화 기록의 화자 나누기(src/lib/story/speakers.ts) 검사.
// 실행: node --test tests/unit/speakers.unit.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSentences } from "../../src/lib/story/groups.ts";
import { labelOf, numberedWithSpeakers, speakersOf } from "../../src/lib/story/speakers.ts";

test("줄 맨 앞의 이름표를 알아본다", () => {
  assert.equal(labelOf("나: 오늘 시험 망했어"), "me");
  assert.equal(labelOf("  사용자 : 안녕"), "me");
  assert.equal(labelOf("**Gemini**: 그랬군요"), "ai");
  assert.equal(labelOf("제미나이: 괜찮아요"), "ai");
  assert.equal(labelOf("[AI] 답변입니다"), "ai");
  assert.equal(labelOf("You said"), "me"); // 이름표만 있는 줄
  assert.equal(labelOf("Gemini said"), "ai");
  assert.equal(labelOf("A: 네 맞아요"), "ai");
  assert.equal(labelOf("Q: 질문"), "me");
});

test("이름표가 아닌 문장은 고르지 않는다", () => {
  assert.equal(labelOf("나는 오늘 학교에 갔다"), null);
  assert.equal(labelOf("A cat sat on the mat"), null);
  assert.equal(labelOf("AI가 좋아"), null);
  assert.equal(labelOf("제미나이랑 얘기했는데"), null);
});

test("나와 AI 이름표가 둘 다 있어야 대화 기록으로 본다", () => {
  const one = "나: 오늘 힘들었어.\n그래도 버텼어.";
  assert.equal(speakersOf(one, splitSentences(one)), null);
  const plain = "오늘은 비가 왔다. 우산을 잃어버렸다.";
  assert.equal(speakersOf(plain, splitSentences(plain)), null);
});

test("문장마다 마지막에 나온 이름표의 화자가 붙고, 여러 줄 답도 이어진다", () => {
  const text = "나: 시험 망했어. 너무 속상해.\nGemini: 많이 속상했겠어요.\n다음엔 범위를 나눠 봐요.\n나: 고마워.";
  const sentences = splitSentences(text);
  const who = speakersOf(text, sentences)!;
  const pairs = sentences.map((s, i) => [text.slice(s.start, s.end).trim(), who[i]]);
  assert.deepEqual(pairs, [
    ["나: 시험 망했어.", "me"],
    ["너무 속상해.", "me"],
    ["Gemini: 많이 속상했겠어요.", "ai"],
    ["다음엔 범위를 나눠 봐요.", "ai"],
    ["나: 고마워.", "me"],
  ]);
});

test("첫 이름표 앞의 글은 내 말로 본다", () => {
  const text = "어제 대화 붙여 넣을게.\n나: 안녕\nAI: 안녕하세요";
  const s = splitSentences(text);
  assert.deepEqual(speakersOf(text, s), ["me", "me", "ai"]);
});

test("모델에 보여 줄 목록에 [나]/[AI] 표시가 붙는다 (대화가 아니면 표시 없음)", () => {
  const text = "나: 배고파\nAI: 뭐 먹을래요?";
  const s = splitSentences(text);
  assert.equal(numberedWithSpeakers(text, s, speakersOf(text, s)), "1. [나] 나: 배고파\n2. [AI] AI: 뭐 먹을래요?");
  const plain = "배고파. 밥 먹자.";
  const p = splitSentences(plain);
  assert.equal(numberedWithSpeakers(plain, p, null), "1. 배고파.\n2. 밥 먹자.");
});
