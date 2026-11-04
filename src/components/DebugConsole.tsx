"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemoryNode } from "@/lib/types";
import { api, type DebugState, type SessionSummary } from "./api";
import AppNav from "./AppNav";
import styles from "@/app/debug/debug.module.css";

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});
const t = (iso: string) => timeFmt.format(new Date(iso));

const MODE_NAME: Record<string, string> = { consolidate: "모드 1 · 정리", dream: "모드 2 · 꿈" };

/** 지우기는 한 번 더 눌러야 실행된다 */
function Danger({
  id,
  label = "삭제",
  armed,
  setArmed,
  onConfirm,
}: {
  id: string;
  label?: string;
  armed: string | null;
  setArmed: (id: string | null) => void;
  onConfirm: () => void;
}) {
  if (armed === id)
    return (
      <span className={styles.confirm}>
        <button type="button" className={styles.dangerSolid} onClick={onConfirm}>
          정말 {label}
        </button>
        <button type="button" className={styles.plain} onClick={() => setArmed(null)}>
          취소
        </button>
      </span>
    );
  return (
    <button type="button" className={styles.danger} onClick={() => setArmed(id)}>
      {label}
    </button>
  );
}

export default function DebugConsole() {
  const [state, setState] = useState<DebugState | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [q, setQ] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const reloadAll = useCallback(async () => {
    try {
      const [st, se] = await Promise.all([api.state(), api.sessions()]);
      setState(st);
      setSessions(se.sessions);
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    }
  }, []);

  const reloadNodes = useCallback(async () => {
    try {
      setNodes((await api.nodes({ q: q.trim() || undefined, sessionId: sessionId || undefined })).nodes);
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    }
  }, [q, sessionId]);

  useEffect(() => {
    queueMicrotask(() => void reloadAll());
  }, [reloadAll]);

  // 글자를 칠 때마다 바로 부르지 않고 잠깐 기다렸다가 검색
  useEffect(() => {
    const h = setTimeout(() => void reloadNodes(), 200);
    return () => clearTimeout(h);
  }, [reloadNodes]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      setMessage({ kind: "ok", text: done });
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    }
    setArmed(null);
    await Promise.all([reloadAll(), reloadNodes()]);
  };

  const stats: [string, string][] = [
    ["기억 노드", state ? String(state.nodeCount) : "…"],
    ["세션", String(sessions.length)],
    ["이야기", state ? String(state.stories.length) : "…"],
    ["통찰", state ? String(state.insights.length) : "…"],
    ["인격 버전", state ? `v${state.activePersona}` : "…"],
    ["오류", "—"],
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>디버그</h1>
        <AppNav />
        <span className={styles.sub}>가짜 API · data/runtime/mock-store.json</span>
        <div className={styles.controls}>
          {/* REM 조작은 3단계(REM)부터 동작한다 */}
          <select disabled aria-label="REM 모드">
            <option>모드 1 · 정리</option>
            <option>모드 2 · 꿈</option>
          </select>
          <button type="button" disabled>
            REM 시작
          </button>
          <button type="button" disabled>
            중단
          </button>
          <Danger
            id="reset-all"
            label="전체 초기화"
            armed={armed}
            setArmed={setArmed}
            onConfirm={() => void run(() => api.resetAll(), "전체 초기화했어요. 시드 데이터로 돌아갔어요.")}
          />
        </div>
      </header>

      {message && (
        <p className={`${styles.message} ${message.kind === "err" ? styles.msgErr : styles.msgOk}`} role="status">
          {message.text}
          <button type="button" className={styles.plain} onClick={() => setMessage(null)}>
            닫기
          </button>
        </p>
      )}

      <dl className={styles.stats}>
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <main className={styles.grid}>
        {/* ── 검색 + 노드 표 ── */}
        <section aria-labelledby="nodes-h" className={styles.card}>
          <h2 id="nodes-h">
            기억 노드 {nodes.length}개{q || sessionId ? " (검색 결과)" : ""}
          </h2>
          <div className={styles.search}>
            <label>
              <span>내용·세션 검색</span>
              <input
                type="search"
                value={q}
                placeholder="예: 떡볶이, s-lq3x, #12"
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label>
              <span>세션</span>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                <option value="">전체</option>
                {sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.sessionId} ({s.nodeCount})
                  </option>
                ))}
              </select>
            </label>
            {(q || sessionId) && (
              <button
                type="button"
                className={styles.plain}
                onClick={() => {
                  setQ("");
                  setSessionId("");
                }}
              >
                조건 지우기
              </button>
            )}
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th className={styles.num}>#</th>
                  <th>세션</th>
                  <th className={styles.num}>순서</th>
                  <th>시각</th>
                  <th>유저 입력</th>
                  <th>AI 답변</th>
                  <th>이야기</th>
                  <th>조작</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id}>
                    <td className={`${styles.mono} ${styles.num}`}>{n.id}</td>
                    <td className={styles.mono}>
                      <button type="button" className={styles.link} onClick={() => setSessionId(n.sessionId)}>
                        {n.sessionId}
                      </button>
                    </td>
                    <td className={`${styles.mono} ${styles.num}`}>{n.order}</td>
                    <td className={styles.mono}>{t(n.createdAt)}</td>
                    <td className={styles.clip}>{n.user}</td>
                    <td className={`${styles.dim} ${styles.clip}`}>{n.ai}</td>
                    <td className={styles.mono}>{n.storyId ? `이야기 #${n.storyId}` : "—"}</td>
                    <td>
                      <Danger
                        id={`node:${n.id}`}
                        armed={armed}
                        setArmed={setArmed}
                        onConfirm={() => void run(() => api.deleteNode(n.id), `기억 #${n.id}을 지웠어요.`)}
                      />
                    </td>
                  </tr>
                ))}
                {nodes.length === 0 && (
                  <tr>
                    <td colSpan={8} className={styles.dim}>
                      {q || sessionId ? "조건에 맞는 노드가 없어요." : "노드가 없어요."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 세션 · 이야기 ── */}
        <div className={styles.side}>
          <section aria-labelledby="ses-h" className={styles.card}>
            <h2 id="ses-h">세션 {sessions.length}개</h2>
            <ul className={styles.list}>
              {sessions.map((s) => (
                <li key={s.sessionId}>
                  <div className={styles.rowMeta}>
                    <button type="button" className={styles.link} onClick={() => setSessionId(s.sessionId)}>
                      {s.sessionId}
                    </button>
                    <span>{s.nodeCount}개</span>
                    <span className={`${styles.mono} ${styles.right}`}>{t(s.lastAt)}</span>
                  </div>
                  <p>{s.preview}</p>
                  <Danger
                    id={`session:${s.sessionId}`}
                    label="세션 삭제"
                    armed={armed}
                    setArmed={setArmed}
                    onConfirm={() =>
                      void run(() => api.deleteSession(s.sessionId), `세션 ${s.sessionId}을 지웠어요.`).then(() => {
                        if (sessionId === s.sessionId) setSessionId("");
                      })
                    }
                  />
                </li>
              ))}
              {sessions.length === 0 && <li className={styles.dim}>세션이 없어요.</li>}
            </ul>
          </section>

          <section aria-labelledby="sto-h" className={styles.card}>
            <h2 id="sto-h">이야기 {state?.stories.length ?? 0}편</h2>
            <ul className={styles.list}>
              {state?.stories.map((s) => (
                <li key={s.id}>
                  <div className={styles.rowMeta}>
                    <span className={styles.mono}>#{s.id}</span>
                    <span className={styles.mono}>{s.sessionId}</span>
                    <span>
                      {s.chars.toLocaleString()}자 · 조각 {s.nodeIds.length}개
                    </span>
                    <span className={`${styles.mono} ${styles.right}`}>{t(s.createdAt)}</span>
                  </div>
                  <Danger
                    id={`story:${s.id}`}
                    label="이야기와 조각 삭제"
                    armed={armed}
                    setArmed={setArmed}
                    onConfirm={() => void run(() => api.deleteStory(s.id), `이야기 #${s.id}와 조각을 지웠어요.`)}
                  />
                </li>
              ))}
              {state && state.stories.length === 0 && <li className={styles.dim}>넣은 이야기가 없어요.</li>}
            </ul>
          </section>
        </div>

        {/* ── 통찰 · 인격 ── */}
        <div className={styles.side}>
          <section aria-labelledby="ins-h" className={styles.card}>
            <h2 id="ins-h">통찰 {state?.insights.length ?? 0}개</h2>
            <ul className={styles.list}>
              {state?.insights.map((i) => (
                <li key={i.id}>
                  <div className={styles.rowMeta}>
                    <span className={styles.mono}>#{i.id}</span>
                    <span className={styles.tag}>{MODE_NAME[i.mode] ?? i.mode}</span>
                    <span className={styles.mono}>근거 {i.sourceNodeIds.map((x) => `#${x}`).join(" ") || "없음"}</span>
                  </div>
                  <p>{i.content}</p>
                  <Danger
                    id={`insight:${i.id}`}
                    armed={armed}
                    setArmed={setArmed}
                    onConfirm={() => void run(() => api.deleteInsight(i.id), `통찰 #${i.id}을 지웠어요.`)}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="per-h" className={styles.card}>
            <h2 id="per-h">인격(시스템 프롬프트) 버전</h2>
            <ul className={styles.list}>
              {state &&
                [...state.personas].reverse().map((p) => (
                  <li key={p.version}>
                    <div className={styles.rowMeta}>
                      <b className={styles.mono}>v{p.version}</b>
                      {p.version === state.activePersona && <span className={styles.active}>지금 쓰는 중</span>}
                      <span>
                        {p.parentVersion === null
                          ? "처음 인격"
                          : `v${p.parentVersion}에서 · 통찰 ${p.sourceInsightIds.map((x) => `#${x}`).join(" ")} 근거`}
                      </span>
                      <span className={`${styles.mono} ${styles.right}`}>{t(p.approvedAt)}</span>
                    </div>
                    <pre className={styles.prompt}>{p.systemPrompt}</pre>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
