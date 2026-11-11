// 하늘 연출의 순수 계산 (화면 없이 tests/unit에서 시험한다)
// 1) 비교 화면 위 천구: 아치(∩) 모양 하늘, 별 자리, 점 A에서 퍼지는 빛
// 2) 의미성 하늘: 북극성 주위 공전 자리, 모여서 한 줄이 되어 빨려 들어가는 연출의 시간표

export interface Pt {
  x: number;
  y: number;
}

/**
 * 천구의 윗선: 폭 w, 높이 h인 칸 안에서 양 끝은 바닥(y=h), 가운데 꼭대기는 top인 원호.
 * x는 칸 밖이면 양 끝으로 붙인다.
 */
export function domeY(x: number, w: number, h: number, top = 8): number {
  const s = h - top; // 활꼴 높이
  const half = w / 2;
  const r = (half * half + s * s) / (2 * s);
  const cx = Math.min(Math.max(x, 0), w);
  const dx = cx - half;
  return top + r - Math.sqrt(Math.max(r * r - dx * dx, 0));
}

/** 같은 씨앗이면 늘 같은 수열 (별 자리가 새로고침해도 그대로이게) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) % 100000) / 100000;
  };
}

/** 천구 안(윗선 아래, 바닥 위)에 흩뿌린 배경 별 */
export function domeStars(n: number, w: number, h: number, seed = 7): (Pt & { r: number })[] {
  const rnd = seeded(seed);
  const out: (Pt & { r: number })[] = [];
  for (let i = 0; i < n; i++) {
    const x = 6 + rnd() * (w - 12);
    const yTop = domeY(x, w, h) + 4;
    const y = yTop + rnd() * Math.max(h - 6 - yTop, 0);
    out.push({ x, y, r: 0.6 + rnd() * 0.9 });
  }
  return out;
}

/**
 * 이름 있는 별(기억 위키 칸) 자리: 왼쪽에서 오른쪽으로 고르게 퍼뜨리고, 높이는 윗선 가까이에서 조금씩 엇갈린다.
 * 그래야 별자리 선이 아치를 따라 흐른다.
 */
export function namedStars(n: number, w: number, h: number, seed = 11): Pt[] {
  const rnd = seeded(seed);
  return Array.from({ length: n }, (_, i) => {
    const x = w * ((i + 0.5) / n) + (rnd() - 0.5) * (w / Math.max(n, 1)) * 0.4;
    const yTop = domeY(x, w, h) + 14;
    const room = Math.max(h - 14 - yTop, 0);
    return { x, y: yTop + room * (0.15 + rnd() * 0.5) };
  });
}

/** 점 A에서 거리 d만큼 떨어진 별이 받는 빛 (0~1, 가우스) */
export function glowAt(d: number, sigma: number): number {
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** 빛이 A에서 물결처럼 퍼지게: 거리에 비례한 지연(초) */
export function rippleDelay(d: number, speed = 700): number {
  return d / speed;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 의미성 하늘 ──

/** 공전 반지름 r에서의 각속도(라디안/초). 안쪽이 빠르다 (케플러처럼 r^-1.5에 비례, 너무 빠르지 않게) */
export function orbitSpeed(r: number, base = 0.05, r0 = 200): number {
  return base * Math.pow(r0 / Math.max(r, 40), 1.5);
}

/**
 * 의미(별)들의 공전 자리. 같은 세션의 의미는 비슷한 각도에 모이고, 세션마다 반지름 띠가 조금씩 다르다.
 * minR~maxR 사이, 세션 순서대로 각도를 황금각으로 벌린다.
 */
export function orbitSlots(
  meanings: { sessionId: string; id: number }[],
  minR: number,
  maxR: number,
): { id: number; r: number; angle: number }[] {
  const sessions = [...new Set(meanings.map((m) => m.sessionId))];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return meanings.map((m) => {
    const si = sessions.indexOf(m.sessionId);
    const rnd = seeded(m.id * 2654435761);
    const band = sessions.length <= 1 ? 0.5 : (si % 5) / 4; // 0~1
    const r = minR + (maxR - minR) * (0.15 + band * 0.7) + (rnd() - 0.5) * (maxR - minR) * 0.18;
    const angle = si * golden + (rnd() - 0.5) * 0.9;
    return { id: m.id, r, angle };
  });
}

/**
 * 의미(별)들을 생성 시간순으로 잇는 옅은 그물. 바로 다음 별과는 늘, 한 칸 건너 별과는 둘의 간격이 가까울 때만(기간 안) 잇는다.
 * 그래서 별 하나에서 앞으로 많아야 두 줄 — 촘촘해지지 않고 시간이 가까운 별끼리 그물이 짜인다.
 */
export function netLinks(
  meanings: { id: number; createdAt: string }[],
  skipWithinMs = 30 * 60 * 1000,
): [number, number][] {
  const sorted = [...meanings].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const at = (i: number) => Date.parse(sorted[i].createdAt);
  const out: [number, number][] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i + 1 < sorted.length) out.push([sorted[i].id, sorted[i + 1].id]);
    if (i + 2 < sorted.length && at(i + 2) - at(i) <= skipWithinMs) out.push([sorted[i].id, sorted[i + 2].id]);
  }
  return out;
}

/** 모이는 연출의 시간표(초). 각 구간의 끝 시각 */
export const CONVERGE = {
  gather: 1.3, // 기운 원으로 모인다
  spin: 2.7, // 원을 따라 점점 빨리 돈다
  flatten: 3.25, // 원이 납작해져 한 줄이 된다
  plunge: 3.6, // 한 줄이 가운데로 빨려 들어간다
  wobble: 5.0, // 북극성이 관성으로 흔들리다 멈춘다
  talk: 10.5, // 대화 예시
  end: 12.0, // 별들이 제자리로 돌아온다
} as const;

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeIn = (t: number) => Math.pow(clamp01(t), 3);

/** 구간 [a, b]에서 지금 t가 몇 % 왔는지 (0~1) */
export const phase = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/**
 * 연출 중 별 i(전체 n개)의 자리. home은 원래 공전 자리, 반환값은 북극성 기준 좌표.
 * 기운 원(45도)은 가로 반지름 R, 세로는 R*0.42에서 시작해 납작해지고(→ 한 줄), 마지막에 길이까지 0으로 줄어든다.
 */
export function convergePos(t: number, i: number, n: number, home: Pt, R: number): Pt {
  const tilt = -Math.PI / 4;
  // 원 위의 자리: 처음 각도 + 점점 빨라지는 회전 (돌아간 각 = 가속 구간의 적분)
  const spinT = Math.max(0, t - CONVERGE.gather * 0.6);
  const turned = 0.6 * spinT * spinT;
  const theta = (2 * Math.PI * i) / Math.max(n, 1) + turned;
  const squash = 0.42 * (1 - easeInOut(phase(t, CONVERGE.spin, CONVERGE.flatten)));
  const len = 1 - easeIn(phase(t, CONVERGE.flatten, CONVERGE.plunge));
  const lx = R * len * Math.cos(theta);
  const ly = R * len * squash * Math.sin(theta);
  const ring = {
    x: lx * Math.cos(tilt) - ly * Math.sin(tilt),
    y: lx * Math.sin(tilt) + ly * Math.cos(tilt),
  };
  // 모이기 (집 → 원), 끝나면 (가운데 → 집)으로 다시 퍼진다
  const g = easeInOut(phase(t, 0, CONVERGE.gather));
  const back = easeInOut(phase(t, CONVERGE.talk, CONVERGE.end));
  if (t >= CONVERGE.plunge) return { x: home.x * back, y: home.y * back };
  return { x: home.x + (ring.x - home.x) * g, y: home.y + (ring.y - home.y) * g };
}

/** 빨려 들어간 직후 북극성이 관성으로 밀렸다 돌아오는 거리 (한 줄 방향 = 45도 축) */
export function polarisKick(t: number, amp = 26): Pt {
  if (t < CONVERGE.plunge) return { x: 0, y: 0 };
  const s = t - CONVERGE.plunge;
  const k = amp * Math.exp(-s * 2.6) * Math.sin(s * 9);
  return { x: k * Math.SQRT1_2, y: -k * Math.SQRT1_2 };
}
