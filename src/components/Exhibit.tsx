"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MemoryNode } from "@/lib/types";
import AppNav from "./AppNav";
import GlyphField from "./GlyphField";
import Moon from "./Moon";
import styles from "./Exhibit.module.css";

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});
const hhmm = (iso: string) => timeFmt.format(new Date(iso));

/** 대화 칸에서 지금 보이는 구간 하나 (main 기준 좌표) */
interface Seg {
  id: number;
  top: number;
  bottom: number;
  /** 0~1, 얼마나 많이 보이는지 */
  k: number;
}

interface Geo {
  edgeX: number; // 대화 칸 오른쪽 끝
  axisX: number; // 시간축 x (정수 픽셀)
  nodeY: Map<number, number>;
  /** 노드 한 줄의 높이 = 누르는 영역 (겹치지 않게 줄 간격, 짝수 정수, 최대 44px) */
  rowH: number;
  segs: Seg[];
  /** 보이는 대화 구간의 위·아래 끝을 "기억 번호 공간"의 연속 위치로 나타낸 값 (0 ~ 노드 수) */
  band: [number, number];
  w: number;
  h: number;
}

const AXIS_PAD = 56;
const FULL_AT = 160; // 이만큼(px) 보이면 빛줄기가 가장 진해짐
const MOON_REACH = 5; // 보이는 구간에서 기억 5개만큼 멀어지면 삭(새달)

/** 보이는 구간에서 d(기억 개수)만큼 떨어진 노드의 밝기. 코사인으로 부드럽게 1→0. */
const falloff = (d: number) => 0.5 * (1 + Math.cos(Math.PI * Math.min(d / MOON_REACH, 1)));

export default function Exhibit({ nodes, personaVersion }: { nodes: MemoryNode[]; personaVersion: number }) {
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [nodes],
  );

  const mainRef = useRef<HTMLElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const planeRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<number, HTMLElement>());
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
      if (bottom - top > 0) segs.push({ id: n.id, top, bottom, k: Math.min(1, (bottom - top) / FULL_AT) });
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
      edgeX: c.right - m.left,
      axisX: Math.round(p.left - m.left + Math.min(140, p.width * 0.28)),
      nodeY,
      segs,
      band: [posOf(viewTop), posOf(viewBottom)],
      w: m.width,
      h: m.height,
    });
  }, [sorted, tRatio]);

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
  }, [measure]);

  const litById = useMemo(() => new Map((geo?.segs ?? []).map((s) => [s.id, s.k])), [geo]);

  const jumpTo = (id: number) => {
    setSelectedId(id);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    itemRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1>꿈 시스템</h1>
          <span className={styles.count}>오늘의 기억 {nodes.length}개</span>
        </div>
        <AppNav />
        <p className={styles.state}>
          <span className={styles.awakeDot} aria-hidden="true" />
          깨어 있어요 · 인격 v{personaVersion}
        </p>
      </header>

      <main ref={mainRef} className={styles.main}>
        <section ref={chatRef} className={styles.chat} aria-label="대화">
          {sorted.map((n) => (
            <article
              key={n.id}
              ref={(el) => {
                if (el) itemRefs.current.set(n.id, el);
                else itemRefs.current.delete(n.id);
              }}
              className={`${styles.pair} ${n.id === selectedId ? styles.pairSelected : ""}`}
              data-node-id={n.id}
              // 이 대화를 비추는 빛의 세기(0~1). 빛줄기와 같은 값을 써서 칸이 오른쪽(빛이 들어오는 쪽)부터 밝아진다
              style={{ ["--lit" as string]: (litById.get(n.id) ?? 0).toFixed(3) }}
            >
              <div className={styles.meta}>
                <span>기억 {n.order}</span>
                <time dateTime={n.createdAt}>{hhmm(n.createdAt)}</time>
              </div>
              <p className={styles.user}>{n.user}</p>
              <p className={styles.ai}>{n.ai}</p>
            </article>
          ))}
        </section>

        <section ref={planeRef} className={styles.plane} aria-label="기억 노드 시간축">
          <GlyphField host={mainRef} />
          <p className={styles.hint}>지금 보이는 대화를 그 기억이 비춰요</p>
        </section>

        {/* 빛줄기: 대화 칸의 보이는 구간 → 그 기억 노드 */}
        {geo && (
          <svg className={styles.overlay} width={geo.w} height={geo.h} aria-hidden="true">
            <rect
              className={styles.axis}
              x={geo.axisX}
              width={1}
              y={(geo.nodeY.get(sorted[0]?.id) ?? 0) - 28}
              height={
                (geo.nodeY.get(sorted[sorted.length - 1]?.id) ?? 0) -
                (geo.nodeY.get(sorted[0]?.id) ?? 0) +
                56
              }
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
        )}

        {/* 노드(달)는 버튼이라 빛줄기 위에 따로 둔다 */}
        {geo &&
          sorted.map((n, i) => {
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
                  ["--lit" as string]: lit.toFixed(3),
                }}
                data-lit={lit.toFixed(2)}
                data-side={side}
                aria-label={`기억 ${n.order}번: ${n.user}`}
                onClick={() => jumpTo(n.id)}
              >
                <Moon lit={lit} side={side} selected={n.id === selectedId} />
                <span className={styles.nodeLabel}>
                  <span className={styles.nodeTime}>{hhmm(n.createdAt)}</span>
                  {n.user}
                </span>
              </button>
            );
          })}
      </main>

      {/* 입력·모델·잠들기는 2단계(채팅 연결)부터 동작한다 */}
      <footer className={styles.footer}>
        <label className={styles.field}>
          <span>오늘 있었던 일을 적거나 말을 걸어 보세요</span>
          <input type="text" placeholder="2단계에서 연결돼요" disabled />
        </label>
        <label className={styles.fieldSmall}>
          <span>모델</span>
          <select disabled defaultValue="flash">
            <option value="flash">Gemini Flash</option>
          </select>
        </label>
        <button type="button" className={styles.send} disabled>
          보내기
        </button>
        <button type="button" className={styles.sleep} disabled>
          잠들기
        </button>
      </footer>
    </div>
  );
}
