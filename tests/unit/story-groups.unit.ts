import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coversExactly,
  groupsToPieces,
  pieceText,
  splitSentences,
  validateMeanings,
} from "../../src/lib/story/groups.ts";

const TEXT = "아침에 비가 왔다. 점심은 국수였다. 저녁에도 비가 왔다.\n친구가 전화했다.";
const sentences = splitSentences(TEXT);

test("문장 나누기는 원문 전체를 빈틈·겹침 없이 덮는다", () => {
  assert.equal(sentences.length, 4);
  assert.equal(sentences.map((s) => TEXT.slice(s.start, s.end)).join(""), TEXT);
});

test("뒤섞인 이야기: 떨어진 문장이 한 조각의 여러 구간이 된다", () => {
  const pieces = groupsToPieces(
    TEXT,
    sentences,
    { groups: [{ topic: "비", sentences: [1, 3] }, { topic: "밥", sentences: [2] }, { topic: "친구", sentences: [4] }] },
    8,
  )!;
  assert.equal(pieces.length, 3);
  assert.equal(pieces[0].spans.length, 2);
  assert.ok(coversExactly(TEXT, pieces));
  assert.equal(pieceText(TEXT, pieces[0]), `${TEXT.slice(...pieces[0].spans[0])}\n${TEXT.slice(...pieces[0].spans[1])}`);
});

test("빠진 문장·중복·범위 밖 번호·너무 많은 묶음은 거부한다", () => {
  const g = (groups: { topic: string; sentences: number[] }[]) => groupsToPieces(TEXT, sentences, { groups }, 2);
  assert.equal(g([{ topic: "a", sentences: [1, 2, 3] }]), null); // 4번 빠짐
  assert.equal(g([{ topic: "a", sentences: [1, 2, 3, 4] }, { topic: "b", sentences: [4] }]), null); // 중복
  assert.equal(g([{ topic: "a", sentences: [1, 2, 3, 5] }]), null); // 범위 밖
  assert.equal(g([{ topic: "a", sentences: [1] }, { topic: "b", sentences: [2] }, { topic: "c", sentences: [3, 4] }]), null); // 상한 초과
  assert.equal(g([{ topic: "a", sentences: [] }, { topic: "b", sentences: [1, 2, 3, 4] }]), null); // 빈 묶음
});

test("의미 검증: 잘못된 의미만 버리고 번호는 조각 번호 → 0부터 인덱스로", () => {
  const out = validateMeanings(
    {
      meanings: [
        { title: "비 오는 날", essence: "비가 계속 왔다.", nodes: [1, 1, 3, 9] },
        { title: "", essence: "제목 없음", nodes: [1] },
        { title: "빈 근거", essence: "근거 없음", nodes: [9] },
      ],
    },
    3,
    5,
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].pieceIndexes, [0, 2]);
});
