"use client";

// 기록 관리 (운영하는 사람용): 관람객 기록을 세션 단위로 보고 지운다.
// 세션을 지우면 대화·이야기·의미·내 AI·사진 파일·메일 기록(가린 주소)까지 함께 지워진다.
import { useCallback, useEffect, useState } from "react";
import { api, type MailLog, type SessionRecord } from "./api";
import AppNav from "./AppNav";
import styles from "./AdminView.module.css";

const PRUNE_OPTIONS = [
  { hours: 1, label: "1시간 넘은 것" },
  { hours: 3, label: "3시간 넘은 것" },
  { hours: 24, label: "하루 넘은 것" },
  { hours: 0, label: "전부" },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AdminView() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [mails, setMails] = useState<MailLog[]>([]);
  const [hours, setHours] = useState(3);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api.records();
    setSessions(r.sessions);
    setMails(r.mails);
  }, []);

  useEffect(() => {
    queueMicrotask(() => load().catch((e) => setError((e as Error).message)));
  }, [load]);

  const run = async (label: string, fn: () => Promise<string>) => {
    if (!window.confirm(`${label}\n되돌릴 수 없어요. 계속할까요?`)) return;
    setBusy(true);
    setError(null);
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const total = sessions?.reduce((n, s) => n + s.nodes, 0) ?? 0;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>꿈 시스템</h1>
        <AppNav />
      </header>

      <main className={styles.main}>
        <section className={styles.panel} aria-labelledby="prune-h">
          <h2 id="prune-h">기록 지우기</h2>
          <p className={styles.help}>
            관람객 기록은 이 컴퓨터의 data/runtime 안에만 있어요. 마지막으로 무언가 남긴 지 오래된 세션을 통째로 지울 수 있어요. 메일 주소는
            원래 저장하지 않고, 보낸 기록에는 가린 주소(j***@…)만 남아요.
          </p>
          <div className={styles.bar}>
            <label>
              <span className={styles.srOnly}>지울 범위</span>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="지울 범위">
                {PRUNE_OPTIONS.map((o) => (
                  <option key={o.hours} value={o.hours}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.danger}
              disabled={busy || !sessions?.length}
              onClick={() =>
                void run(
                  hours === 0 ? "모든 세션의 기록을 지워요." : `마지막 기록이 ${hours}시간 넘은 세션을 지워요.`,
                  async () => `세션 ${(await api.prune(hours)).removed.length}개를 지웠어요.`,
                )
              }
            >
              세션 기록 지우기
            </button>
            <button
              type="button"
              className={styles.ghost}
              disabled={busy || mails.length === 0}
              onClick={() =>
                void run("메일 보낸 기록을 모두 지워요.", async () => {
                  await api.clearMails();
                  return "메일 보낸 기록을 지웠어요.";
                })
              }
            >
              메일 기록만 지우기
            </button>
          </div>
          {msg && (
            <p className={styles.ok} role="status">
              {msg}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="ses-h">
          <h2 id="ses-h">
            세션 <span>{sessions ? `${sessions.length}개 · 노드 ${total}개` : "읽는 중…"}</span>
          </h2>
          {sessions && sessions.length === 0 && <p className={styles.help}>남은 기록이 없어요.</p>}
          {sessions && sessions.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>세션</th>
                  <th>마지막 기록</th>
                  <th>노드</th>
                  <th>이야기</th>
                  <th>의미</th>
                  <th>내 AI</th>
                  <th>사진</th>
                  <th>메일</th>
                  <th>
                    <span className={styles.srOnly}>지우기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId}>
                    <td className={styles.mono}>{s.sessionId}</td>
                    <td>{when(s.lastAt)}</td>
                    <td>{s.nodes}</td>
                    <td>{s.stories}</td>
                    <td>{s.meanings}</td>
                    <td>{s.profiles}</td>
                    <td>{s.images}</td>
                    <td>{s.mails}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.rowDel}
                        aria-label={`${s.sessionId} 지우기`}
                        disabled={busy}
                        onClick={() =>
                          void run(`세션 ${s.sessionId}의 기록을 모두 지워요.`, async () => {
                            await api.deleteSession(s.sessionId);
                            return `${s.sessionId}를 지웠어요.`;
                          })
                        }
                      >
                        지우기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="mail-h">
          <h2 id="mail-h">
            메일 보낸 기록 <span>{mails.length}건</span>
          </h2>
          {mails.length === 0 ? (
            <p className={styles.help}>보낸 메일이 없어요.</p>
          ) : (
            <ul className={styles.mails}>
              {mails.map((m) => (
                <li key={m.id}>
                  <span>{when(m.at)}</span>
                  <span className={styles.mono}>{m.to}</span>
                  <span className={styles.mono}>{m.sessionId}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
