"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MemoryNode } from "@/lib/types";
import { api, currentSessionId, startNewSession, switchSession, type SessionSummary } from "./api";
import AppNav from "./AppNav";
import { MoonPlaneBeams, MoonPlaneTrack, useMoonPlane } from "./MoonPlane";
import { WALL_W, wallLayout } from "./wallLayout";
import styles from "./ChatView.module.css";

const timeFmt = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
const hhmm = (iso: string) => timeFmt.format(new Date(iso));

const MIRROR_PROPS = [
  "boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "textIndent", "tabSize",
] as const;

/** 글상자 안 타이핑 커서(캐럿)의 위치. 같은 글자 모양의 숨은 상자에 글을 넣고 커서 자리의 위치를 잰다. */
function caretXY(ta: HTMLTextAreaElement): { x: number; y: number } {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement("div");
  for (const p of MIRROR_PROPS) mirror.style[p] = cs[p];
  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-9999px",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  });
  const end = ta.selectionEnd ?? ta.value.length;
  mirror.textContent = ta.value.slice(0, end);
  const mark = document.createElement("span");
  mark.textContent = ta.value.slice(end) || ".";
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const x = mark.offsetLeft - ta.scrollLeft;
  const y = mark.offsetTop - ta.scrollTop + mark.offsetHeight / 2;
  mirror.remove();
  return { x, y };
}


interface Meteor {
  id: number;
  x: number;
  y: number;
}

export default function ChatView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLElement>(null);
  const moonScrollRef = useRef<HTMLDivElement>(null);
  const [wallPref, setWallPref] = useState<boolean | null>(null); // 사용자가 열고 닫은 선택. null이면 대화가 있을 때 자동으로 열림
  const itemRefs = useRef(new Map<number, HTMLElement>());
  const [area, setArea] = useState(0); // 대화 영역 폭 (벽이 대화 열을 얼마나 밀지 계산하려고)
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  // 입력창 빛: 마우스가 올라가 있거나 입력창에 커서가 있으면 켜지고, 마우스 / 타이핑 커서를 따라 움직인다
  const [glow, setGlow] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  // 보내기 별똥별
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  const meteorSeq = useRef(0);

  const glowToCaret = () => {
    const ta = taRef.current;
    if (ta) setGlow(caretXY(ta));
  };

  const refreshSessions = useCallback(async () => {
    try {
      setSessions((await api.sessions()).sessions);
    } catch {
      /* 사이드바 목록은 없어도 대화는 된다 */
    }
  }, []);

  const openSession = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const r = await api.nodes({ sessionId: id });
        setNodes(r.nodes);
      } catch (e) {
        setNodes([]);
        setError((e as Error).message);
      }
      setSessionId(id);
    },
    [],
  );

  useEffect(() => {
    // 브라우저에 저장된 세션 번호는 마운트 뒤에만 읽을 수 있다 (서버 렌더와 어긋나지 않게)
    queueMicrotask(() => {
      void openSession(currentSessionId());
      void refreshSessions();
    });
  }, [openSession, refreshSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [nodes, pending]);

  useEffect(() => {
    // 대화 영역 폭 = 스크롤 칸의 안쪽 폭 (스크롤바 제외)
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setArea(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 대화가 시작되면 오른쪽에서 벽이 밀고 들어온다.
  // 대화 열은 벽에 밀려 왼쪽으로 가다가, 왼쪽 끝(한계)에 닿으면 멈추고 벽만 ease-out으로 마저 들어온다.
  const wallOpen = wallPref ?? (nodes.length > 0 || pending !== null);
  const sorted = useMemo(() => [...nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [nodes]);
  // 오른쪽 벽의 내용은 전시 화면(/)의 오른쪽과 같은 것: 달 시간축 + 빛줄기 (MoonPlane 공용)
  const { geo, lightById, selectedId, jumpTo, measure } = useMoonPlane({
    sorted,
    mainRef: chatRef,
    chatRef: scrollRef,
    planeRef,
    scrollRef: moonScrollRef,
    followLatest: true,
    itemRefs,
    // 빛줄기는 전시 화면처럼 대화 배경과 달창의 경계(벽의 왼쪽 끝)에서 시작한다
    edgeRef: planeRef,
    edgeSide: "left",
  });
  // 벽이 들어오고 나가는 동안은 벽과 대화 열이 계속 움직이므로 매 프레임 다시 잰다
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      measure();
      if (performance.now() - start < 1200) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wallOpen, measure]);

  // 대화 열의 왼쪽 끝과 폭은 벽이 들어온 길이에 정비례한다 (계산식: wallLayout.ts, 테스트: tests/unit)
  const lay = wallLayout(area);
  const send = async () => {
    const msg = text.trim();
    if (!msg || !sessionId || pending) return;
    // 별똥별: 보내기 버튼 가운데(버튼 뒤)에서 떠서 수직으로 올라간다 (움직임 줄이기 설정이면 생략)
    const btn = sendRef.current;
    if (btn && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = ++meteorSeq.current;
      setMeteors((m) => [...m, { id, x: btn.offsetLeft + btn.offsetWidth / 2, y: btn.offsetTop + btn.offsetHeight / 2 }]);
    }
    setError(null);
    setPending(msg);
    setText("");
    try {
      const { node } = await api.chat(sessionId, msg);
      setNodes((n) => [...n, node]);
      void refreshSessions();
    } catch (e) {
      setError((e as Error).message);
      setText(msg); // 실패하면 쓴 글을 돌려준다
    } finally {
      setPending(null);
    }
  };

  const newChat = () => {
    if (pending) return;
    const id = startNewSession();
    setNodes([]);
    setError(null);
    setSessionId(id);
  };

  const pick = (id: string) => {
    if (pending || id === sessionId) return;
    switchSession(id);
    void openSession(id);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>꿈 시스템</h1>
        <AppNav />
        <span className={styles.session} title="이 대화의 세션 번호">
          {sessionId ?? "…"}
        </span>
      </header>

      <div className={styles.body}>
        <aside className={styles.side} aria-label="대화 목록">
          <button type="button" className={styles.newChat} onClick={newChat} disabled={!!pending}>
            + 새 대화
          </button>
          <ul className={styles.sessions}>
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <button
                  type="button"
                  className={styles.sessionBtn}
                  aria-current={s.sessionId === sessionId ? "true" : undefined}
                  onClick={() => pick(s.sessionId)}
                >
                  <span className={styles.preview}>{s.preview || "(빈 대화)"}</span>
                  <span className={styles.sub}>
                    {s.sessionId} · {s.nodeCount}개
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section
          ref={chatRef}
          className={styles.chat}
          data-measured={area > 0 ? "" : undefined}
          style={{
            ["--wall" as string]: wallOpen ? `${WALL_W}px` : "0px",
            ["--area" as string]: `${area}px`,
            ["--l0" as string]: `${lay.l0.toFixed(2)}px`,
            ["--lk" as string]: lay.lk.toFixed(5),
            ["--w0" as string]: `${lay.w0.toFixed(2)}px`,
            ["--wk" as string]: lay.wk.toFixed(5),
          }}
        >
          <div ref={scrollRef} className={styles.scroll} role="log" aria-live="polite" aria-label="대화 내용">
            <div ref={columnRef} className={styles.column}>
              {nodes.length === 0 && !pending && (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>오늘 있었던 일을 편하게 이야기해 보세요</p>
                  <p>말을 걸면 대화 한 번이 기억 노드 하나로 쌓여요.</p>
                </div>
              )}
              {nodes.map((n) => (
                <article
                  key={n.id}
                  className={styles.pair}
                  // 전시 화면과 같은 음각 연출: 이 대화를 비추는 빛(lit)과 아래 홈에 드는 빛(glow)
                  style={{
                    ["--lit" as string]: (lightById.get(n.id)?.lit ?? 0).toFixed(3),
                    ["--glow" as string]: (lightById.get(n.id)?.glow ?? 0).toFixed(3),
                  }}
                  ref={(el) => {
                    if (el) itemRefs.current.set(n.id, el);
                    else itemRefs.current.delete(n.id);
                  }}
                >
                  <time className={styles.time} dateTime={n.createdAt}>
                    {hhmm(n.createdAt)}
                  </time>
                  <p className={styles.user}>{n.user}</p>
                  <p className={styles.ai}>{n.ai}</p>
                </article>
              ))}
              {pending && (
                <article className={styles.pair}>
                  <p className={styles.user}>{pending}</p>
                  <p className={`${styles.ai} ${styles.thinking}`} aria-label="답을 만드는 중">
                    <span />
                    <span />
                    <span />
                  </p>
                </article>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.row}>
              <label
                className={styles.field}
                data-glow={hover || focused ? "on" : "off"}
                style={{ ["--gx" as string]: `${glow.x}px`, ["--gy" as string]: `${glow.y}px` }}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setGlow({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
              >
                <span className={styles.srOnly}>메시지</span>
                <textarea
                  ref={taRef}
                  value={text}
                  rows={1}
                  placeholder="메시지를 입력하세요 (Enter 보내기, Shift+Enter 줄바꿈)"
                  onChange={(e) => {
                    setText(e.target.value);
                    setGlow(caretXY(e.target)); // 타이핑하면 빛이 글 쓰는 자리(커서)를 따라간다
                  }}
                  onFocus={() => {
                    setFocused(true);
                    glowToCaret();
                  }}
                  onBlur={() => setFocused(false)}
                  onKeyUp={glowToCaret}
                  onClick={glowToCaret}
                  onKeyDown={(e) => {
                    // 한글 조합 중 Enter는 글자를 확정하는 키라 보내지 않는다
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
              </label>
              <label className={styles.model}>
                <span className={styles.srOnly}>모델</span>
                <select defaultValue="flash" aria-label="모델">
                  <option value="flash">Gemini Flash</option>
                </select>
              </label>
              <button ref={sendRef} type="submit" className={styles.send} disabled={!text.trim() || !!pending}>
                보내기
              </button>
              {meteors.map((m) => (
                <span
                  key={m.id}
                  className={styles.meteor}
                  style={{ left: m.x, top: m.y }}
                  aria-hidden="true"
                  onAnimationEnd={() => setMeteors((all) => all.filter((x) => x.id !== m.id))}
                >
                  <span className={styles.meteorTail} />
                  <span className={styles.meteorHead} />
                </span>
              ))}
            </div>
          </form>

          <section ref={planeRef} className={styles.wall} aria-label="기억 노드 시간축" inert={!wallOpen}>
            <p className={styles.hint}>지금 보이는 대화를 그 기억이 비춰요</p>
            <div ref={moonScrollRef} className={styles.wallScroll}>
              <MoonPlaneTrack sorted={sorted} geo={geo} selectedId={selectedId} onJump={jumpTo} labelMax={WALL_W - 140} />
            </div>
          </section>
          <div className={styles.layers} style={{ opacity: wallOpen ? 1 : 0 }}>
            <MoonPlaneBeams sorted={sorted} geo={geo} />
          </div>
          <button
            type="button"
            className={styles.wallToggle}
            aria-expanded={wallOpen}
            onClick={() => setWallPref(!wallOpen)}
          >
            {wallOpen ? "달 창 닫기 ›" : "‹ 달 창 열기"}
          </button>
        </section>
      </div>
    </div>
  );
}







