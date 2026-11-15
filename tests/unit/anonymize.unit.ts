import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anonymizePhone,
  anonymizeEmail,
  anonymizeUrl,
  anonymizeLongDigits,
  anonymizeClass,
  anonymizeAddress,
  anonymizeNamesAndTitles,
  anonymizeText,
  anonymizeMeaning,
} from "../../src/lib/school/anonymize.ts";
import type { Meaning } from "../../src/lib/types.ts";

test("anonymizePhone removes phone numbers", () => {
  assert.equal(anonymizePhone("내 번호는 010-1234-5678 이야").trim(), "내 번호는  이야");
  assert.equal(anonymizePhone("연락처 01099887766 남겨").trim(), "연락처  남겨");
});

test("anonymizeEmail removes email addresses", () => {
  assert.equal(anonymizeEmail("메일은 user@example.com 으로 줘").trim(), "메일은  으로 줘");
});

test("anonymizeUrl removes http and https links", () => {
  assert.equal(anonymizeUrl("여기 봐봐 https://rem-dream.local/demo 확인").trim(), "여기 봐봐  확인");
});

test("anonymizeLongDigits removes 6+ consecutive digits", () => {
  assert.equal(anonymizeLongDigits("학번 20261101 메모").trim(), "학번  메모");
  // Less than 6 digits are preserved
  assert.equal(anonymizeLongDigits("3등 했어"), "3등 했어");
});

test("anonymizeClass removes class and student identifiers", () => {
  assert.equal(anonymizeClass("나는 2학년 3반 15번 민수").trim(), "나는  민수");
  assert.equal(anonymizeClass("우리 1학년 4반 교실이야").trim(), "우리  교실이야");
});

test("anonymizeAddress removes Korean address format", () => {
  assert.equal(
    anonymizeAddress("우리 집은 서울특별시 강남구 역삼동 근처").trim(),
    "우리 집은  근처"
  );
});

test("anonymizeNamesAndTitles converts names with vocatives/titles", () => {
  assert.equal(anonymizeNamesAndTitles("민수야 오늘 축구하자"), "친구야 오늘 축구하자");
  assert.equal(anonymizeNamesAndTitles("지훈아 안녕"), "친구야 안녕");
  assert.equal(anonymizeNamesAndTitles("김선생님 감사합니다"), "선생님 감사합니다");
  assert.equal(anonymizeNamesAndTitles("이수학쌤 최고"), "선생님 최고");
});

test("anonymizeText integrates all filters together", () => {
  const raw = "민수야 내 번호 010-1234-5678 이고 2학년 3반 15번이야. 메일 test@school.kr 로 연락해";
  const cleaned = anonymizeText(raw);
  assert.ok(!cleaned.includes("010-1234-5678"));
  assert.ok(!cleaned.includes("2학년 3반 15번"));
  assert.ok(!cleaned.includes("test@school.kr"));
  assert.ok(!cleaned.includes("민수야"));
  assert.ok(cleaned.includes("친구야"));
});

test("anonymizeMeaning returns null if essence is shorter than 8 characters", () => {
  const shortMeaning: Meaning = {
    id: 1,
    storyId: 10,
    sessionId: "sess_secret_123",
    nodeIds: [1],
    title: "짧은 글",
    essence: "010-1234-5678", // Anonymizes to "" (< 8 chars)
    keywords: ["짧음"],
    createdAt: new Date().toISOString(),
  };
  const result = anonymizeMeaning(shortMeaning, "tag_abc", 1);
  assert.equal(result, null);
});

test("anonymizeMeaning creates valid SchoolMeaning with no session id", () => {
  const meaning: Meaning = {
    id: 2,
    storyId: 11,
    sessionId: "sess_visitor_private_999",
    nodeIds: [1, 2],
    title: "민수야의 축구 이야기",
    essence: "민수야와 함께 2학년 3반 운동장에서 010-9999-8888 연락하며 신나게 축구를 했다.",
    keywords: ["축구", "민수야", "운동장"],
    createdAt: new Date().toISOString(),
  };
  const result = anonymizeMeaning(meaning, "random_tag_xyz", 5);
  assert.ok(result !== null);
  assert.equal(result.id, 5);
  assert.equal(result.count, 1);
  assert.deepEqual(result.sourceTags, ["random_tag_xyz"]);
  // Must NOT contain session id
  assert.equal((result as any).sessionId, undefined);
  // Title and essence must be anonymized
  assert.ok(!result.title.includes("민수야"));
  assert.ok(!result.essence.includes("010-9999-8888"));
  assert.ok(!result.essence.includes("2학년 3반"));
  assert.ok(!result.essence.includes("민수야"));
});
