// 하늘 연출 계산(src/components/sky.ts) 검사.
// 실행: node --test tests/unit/sky.unit.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERGE,
  convergePos,
  domeStars,
  domeY,
  glowAt,
  namedStars,
  netLinks,
  orbitSlots,
  orbitSpeed,
  polarisKick,
  rippleDelay,
  sphereProject,
  VIEW_TILT,
} from "../../src/components/sky.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("천구 윗선: 양 끝은 바닥, 가운데가 꼭대기, 좌우 대칭, 칸 밖은 끝에 붙는다", () => {
  near(domeY(0, 600, 150), 150);
  near(domeY(600, 600, 150), 150);
  near(domeY(300, 600, 150), 8);
  near(domeY(120, 600, 150), domeY(480, 600, 150));
  assert.ok(domeY(150, 600, 150) < domeY(60, 600, 150)); // 가운데로 갈수록 높다(작은 y)
  near(domeY(-50, 600, 150), 150);
});

test("배경 별은 모두 천구 안에 있고, 같은 씨앗이면 같은 자리", () => {
  const s = domeStars(60, 600, 150);
  for (const p of s) {
    assert.ok(p.x >= 0 && p.x <= 600);
    assert.ok(p.y >= domeY(p.x, 600, 150) && p.y <= 150, `${p.x},${p.y}`);
  }
  assert.deepEqual(domeStars(60, 600, 150), s);
});

test("이름 있는 별은 왼쪽부터 순서대로 놓이고 천구 안에 있다", () => {
  const s = namedStars(6, 600, 150);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].x > s[i - 1].x);
  for (const p of s) assert.ok(p.y > domeY(p.x, 600, 150) && p.y < 150);
});

test("빛은 A에서 멀수록 약하고, 물결은 멀수록 늦게 닿는다", () => {
  near(glowAt(0, 80), 1);
  assert.ok(glowAt(40, 80) > glowAt(120, 80));
  assert.ok(glowAt(400, 80) < 0.01);
  assert.ok(rippleDelay(300) > rippleDelay(100));
});

test("공전: 안쪽이 바깥보다 빠르다", () => {
  assert.ok(orbitSpeed(100) > orbitSpeed(300));
});

test("공전 자리: 반지름은 띠 안, 같은 세션은 비슷한 각도", () => {
  const ms = [
    { id: 1, sessionId: "a" },
    { id: 2, sessionId: "a" },
    { id: 3, sessionId: "b" },
  ];
  const slots = orbitSlots(ms, 100, 300);
  for (const s of slots) assert.ok(s.r > 80 && s.r < 320, `${s.r}`);
  const a = slots.filter((_, i) => ms[i].sessionId === "a");
  assert.ok(Math.abs(a[0].angle - a[1].angle) < 1);
});

test("모이는 연출: 처음엔 집, 원이 납작해지면 한 줄(45도 위), 빨려 들면 가운데, 끝나면 다시 집", () => {
  const home = { x: 200, y: -50 };
  const p0 = convergePos(0, 0, 5, home, 150);
  near(p0.x, home.x);
  near(p0.y, home.y);

  // 납작해진 뒤: 모든 별이 y = -x 직선(45도 기울기) 위
  for (let i = 0; i < 5; i++) {
    const p = convergePos(CONVERGE.flatten + 0.01, i, 5, home, 150);
    near(p.y, -p.x, 1e-6);
  }
  const inside = convergePos(CONVERGE.plunge + 0.1, 2, 5, home, 150);
  assert.ok(Math.hypot(inside.x, inside.y) < 1);
  const end = convergePos(CONVERGE.end, 2, 5, home, 150);
  near(end.x, home.x);
  near(end.y, home.y);
});

test("그물: 시간순으로 다음 별과 잇고, 한 칸 건너는 선은 기간 안일 때만", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min)).toISOString();
  const ms = [
    { id: 3, createdAt: t(20) },
    { id: 1, createdAt: t(0) },
    { id: 2, createdAt: t(10) },
    { id: 4, createdAt: t(300) },
  ];
  assert.deepEqual(netLinks(ms), [
    [1, 2],
    [1, 3],
    [2, 3],
    [3, 4],
  ]);
  assert.deepEqual(netLinks([{ id: 1, createdAt: t(0) }]), []);
});

test("구 공전: 3D 거리는 반지름 그대로, 앞은 크고 뒤는 작다", () => {
  const D = 900;
  for (const a of [0, 0.7, 1.9, 3.3, 5]) {
    const p = sphereProject(200, a, 0.8, 1.1, D);
    // 원근을 걷어 낸 3D 거리 = 궤도 반지름
    near(Math.hypot(p.x / p.s, p.y / p.s, p.z), 200, 1e-6);
    assert.ok((p.z > 0) === (p.s > 1));
  }
  // 기울기 0이면 위에서 본 원을 VIEW_TILT만큼 눕힌 타원이다
  const top = sphereProject(100, Math.PI / 2, 0, 0, 1e9);
  near(top.y, 100 * Math.cos(VIEW_TILT), 1e-3);
});

test("북극성 관성: 빨려 들기 전엔 0, 뒤에는 흔들리다 잦아든다", () => {
  assert.deepEqual(polarisKick(1), { x: 0, y: 0 });
  const early = Math.max(...[0.05, 0.1, 0.15, 0.2].map((d) => Math.abs(polarisKick(CONVERGE.plunge + d).x)));
  const late = Math.abs(polarisKick(CONVERGE.plunge + 1.5).x);
  assert.ok(early > 5 && late < 1);
});
