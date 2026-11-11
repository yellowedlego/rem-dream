"use client";

// 비교 화면 위의 천구. 기억 위키 칸이 별자리로 떠 있고, 답변 칸의 왼쪽 벽에서 올라온 선이
// 천구 윗선과 만나는 점 A를 중심으로 별빛이 물결처럼 번진다 (내 AI는 달빛, 기본 AI는 희미한 회색).
import { useEffect, useMemo, useRef, useState } from "react";
import type { WikiEntry } from "@/lib/types";
import { domeStars, domeY, dist, glowAt, namedStars, rippleDelay } from "./sky";
import styles from "./CompareSky.module.css";

export const SKY_H = 150;

/** 한 번의 빛: 천구 안 x 좌표(A의 가로 위치)와 어느 AI의 선인지 */
export interface SkyHit {
  x: number;
  kind: "basic" | "personal";
}
export interface SkyEvent {
  id: number;
  hits: SkyHit[];
  /** 이번에 기억 위키에서 찾은 칸 번호 (별이 따로 번쩍인다) */
  flare: number[];
}

const SIGMA = { basic: 70, personal: 110 };
const POWER = { basic: 0.45, personal: 1 };

export default function CompareSky({ wiki, event }: { wiki: WikiEntry[]; event: SkyEvent | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bg = useMemo(() => (w ? domeStars(Math.round(w / 14), w, SKY_H) : []), [w]);
  const named = useMemo(() => (w ? namedStars(wiki.length, w, SKY_H) : []), [w, wiki.length]);
  const arc = useMemo(() => {
    if (!w) return "";
    const pts: string[] = [];
    for (let x = 0; x <= w; x += 8) pts.push(`${x},${domeY(x, w, SKY_H).toFixed(1)}`);
    pts.push(`${w},${SKY_H}`);
    return pts.join(" ");
  }, [w]);

  // 이번 빛을 받는 별들: 별마다 가장 센 빛과 그 빛이 닿는 시각
  const lit = useMemo(() => {
    if (!event || !w) return null;
    const stars = [...named.map((p, i) => ({ ...p, r: 2.4, key: `n${i}` })), ...bg.map((p, i) => ({ ...p, key: `b${i}` }))];
    return {
      as: event.hits.map((h) => ({ ...h, y: domeY(h.x, w, SKY_H) })),
      stars: stars
        .map((s) => {
          let best = { g: 0, delay: 0, kind: "basic" as SkyHit["kind"] };
          for (const h of event.hits) {
            const a = { x: h.x, y: domeY(h.x, w, SKY_H) };
            const d = dist(s, a);
            const g = glowAt(d, SIGMA[h.kind]) * POWER[h.kind];
            if (g > best.g) best = { g, delay: rippleDelay(d), kind: h.kind };
          }
          return { ...s, ...best };
        })
        .filter((s) => s.g > 0.04),
    };
  }, [event, named, bg, w]);

  const flare = new Set(event?.flare ?? []);

  return (
    <div ref={boxRef} className={styles.sky} style={{ height: SKY_H }} aria-hidden="true">
      {w > 0 && (
        <svg width={w} height={SKY_H} viewBox={`0 0 ${w} ${SKY_H}`}>
          <defs>
            <linearGradient id="sky-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b9a3f5" stopOpacity="0.10" />
              <stop offset="1" stopColor="#b9a3f5" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon className={styles.dome} points={`0,${SKY_H} ${arc}`} fill="url(#sky-fill)" />
          <polyline className={styles.rim} points={arc.split(" ").slice(0, -1).join(" ")} />

          {bg.map((s, i) => (
            <circle key={i} className={styles.bgStar} cx={s.x} cy={s.y} r={s.r} style={{ animationDelay: `${(i * 0.37) % 4}s` }} />
          ))}

          {named.length > 1 && <polyline className={styles.line} points={named.map((p) => `${p.x},${p.y}`).join(" ")} />}
          {named.map((p, i) => {
            const e = wiki[i];
            return (
              <g key={e.id} className={styles.named} data-flare={flare.has(e.id) ? "" : undefined} data-wiki={e.id}>
                <circle cx={p.x} cy={p.y} r={2.4} />
                <text x={p.x} y={p.y + 14} textAnchor="middle">
                  {e.title}
                </text>
              </g>
            );
          })}

          {/* 이번 빛: 별마다 A에서 퍼져 온 빛 (key가 바뀌면 처음부터 다시 번진다) */}
          {lit && (
            <g key={event!.id}>
              {lit.stars.map((s) => (
                <circle
                  key={s.key}
                  className={s.kind === "personal" ? styles.glowP : styles.glowB}
                  cx={s.x}
                  cy={s.y}
                  r={2.2 + s.g * 4}
                  style={{ animationDelay: `${s.delay.toFixed(3)}s`, ["--g" as string]: s.g.toFixed(3) }}
                />
              ))}
              {lit.as.map((a, i) => (
                <g key={i} className={a.kind === "personal" ? styles.aP : styles.aB} data-a={a.kind}>
                  <circle cx={a.x} cy={a.y} r={3} />
                  <circle className={styles.aRing} cx={a.x} cy={a.y} r={4} />
                </g>
              ))}
              {named.map((p, i) =>
                flare.has(wiki[i].id) ? (
                  <path
                    key={`f${i}`}
                    className={styles.flare}
                    transform={`translate(${p.x} ${p.y})`}
                    d="M0 -11 L2 -2 L11 0 L2 2 L0 11 L-2 2 L-11 0 L-2 -2 Z"
                  />
                ) : null,
              )}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
