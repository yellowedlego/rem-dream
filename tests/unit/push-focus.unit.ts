// 거꾸로 마리오식 카메라(src/components/camera.ts의 pushFocus) 검사.
// 실행: node --test tests/unit/push-focus.unit.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pushFocus } from "../../src/components/camera.ts";

const H = 400;
const M = 100; // 여백

test("비추는 자리가 달창 여백 안쪽이면 그대로 둔다 (대화는 가만히 있는다)", () => {
  for (let focus = 500 + M; focus <= 500 + H - M; focus += 10) {
    assert.equal(pushFocus(focus, 500, H, M), focus);
  }
});

test("달창을 아래로 굴려 비추는 자리가 위 여백에 닿으면 여백 위치로 밀려 올라온다 (대화가 따라간다)", () => {
  let focus = 600;
  for (let scroll = 500; scroll <= 900; scroll += 20) {
    focus = pushFocus(focus, scroll, H, M);
    assert.ok(focus >= scroll + M, `scroll ${scroll}: focus ${focus}`);
  }
  assert.equal(focus, 900 + M);
});

test("위로 굴릴 때는 아래 여백에 닿을 때까지 가만히 있다가 닿으면 밀려 내려온다", () => {
  let focus = 600;
  for (let scroll = 500; scroll >= 100; scroll -= 20) {
    const next = pushFocus(focus, scroll, H, M);
    if (focus <= scroll + H - M) assert.equal(next, focus); // 아직 여백 안쪽
    else assert.equal(next, scroll + H - M);
    assert.ok(next <= scroll + H - M);
    focus = next;
  }
  assert.equal(focus, 100 + H - M);
});

test("여백이 칸의 절반을 넘으면 가운데에 붙잡아 둔다", () => {
  assert.equal(pushFocus(0, 100, H, 300), 100 + H / 2);
  assert.equal(pushFocus(9999, 100, H, 300), 100 + H / 2);
});
