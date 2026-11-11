// "내 AI" 계산(src/lib/profile/build.ts) 검사: 말투 추정, 위키 찾기, 사전 프롬프트 조립, 메일 주소.
// 실행: node --test tests/unit/profile-build.unit.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROMPT_MAX,
  buildPrompt,
  inferStyle,
  isEmail,
  maskEmail,
  searchWiki,
  styleLine,
  wikiContext,
} from "../../src/lib/profile/build.ts";
import type { WikiEntry } from "../../src/lib/types.ts";

test("반말·짧은 글·ㅋㅋ를 알아본다", () => {
  const s = inferStyle(["오늘 시험 망함 ㅋㅋ", "배고파", "진짜 졸려 ㅋㅋㅋ", "그치?"]);
  assert.equal(s.polite, false);
  assert.equal(s.length, "short");
  assert.equal(s.laughs, true);
  assert.equal(s.samples, 4);
});

test("존댓말·긴 글을 알아본다, 사진만 보낸 말은 세지 않는다", () => {
  const long = "오늘은 동아리에서 전시 준비를 했는데요, 생각보다 할 일이 많아서 조금 지쳤어요. 그래도 친구들이 도와줘서 다행이었어요.";
  const s = inferStyle([long, long, "(사진)"]);
  assert.equal(s.polite, true);
  assert.equal(s.length, "long");
  assert.equal(s.samples, 2);
});

test("말이 없으면 존댓말·보통 길이", () => {
  assert.deepEqual(inferStyle([]), { polite: true, length: "medium", laughs: false, emoji: false, samples: 0 });
});

test("말투 한 줄", () => {
  assert.equal(
    styleLine({ polite: false, length: "short", laughs: true, emoji: false, samples: 3 }),
    "반말로 편하게, 두세 문장 안으로 짧게, ㅋㅋ 같은 웃음도 가끔 섞어서 말해 줘.",
  );
});

const wiki: WikiEntry[] = [
  { id: 1, title: "시험 걱정", body: "나는 수학 시험 범위가 너무 넓어서 걱정이라고 했어.", keywords: ["수학", "시험"], sourceNodeIds: [1] },
  { id: 2, title: "떡볶이 사랑", body: "나는 힘들 때 떡볶이를 먹으면 기분이 풀린다고 했어.", keywords: ["떡볶이"], sourceNodeIds: [2] },
  { id: 3, title: "동아리 전시", body: "나는 동아리 전시를 준비하고 있어.", keywords: ["동아리", "전시"], sourceNodeIds: [3] },
];

test("이번 말과 겹치는 위키 칸을 찾는다 (낱말 끝이 달라도)", () => {
  const hits = searchWiki(wiki, "내일 수학시험인데 어떡하지");
  assert.equal(hits[0].entry.id, 1);
  assert.deepEqual(searchWiki(wiki, "떡볶이가 먹고 싶다").map((h) => h.entry.id), [2]);
});

test("관련 없는 말이면 아무것도 고르지 않는다, 최대 k개", () => {
  assert.deepEqual(searchWiki(wiki, "날씨 좋다"), []);
  assert.deepEqual(searchWiki(wiki, ""), []);
  assert.ok(searchWiki(wiki, "시험 끝나고 떡볶이 먹고 동아리 전시 가자", 2).length <= 2);
});

test("찾은 칸은 시스템 프롬프트용 글이 된다", () => {
  assert.equal(wikiContext([]), "");
  const ctx = wikiContext(searchWiki(wiki, "떡볶이"));
  assert.match(ctx, /^\[기억 위키에서 찾은 내 이야기/);
  assert.match(ctx, /- 떡볶이 사랑: /);
});

const parts = {
  relation: "friend" as const,
  style: { polite: false, length: "short" as const, laughs: true, emoji: false, samples: 4 },
  about: "나는 시험 전에 걱정이 많은 편이야.",
  tips: ["내가 걱정할 땐 먼저 들어 줘."],
  wiki,
};

test("사전 프롬프트: 관계·말투·나에 대해·요령·위키가 다 들어간다", () => {
  const p = buildPrompt(parts);
  assert.match(p, /^\[나와 말이 잘 통하는 AI가 되어 줘\]/);
  assert.match(p, /나의 친구야/);
  assert.match(p, /반말로 편하게/);
  assert.match(p, /나에 대해: 나는 시험 전에/);
  assert.match(p, /- 내가 걱정할 땐 먼저 들어 줘\./);
  assert.match(p, /- 떡볶이 사랑: /);
  assert.match(buildPrompt({ ...parts, relation: "mentor" }), /나의 멘토야/);
});

test("사전 프롬프트는 QR에 들어가는 길이를 넘지 않는다 (위키 칸을 뒤에서부터 뺀다)", () => {
  const many: WikiEntry[] = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    title: `이야기 ${i + 1}`,
    body: "나는 이 이야기를 아주 길게 했어. ".repeat(6),
    keywords: [],
    sourceNodeIds: [],
  }));
  const p = buildPrompt({ ...parts, wiki: many });
  assert.ok(p.length <= PROMPT_MAX, `${p.length}자`);
  assert.match(p, /- 이야기 1: /);
  assert.doesNotMatch(p, /- 이야기 8: /);
  assert.ok(Buffer.byteLength(p, "utf8") <= 2953);
});

test("메일 주소 검사와 가리기", () => {
  assert.equal(isEmail("abc@example.com"), true);
  assert.equal(isEmail("a@b"), false);
  assert.equal(isEmail("a@b.com, c@d.com"), false);
  assert.equal(isEmail("a@b.com\nBcc: x@y.com"), false);
  assert.equal(isEmail(42), false);
  assert.equal(maskEmail("abc@example.com"), "a***@example.com");
});
