"use client";

import { useEffect, useState } from "react";
import type { MemoryNode, Story } from "@/lib/types";
import { api, currentSessionId } from "./api";
import AppNav from "./AppNav";
import { STORY_SAMPLES } from "./storySamples";
import styles from "./StoryView.module.css";

const MAX_CHARS = 8000;

interface Result {
  story: Story;
  nodes: MemoryNode[];
}

/**
 * 정보를 잃지 않았는지 확인한다: 모든 노드의 원문 구간을 합치면 원문 전체가 빈틈·겹침 없이 덮이고,
 * 각 노드 글이 자기 구간의 원문 그대로여야 한다.
 */
function verify({ story, nodes }: Result) {
  const raw = story.rawText;
  const spans = nodes
    .flatMap((n, i) => (n.storySpans ?? []).map(([s, e]) => ({ s, e, i })))
    .sort((a, b) => a.s - b.s);
  let pos = 0;
  let contiguous = true;
  for (const { s, e } of spans) {
    if (s !== pos || e <= s) contiguous = false;
    pos = e;
  }
  const nodeTextOk = nodes.every(
    (n) => n.user === (n.storySpans ?? []).map(([s, e]) => raw.slice(s, e)).join("\n"),
  );
  return {
    ok: contiguous && pos === raw.length && nodeTextOk,
    chars: spans.reduce((n, x) => n + x.e - x.s, 0),
    total: raw.length,
    spans,
  };
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
            {STORY_SAMPLES.map((s) => (
              <button key={s.id} type="button" className={styles.ghost} onClick={() => setText(s.text)} disabled={busy}>
                예시: {s.label}
              </button>
            ))}
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
                {check.ok ? "원문 보존 확인됨" : "원문과 다름 — 확인 필요"} · 조각 {result.nodes.length}개 · 원문 구간 {check.spans.length}군데 · 글자{" "}
                {check.chars.toLocaleString()} / {check.total.toLocaleString()}
              </p>

              <h3>원문에서 나눈 자리</h3>
              <p className={styles.raw}>
                {check.spans.map((sp, k) => (
                  <span key={k} className={styles.seg} data-alt={sp.i % 6} title={result.nodes[sp.i].topic}>
                    <sup>{sp.i + 1}</sup>
                    {result.story.rawText.slice(sp.s, sp.e)}
                  </span>
                ))}
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
                    <p className={styles.piece}>
                      {(n.storySpans ?? []).map(([s, e], j) => (
                        <span key={j}>
                          {j > 0 && <i className={styles.gap}> ⋯ </i>}
                          {result.story.rawText.slice(s, e).trim()}
                        </span>
                      ))}
                    </p>
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


