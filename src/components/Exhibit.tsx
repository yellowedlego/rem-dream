"use client";

import { useMemo, useRef } from "react";
import type { MemoryNode } from "@/lib/types";
import AppNav from "./AppNav";
import { MoonPlaneBeams, MoonPlaneTrack, byTime, hhmm, useMoonPlane } from "./MoonPlane";
import styles from "./Exhibit.module.css";

export default function Exhibit({ nodes, personaVersion }: { nodes: MemoryNode[]; personaVersion: number }) {
  const sorted = useMemo(() => [...nodes].sort(byTime), [nodes]);

  const mainRef = useRef<HTMLElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const planeRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<number, HTMLElement>());
  const { geo, lightById, selectedId, jumpTo } = useMoonPlane({ sorted, mainRef, chatRef, planeRef, scrollRef, itemRefs });
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
              style={{
                ["--lit" as string]: (lightById.get(n.id)?.lit ?? 0).toFixed(3),
                ["--glow" as string]: (lightById.get(n.id)?.glow ?? 0).toFixed(3),
              }}
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
          <p className={styles.hint}>지금 보이는 대화를 그 기억이 비춰요</p>
          <div ref={scrollRef} className={styles.planeScroll}>
            <MoonPlaneTrack sorted={sorted} geo={geo} selectedId={selectedId} onJump={jumpTo} />
          </div>
        </section>

        <MoonPlaneBeams sorted={sorted} geo={geo} />
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



