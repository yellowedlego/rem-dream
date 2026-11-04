"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { MemoryNode } from "@/lib/types";
import Moon from "./Moon";
import styles from "./Exhibit.module.css";

// 전시 화면(/)과 대화 화면(/chat)이 똑같이 쓰는 "오른쪽 기억 달 시간축":
// 대화 칸의 보이는 구간 → 빛줄기 → 그 기억의 달. 보이는 구간에서 멀수록 달이 기운다.

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});
export const hhmm = (iso: string) => timeFmt.format(new Date(iso));

/** 대화 칸에서 지금 보이는 구간 하나 (main 기준 좌표) */
interface Seg {
  id: number;
  top: number;
  bottom: number;
  /** 0~1, 얼마나 많이 보이는지 */
  k: number;
  /** 이 대화의 실제 아래 끝(= 아래 홈의 위치). 잘리지 않은 값 */
  pairBottom: number;
}

export interface Geo {
  edgeX: number; // 빛줄기가 시작하는 대화 칸 오른쪽 끝
  axisX: number; // 시간축 x (정수 픽셀)
  nodeY: Map<number, number>;
  /** 노드 한 줄의 높이 = 누르는 영역 (겹치지 않게 줄 간격, 짝수 정수, 최대 44px) */
  rowH: number;
  segs: Seg[];
  /** 보이는 대화 구간의 위·아래 끝을 "기억 번호 공간"의 연속 위치로 나타낸 값 (0 ~ 노드 수) */
  band: [number, number];
  /** 대화 칸이 보이는 위·아래 끝 (main 기준 좌표) */
  viewTop: number;
  viewBottom: number;
  w: number;
  h: number;
}

const AXIS_PAD = 56;
const FULL_AT = 160; // 이만큼(px) 보이면 빛줄기가 가장 진해짐
const MOON_REACH = 5; // 보이는 구간에서 기억 5개만큼 멀어지면 삭(새달)

/** 보이는 구간에서 d(기억 개수)만큼 떨어진 노드의 밝기. 코사인으로 부드럽게 1→0. */
const falloff = (d: number) => 0.5 * (1 + Math.cos(Math.PI * Math.min(d / MOON_REACH, 1)));

/**
 * 보이는 대화 칸의 위·아래 끝에서 멀수록 1, 끝에서는 0.2. y가 끝에서 칸 높이의 45% 이상 안쪽이면 1.
 * (부드럽게 이어지도록 smoothstep)
 */
const EDGE_REACH = 0.45;
const EDGE_MIN = 0.2;
export function edgeFade(y: number, viewTop: number, viewBottom: number) {
  const reach = (viewBottom - viewTop) * EDGE_REACH;
  if (reach <= 0) return EDGE_MIN;
  const t = Math.min(1, Math.max(0, Math.min(y - viewTop, viewBottom - y) / reach));
  return EDGE_MIN + (1 - EDGE_MIN) * t * t * (3 - 2 * t);
}

interface Options {
  /** 기억 노드들 (시간순으로 정렬해서 넘긴다) */
  sorted: MemoryNode[];
  /** 달과 빛줄기를 그리는 기준 상자 (position: relative). 이 상자 기준 좌표로 그린다 */
  mainRef: RefObject<HTMLElement | null>;
  /** 대화가 스크롤되는 칸. 보이는 구간은 이 칸의 높이다 */
  chatRef: RefObject<HTMLElement | null>;
  /** 달이 놓일 오른쪽 영역 */
  planeRef: RefObject<HTMLElement | null>;
  /** 대화 한 쌍씩의 요소 (노드 번호 → 요소) */
  itemRefs: RefObject<Map<number, HTMLElement>>;
  /** 빛줄기가 시작하는 오른쪽 끝을 재는 요소. 없으면 chatRef의 오른쪽 끝 */
  edgeRef?: RefObject<HTMLElement | null>;
}

export function useMoonPlane({ sorted, mainRef, chatRef, planeRef, itemRefs, edgeRef }: Options) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 노드의 세로 위치 = 시간 순서대로 고르게 (시각 비례로 두면 가까운 시각끼리 겹침)
  const tRatio = useMemo(
    () => new Map(sorted.map((n, i) => [n.id, sorted.length > 1 ? i / (sorted.length - 1) : 0.5])),
    [sorted],
  );

  const measure = useCallback(() => {
    const main = mainRef.current;
    const chat = chatRef.current;
    const plane = planeRef.current;
    if (!main || !chat || !plane) return;
    const m = main.getBoundingClientRect();
    const c = chat.getBoundingClientRect();
    const p = plane.getBoundingClientRect();
    const edge = (edgeRef?.current ?? chat).getBoundingClientRect();

    const viewTop = c.top - m.top;
    const viewBottom = c.bottom - m.top;
    const segs: Seg[] = [];
    const rects: { top: number; bottom: number }[] = [];
    for (const n of sorted) {
      const el = itemRefs.current.get(n.id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      rects.push({ top: r.top - m.top, bottom: r.bottom - m.top });
      const top = Math.max(r.top - m.top, viewTop);
      const bottom = Math.min(r.bottom - m.top, viewBottom);
      if (bottom - top > 0)
        segs.push({ id: n.id, top, bottom, k: Math.min(1, (bottom - top) / FULL_AT), pairBottom: r.bottom - m.top });
    }

    // y 좌표가 "몇 번째 기억의 어디쯤"인지를 연속 값으로 (i + 그 안에서의 비율)
    const posOf = (y: number) => {
      if (rects.length === 0) return 0;
      if (y <= rects[0].top) return 0;
      for (let i = 0; i < rects.length; i++) {
        const { top, bottom } = rects[i];
        if (y < bottom) return y >= top ? i + (y - top) / (bottom - top) : i; // 사이 틈이면 경계
      }
      return rects.length;
    };

    const usable = p.height - AXIS_PAD * 2;
    const nodeY = new Map<number, number>();
    for (const n of sorted)
      nodeY.set(n.id, Math.round(p.top - m.top + AXIS_PAD + (tRatio.get(n.id) ?? 0) * usable));

    const step = sorted.length > 1 ? usable / (sorted.length - 1) : 44;
    setGeo({
      rowH: Math.max(2, 2 * Math.floor(Math.min(44, step) / 2)),
      edgeX: edge.right - m.left,
      axisX: Math.round(p.left - m.left + Math.min(140, p.width * 0.28)),
      nodeY,
      segs,
      band: [posOf(viewTop), posOf(viewBottom)],
      viewTop,
      viewBottom,
      w: m.width,
      h: m.height,
    });
  }, [sorted, tRatio, mainRef, chatRef, planeRef, itemRefs, edgeRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const chat = chatRef.current;
    chat?.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    if (mainRef.current) ro.observe(mainRef.current);
    return () => {
      cancelAnimationFrame(raf);
      chat?.removeEventListener("scroll", schedule);
      ro.disconnect();
    };
  }, [measure, chatRef, mainRef]);

  // 빛은 전부 똑같이 들어오지 않는다: 보이는 칸의 위·아래 끝에 가까운 대화와 홈일수록 옅다.
  // lit = 대화 바닥에 드는 빛, glow = 그 대화 아래 홈에 드는 빛
  const lightById = useMemo(() => {
    const m = new Map<number, { lit: number; glow: number }>();
    if (!geo) return m;
    for (const s of geo.segs) {
      m.set(s.id, {
        lit: s.k * edgeFade((s.top + s.bottom) / 2, geo.viewTop, geo.viewBottom),
        glow: edgeFade(s.pairBottom, geo.viewTop, geo.viewBottom),
      });
    }
    return m;
  }, [geo]);

  const jumpTo = (id: number) => {
    setSelectedId(id);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    itemRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  };

  return { geo, lightById, selectedId, jumpTo, measure };
}

/** 빛줄기와 달 (기준 상자 안에 겹쳐 그린다) */
export function MoonPlaneLayers({
  sorted,
  geo,
  selectedId,
  onJump,
  labelMax,
}: {
  sorted: MemoryNode[];
  geo: Geo | null;
  selectedId: number | null;
  onJump: (id: number) => void;
  /** 달 옆 글자의 최대 너비(px) */
  labelMax?: number;
}) {
  if (!geo || sorted.length === 0) return null;
  return (
    <>
      {/* 빛줄기: 대화 칸의 보이는 구간 → 그 기억 노드 */}
      <svg className={styles.overlay} width={geo.w} height={geo.h} aria-hidden="true">
        <rect
          className={styles.axis}
          x={geo.axisX}
          width={1}
          y={(geo.nodeY.get(sorted[0].id) ?? 0) - 28}
          height={(geo.nodeY.get(sorted[sorted.length - 1].id) ?? 0) - (geo.nodeY.get(sorted[0].id) ?? 0) + 56}
        />
        {geo.segs.map((s) => {
          const ny = geo.nodeY.get(s.id) ?? 0;
          const ax = geo.axisX + 0.5; // 달의 중심
          const y1 = s.top + 2;
          const y2 = s.bottom - 2;
          return (
            <g key={s.id} className={styles.beam} data-beam={s.id}>
              <polygon points={`${geo.edgeX},${y1} ${ax},${ny} ${geo.edgeX},${y2}`} fillOpacity={0.09 * s.k} />
              <line x1={geo.edgeX} y1={y1} x2={ax} y2={ny} strokeOpacity={0.6 * s.k} />
              <line x1={geo.edgeX} y1={y2} x2={ax} y2={ny} strokeOpacity={0.6 * s.k} />
              <rect x={geo.edgeX - 1} y={y1} width={2} height={Math.max(0, y2 - y1)} opacity={0.3 + 0.7 * s.k} />
            </g>
          );
        })}
      </svg>

      {/* 노드(달)는 버튼이라 빛줄기 위에 따로 둔다 */}
      {sorted.map((n, i) => {
        const center = i + 0.5;
        const [lo, hi] = geo.band;
        const d = Math.max(0, lo - center, center - hi); // 보이는 구간까지의 거리
        const lit = falloff(d);
        const side = center < lo ? "left" : "right"; // 지난 기억은 기우는 달, 앞선 기억은 차오르는 달
        return (
          <button
            key={n.id}
            type="button"
            className={styles.node}
            style={{
              left: geo.axisX - 10, // 21px 달의 중심이 축 한가운데(axisX + 0.5)에 오도록
              top: (geo.nodeY.get(n.id) ?? 0) - geo.rowH / 2,
              height: geo.rowH,
              pointerEvents: "auto",
              ["--lit" as string]: lit.toFixed(3),
            }}
            data-lit={lit.toFixed(2)}
            data-side={side}
            aria-label={`기억 ${n.order}번: ${n.user}`}
            onClick={() => onJump(n.id)}
          >
            <Moon lit={lit} side={side} selected={n.id === selectedId} />
            <span className={styles.nodeLabel} style={labelMax ? { maxWidth: labelMax } : undefined}>
              <span className={styles.nodeTime}>{hhmm(n.createdAt)}</span>
              {n.user}
            </span>
          </button>
        );
      })}
    </>
  );
}
