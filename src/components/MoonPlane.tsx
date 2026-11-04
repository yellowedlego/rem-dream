"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MemoryNode } from "@/lib/types";
import { followCamera } from "./camera";
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
  /** 달의 화면상 세로 위치 (달창이 스크롤된 만큼 반영, main 기준 좌표) */
  nodeY: Map<number, number>;
  /** 달창(스크롤되는 칸)이 보이는 위·아래 끝 (main 기준 좌표) */
  planeTop: number;
  planeBottom: number;
  /** 달창 안에서의 시간축 x */
  axisLocal: number;
  /** 달 목록 전체 높이 (달창 안쪽 길이) */
  trackH: number;
  segs: Seg[];
  /** 보이는 대화 구간의 위·아래 끝을 "기억 번호 공간"의 연속 위치로 나타낸 값 (0 ~ 노드 수) */
  band: [number, number];
  /** 대화 칸이 보이는 위·아래 끝 (main 기준 좌표) */
  viewTop: number;
  viewBottom: number;
  w: number;
  h: number;
}

/** 달 사이 간격(px). 전시 화면에 원래 있던 간격이고, 노드가 많아져도 줄이지 않고 달창을 스크롤한다 */
export const MOON_STEP = 32;
const AXIS_PAD = 56;
/** 달창 위·아래 여백(높이 비율). 비추는 자리가 이 안쪽에 있으면 달창은 가만히 있는다 */
const CAMERA_MARGIN = 0.25;
/** 달창을 굴리다 이만큼(ms) 멈추면 가운데 달의 대화로 포커스가 옮겨간다 */
const SETTLE_MS = 450;
/** 휠·터치가 있은 뒤 이 시간(ms) 안의 달창 스크롤만 사람이 굴린 것으로 본다 */
const USER_INPUT_MS = 250;
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
  /** 달이 놓일 오른쪽 영역 (스크롤되지 않는 바깥 상자) */
  planeRef: RefObject<HTMLElement | null>;
  /** 달창 안의 스크롤되는 칸. 대화 칸과 따로 스크롤된다 */
  scrollRef: RefObject<HTMLElement | null>;
  /** 새 기억이 생기면 달창을 맨 아래로 내려 최신 달을 보여 줄지 */
  followLatest?: boolean;
  /** 대화 한 쌍씩의 요소 (노드 번호 → 요소) */
  itemRefs: RefObject<Map<number, HTMLElement>>;
  /** 빛줄기가 시작하는 경계를 재는 요소. 없으면 chatRef의 오른쪽 끝 */
  edgeRef?: RefObject<HTMLElement | null>;
  /** edgeRef의 어느 쪽 끝이 경계인지 (대화 화면은 벽의 왼쪽 끝) */
  edgeSide?: "left" | "right";
}

export function useMoonPlane({
  sorted,
  mainRef,
  chatRef,
  planeRef,
  scrollRef,
  itemRefs,
  edgeRef,
  edgeSide = "right",
  followLatest = false,
}: Options) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 대화 칸이 스크롤됐을 때만 달창 카메라가 따라간다 (달창을 직접 스크롤할 때는 따라가지 않는다)
  const followNext = useRef(true);
  // 달창이 멈췄을 때 실행할 "가운데 달로 포커스" (아래에서 매 렌더 최신 상태로 갱신)
  const settleRef = useRef<() => void>(() => {});

  const measure = useCallback(() => {
    const main = mainRef.current;
    const chat = chatRef.current;
    const plane = planeRef.current;
    const sc = scrollRef.current;
    if (!main || !chat || !plane || !sc) return;
    const m = main.getBoundingClientRect();
    const c = chat.getBoundingClientRect();
    const s = sc.getBoundingClientRect();
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

    // 마리오식 카메라: 대화가 비추는 자리(focus)가 달창 안쪽 여백(가장자리 25%)에 닿으면 그만큼만 달창이 따라간다.
    // 반대로 가는 동안에는 여백 안쪽에서는 그대로 있다가, 다시 닿으면 따라간다.
    if (followNext.current && sorted.length > 0) {
      followNext.current = false;
      const mid = Math.min(sorted.length - 0.5, Math.max(0.5, (posOf(viewTop) + posOf(viewBottom)) / 2));
      const focusY = AXIS_PAD + (mid - 0.5) * MOON_STEP; // 달 목록(트랙) 안에서의 위치
      const next = followCamera(focusY, sc.scrollTop, sc.clientHeight, sc.clientHeight * CAMERA_MARGIN, sc.scrollHeight - sc.clientHeight);
      if (next !== sc.scrollTop) sc.scrollTop = next;
    }

    // 달은 전시 화면의 원래 간격(MOON_STEP)으로 늘어놓고, 달창이 스크롤된 만큼 위치가 바뀐다
    const nodeY = new Map<number, number>();
    sorted.forEach((n, i) => nodeY.set(n.id, Math.round(s.top - m.top + AXIS_PAD + i * MOON_STEP - sc.scrollTop)));
    const axisLocal = Math.round(Math.min(140, s.width * 0.28));

    setGeo({
      edgeX: (edgeSide === "left" ? edge.left : edge.right) - m.left,
      axisX: Math.round(s.left - m.left) + axisLocal,
      axisLocal,
      nodeY,
      planeTop: s.top - m.top,
      planeBottom: s.bottom - m.top,
      trackH: AXIS_PAD * 2 + Math.max(0, sorted.length - 1) * MOON_STEP,
      segs,
      band: [posOf(viewTop), posOf(viewBottom)],
      viewTop,
      viewBottom,
      w: m.width,
      h: m.height,
    });  }, [sorted, mainRef, chatRef, planeRef, scrollRef, itemRefs, edgeRef, edgeSide]);

  useLayoutEffect(() => {
    followNext.current = true; // 기억이 바뀌었거나 처음 그릴 때도 비추는 자리를 보여 준다
    measure();
  }, [measure]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const scheduleFollow = () => {
      followNext.current = true;
      schedule();
    };
    const chat = chatRef.current;
    const sc = scrollRef.current;
    // 달창을 사람이 굴렸을 때만 센다. 카메라가 따라가느라 scrollTop을 바꾼 것(프로그램 스크롤)과 구별하려고
    // 휠·터치가 방금(USER_INPUT_MS 안에) 있었거나 스크롤바를 잡고 있는 동안만 사람이 굴린 것으로 본다.
    // (표시가 오래 남으면 대화를 굴릴 때 카메라가 움직인 달창을 사람이 굴린 줄 알고 대화를 되돌려 버린다)
    let lastInput = -Infinity;
    let dragging = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const markUser = () => {
      lastInput = performance.now();
    };
    const onPlaneScroll = () => {
      schedule();
      if (!dragging && performance.now() - lastInput > USER_INPUT_MS) return;
      // 대화는 그대로 두고, 달창이 잠깐 멈추면 가운데 달의 대화로 포커스를 옮긴다
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => settleRef.current(), SETTLE_MS);
    };
    const onChatScroll = () => {
      clearTimeout(settleTimer); // 대화를 직접 굴리기 시작하면 달 쪽 포커스 이동은 취소한다
      scheduleFollow();
    };
    chat?.addEventListener("scroll", onChatScroll, { passive: true }); // 대화가 움직이면 카메라가 따라간다
    sc?.addEventListener("scroll", onPlaneScroll, { passive: true }); // 달창은 따로 스크롤된다 (카메라는 안 따라감)
    sc?.addEventListener("wheel", markUser, { passive: true });
    sc?.addEventListener("touchmove", markUser, { passive: true });
    // 눌러 끌기는 스크롤바를 잡았을 때만 (달 버튼을 눌러 이동한 뒤의 카메라 스크롤을 사람이 굴린 것으로 착각하지 않게)
    const onPointerDown = (e: PointerEvent) => {
      if (e.target === sc) dragging = true;
    };
    const onPointerUp = () => {
      if (dragging) {
        dragging = false;
        markUser(); // 놓은 뒤 이어지는 마지막 스크롤 이벤트도 사람이 굴린 것으로
      }
    };
    sc?.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    const ro = new ResizeObserver(schedule);
    if (mainRef.current) ro.observe(mainRef.current);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      chat?.removeEventListener("scroll", onChatScroll);
      sc?.removeEventListener("scroll", onPlaneScroll);
      sc?.removeEventListener("wheel", markUser);
      sc?.removeEventListener("touchmove", markUser);
      sc?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      ro.disconnect();
    };
  }, [measure, chatRef, mainRef, scrollRef]);

  // 새 기억이 생기면 달창을 최신 달로 내린다
  const count = sorted.length;
  useEffect(() => {
    if (!followLatest) return;
    const sc = scrollRef.current;
    if (!sc) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc.scrollTo({ top: sc.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [count, followLatest, scrollRef]);

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

  // 달창을 굴리다 멈추면: 달창 세로 한가운데에 있는 달의 대화로 포커스를 옮긴다 (아직 답을 기다리는 임시 노드는 건너뜀)
  useEffect(() => {
    settleRef.current = () => {
      const sc = scrollRef.current;
      if (!sc || sorted.length === 0) return;
      const centerY = sc.scrollTop + sc.clientHeight / 2;
      const i = Math.min(sorted.length - 1, Math.max(0, Math.round((centerY - AXIS_PAD) / MOON_STEP)));
      const node = sorted[i];
      if (node && node.id >= 0) jumpTo(node.id);
    };
  });

  return { geo, lightById, selectedId, jumpTo, measure };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 달이 태어나는 중인 기억 (대화 화면). charging: 답을 기다리는 동안(선이 먼저 나가고 달이 어둠에서 차츰 밝아짐),
 * flash: 답이 온 순간(달과 그 대화가 한 번 번쩍). 그림은 CSS(data-birth)가 맡는다.
 */
export interface Birth {
  id: number;
  phase: "charging" | "flash";
}
const birthOf = (birth: Birth | null | undefined, id: number) => (birth?.id === id ? birth.phase : undefined);

/** 빛줄기: 대화 칸의 보이는 구간 → 그 기억의 달 (기준 상자 위에 겹쳐 그린다). 달이 달창 밖이면 가까운 가장자리로 향한다 */
export function MoonPlaneBeams({ sorted, geo, birth }: { sorted: MemoryNode[]; geo: Geo | null; birth?: Birth | null }) {
  if (!geo || sorted.length === 0) return null;
  return (
    <svg className={styles.overlay} width={geo.w} height={geo.h} aria-hidden="true">
      {geo.segs.map((s) => {
        const ny = clamp(geo.nodeY.get(s.id) ?? 0, geo.planeTop + 10, geo.planeBottom - 10);
        const ax = geo.axisX + 0.5; // 달의 중심
        const y1 = s.top + 2;
        const y2 = s.bottom - 2;
        return (
          <g key={s.id} className={styles.beam} data-beam={s.id} data-birth={birthOf(birth, s.id)}>
            <polygon points={`${geo.edgeX},${y1} ${ax},${ny} ${geo.edgeX},${y2}`} fillOpacity={0.09 * s.k} />
            {/* pathLength=1: 태어나는 동안 선이 대화 쪽에서 달 쪽으로 그어지는 연출에 쓴다 */}
            <line x1={geo.edgeX} y1={y1} x2={ax} y2={ny} strokeOpacity={0.6 * s.k} pathLength={1} />
            <line x1={geo.edgeX} y1={y2} x2={ax} y2={ny} strokeOpacity={0.6 * s.k} pathLength={1} />
            <rect x={geo.edgeX - 1} y={y1} width={2} height={Math.max(0, y2 - y1)} opacity={0.3 + 0.7 * s.k} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 달창 안쪽(스크롤되는 칸의 내용): 시간축과 달. 달 간격은 늘 같다.
 */
export function MoonPlaneTrack({
  sorted,
  geo,
  selectedId,
  onJump,
  labelMax,
  birth,
}: {
  sorted: MemoryNode[];
  geo: Geo | null;
  selectedId: number | null;
  onJump: (id: number) => void;
  /** 달 옆 글자의 최대 너비(px) */
  labelMax?: number;
  /** 지금 태어나는 중인 달 */
  birth?: Birth | null;
}) {
  if (!geo || sorted.length === 0) return null;
  return (
    <div className={styles.track} style={{ height: geo.trackH }}>
      <div
        className={styles.trackAxis}
        style={{ left: geo.axisLocal, top: AXIS_PAD - 28, height: (sorted.length - 1) * MOON_STEP + 56 }}
      />
      {sorted.map((n, i) => {
        const center = i + 0.5;
        const [lo, hi] = geo.band;
        const d = Math.max(0, lo - center, center - hi); // 보이는 대화 구간까지의 거리
        const lit = falloff(d);
        const side = center < lo ? "left" : "right"; // 지난 기억은 기우는 달, 앞선 기억은 차오르는 달
        return (
          <button
            key={n.id}
            type="button"
            className={styles.node}
            style={{
              left: geo.axisLocal - 10, // 21px 달의 중심이 축 한가운데에 오도록
              top: AXIS_PAD + i * MOON_STEP - MOON_STEP / 2,
              height: MOON_STEP,
              ["--lit" as string]: lit.toFixed(3),
            }}
            data-lit={lit.toFixed(2)}
            data-side={side}
            data-birth={birthOf(birth, n.id)}
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
    </div>
  );
}





