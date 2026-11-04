// 마리오식 카메라 계산(src/components/camera.ts) 검사.
// 실행: node --test tests/unit/camera.unit.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { followCamera } from "../../src/components/camera.ts";

const H = 400;
const M = 100; // 여백
const MAX = 2000;

test("여백 안쪽에서는 카메라가 가만히 있는다", () => {
  for (let focus = 500 + M; focus <= 500 + H - M; focus += 10) {
    assert.equal(followCamera(focus, 500, H, M, MAX), 500);
  }
});

test("앞으로 가다 아래 여백에 닿으면 여백을 유지하며 따라간다", () => {
  let cam = 0;
  for (let focus = 0; focus <= 1500; focus += 25) {
    cam = followCamera(focus, cam, H, M, MAX);
    assert.ok(focus <= cam + H - M + 1e-9, `focus ${focus}가 아래 여백을 넘음 (cam ${cam})`);
    assert.ok(focus >= cam + M - 1e-9 || cam === 0);
  }
  assert.equal(cam, 1500 - H + M); // 마지막에도 여백을 남기고 따라온 상태
});

test("반대로 가면 카메라는 그대로, 반대쪽 여백에 닿을 때 다시 따라간다", () => {
  // 아래로 따라가서 카메라가 1000이 된 상태
  const cam = followCamera(1000 + H - M, 0, H, M, MAX);
  assert.equal(cam, 1000);
  // 반대로 가기 시작: 위 여백(cam + M = 1100)에 닿기 전까지 그대로
  const seen: number[] = [];
  let c = cam;
  for (let focus = 1000 + H - M; focus >= 1000 + M; focus -= 20) {
    c = followCamera(focus, c, H, M, MAX);
    seen.push(c);
  }
  assert.ok(seen.every((v) => v === 1000), "여백 안쪽에서 카메라가 움직임");
  // 위 여백을 지나 더 가면 따라간다
  c = followCamera(1000 + M - 50, c, H, M, MAX);
  assert.equal(c, 1000 - 50);
});

test("맨 위·맨 아래를 넘지 않는다", () => {
  assert.equal(followCamera(-500, 0, H, M, MAX), 0);
  assert.equal(followCamera(9999, 0, H, M, MAX), MAX);
});

test("움직임 한계: 한 번에 필요한 만큼만 (과하게 따라가지 않는다)", () => {
  for (const cam of [0, 137, 800, 1999]) {
    for (let focus = 0; focus <= 2400; focus += 7) {
      const next = followCamera(focus, cam, H, M, MAX);
      const top = Math.min(next + M, next + H - M);
      void top;
      // 결과가 달라졌다면 focus가 정확히 여백 선 위에 놓여야 한다 (위/아래 한계 때문에 못 맞춘 경우 제외)
      if (next !== cam && next > 0 && next < MAX) {
        const onEdge = Math.abs(focus - (next + M)) < 1e-9 || Math.abs(focus - (next + H - M)) < 1e-9;
        assert.ok(onEdge, `cam ${cam}, focus ${focus}: 필요 이상으로 움직임 (${next})`);
      }
    }
  }
});
