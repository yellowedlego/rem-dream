"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MemoryNode } from "@/lib/types";
import type { Meaning } from "@/lib/types";
import { MOON_R, MoonShape } from "./Moon";
import { buildLinks, relatedOf, toggleFocus, type Link, type StoryFocus } from "./storyFocus";
import styles from "./StoryCloud.module.css";

// 옵시디언 그래프처럼: 이야기 노드(달)가 왼쪽에서 확 튕겨 나와 출렁이다 자리를 잡고, 별(의미 파일)이 노드들 사이에 놓인다.
// 물리: 모든 몸(달·별)이 서로 밀어내고, 별과 달은 용수철(선)로 이어진다. 달·별을 끌면 나머지가 따라온다.
// 선은 노드에서 별로 갈수록 밝아지는 그라데이션이고, 빛 알갱이가 선을 따라 별로 모인다.
// 연출 순서(CSS): 0 대기 → 1 등장 → 2 빛이 선을 따라 모임 → 3 별이 켜짐.
// 1 unit = 1px. 달은 전시 화면의 달(Moon)과 같은 그림이고, 별은 가장 큰 달의 1.5배다.
const H = 340;
const MARGIN = 28;
const ACCENT = "#efdfa6";
const MOON_MAX = MOON_R; // 가장 큰 달의 반지름(px)
const MOON_MIN = MOON_R * 0.72;
const STAR_OUTER = MOON_MAX * 1.5; // 별은 달보다 1.5배 크게
const STAR_INNER = STAR_OUTER * 0.42;
// StoryView 원문 보기의 주제 색과 같은 순서 (선의 시작 색)
const COLORS = ["#efdfa6", "#b9a3f5", "#8fd6b4", "#f2a38b", "#82b4f0", "#dc96c8"];

const GATHER_AT = 1250; // 빛이 선을 따라 모이기 시작하는 때
const STEP_MS = 70;
const PULSE_DELAY = 300;
const PULSE_MS = 1000;

// 물리 상수
const REPEL = 3200; // 달끼리 밀어내는 힘 (거리²에 반비례)
const REPEL_STAR = 4200; // 별은 조금 더 자리를 차지한다
const SPRING = 0.06; // 별과 달을 잇는 선의 탄성
const GRAVITY_STAR = 0.03; // 별이 칸 한가운데에 머물게 하는 힘
const GRAVITY_NODE = 0.004;
const FORCE_GAIN = 1.2;
const VELOCITY_KEEP = 0.82; // 프레임마다 속도가 남는 비율 (작을수록 빨리 가라앉음)
const VELOCITY_MAX = 40;
const ALPHA_DECAY = 0.012; // 식는 속도 (d3-force의 alpha와 같은 개념)
const ALPHA_MIN = 0.015;

const frac = (x: number) => x - Math.floor(x);
const hash = (i: number, seed: number) => frac(Math.sin(i * 127.1 + seed * 311.7) * 43758.5453);
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

const starPoints = (outer: number, inner: number) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? outer : inner;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 끌고 있는 동안 고정되는 위치 */
  fx: number | null;
  fy: number | null;
}

/** 별 s가 머무는 자리의 x: 별이 여러 개면 칸을 고르게 나눠 선다 */
const starHomeX = (s: number, k: number, width: number) => (width * (s + 1)) / (k + 1);

/** 힘 계산 한 프레임. bodies[0..n-1]은 달, bodies[n..n+k-1]은 별. */
function step(bs: Body[], n: number, links: Link[], rest: number[], radii: number[], width: number, alpha: number) {
  const m = bs.length;
  const k = m - n;
  const ax = new Array<number>(m).fill(0);
  const ay = new Array<number>(m).fill(0);
  const cx = width / 2;
  const cy = H / 2;

  // 서로 밀어내기 + 겹치지 않게
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const dx = bs[i].x - bs[j].x;
      const dy = bs[i].y - bs[j].y;
      const d2 = Math.max(dx * dx + dy * dy, 4);
      const d = Math.sqrt(d2);
      let push = (i >= n || j >= n ? REPEL_STAR : REPEL) / d2;
      const ri = i >= n ? STAR_OUTER : radii[i];
      const rj = j >= n ? STAR_OUTER : radii[j];
      const minD = ri + rj + 10;
      if (d < minD) push += ((minD - d) / d) * 0.6; // 닿으면 확 밀어낸다
      ax[i] += (dx / d) * push;
      ay[i] += (dy / d) * push;
      ax[j] -= (dx / d) * push;
      ay[j] -= (dy / d) * push;
    }
  }

  // 별과 달을 잇는 용수철 (옵시디언의 링크). 한 달이 여러 별에 이어질 수 있다
  for (const { s, i } of links) {
    const star = bs[n + s];
    const dx = bs[i].x - star.x;
    const dy = bs[i].y - star.y;
    const d = Math.max(Math.hypot(dx, dy), 1);
    const pull = (d - rest[i]) * SPRING;
    ax[i] -= (dx / d) * pull;
    ay[i] -= (dy / d) * pull;
    ax[n + s] += (dx / d) * pull * 0.5;
    ay[n + s] += (dy / d) * pull * 0.5;
  }

  // 별은 자기 자리로, 달은 한가운데로 살짝 모으기
  for (let s = 0; s < k; s++) {
    const star = bs[n + s];
    ax[n + s] += (starHomeX(s, k, width) - star.x) * GRAVITY_STAR;
    ay[n + s] += (cy - star.y) * GRAVITY_STAR;
  }
  for (let i = 0; i < n; i++) {
    ax[i] += (cx - bs[i].x) * GRAVITY_NODE;
    ay[i] += (cy - bs[i].y) * GRAVITY_NODE;
  }

  for (let i = 0; i < m; i++) {
    const b = bs[i];
    if (b.fx !== null && b.fy !== null) {
      b.x = b.fx;
      b.y = b.fy;
      b.vx = 0;
      b.vy = 0;
      continue;
    }
    b.vx = Math.max(-VELOCITY_MAX, Math.min(VELOCITY_MAX, (b.vx + ax[i] * FORCE_GAIN * alpha) * VELOCITY_KEEP));
    b.vy = Math.max(-VELOCITY_MAX, Math.min(VELOCITY_MAX, (b.vy + ay[i] * FORCE_GAIN * alpha) * VELOCITY_KEEP));
    b.x += b.vx;
    b.y += b.vy;
    // 칸 밖으로 못 나가고 벽에 닿으면 살짝 튕긴다
    if (b.x < MARGIN || b.x > width - MARGIN) {
      b.x = Math.min(width - MARGIN, Math.max(MARGIN, b.x));
      b.vx *= -0.3;
    }
    if (b.y < MARGIN || b.y > H - MARGIN) {
      b.y = Math.min(H - MARGIN, Math.max(MARGIN, b.y));
      b.vy *= -0.3;
    }
  }
}

export default function StoryCloud({
  nodes,
  meanings,
  storyId,
  focus,
  onFocus,
}: {
  nodes: MemoryNode[];
  /** 의미 파일(별)들. 0개일 수도 있다 (모델이 의미를 못 뽑았을 때는 달만 떠 있다) */
  meanings: Meaning[];
  storyId: number;
  /** 지금 포커스된 달·별 (아래 목록과 같은 값). 눌러서 바꾸면 onFocus로 알린다 */
  focus: StoryFocus | null;
  onFocus: (f: StoryFocus | null) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const n = nodes.length;
  const k = meanings.length;
  // 별 s ↔ 달 i 연결. 노드 번호를 이 화면의 달 순서로 바꾼다 (모르는 번호는 버린다)
  const links = useMemo(() => buildLinks(nodes, meanings), [nodes, meanings]);
  const linkCount = links.length;
  // 포커스: 눌린 것과 이어진 것만 또렷하게, 나머지는 흐리게
  const related = useMemo(() => relatedOf(focus, links), [focus, links]);
  const moonFocused = (i: number) => focus?.kind === "moon" && focus.index === i;
  const starFocused = (s: number) => focus?.kind === "star" && focus.index === s;
  const moonDim = (i: number) => !!focus && !moonFocused(i) && !related.moons.has(i);
  const starDim = (s: number) => !!focus && !starFocused(s) && !related.stars.has(s);
  const linkDim = (s: number, i: number) => !!focus && !(starFocused(s) || moonFocused(i));
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(0);
  const [phase, setPhase] = useState(0);
  const [still, setStill] = useState(false); // 움직임 줄이기 설정이면 바로 완성된 모습

  // 달의 크기(글이 길수록 조금 크다), 별과 떨어진 정도(노드마다 다르다), 선 색
  const look = useMemo(() => {
    const lens = nodes.map((nd) => (nd.storySpans ?? []).reduce((a, [s, e]) => a + e - s, 0) || nd.user.length);
    const maxLen = Math.max(...lens, 1);
    return nodes.map((_, i) => ({
      r: MOON_MIN + (MOON_MAX - MOON_MIN) * Math.sqrt(lens[i] / maxLen),
      rest: 64 + 56 * hash(i + 100, storyId),
      color: COLORS[i % COLORS.length],
    }));
  }, [nodes, storyId]);

  // 물리 상태와 그림 요소는 React 상태가 아니라 ref로 들고, 프레임마다 DOM에 직접 쓴다 (60fps에도 가볍게)
  const bodies = useRef<Body[]>([]);
  const alpha = useRef(1);
  const raf = useRef(0);
  const dragging = useRef<number | null>(null);
  // 눌렀다 떼는 동안 거의 안 움직였으면 "끌기"가 아니라 "누르기"로 보고 포커스를 바꾼다
  const downAt = useRef<{ x: number; y: number; idx: number } | null>(null);
  const widthRef = useRef(0);
  const phaseRef = useRef(0);
  const gatherAt = useRef(0);
  const kick = useRef<() => void>(() => {});
  const els = useRef({
    nodes: [] as (SVGGElement | null)[],
    lines: [] as (SVGLineElement | null)[],
    grads: [] as (SVGLinearGradientElement | null)[],
    pulses: [] as (SVGCircleElement | null)[],
    stars: [] as (SVGGElement | null)[],
  });

  // 그래프 폭 = 칸 폭
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 폭이 바뀌면 중심이 바뀌므로 살짝 다시 흔든다
  useEffect(() => {
    widthRef.current = w;
    if (bodies.current.length > 0) {
      alpha.current = Math.max(alpha.current, 0.3);
      kick.current();
    }
  }, [w]);

  // 물리 엔진: 몸을 만들고 프레임마다 계산 → 그리기
  const ready = w > 0;
  useEffect(() => {
    if (!ready) return;
    const width = widthRef.current;
    const e = els.current;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const radii = look.map((l) => l.r);
    const rest = look.map((l) => l.rest);

    const paint = (now: number) => {
      const bs = bodies.current;
      if (bs.length !== n + k) return;
      for (let s = 0; s < k; s++) {
        const star = bs[n + s];
        e.stars[s]?.setAttribute("transform", `translate(${star.x.toFixed(1)} ${star.y.toFixed(1)})`);
      }
      for (let i = 0; i < n; i++) {
        const b = bs[i];
        e.nodes[i]?.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`);
      }
      links.forEach(({ s, i }, li) => {
        const b = bs[i];
        const star = bs[n + s];
        for (const el of [e.lines[li], e.grads[li]]) {
          if (!el) continue;
          el.setAttribute("x1", b.x.toFixed(1));
          el.setAttribute("y1", b.y.toFixed(1));
          el.setAttribute("x2", star.x.toFixed(1));
          el.setAttribute("y2", star.y.toFixed(1));
        }
        // 빛 알갱이: 선이 움직여도 선을 따라간다
        const pulse = e.pulses[li];
        if (pulse) {
          const p = (now - gatherAt.current - (PULSE_DELAY + li * STEP_MS)) / PULSE_MS;
          if (phaseRef.current === 2 && p > 0 && p < 1) {
            const t = easeInOut(p);
            pulse.setAttribute("cx", (b.x + (star.x - b.x) * t).toFixed(1));
            pulse.setAttribute("cy", (b.y + (star.y - b.y) * t).toFixed(1));
            pulse.setAttribute("opacity", "1");
          } else {
            pulse.setAttribute("opacity", "0");
          }
        }
      });
    };

    // 처음 모양: 달은 왼쪽(이야기 글 쪽)에서 오른쪽으로 튕겨 나가고, 별은 자기 자리에서 기다린다
    const cy = H / 2;
    bodies.current = [
      ...nodes.map(
        (_, i): Body => ({
          x: 22,
          y: cy + (hash(i + 7, storyId) - 0.5) * 24,
          vx: 30 + 12 * hash(i + 13, storyId),
          vy: (hash(i + 29, storyId) - 0.5) * 30,
          fx: null,
          fy: null,
        }),
      ),
      ...meanings.map(
        (_, s): Body => ({ x: starHomeX(s, k, width), y: cy, vx: 0, vy: 0, fx: null, fy: null }),
      ),
    ];
    alpha.current = 1;

    if (reduce) {
      // 움직임 줄이기: 다 가라앉은 모양을 한 번에 계산해서 보여 준다
      let a = 1;
      for (let it = 0; it < 400; it++) {
        step(bodies.current, n, links, rest, radii, width, a);
        a *= 1 - ALPHA_DECAY;
      }
      alpha.current = 0;
      paint(performance.now());
      return;
    }

    const loop = (now: number) => {
      raf.current = 0;
      const held = dragging.current !== null;
      if (alpha.current > ALPHA_MIN || held) {
        step(bodies.current, n, links, rest, radii, widthRef.current, held ? Math.max(alpha.current, 0.3) : alpha.current);
        if (!held) alpha.current *= 1 - ALPHA_DECAY;
      }
      paint(now);
      if (alpha.current > ALPHA_MIN || held || phaseRef.current === 2) raf.current = requestAnimationFrame(loop);
    };
    kick.current = () => {
      if (!raf.current) raf.current = requestAnimationFrame(loop);
    };
    paint(performance.now());
    kick.current();

    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      kick.current = () => {};
    };
  }, [ready, nodes, n, k, meanings, links, storyId, look]);

  // 연출 단계 (CSS 전환이 쓰는 값). 2단계가 시작되면 빛 알갱이를 움직이려고 엔진을 깨운다.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => {
        setStill(true);
        setPhase(3);
      });
      return;
    }
    const lastArrival = GATHER_AT + PULSE_DELAY + Math.max(linkCount - 1, 0) * STEP_MS + PULSE_MS;
    const timers = [
      setTimeout(() => setPhase(1), 60),
      setTimeout(() => setPhase(2), GATHER_AT),
      setTimeout(() => setPhase(3), lastArrival),
    ];
    return () => timers.forEach(clearTimeout);
  }, [linkCount]);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === 2) {
      gatherAt.current = performance.now();
      kick.current();
    }
  }, [phase]);

  // ── 끌기 (달·별 모두): 끄는 동안 고정, 놓으면 다시 물리에 맡긴다. 어느 몸인지는 data-body로 안다 ──
  const bodyIndex = (ev: React.PointerEvent<SVGGElement>) => Number(ev.currentTarget.dataset.body);
  const pointOf = (ev: React.PointerEvent<SVGGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: ev.clientX - (r?.left ?? 0), y: ev.clientY - (r?.top ?? 0) };
  };
  const onDown = (ev: React.PointerEvent<SVGGElement>) => {
    const idx = bodyIndex(ev);
    const b = bodies.current[idx];
    if (!b) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = pointOf(ev);
    downAt.current = { x: ev.clientX, y: ev.clientY, idx };
    dragging.current = idx;
    b.fx = p.x;
    b.fy = p.y;
    alpha.current = Math.max(alpha.current, 0.4);
    kick.current();
  };
  const onMove = (ev: React.PointerEvent<SVGGElement>) => {
    const idx = bodyIndex(ev);
    if (dragging.current !== idx) return;
    const b = bodies.current[idx];
    const p = pointOf(ev);
    b.fx = Math.min(widthRef.current - MARGIN / 2, Math.max(MARGIN / 2, p.x));
    b.fy = Math.min(H - MARGIN / 2, Math.max(MARGIN / 2, p.y));
    kick.current();
  };
  const onUp = (ev: React.PointerEvent<SVGGElement>) => {
    const idx = bodyIndex(ev);
    const b = bodies.current[idx];
    if (b) {
      b.fx = null;
      b.fy = null;
    }
    if (dragging.current === idx) dragging.current = null;
    alpha.current = Math.max(alpha.current, 0.4);
    kick.current();
    const d = downAt.current;
    downAt.current = null;
    if (ev.type === "pointerup" && d && d.idx === idx && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 5) {
      onFocus(toggleFocus(focus, idx < n ? { kind: "moon", index: idx } : { kind: "star", index: idx - n }));
    }
  };
  const t = (spec: string) => (still ? "none" : spec);

  return (
    <figure className={styles.wrap}>
      <div ref={boxRef} className={styles.canvas} style={{ height: H }}>
        {ready && (
          <svg
            ref={svgRef}
            width={w}
            height={H}
            viewBox={`0 0 ${w} ${H}`}
            role="img"
            aria-label={`이야기 노드 ${n}개가 별 ${k}개로 모이는 그래프. 달과 별은 끌어서 움직일 수 있어요.`}
          >
            <defs>
              <radialGradient id={`${uid}-glow`}>
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.55" />
                <stop offset="45%" stopColor={ACCENT} stopOpacity="0.16" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </radialGradient>
              {links.map(({ s, i }, li) => (
                // 노드에서 별로 갈수록 밝아지는 선: 빛이 별에 모이는 방향이 보이게 (좌표는 프레임마다 물리가 넣는다)
                <linearGradient
                  key={`${s}-${i}`}
                  id={`${uid}-g${li}`}
                  ref={(el) => {
                    els.current.grads[li] = el;
                  }}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor={look[i].color} stopOpacity="0.1" />
                  <stop offset="55%" stopColor={look[i].color} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity="1" />
                </linearGradient>
              ))}
            </defs>

            {/* 선: 별 하나와 그 별의 근거 달 하나마다 한 줄 */}
            {links.map(({ s, i }, li) => (
              <line
                key={`${s}-${i}`}
                ref={(el) => {
                  els.current.lines[li] = el;
                }}
                stroke={`url(#${uid}-g${li})`}
                strokeWidth={1.4}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={phase >= 2 ? 0 : 1}
                style={{
                  transition: t(`stroke-dashoffset 900ms ease-out ${li * STEP_MS}ms, opacity 250ms ease`),
                  opacity: linkDim(s, i) ? 0.12 : 1,
                  strokeWidth: starFocused(s) || moonFocused(i) ? 2.4 : undefined,
                }}
              />
            ))}

            {/* 선을 따라 별로 모이는 빛 (위치는 물리 루프가 선 위에 놓는다) */}
            {links.map(({ s, i }, li) => (
              <circle
                key={`${s}-${i}`}
                ref={(el) => {
                  els.current.pulses[li] = el;
                }}
                r={2.4}
                fill="#fff7d6"
                opacity={0}
              />
            ))}

            {/* 별 (의미 파일): 근거 노드들 사이, 가장 큰 달의 1.5배. 번호는 아래 설명과 같다. 끌 수 있다 */}
            {meanings.map((m, s) => (
              <g
                key={m.id || `m${s}`}
                ref={(el) => {
                  els.current.stars[s] = el;
                }}
                style={{ opacity: starDim(s) ? 0.3 : 1, transition: "opacity 250ms ease" }}
                className={styles.grab}
                data-body={n + s}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <title>{m.title}</title>
                <circle r={STAR_OUTER + 10} fill="transparent" />
                {/* 포커스 고리: 눌린 별은 또렷하게, 이어진 별은 옅게 */}
                <circle
                  data-focus-ring=""
                  r={STAR_OUTER + 9}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1.6}
                  pointerEvents="none"
                  style={{ opacity: starFocused(s) ? 1 : related.stars.has(s) ? 0.5 : 0, transition: "opacity 200ms ease" }}
                />
                <circle
                  r={STAR_OUTER * 3.4}
                  fill={`url(#${uid}-glow)`}
                  pointerEvents="none"
                  style={{
                    opacity: phase >= 3 ? 1 : phase === 2 ? 0.3 : 0,
                    transform: `scale(${phase >= 3 ? 1 : 0.6})`,
                    transition: t("opacity 900ms ease, transform 900ms ease"),
                  }}
                />
                <polygon
                  points={starPoints(STAR_OUTER, STAR_INNER)}
                  fill={ACCENT}
                  style={{
                    opacity: phase >= 3 ? 1 : phase === 2 ? 0.6 : 0.2,
                    transform: `scale(${phase >= 3 ? 1 : phase === 2 ? 0.85 : 0.6}) rotate(${phase >= 3 ? 0 : -24}deg)`,
                    transition: t("opacity 700ms ease, transform 900ms cubic-bezier(0.34, 1.56, 0.64, 1)"),
                  }}
                />
                {k > 1 && (
                  <text
                    y={STAR_OUTER + 14}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill={ACCENT}
                    pointerEvents="none"
                    style={{ opacity: phase >= 3 ? 1 : 0, transition: t("opacity 600ms ease") }}
                  >
                    ★{s + 1}
                  </text>
                )}
              </g>
            ))}

            {/* 노드 = 대화창의 달. 번호는 달 아래에. 끌 수 있다 */}
            {look.map((l, i) => (
              <g
                key={nodes[i].id}
                ref={(el) => {
                  els.current.nodes[i] = el;
                }}
                style={{ opacity: moonDim(i) ? 0.35 : 1, transition: "opacity 250ms ease" }}
                className={styles.grab}
                data-body={i}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <title>{nodes[i].topic}</title>
                <circle r={l.r + 8} fill="transparent" />
                <circle
                  data-focus-ring=""
                  r={l.r + 6}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1.6}
                  pointerEvents="none"
                  style={{ opacity: moonFocused(i) ? 1 : related.moons.has(i) ? 0.5 : 0, transition: "opacity 200ms ease" }}
                />
                <g
                  style={{
                    transform: `scale(${phase >= 1 ? 1 : 0.25})`,
                    opacity: phase >= 1 ? 1 : 0,
                    transition: t(`transform 500ms ease ${i * 45}ms, opacity 250ms ease ${i * 45}ms`),
                  }}
                >
                  <g
                    transform={`scale(${l.r / MOON_R})`}
                    opacity={phase >= 3 ? 0.78 : 1}
                    style={{ transition: t("opacity 900ms ease") }}
                  >
                    <MoonShape lit={1} side="right" />
                  </g>
                  <text
                    y={l.r + 13}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill="#a39cae"
                    pointerEvents="none"
                  >
                    {i + 1}
                  </text>
                </g>
              </g>
            ))}
          </svg>
        )}
      </div>

      <figcaption className={`${styles.hint} ${phase >= 3 ? styles.on : ""}`}>
        <p className={styles.mNote}>
          달과 별은 끌어서 움직여 볼 수 있고, 눌러서 아래 목록과 함께 볼 수 있어요. 이런 의미 파일들이 모여 인격을 이룹니다.
        </p>
      </figcaption>
    </figure>
  );
}

