"use client";

// 대화창 아래의 '잠' 줄: 누구와 이야기하는지(내 AI ↔ 학교 AI), 지금 인격, 잠들기.
// 잠드는 동안은 0.5초마다 진행을 불러와 그리고(입력은 서버도 막는다), 깨면 '자는 동안 이렇게 바뀌려 해요' 카드에서
// 항목마다 적용/취소를 고른다. 적용하면 같은 질문에 대한 잠들기 전·후 답을 나란히 보여 준다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaChange, PersonaChangeItem } from "@/lib/types";
import { api, type ChatMode, type Comparison, type PersonaProposal, type RemRun, type SleepState } from "./api";
import styles from "./SleepPanel.module.css";

const POLL_MS = 500;
const MODES = [
  { id: "consolidate", label: "정리", hint: "깊은 잠 · 기억을 하나씩 다시 읽고 정리해요" },
  { id: "dream", label: "꿈", hint: "REM · 별 두 개를 짝지어 뜻밖의 연결을 찾아요" },
] as const;
const AXIS: Record<string, [string, string]> = {
  warmth: ["차분하게", "다정하게"],
  empathy: ["밝게", "공감하며"],
  brevity: ["길게", "짧게"],
  curiosity: ["덜 묻기", "더 되묻기"],
};

export function describeChange(c: PersonaChange): string {
  switch (c.kind) {
    case "addNote":
      return `새 지침: “${c.text}”`;
    case "editNote":
      return `지침 ${c.noteId}번 고치기: “${c.text}”`;
    case "removeNote":
      return `지침 ${c.noteId}번 빼기`;
    case "moveStyle": {
      const [lo, hi] = AXIS[c.axis] ?? [c.axis, c.axis];
      return `말투: 조금 더 ${c.delta >= 0 ? hi : lo} (${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(2)})`;
    }
  }
}

export default function SleepPanel({
  sessionId,
  nodeCount,
  onSleepingChange,
}: {
  sessionId: string | null;
  /** 대화가 늘 때마다 다시 불러오려고 받는다 */
  nodeCount: number;
  /** 잠든 동안 입력을 잠그라고 대화 화면에 알린다 */
  onSleepingChange: (sleeping: boolean) => void;
}) {
  const [state, setState] = useState<SleepState | null>(null);
  const [run, setRun] = useState<RemRun | null>(null);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await api.sleepState(sessionId);
      setState(s);
      if (s.run) setRun(s.run);
    } catch {
      /* 다음에 다시 */
    }
  }, [sessionId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load, nodeCount]);

  // 세션이 바뀌면 그 세션의 것만
  useEffect(() => {
    queueMicrotask(() => {
      setRun(null);
      setDismissed(new Set());
      setError(null);
    });
  }, [sessionId]);

  const sleeping = run?.status === "running";
  useEffect(() => onSleepingChange(sleeping), [sleeping, onSleepingChange]);

  // 자는 동안 진행 폴링
  const runId = run?.id;
  useEffect(() => {
    if (!runId || !sleeping) return;
    let alive = true;
    const id = window.setInterval(async () => {
      try {
        const r = await api.remStatus(runId);
        if (!alive) return;
        setRun(r);
        if (r.status !== "running") {
          if (r.status === "error") setError(r.error ?? "잠자는 동안 문제가 생겼어요.");
          void load();
        }
      } catch {
        /* 한 번 놓쳐도 다음 차례에 */
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [runId, sleeping, load]);

  const proposal: PersonaProposal | null =
    state?.proposals
      .filter((p) => p.status === "pending" && !dismissed.has(p.id) && (p.items?.length ?? 0) > 0)
      .sort((a, b) => b.id - a.id)[0] ?? null;

  // 새 제안이 뜨면 기본으로 모두 고른 상태
  const proposalId = proposal?.id;
  const lastProposal = useRef<number | null>(null);
  useEffect(() => {
    if (proposalId == null || lastProposal.current === proposalId) return;
    lastProposal.current = proposalId;
    const items = proposal?.items ?? [];
    queueMicrotask(() => setPicked(new Set(items.filter((i) => i.status === "pending").map((i) => i.id))));
  }, [proposalId, proposal]);

  // 가장 최근 비교 (승인 뒤 '후' 답은 서버가 조금 늦게 채우므로 비어 있으면 몇 번 더 불러온다)
  const comparison: Comparison | null =
    [...(state?.comparisons ?? [])].sort((a, b) => b.id - a.id)[0] ?? null;
  const waitingAfter = !!comparison && !comparison.after && !!state?.proposals.find(
    (p) => p.runId === comparison.runId && p.status !== "pending" && p.items?.some((i) => i.status === "approved"),
  );
  useEffect(() => {
    if (!waitingAfter) return;
    const id = window.setTimeout(() => void load(), 1200);
    return () => clearTimeout(id);
  }, [waitingAfter, load, state]);

  const sleep = async (mode: string) => {
    if (!sessionId) return;
    setMenu(false);
    setError(null);
    try {
      const { runId: id } = await api.remStart(sessionId, mode);
      setRun(await api.remStatus(id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const decide = async () => {
    if (!proposal?.items) return;
    const pending = proposal.items.filter((i) => i.status === "pending");
    const approve = pending.filter((i) => picked.has(i.id)).map((i) => i.id);
    const reject = pending.filter((i) => !picked.has(i.id)).map((i) => i.id);
    setBusy(true);
    setError(null);
    try {
      await api.decide(proposal.id, approve, reject);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = async (mode: ChatMode) => {
    if (!sessionId || state?.mode === mode) return;
    setError(null);
    try {
      await api.setMode(sessionId, mode);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const mode = state?.mode ?? "personal";
  const persona = state?.persona;
  const noteCount = persona?.notes?.length ?? 0;
  const progress = run?.steps && run.steps.total > 0 ? run.steps.done / run.steps.total : null;
  const reading = run?.currentNodeIds?.length
    ? state?.nodes.find((n) => n.id === run.currentNodeIds[run.currentNodeIds.length - 1])
    : undefined;
  const pairing = run?.currentMeaningIds?.length
    ? state?.meanings.filter((m) => run.currentMeaningIds!.includes(m.id))
    : undefined;
  const modeLabel = MODES.find((m) => m.id === run?.mode)?.label ?? run?.mode;

  return (
    <div className={styles.root} data-sleeping={sleeping ? "" : undefined}>
      {/* 잠든 동안: 진행 */}
      {sleeping && run && (
        <section className={styles.sheet} aria-live="polite" aria-label="잠자는 중">
          <header className={styles.sleepHead}>
            <span className={styles.moon} aria-hidden="true" />
            <b>자는 중 · {modeLabel}</b>
            {run.source === "replay" && <span className={styles.tag}>인터넷이 안 돼서 예시로 보여 줘요</span>}
            <button type="button" className={styles.ghost} onClick={() => void api.remStop(run.id).catch(() => {})}>
              깨우기
            </button>
          </header>
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
            <span style={{ width: `${Math.max(progress ?? 0.06, 0.06) * 100}%` }} data-indeterminate={progress == null ? "" : undefined} />
          </div>
          {run.steps && (
            <p className={styles.step}>
              {run.steps.done} / {run.steps.total} 단계
            </p>
          )}
          {pairing && pairing.length > 0 ? (
            <p className={styles.reading}>
              <span>짝지은 별</span> {pairing.map((m) => m.title).join("  ✦  ")}
            </p>
          ) : reading ? (
            <p className={styles.reading}>
              <span>다시 읽는 기억</span> {reading.user.length > 60 ? `${reading.user.slice(0, 59)}…` : reading.user}
            </p>
          ) : (
            <p className={styles.reading}>기억을 고르는 중…</p>
          )}
        </section>
      )}

      {/* 깬 뒤: 제안 카드 */}
      {!sleeping && proposal && (
        <section className={styles.sheet} aria-label="인격 수정 제안">
          <header className={styles.cardHead}>
            <h2>자는 동안 이렇게 바뀌려 해요</h2>
            <button
              type="button"
              className={styles.ghost}
              aria-label="나중에 보기"
              onClick={() => setDismissed((d) => new Set(d).add(proposal.id))}
            >
              나중에
            </button>
          </header>
          <p className={styles.summary}>{proposal.summary}</p>
          <ul className={styles.items}>
            {(proposal.items ?? []).map((it: PersonaChangeItem) => (
              <li key={it.id} data-status={it.status}>
                <label>
                  <input
                    type="checkbox"
                    checked={it.status === "pending" ? picked.has(it.id) : it.status === "approved"}
                    disabled={it.status !== "pending"}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(it.id);
                        else n.delete(it.id);
                        return n;
                      })
                    }
                  />
                  <span>
                    <b>{describeChange(it.change)}</b>
                    <small>{it.reason}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void decide()}>
              {picked.size > 0 ? `고른 ${picked.size}개 적용` : "모두 취소"}
            </button>
            <span className={styles.note}>적용한 변화는 이 대화(나)에게만 남아요.</span>
          </div>
        </section>
      )}

      {/* 적용한 뒤: 같은 질문, 잠들기 전·후 */}
      {!sleeping && !proposal && comparison && (comparison.after || waitingAfter) && !dismissed.has(-comparison.id) && (
        <section className={styles.sheet} aria-label="잠들기 전후 비교">
          <header className={styles.cardHead}>
            <h2>같은 질문, 잠들기 전과 후</h2>
            <button type="button" className={styles.ghost} onClick={() => setDismissed((d) => new Set(d).add(-comparison.id))}>
              닫기
            </button>
          </header>
          <p className={styles.question}>“{comparison.question}”</p>
          <div className={styles.compare}>
            <div>
              <span>전 · v{comparison.before.version}</span>
              <p>{comparison.before.answer}</p>
            </div>
            <div data-after="">
              <span>후{comparison.after ? ` · v${comparison.after.version}` : ""}</span>
              <p>{comparison.after ? comparison.after.answer : "새 인격으로 다시 물어보는 중…"}</p>
            </div>
          </div>
        </section>
      )}

      {/* 늘 보이는 줄 */}
      <div className={styles.line}>
        <div className={styles.who} role="radiogroup" aria-label="대화 상대">
          <button type="button" role="radio" aria-checked={mode === "personal"} disabled={sleeping} onClick={() => void switchMode("personal")}>
            내 AI
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "school"}
            disabled={sleeping}
            title="우리 학교 학생들 이야기(이름 등은 지운 것)로 자란 AI"
            onClick={() => void switchMode("school")}
          >
            학교 AI
          </button>
        </div>
        <span className={styles.persona}>
          {mode === "school"
            ? "친구들 이야기로 짐작해서 말해요"
            : persona
              ? `인격 v${persona.version}${noteCount ? ` · 지침 ${noteCount}개` : ""}`
              : ""}
        </span>
        {state?.remSuggest && !sleeping && mode === "personal" && <span className={styles.suggest}>이야기가 쌓였어요. 잠들어 볼까요?</span>}
        <div className={styles.sleepWrap}>
          <button
            type="button"
            className={styles.sleep}
            aria-haspopup="menu"
            aria-expanded={menu}
            disabled={!sessionId || sleeping || nodeCount === 0 || mode === "school"}
            title={mode === "school" ? "학교 AI는 운영자가 재워요" : nodeCount === 0 ? "먼저 이야기를 나눠 주세요" : "잠들기"}
            onClick={() => setMenu((m) => !m)}
          >
            {sleeping ? "자는 중…" : "잠들기"}
          </button>
          {menu && (
            <div className={styles.menu} role="menu">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="menuitem" onClick={() => void sleep(m.id)}>
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
