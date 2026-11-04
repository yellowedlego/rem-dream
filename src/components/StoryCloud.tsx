"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { MemoryNode } from "@/lib/types";
import type { Meaning } from "./api";
import styles from "./StoryCloud.module.css";

// 이야기 노드가 오른쪽으로 구름처럼 확 흩어졌다가, 선(그라데이션)을 따라 빛을 모아 별 하나(의미 파일)가 되는 그래프.
// 연출 순서: 0 대기 → 1 흩어짐 → 2 빛이 선을 따라 모임 → 3 별이 켜짐. (애니메이션은 노드 등장·통찰 등장에만 쓴다는 규칙을 따름)
const W = 640;
const H = 380;
const ORIGIN = { x: 34, y: 190 }; // 이야기 글(왼쪽)에서 터져 나오는 자리
const STAR = { x: 556, y: 190 };
const CLOUD = { cx: 300, cy: 190, rx: 175, ry: 140 };
const ACCENT = "#efdfa6";
// StoryView 원문 보기의 주제 색과 같은 순서
const COLORS = ["#efdfa6", "#b9a3f5", "#8fd6b4", "#f2a38b", "#82b4f0", "#dc96c8"];

const SCATTER_MS = 950;
const GATHER_AT = 1250;
const STEP_MS = 70;

const frac = (x: number) => x - Math.floor(x);
const hash = (i: number, seed: number) => frac(Math.sin(i * 127.1 + seed * 311.7) * 43758.5453);

const starPoints = (outer: number, inner: number) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? outer : inner;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");

interface Placed {
  node: MemoryNode;
  x: number;
  y: number;
  r: number;
  color: string;
}

/** 해바라기 씨앗 배치에 흔들림을 더해 구름처럼 (같은 이야기는 늘 같은 모양) */
function place(nodes: MemoryNode[], seed: number): Placed[] {
  const lens = nodes.map((n) => (n.storySpans ?? []).reduce((a, [s, e]) => a + e - s, 0) || n.user.length);
  const maxLen = Math.max(...lens, 1);
  const rot = hash(0, seed) * Math.PI * 2;
  return nodes.map((node, i) => {
    const d = Math.sqrt((i + 0.6) / nodes.length);
    const th = i * 2.39996 + rot;
    return {
      node,
      x: CLOUD.cx + Math.cos(th) * d * CLOUD.rx + (hash(i, seed) - 0.5) * 24,
      y: CLOUD.cy + Math.sin(th) * d * CLOUD.ry + (hash(i + 50, seed) - 0.5) * 24,
      r: 9 + 8 * Math.sqrt(lens[i] / maxLen), // 글이 길수록 큰 노드
      color: COLORS[i % COLORS.length],
    };
  });
}

export default function StoryCloud({
  nodes,
  meaning,
  storyId,
}: {
  nodes: MemoryNode[];
  meaning: Meaning;
  storyId: number;
}) {
  const uid = useId().replace(/:/g, "");
  const placed = useMemo(() => place(nodes, storyId), [nodes, storyId]);
  const [phase, setPhase] = useState(0);
  const [still, setStill] = useState(false); // 움직임 줄이기 설정이면 바로 완성된 모습

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => {
        setStill(true);
        setPhase(3);
      });
      return;
    }
    const lastArrival = GATHER_AT + 300 + (nodes.length - 1) * STEP_MS + 1000;
    const timers = [
      setTimeout(() => setPhase(1), 60),
      setTimeout(() => setPhase(2), GATHER_AT),
      setTimeout(() => setPhase(3), lastArrival),
    ];
    return () => timers.forEach(clearTimeout);
  }, [nodes.length]);

  const t = (spec: string) => (still ? "none" : spec);

  return (
    <figure className={styles.wrap}>
      <svg
        className={styles.stage}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`이야기 노드 ${nodes.length}개가 흩어졌다가 별 하나로 모이는 그래프`}
      >
        <defs>
          <radialGradient id={`${uid}-glow`}>
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.55" />
            <stop offset="45%" stopColor={ACCENT} stopOpacity="0.16" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
          {placed.map((p, i) => (
            // 노드에서 별로 갈수록 밝아지는 선: 빛이 별에 모이는 방향이 보이게
            <linearGradient
              key={p.node.id}
              id={`${uid}-g${i}`}
              gradientUnits="userSpaceOnUse"
              x1={p.x}
              y1={p.y}
              x2={STAR.x}
              y2={STAR.y}
            >
              <stop offset="0%" stopColor={p.color} stopOpacity="0.12" />
              <stop offset="55%" stopColor={p.color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="1" />
            </linearGradient>
          ))}
        </defs>

        {/* 선 */}
        {placed.map((p, i) => (
          <line
            key={p.node.id}
            x1={p.x}
            y1={p.y}
            x2={STAR.x}
            y2={STAR.y}
            stroke={`url(#${uid}-g${i})`}
            strokeWidth={1.6}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={phase >= 2 ? 0 : 1}
            style={{ transition: t(`stroke-dashoffset 900ms ease-out ${i * STEP_MS}ms`) }}
          />
        ))}

        {/* 선을 따라 별로 모이는 빛 */}
        {placed.map((p, i) => (
          <circle
            key={p.node.id}
            r={3.2}
            fill="#fff7d6"
            style={{
              transform:
                phase >= 2 ? `translate(${STAR.x}px, ${STAR.y}px)` : `translate(${p.x}px, ${p.y}px)`,
              opacity: phase === 2 ? 1 : 0,
              transition: t(
                phase >= 2
                  ? `transform 1000ms cubic-bezier(0.4, 0, 0.2, 1) ${300 + i * STEP_MS}ms, opacity 150ms linear ${300 + i * STEP_MS}ms`
                  : "none",
              ),
            }}
          />
        ))}

        {/* 별 (의미 파일) */}
        <g style={{ transform: `translate(${STAR.x}px, ${STAR.y}px)` }}>
          <circle
            r={74}
            fill={`url(#${uid}-glow)`}
            style={{
              opacity: phase >= 3 ? 1 : phase === 2 ? 0.3 : 0,
              transform: `scale(${phase >= 3 ? 1 : 0.6})`,
              transition: t("opacity 900ms ease, transform 900ms ease"),
            }}
          />
          <polygon
            points={starPoints(25, 10.5)}
            fill={ACCENT}
            style={{
              opacity: phase >= 3 ? 1 : phase === 2 ? 0.55 : 0.15,
              transform: `scale(${phase >= 3 ? 1.1 : phase === 2 ? 0.85 : 0.55}) rotate(${phase >= 3 ? 0 : -24}deg)`,
              transition: t("opacity 700ms ease, transform 900ms cubic-bezier(0.34, 1.56, 0.64, 1)"),
            }}
          />
        </g>

        {/* 노드: 이야기 글 쪽(왼쪽)에서 오른쪽으로 구름처럼 확 퍼진다 */}
        {placed.map((p, i) => (
          <g
            key={p.node.id}
            style={{
              transform:
                phase >= 1
                  ? `translate(${p.x}px, ${p.y}px) scale(1)`
                  : `translate(${ORIGIN.x}px, ${ORIGIN.y}px) scale(0.25)`,
              opacity: phase >= 1 ? 1 : 0,
              transition: t(
                `transform ${SCATTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms, opacity 250ms ease ${i * 45}ms`,
              ),
            }}
          >
            <title>{p.node.topic}</title>
            <circle r={p.r + 5} fill={p.color} opacity={0.14} />
            <circle r={p.r} fill={p.color} opacity={phase >= 3 ? 0.78 : 1} style={{ transition: t("opacity 900ms ease") }} />
            <text textAnchor="middle" dy="0.36em" fontSize={11} fontWeight={600} fill="#1a1626">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className={`${styles.meaning} ${phase >= 3 ? styles.on : ""}`}>
        <p className={styles.mTitle}>
          <span aria-hidden="true">★</span> {meaning.title || "이름 없는 의미"}
        </p>
        <p className={styles.mText}>{meaning.essence}</p>
        <p className={styles.mNote}>이런 의미 파일들이 모여 인격을 이룹니다.</p>
      </figcaption>
    </figure>
  );
}
