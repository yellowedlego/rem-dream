"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, currentSessionId, type StoryResult } from "./api";
import AppNav from "./AppNav";
import StoryCloud from "./StoryCloud";
import { STORY_SAMPLES } from "./storySamples";
import {
  STAR_LIST_SCROLL_FROM,
  buildLinks,
  focusedMoons,
  relatedOf,
  toggleFocus,
  type StoryFocus,
} from "./storyFocus";
import styles from "./StoryView.module.css";

const MAX_CHARS = 8000;

type Result = StoryResult;

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

/** 목록 상자(스크롤되는 칸) 안에서만 스크롤해서 항목이 보이게 한다 (화면 전체가 같이 움직이지 않게) */
function revealIn(list: HTMLElement, item: HTMLElement) {
  const c = list.getBoundingClientRect();
  const r = item.getBoundingClientRect();
  if (r.top < c.top) list.scrollTop -= c.top - r.top + 4;
  else if (r.bottom > c.bottom) list.scrollTop += r.bottom - c.bottom + 4;
}

export default function StoryView() {
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [replay, setReplay] = useState(0); // 연출을 다시 보려고 컴포넌트를 새로 띄우는 번호
  // 눌러서 보고 있는 달·별. 위 그래프와 아래 별·노드 목록이 같은 값을 쓴다
  const [focus, setFocus] = useState<StoryFocus | null>(null);
  const starListRef = useRef<HTMLOListElement>(null);
  const nodeListRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    // 대화 화면과 같은 세션을 쓴다 (둘 다 같은 기억 저장소에 쌓임)
    queueMicrotask(() => setSessionId(currentSessionId()));
  }, []);

  const analyze = async () => {
    if (!text.trim() || !sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      setReplay(0);
      setFocus(null);
      setResult(await api.story(sessionId, text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const check = result ? verify(result) : null;
  const links = useMemo(() => (result ? buildLinks(result.nodes, result.meanings) : []), [result]);
  const related = useMemo(() => relatedOf(focus, links), [focus, links]);
  const hot = useMemo(() => focusedMoons(focus, links), [focus, links]);
  // 별마다 / 노드마다 이어진 상대 (목록에 작게 보여 주려고)
  const nodesOfStar = (s: number) => links.filter((l) => l.s === s).map((l) => l.i);
  const starsOfNode = (i: number) => links.filter((l) => l.i === i).map((l) => l.s);

  // 포커스가 바뀌면 각 목록은 자기 칸 안에서 그 항목(과 이어진 첫 항목)이 보이게 스크롤한다. 두 목록의 스크롤은 서로 따로다.
  useEffect(() => {
    if (!focus) return;
    const own = focus.kind === "star" ? starListRef.current : nodeListRef.current;
    const other = focus.kind === "star" ? nodeListRef.current : starListRef.current;
    const ownEl = own?.querySelector<HTMLElement>(`[data-i="${focus.index}"]`);
    if (own && ownEl) revealIn(own, ownEl);
    const firstRelated = [...(focus.kind === "star" ? related.moons : related.stars)].sort((a, b) => a - b)[0];
    const otherEl = firstRelated === undefined ? null : other?.querySelector<HTMLElement>(`[data-i="${firstRelated}"]`);
    if (other && otherEl) revealIn(other, otherEl);
  }, [focus, related]);
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

              <p className={styles.note}>
                {result.method === "ai"
                  ? "AI가 맥락을 읽고 나눴어요."
                  : "지금은 규칙으로 임시 분리했어요. 나중에는 AI가 맥락을 읽고 나눠요."}
              </p>

              <h3>의미 지도</h3>
              <StoryCloud
                key={`${result.story.id}-${replay}`}
                nodes={result.nodes}
                meanings={result.meanings}
                storyId={result.story.id}
                focus={focus}
                onFocus={setFocus}
              />

              {/* 그래프 바로 아래: 별 목록과 노드 목록. 스크롤이 서로 따로이고, 누르면 위 그래프에서 그 별·달이 포커스된다 */}
              <div className={styles.deck}>
                <section className={styles.panel} aria-labelledby="deck-stars">
                  <h4 id="deck-stars" className={styles.panelHead}>
                    의미 파일 (별) <span>{result.meanings.length}개</span>
                  </h4>
                  {result.meanings.length === 0 ? (
                    <p className={styles.panelEmpty}>이번 이야기에서는 의미 파일(별)을 뽑지 못했어요. 노드는 그대로 저장됐어요.</p>
                  ) : (
                    <ol
                      ref={starListRef}
                      className={`${styles.list} ${styles.starList}`}
                      data-scroll={result.meanings.length >= STAR_LIST_SCROLL_FROM ? "true" : undefined}
                    >
                      {result.meanings.map((m, s) => (
                        <li key={m.id || `m${s}`}>
                          <button
                            type="button"
                            className={styles.item}
                            data-i={s}
                            aria-pressed={focus?.kind === "star" && focus.index === s}
                            data-linked={related.stars.has(s) ? "" : undefined}
                            onClick={() => setFocus((f) => toggleFocus(f, { kind: "star", index: s }))}
                          >
                            <span className={styles.itemHead}>
                              <span className={`${styles.chip} ${styles.starChip}`}>★{s + 1}</span>
                              <b>{m.title || "이름 없는 의미"}</b>
                            </span>
                            <span className={styles.itemText}>{m.essence}</span>
                            <span className={styles.itemMeta}>
                              근거 노드 {nodesOfStar(s).map((i) => i + 1).join(" · ") || "없음"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className={styles.panel} aria-labelledby="deck-nodes">
                  <h4 id="deck-nodes" className={styles.panelHead}>
                    만들어진 기억 노드 <span>{result.nodes.length}개</span>
                  </h4>
                  <ol ref={nodeListRef} className={`${styles.list} ${styles.nodeList}`}>
                    {result.nodes.map((n, i) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={styles.item}
                          data-i={i}
                          aria-pressed={focus?.kind === "moon" && focus.index === i}
                          data-linked={related.moons.has(i) ? "" : undefined}
                          onClick={() => setFocus((f) => toggleFocus(f, { kind: "moon", index: i }))}
                        >
                          <span className={styles.itemHead}>
                            <span className={styles.chip}>{i + 1}</span>
                            <b>{n.topic}</b>
                            <span className={styles.itemMeta}>
                              #{n.id} · {n.user.trim().length}자
                              {starsOfNode(i).length > 0 && <> · {starsOfNode(i).map((s) => `★${s + 1}`).join(" ")}</>}
                            </span>
                          </span>
                          <span className={styles.itemText}>
                            {(n.storySpans ?? []).map(([s, e], j) => (
                              <span key={j}>
                                {j > 0 && <i className={styles.gap}> ⋯ </i>}
                                {result.story.rawText.slice(s, e).trim()}
                              </span>
                            ))}
                          </span>
                          {/* 눌러서 보는 동안에만 AI의 반응까지 펼친다 */}
                          {focus?.kind === "moon" && focus.index === i && <span className={styles.itemReply}>{n.ai}</span>}
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <button type="button" className={styles.ghost} onClick={() => setReplay((r) => r + 1)}>
                연출 다시 보기
              </button>
              <h3>원문에서 나눈 자리</h3>
              <p className={styles.raw}>
                {check.spans.map((sp, k) => (
                  <span
                    key={k}
                    className={styles.seg}
                    data-alt={sp.i % 6}
                    data-hot={hot.size === 0 ? undefined : hot.has(sp.i) ? "on" : "off"}
                    title={result.nodes[sp.i].topic}
                  >
                    <sup>{sp.i + 1}</sup>
                    {result.story.rawText.slice(sp.s, sp.e)}
                  </span>
                ))}
              </p>

              <button type="button" className={styles.ghost} onClick={() => {
                  setResult(null);
                  setFocus(null);
                }}>
                결과 닫기
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}



