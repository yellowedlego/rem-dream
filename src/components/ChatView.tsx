"use client";

// 첨부 사진은 내 컴퓨터의 임시 주소(blob:)와 우리 서버의 /api/images라서 next/image로 최적화할 대상이 아니다
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MemoryNode } from "@/lib/types";
import { api, currentSessionId, startNewSession, switchSession, type SessionSummary } from "./api";
import AppNav from "./AppNav";
import { MAX_IMAGES, PHOTO_ONLY_TEXT } from "@/lib/images";
import { MoonPlaneBeams, MoonPlaneTrack, chargeLit, useMoonPlane, type Birth } from "./MoonPlane";
import { hasFiles, imageFilesOf, prepareImage, revokeAttachment, type Attachment } from "./imageFiles";
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

/** 답을 기다리는 대화의 임시 번호: 이 번호로 달 자리·빛줄기를 먼저 만든다 (진짜 노드 번호는 1부터) */
const PENDING_ID = -1;
/** 답이 온 순간 달과 대화가 번쩍이는 시간 (CSS의 moonFlash·pairFlash와 같다) */
const FLASH_MS = 1100;

/** 파일을 끌어 올 때 나타나는 별: 가로세로로 길게 뻗은 네 꼭짓점 별이라 "+"처럼 보인다 */
const PLUS_STAR = Array.from({ length: 8 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 4;
  const r = k % 2 === 0 ? 34 : 6.5;
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
}).join(" ");

export default function ChatView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [pendingAt, setPendingAt] = useState("");
  // 사진 첨부: 입력줄에 붙어 있는 것(줄이는 중인 것 포함), 답을 기다리는 대화에 보이는 것, 크게 보기, 끌어 오는 별
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(0);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [dragStar, setDragStar] = useState<{ x: number; y: number; dropped: boolean } | null>(null);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // 달이 태어나는 연출: 보내면 charging(선 → 어두운 달이 차오름), 답이 오면 flash(번쩍) 뒤 사라진다
  const [birth, setBirth] = useState<Birth | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const [composerH, setComposerH] = useState(96); // 입력줄 높이: 대화 칸 아래 여백과 보이는 구간 계산에 쓴다
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
  // 대화 칸과 달창이 똑같은 순서를 쓴다: 한 세션 안에서는 대화가 이어진 순서(order).
  // (시각으로 정렬하면 시드처럼 시각이 앞서 있는 기억 사이에 새 대화가 끼어든다)
  const ordered = useMemo(() => [...nodes].sort((a, b) => a.order - b.order || a.id - b.id), [nodes]);
  // 답을 기다리는 대화도 맨 끝에 임시 노드로 넣어서, 달 자리와 빛줄기가 답보다 먼저 생기게 한다
  const sorted = useMemo(() => {
    const list = [...ordered];
    if (pending !== null && sessionId)
      list.push({ id: PENDING_ID, sessionId, order: Number.MAX_SAFE_INTEGER, createdAt: pendingAt, user: pending, ai: "" });
    return list;
  }, [ordered, pending, pendingAt, sessionId]);
  // 오른쪽 벽의 내용은 전시 화면(/)의 오른쪽과 같은 것: 달 시간축 + 빛줄기 (MoonPlane 공용)
  const { geo, lightById, selectedId, jumpTo, measure } = useMoonPlane({
    sorted,
    mainRef: chatRef,
    chatRef: scrollRef,
    planeRef,
    scrollRef: moonScrollRef,
    itemRefs,
    // 빛줄기는 전시 화면처럼 대화 배경과 달창의 경계(벽의 왼쪽 끝)에서 시작한다
    edgeRef: planeRef,
    edgeSide: "left",
    // 대화 칸은 입력줄 밑까지 깔려 있으므로, 글이 보이는 구간은 입력줄 윗변까지
    bottomInsetRef: composerRef,
  });
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setComposerH(Math.round(el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

  // ── 사진 붙이기 (클립 버튼, Ctrl+V, 끌어 놓기가 모두 여기로 온다) ──
  const addFiles = (files: File[]) => {
    const imgs = imageFilesOf(files);
    if (imgs.length === 0) {
      if (files.length > 0) setError("사진 파일만 올릴 수 있어요.");
      return;
    }
    const room = Math.max(0, MAX_IMAGES - attachments.length - attachBusy);
    if (room === 0) {
      setError(`사진은 한 번에 ${MAX_IMAGES}장까지 보낼 수 있어요.`);
      return;
    }
    const take = imgs.slice(0, room);
    setError(imgs.length > room ? `사진은 한 번에 ${MAX_IMAGES}장까지만 붙어요. 앞의 ${room}장만 올렸어요.` : null);
    setAttachBusy((b) => b + take.length);
    for (const f of take) {
      prepareImage(f)
        .then((a) => setAttachments((list) => [...list, a]))
        .catch((e: Error) => setError(e.message))
        .finally(() => setAttachBusy((b) => b - 1));
    }
  };
  const removeAttachment = (id: string) => {
    setAttachments((list) => {
      list.filter((a) => a.id === id).forEach(revokeAttachment);
      return list.filter((a) => a.id !== id);
    });
  };
  const attachFull = attachments.length + attachBusy >= MAX_IMAGES;

  // 파일을 끌어 올 때 나타나는 별이 마우스를 따라다닌다. 놓으면 한 번 터지고 사라진다
  const starAt = (e: React.DragEvent<HTMLElement>, dropped = false) => {
    const r = e.currentTarget.getBoundingClientRect();
    setDragStar({ x: e.clientX - r.left, y: e.clientY - r.top, dropped });
  };
  const onDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth.current += 1;
    starAt(e);
  };
  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    starAt(e);
  };
  const onDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!hasFiles(e.dataTransfer)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragStar(null);
  };
  const onDrop = (e: React.DragEvent<HTMLElement>) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth.current = 0;
    addFiles(Array.from(e.dataTransfer.files));
    starAt(e, true);
    setTimeout(() => setDragStar(null), 650);
  };
  useEffect(() => {
    // 대화 칸 밖에 놓쳐도 브라우저가 사진을 열어 버리지(화면이 사라지지) 않게
    const stop = (e: DragEvent) => {
      if (hasFiles(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  const send = async () => {
    const msg = text.trim();
    const sending = attachments;
    if ((!msg && sending.length === 0) || !sessionId || pending || attachBusy > 0) return;
    // 별똥별: 보내기 버튼 가운데(버튼 뒤)에서 떠서 수직으로 올라간다 (움직임 줄이기 설정이면 생략)
    const btn = sendRef.current;
    if (btn && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = ++meteorSeq.current;
      setMeteors((m) => [...m, { id, x: btn.offsetLeft + btn.offsetWidth / 2, y: btn.offsetTop + btn.offsetHeight / 2 }]);
    }
    setError(null);
    clearTimeout(flashTimer.current);
    setPendingAt(new Date().toISOString());
    setPending(msg || PHOTO_ONLY_TEXT);
    setPendingImages(sending.map((a) => a.previewUrl));
    setBirth({ id: PENDING_ID, phase: "charging" });
    setText("");
    setAttachments([]);
    const sentAt = performance.now();
    try {
      const { node } = await api.chat(sessionId, msg, sending);
      setNodes((n) => [...n, node]);
      // 답이 온 순간: 기다리는 동안 차오른 자리에서 새 달이 제 모양까지 차오르며 번쩍이고, 대화도 한 번 번쩍인다
      setBirth({ id: node.id, phase: "flash", from: chargeLit(performance.now() - sentAt) });
      flashTimer.current = setTimeout(() => setBirth(null), FLASH_MS);
      sending.forEach(revokeAttachment);
      void refreshSessions();
    } catch (e) {
      setBirth(null);
      setError((e as Error).message);
      setText(msg); // 실패하면 쓴 글과 사진을 돌려준다
      setAttachments(sending);
    } finally {
      setPending(null);
      setPendingImages([]);
    }
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

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
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          data-measured={area > 0 ? "" : undefined}
          style={{
            ["--wall" as string]: wallOpen ? `${WALL_W}px` : "0px",
            ["--area" as string]: `${area}px`,
            ["--composer-h" as string]: `${composerH}px`,
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
              {ordered.map((n) => (
                <article
                  key={n.id}
                  className={styles.pair}
                  data-birth={birth?.id === n.id ? birth.phase : undefined}
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
                  {/* 번쩍일 때 이 대화와 위아래 주변까지 잠깐 밝히는 빛 */}
                  {birth?.id === n.id && <span className={styles.birthGlow} aria-hidden="true" />}
                  <time className={styles.time} dateTime={n.createdAt}>
                    {hhmm(n.createdAt)}
                  </time>
                  {n.images?.length ? (
                    <div className={styles.userImgs}>
                      {n.images.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          className={styles.bubbleThumb}
                          aria-label="보낸 사진 크게 보기"
                          onClick={() => setViewer(`/api/images/${i.id}`)}
                        >
                          <img src={`/api/images/${i.id}`} alt="보낸 사진" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!(n.images?.length && n.user === PHOTO_ONLY_TEXT) && <p className={styles.user}>{n.user}</p>}
                  <p className={styles.ai}>{n.ai}</p>
                </article>
              ))}
              {pending && (
                <article
                  className={styles.pair}
                  data-birth="charging"
                  style={{
                    ["--lit" as string]: (lightById.get(PENDING_ID)?.lit ?? 0).toFixed(3),
                    ["--glow" as string]: (lightById.get(PENDING_ID)?.glow ?? 0).toFixed(3),
                  }}
                  ref={(el) => {
                    if (el) itemRefs.current.set(PENDING_ID, el);
                    else itemRefs.current.delete(PENDING_ID);
                  }}
                >
                  {pendingImages.length > 0 && (
                    <div className={styles.userImgs}>
                      {pendingImages.map((src) => (
                        <span key={src} className={styles.bubbleThumb}>
                          <img src={src} alt="보내는 사진" />
                        </span>
                      ))}
                    </div>
                  )}
                  {!(pendingImages.length > 0 && pending === PHOTO_ONLY_TEXT) && <p className={styles.user}>{pending}</p>}
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
            ref={composerRef}
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
              <button
                type="button"
                className={styles.clip}
                aria-label="사진 붙이기"
                title={`사진 붙이기 (최대 ${MAX_IMAGES}장, Ctrl+V·끌어 놓기도 돼요)`}
                disabled={!!pending || attachFull}
                onClick={() => fileRef.current?.click()}
              >
                <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
                  <rect x="1" y="1" width="16" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12.5" cy="5.2" r="1.6" fill="currentColor" />
                  <path d="M2 14 7 7.5 10.5 11.6 12.6 9.4 16.5 14Z" fill="currentColor" />
                </svg>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                aria-label="사진 파일 고르기"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = ""; // 같은 파일을 다시 골라도 반응하게
                }}
              />
              <div
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
                {/* 사진을 붙이면 이 칸이 열리면서 입력창 테두리(빛 포함)가 사진까지 감싸게 늘어난다 */}
                <div className={styles.attachWrap} data-open={attachments.length > 0 || attachBusy > 0 ? "true" : "false"}>
                  <ul className={styles.attach} aria-label="붙인 사진">
                    {attachments.map((a) => (
                      <li key={a.id} className={styles.thumb}>
                        <img src={a.previewUrl} alt={a.name} />
                        <button type="button" className={styles.thumbX} aria-label={`${a.name} 빼기`} onClick={() => removeAttachment(a.id)}>
                          ×
                        </button>
                      </li>
                    ))}
                    {Array.from({ length: attachBusy }, (_, i) => (
                      <li key={`busy-${i}`} className={`${styles.thumb} ${styles.thumbBusy}`} aria-label="사진을 줄이는 중" />
                    ))}
                  </ul>
                </div>
                <textarea
                  ref={taRef}
                  aria-label="메시지"
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
                  onPaste={(e) => {
                    // 복사한 그림·캡처가 있으면 사진으로 붙이고, 글자만 있으면 평소처럼 붙여 넣는다
                    const files = imageFilesOf(e.clipboardData.files);
                    if (files.length > 0) {
                      e.preventDefault();
                      addFiles(files);
                    }
                  }}
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
              </div>
              <label className={styles.model}>
                <span className={styles.srOnly}>모델</span>
                <select defaultValue="flash" aria-label="모델">
                  <option value="flash">Gemini Flash</option>
                </select>
              </label>
              <button ref={sendRef} type="submit" className={styles.send} disabled={(!text.trim() && attachments.length === 0) || !!pending || attachBusy > 0}>
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
            <div ref={moonScrollRef} className={styles.wallScroll}>
              <MoonPlaneTrack
                sorted={sorted}
                geo={geo}
                selectedId={selectedId}
                onJump={(id) => {
                  if (id !== PENDING_ID) jumpTo(id);
                }}
                labelMax={WALL_W - 140}
                birth={birth}
              />
            </div>
          </section>
          <div className={styles.layers} style={{ opacity: wallOpen ? 1 : 0 }}>
            <MoonPlaneBeams sorted={sorted} geo={geo} birth={birth} />
          </div>
          <button
            type="button"
            className={styles.wallToggle}
            aria-expanded={wallOpen}
            onClick={() => setWallPref(!wallOpen)}
          >
            {wallOpen ? "달 창 닫기 ›" : "‹ 달 창 열기"}
          </button>
          {dragStar && (
            <div
              className={styles.dropLayer}
              data-dropped={dragStar.dropped ? "" : undefined}
              style={{ ["--dx" as string]: `${dragStar.x}px`, ["--dy" as string]: `${dragStar.y}px` }}
              aria-hidden="true"
            >
              <svg className={styles.dropStar} width="104" height="104" viewBox="-40 -40 80 80">
                <circle r="38" fill="url(#plusGlow)" />
                <defs>
                  <radialGradient id="plusGlow">
                    <stop offset="0%" stopColor="#efdfa6" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#efdfa6" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <polygon points={PLUS_STAR} fill="#efdfa6" />
              </svg>
              {!dragStar.dropped && <span className={styles.dropHint}>놓으면 사진이 붙어요</span>}
            </div>
          )}
        </section>
      </div>
      {viewer && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={() => setViewer(null)}>
          <img src={viewer} alt="크게 본 사진" onClick={(e) => e.stopPropagation()} />
          <button type="button" className={styles.lightboxClose} aria-label="닫기" onClick={() => setViewer(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}









