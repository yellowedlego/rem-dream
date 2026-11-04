"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryNode } from "@/lib/types";
import { api, currentSessionId, startNewSession, switchSession, type SessionSummary } from "./api";
import AppNav from "./AppNav";
import styles from "./ChatView.module.css";

const timeFmt = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
const hhmm = (iso: string) => timeFmt.format(new Date(iso));

export default function ChatView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

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

  const send = async () => {
    const msg = text.trim();
    if (!msg || !sessionId || pending) return;
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

        <section className={styles.chat}>
          <div className={styles.scroll} role="log" aria-live="polite" aria-label="대화 내용">
            <div className={styles.column}>
              {nodes.length === 0 && !pending && (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>오늘 있었던 일을 편하게 이야기해 보세요</p>
                  <p>말을 걸면 대화 한 번이 기억 노드 하나로 쌓여요.</p>
                </div>
              )}
              {nodes.map((n) => (
                <article key={n.id} className={styles.pair}>
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
              <label className={styles.field}>
                <span className={styles.srOnly}>메시지</span>
                <textarea
                  value={text}
                  rows={1}
                  placeholder="메시지를 입력하세요 (Enter 보내기, Shift+Enter 줄바꿈)"
                  onChange={(e) => setText(e.target.value)}
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
              <button type="submit" className={styles.send} disabled={!text.trim() || !!pending}>
                보내기
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
