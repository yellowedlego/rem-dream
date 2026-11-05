// 이야기 화면의 포커스 계산(src/components/storyFocus.ts) 검사.
// 실행: node --test tests/unit/story-focus.unit.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAR_LIST_SCROLL_FROM,
  buildLinks,
  focusedMoons,
  relatedOf,
  sameFocus,
  toggleFocus,
} from "../../src/components/storyFocus.ts";

const nodes = [{ id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }];
const meanings = [{ nodeIds: [11, 13] }, { nodeIds: [13, 14] }, { nodeIds: [99] }]; // 99는 이 이야기에 없는 번호

test("별 목록 스크롤은 4개부터", () => {
  assert.equal(STAR_LIST_SCROLL_FROM, 4);
});

test("의미 파일의 노드 번호를 달 순서로 바꿔 연결하고, 모르는 번호는 버린다", () => {
  assert.deepEqual(buildLinks(nodes, meanings), [
    { s: 0, i: 0 },
    { s: 0, i: 2 },
    { s: 1, i: 2 },
    { s: 1, i: 3 },
  ]);
  assert.deepEqual(buildLinks(nodes, []), []);
});

const links = buildLinks(nodes, meanings);

test("별을 포커스하면 그 별의 근거 달들이 이어진 것", () => {
  const r = relatedOf({ kind: "star", index: 0 }, links);
  assert.deepEqual([...r.moons].sort(), [0, 2]);
  assert.equal(r.stars.size, 0);
});

test("달을 포커스하면 그 달을 근거로 둔 별들이 이어진 것 (한 달이 두 별에 걸칠 수 있다)", () => {
  const r = relatedOf({ kind: "moon", index: 2 }, links);
  assert.deepEqual([...r.stars].sort(), [0, 1]);
  assert.equal(r.moons.size, 0);
  assert.deepEqual([...relatedOf({ kind: "moon", index: 1 }, links).stars], []); // 어느 별에도 안 속한 달
});

test("포커스가 없으면 이어진 것도 없다", () => {
  const r = relatedOf(null, links);
  assert.equal(r.moons.size + r.stars.size, 0);
});

test("같은 것을 다시 누르면 풀리고, 다른 것을 누르면 바뀐다", () => {
  const a = { kind: "moon", index: 1 } as const;
  assert.equal(toggleFocus(null, a), a);
  assert.equal(toggleFocus(a, { kind: "moon", index: 1 }), null);
  assert.deepEqual(toggleFocus(a, { kind: "star", index: 1 }), { kind: "star", index: 1 });
  assert.equal(sameFocus(a, { kind: "star", index: 1 }), false);
  assert.equal(sameFocus(null, null), false);
});

test("원문에서 또렷하게 보일 달: 달이면 자기 자신, 별이면 근거 달들", () => {
  assert.deepEqual([...focusedMoons({ kind: "moon", index: 3 }, links)], [3]);
  assert.deepEqual([...focusedMoons({ kind: "star", index: 1 }, links)].sort(), [2, 3]);
  assert.equal(focusedMoons(null, links).size, 0);
});
