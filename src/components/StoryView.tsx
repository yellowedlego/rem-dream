"use client";

import { useEffect, useState } from "react";
import type { MemoryNode, Story } from "@/lib/types";
import { api, currentSessionId } from "./api";
import AppNav from "./AppNav";
import styles from "./StoryView.module.css";

const MAX_CHARS = 8000;
const SAMPLE = `아침에 알람을 세 번 끄고 겨우 일어났다. 아침을 못 먹고 버스를 탔는데, 빈속이라 오전이 유난히 길게 느껴졌다.

1교시에 영어 단어 시험을 봤다. 반은 찍었다. 그래도 국어 시간에 발표를 했고, 목소리는 떨렸지만 끝까지 했다. 쉬는 시간에 친구가 발표 좋았다고 말해 줘서 기분이 풀렸다.

점심에는 급식에 떡볶이가 나왔다. 오늘 최고다. 점심시간에는 도서관에서 만화책을 봤다.

오후에는 다음 주 수학 시험 범위가 너무 넓어서 걱정이 됐다. 단원별로 나눠 적어 보니 덜 막막했다.`;

interface Result {
  story: Story;
  nodes: MemoryNode[];
}

/** 조각을 이어 붙이면 원문과 정확히 같은지 확인한다 (정보를 잃지 않았다는 증거) */
function verify({ story, nodes }: Result) {
  const joined = nodes.map((n) => n.user).join("");
  let pos = 0;
  let contiguous = true;
  for (const n of nodes) {
    const [s, e] = n.storySpan ?? [-1, -1];
    if (s !== pos || e <= s) contiguous = false;
    pos = e;
  }
  const same = joined === story.rawText;
  return { ok: same && contiguous && pos === story.rawText.length, chars: joined.length, total: story.rawText.length };
}

export default function StoryView() {
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    // 대화 화면과 같은 세션을 쓴다 (둘 다 같은 기억 저장소에 쌓임)
    queueMicrotask(() => setSessionId(currentSessionId()));
  }, []);

  const analyze = async () => {
    if (!text.trim() || !sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.story(sessionId, text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const check = result ? verify(result) : null;
  const tooLong = text.length > MAX_CHARS;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>꿈 시스템</h1>
        <AppNav />
        <span className={styles.session}>{sessionId ?? "…"}</span>
      </header>

      <main className={styles.main}>
        <section className={styles.input} aria-labelledby="in-h">
          <h2 id="in-h">긴 이야기 넣기</h2>
          <p className={styles.help}>
            하루 이야기나 긴 글을 한 번에 붙여 넣으세요. 맥락이 바뀌는 곳에서 나눠 기억 노드 여러 개로 만들어요. 글은 한 글자도 바뀌지 않아요.
          </p>
          <label className={styles.box}>
            <span className={styles.srOnly}>이야기</span>
            <textarea
              value={text}
              placeholder="여기에 이야기를 붙여 넣으세요"
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className={styles.bar}>
            <span className={`${styles.count} ${tooLong ? styles.over : ""}`}>
              {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}자
            </span>
            <button type="button" className={styles.ghost} onClick={() => setText(SAMPLE)} disabled={busy}>
              예시 넣기
            </button>
            <button type="button" className={styles.primary} onClick={() => void analyze()} disabled={!text.trim() || tooLong || busy}>
              {busy ? "나누는 중…" : "분석하기"}
            </button>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>

        <section className={styles.result} aria-labelledby="out-h" aria-live="polite">
          <h2 id="out-h">분석 결과</h2>
          {!result && (
            <p className={styles.placeholder}>
              {busy ? "이야기를 읽고 있어요…" : "이야기를 넣고 ‘분석하기’를 누르면 여기에 조각들이 나와요."}
            </p>
          )}

          {result && check && (
            <>
              <p className={`${styles.verify} ${check.ok ? styles.ok : styles.bad}`} role="status">
                {check.ok ? "원문 보존 확인됨" : "원문과 다름 — 확인 필요"} · 조각 {result.nodes.length}개 · 글자{" "}
                {check.chars.toLocaleString()} / {check.total.toLocaleString()}
              </p>

              <h3>원문에서 나눈 자리</h3>
              <p className={styles.raw}>
                {result.nodes.map((n, i) => {
                  const [s, e] = n.storySpan ?? [0, 0];
                  return (
                    <span key={n.id} className={styles.seg} data-alt={i % 2} title={n.topic}>
                      <sup>{i + 1}</sup>
                      {result.story.rawText.slice(s, e)}
                    </span>
                  );
                })}
              </p>

              <h3>만들어진 기억 노드</h3>
              <ol className={styles.cards}>
                {result.nodes.map((n, i) => (
                  <li key={n.id} className={styles.card}>
                    <div className={styles.cardHead}>
                      <span className={styles.chip}>{i + 1}</span>
                      <b>{n.topic}</b>
                      <span className={styles.mono}>
                        기억 #{n.id} · {n.user.trim().length}자
                      </span>
                    </div>
                    <p className={styles.piece}>{n.user.trim()}</p>
                    <p className={styles.reply}>{n.ai}</p>
                  </li>
                ))}
              </ol>
              <button type="button" className={styles.ghost} onClick={() => setResult(null)}>
                결과 닫기
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
