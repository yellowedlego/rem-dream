"use client";

// 의미성 하늘: 가운데 북극성(대화하는 AI) 주위로 모든 의미(별)가 우주에 떠 있듯 천천히 공전한다.
// 노드 수·의미 수·관람객 수는 몇 초마다 다시 세어 올라간다.
// 대기 화면처럼 주기적으로(또는 북극성을 누르면): 별들이 45도 기운 원으로 모여 돌다가, 원이 납작해져 한 줄이 되고,
// 북극성 가운데로 빨려 들어간다. 북극성은 관성으로 흔들리고, 가장 최근 대화 한 쌍이 말풍선으로 떠오른다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meaning, MemoryNode } from "@/lib/types";
import { api } from "./api";
import { byTime } from "./MoonPlane";
import { CONVERGE, convergePos, domeStars, easeInOut, orbitSlots, orbitSpeed, phase, polarisKick, type Pt } from "./sky";
import styles from "./MeaningSky.module.css";

const POLL_MS = 5000;
/** 대기 화면 연출 간격 (마지막 손길 뒤) */
const IDLE_PLAY_MS = 60_000;
const FIRST_PLAY_MS = 9_000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function MeaningSky() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [meanings, setMeanings] = useState<Meaning[]>([]);
  const [hover, setHover] = useState<Meaning | null>(null);
  const [playing, setPlaying] = useState(false);
  const [talk, setTalk] = useState<MemoryNode | null>(null);
  const [born, setBorn] = useState<Set<number>>(new Set());
  const known = useRef<Set<number> | null>(null);

  // 크기
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 몇 초마다 다시 센다. 새로 생긴 의미는 태어나는 빛으로
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.sky();
        if (!alive) return;
        if (known.current) {
          const fresh = s.meanings.filter((m) => !known.current!.has(m.id)).map((m) => m.id);
          if (fresh.length) setBorn(new Set(fresh));
        }
        known.current = new Set(s.meanings.map((m) => m.id));
        setNodes(s.nodes);
        setMeanings(s.meanings);
      } catch {
        /* 다음 차례에 다시 */
      }
    };
    queueMicrotask(tick);
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const unit = Math.min(size.w, size.h);
  const slots = useMemo(() => orbitSlots(meanings, unit * 0.17, unit * 0.46), [meanings, unit]);
  const bg = useMemo(() => (size.w ? domeStars(Math.round((size.w * size.h) / 9000), size.w, size.h * 2, 23) : []), [size]);
  const sessions = useMemo(() => new Set([...nodes.map((n) => n.sessionId), ...meanings.map((m) => m.sessionId)]).size, [nodes, meanings]);
  const latest = useMemo(() => [...nodes].sort(byTime).at(-1) ?? null, [nodes]);

  // ── 움직임: rAF가 transform만 바꾼다 (React는 다시 그리지 않는다) ──
  const starRefs = useRef(new Map<number, SVGGElement>());
  const polarisRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGEllipseElement>(null);
  const flashRef = useRef<SVGCircleElement>(null);
  const play = useRef<{ start: number; homes: Map<number, Pt> } | null>(null);
  const clock = useRef({ orbit: 0, last: 0 });
  const talkShown = useRef(false);
  const live = useRef({ slots, unit, latest });
  useEffect(() => {
    live.current = { slots, unit, latest };
  }, [slots, unit, latest]);

  const homeOf = useCallback((s: { id: number; r: number; angle: number }, orbitT: number): Pt => {
    const a = s.angle + orbitT * orbitSpeed(s.r, 0.05, live.current.unit * 0.3);
    const bob = Math.sin(orbitT * 0.7 + s.id) * 4;
    return { x: Math.cos(a) * s.r + bob, y: Math.sin(a) * s.r + Math.cos(orbitT * 0.5 + s.id * 1.7) * 3 };
  }, []);

  const startConverge = useCallback(() => {
    if (play.current) return; // 이미 도는 중
    if (live.current.slots.length === 0) return; // 모일 별이 없으면 연출도 말풍선도 없다 (빈 화면 안내와 겹치지 않게)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTalk(live.current.latest);
      window.setTimeout(() => setTalk(null), 6000);
      return;
    }
    const homes = new Map<number, Pt>();
    for (const s of live.current.slots) homes.set(s.id, homeOf(s, clock.current.orbit));
    play.current = { start: performance.now(), homes };
    setPlaying(true);
  }, [homeOf]);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const c = clock.current;
      const dt = c.last ? Math.min((now - c.last) / 1000, 0.1) : 0;
      c.last = now;
      const p = play.current;
      if (!p) c.orbit += dt; // 연출 중에는 공전 시계를 멈춘다 (돌아올 집이 그대로이게)
      const { slots: list, unit: u } = live.current;
      const t = p ? (now - p.start) / 1000 : 0;
      const R = u * 0.3;

      list.forEach((s, i) => {
        const el = starRefs.current.get(s.id);
        if (!el) return;
        let pos: Pt;
        let op = 1;
        if (p) {
          const home = p.homes.get(s.id) ?? homeOf(s, c.orbit);
          pos = convergePos(t, i, list.length, home, R);
          if (t >= CONVERGE.plunge && t < CONVERGE.talk) op = 0;
          else if (t >= CONVERGE.talk) op = easeInOut(phase(t, CONVERGE.talk, CONVERGE.end));
          else if (t > CONVERGE.flatten) op = 1 - phase(t, CONVERGE.flatten, CONVERGE.plunge) * 0.6;
        } else pos = homeOf(s, c.orbit);
        el.setAttribute("transform", `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);
        el.style.opacity = String(op);
      });

      // 북극성: 관성 + 흡수 순간 번쩍
      const kick = p ? polarisKick(t) : { x: 0, y: 0 };
      polarisRef.current?.setAttribute("transform", `translate(${kick.x.toFixed(2)} ${kick.y.toFixed(2)})`);
      if (flashRef.current) {
        const f = p && t >= CONVERGE.plunge ? Math.max(0, 1 - (t - CONVERGE.plunge) / 1.1) : 0;
        flashRef.current.style.opacity = String(f);
        flashRef.current.setAttribute("r", String(18 + f * 40));
      }
      // 기운 원: 모일 때 나타나 납작해지며 사라진다
      if (ringRef.current) {
        const show = p ? easeInOut(phase(t, 0.2, CONVERGE.gather)) * (1 - phase(t, CONVERGE.flatten, CONVERGE.plunge)) : 0;
        const squash = 0.42 * (1 - easeInOut(phase(t, CONVERGE.spin, CONVERGE.flatten)));
        const len = 1 - phase(t, CONVERGE.flatten, CONVERGE.plunge);
        ringRef.current.setAttribute("rx", String(Math.max(R * len, 0.1)));
        ringRef.current.setAttribute("ry", String(Math.max(R * squash * len, 0.1)));
        ringRef.current.style.opacity = String(show * 0.55);
      }

      if (p) {
        if (t >= CONVERGE.wobble && t < CONVERGE.talk && !talkShown.current) {
          talkShown.current = true;
          setTalk(live.current.latest);
        }
        if (t >= CONVERGE.talk && talkShown.current) {
          talkShown.current = false;
          setTalk(null);
        }
        if (t >= CONVERGE.end) {
          play.current = null;
          setPlaying(false);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [homeOf]);

  // 대기 화면처럼: 아무도 만지지 않으면 주기적으로
  const lastTouch = useRef(0);
  useEffect(() => {
    const touch = () => (lastTouch.current = performance.now());
    window.addEventListener("pointermove", touch);
    window.addEventListener("keydown", touch);
    let next = performance.now() + FIRST_PLAY_MS;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (now < next || play.current) return;
      if (now - lastTouch.current < 15_000) {
        next = now + 5_000;
        return;
      }
      if (live.current.slots.length > 0) startConverge();
      next = now + IDLE_PLAY_MS;
    }, 1000);
    return () => {
      clearInterval(id);
      window.removeEventListener("pointermove", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [startConverge]);

  // 예시 기억: 모델 없이 관람객 3명 분량을 채운다
  const addExample = async () => {
    try {
      for (let i = 0; i < 3; i++) await api.demo(`demo-${Date.now().toString(36)}${i}`);
      const s = await api.sky();
      known.current = new Set(s.meanings.map((m) => m.id));
      setNodes(s.nodes);
      setMeanings(s.meanings);
      setBorn(new Set(s.meanings.map((m) => m.id)));
    } catch {
      /* 서버가 안 닿으면 아무 일도 없다 */
    }
  };

  const cx = size.w / 2;
  const cy = size.h / 2;
  const sizeOf = (m: Meaning) => 2.2 + Math.sqrt(m.nodeIds.length) * 1.5;

  return (
    <div ref={boxRef} className={styles.sky} data-playing={playing ? "" : undefined}>
      <dl className={styles.hud} aria-live="polite">
        <div>
          <dt>기억 노드</dt>
          <dd key={nodes.length}>{nodes.length}</dd>
        </div>
        <div>
          <dt>의미(별)</dt>
          <dd key={meanings.length}>{meanings.length}</dd>
        </div>
        <div>
          <dt>관람객</dt>
          <dd key={sessions}>{sessions}</dd>
        </div>
      </dl>

      {size.w > 0 && (
        <svg className={styles.svg} width={size.w} height={size.h} role="img" aria-label={`의미 ${meanings.length}개가 북극성 주위를 도는 하늘`}>
          {bg.map((s, i) => (
            <circle key={i} className={styles.bgStar} cx={s.x} cy={s.y / 2} r={s.r * 0.8} style={{ animationDelay: `${(i * 0.53) % 5}s` }} />
          ))}
          <g transform={`translate(${cx} ${cy})`}>
            {[0.22, 0.32, 0.42].map((k) => (
              <circle key={k} className={styles.orbitRing} r={unit * k} />
            ))}
            <ellipse ref={ringRef} className={styles.tiltRing} rx={1} ry={1} transform="rotate(-45)" style={{ opacity: 0 }} />

            {slots.map((s) => {
              const m = meanings.find((x) => x.id === s.id)!;
              return (
                <g
                  key={s.id}
                  ref={(el) => {
                    if (el) starRefs.current.set(s.id, el);
                    else starRefs.current.delete(s.id);
                  }}
                  className={styles.star}
                  data-born={born.has(s.id) ? "" : undefined}
                  data-meaning={s.id}
                  onPointerEnter={() => setHover(m)}
                  onPointerLeave={() => setHover((h) => (h?.id === m.id ? null : h))}
                >
                  <circle className={styles.halo} r={sizeOf(m) * 3.2} />
                  <circle className={styles.core} r={sizeOf(m)} />
                  <text y={sizeOf(m) + 13} textAnchor="middle">
                    {clip(m.title, 10)}
                  </text>
                  {m.nodeIds.length > 1 && (
                    <text className={styles.count} x={sizeOf(m) + 4} y={-sizeOf(m) - 2}>
                      {m.nodeIds.length}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 북극성 = 대화하는 AI. 누르면 모이는 연출 */}
            <g
              ref={polarisRef}
              className={styles.polaris}
              role="button"
              tabIndex={0}
              aria-label="북극성: 누르면 의미들이 모여요"
              onClick={startConverge}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  startConverge();
                }
              }}
            >
              <circle ref={flashRef} className={styles.flash} r={18} style={{ opacity: 0 }} />
              <circle className={styles.polarisHalo} r={30} />
              <path className={styles.spikes} d="M0 -34 L3.2 -3.2 L34 0 L3.2 3.2 L0 34 L-3.2 3.2 L-34 0 L-3.2 -3.2 Z" />
              <path className={styles.spikesSmall} d="M0 -14 L1.6 -1.6 L14 0 L1.6 1.6 L0 14 L-1.6 1.6 L-14 0 L-1.6 -1.6 Z" transform="rotate(45)" />
              <circle className={styles.polarisCore} r={4.2} />
            </g>
          </g>
        </svg>
      )}

      {hover && !playing && (
        <div className={styles.tip} role="tooltip">
          <b>{hover.title}</b>
          <p>{hover.essence}</p>
          <span>근거 기억 {hover.nodeIds.length}개</span>
        </div>
      )}

      {talk && (
        <div className={styles.talk} aria-live="polite">
          <p className={styles.talkUser}>{clip(talk.user, 90)}</p>
          <p className={styles.talkAi}>{clip(talk.ai, 140)}</p>
        </div>
      )}

      {meanings.length === 0 && (
        <div className={styles.empty}>
          <p>아직 의미가 없어요. 대화하거나 이야기를 넣으면 별이 하나씩 떠올라요.</p>
          <p className={styles.emptyHint}>모델이 안 닿는 컴퓨터라면 예시로 먼저 볼 수 있어요.</p>
          <button type="button" onClick={() => void addExample()}>
            예시 별 채우기
          </button>
        </div>
      )}
      <p className={styles.caption}>가운데 북극성은 대화하는 AI예요. 별 하나는 관람객의 이야기에서 뽑은 의미 하나, 숫자는 근거가 된 기억 수예요.</p>
    </div>
  );
}
