"use client";

// 내 AI: 이 세션의 의미성으로 "나와 말이 잘 통하는 AI"를 만들고
// 1) 기본 AI와 나란히 같은 말에 답하게 해 비교해 보고 (이전 대화 기록 없이, 사전 프롬프트 + 기억 위키만으로)
// 2) 사전 프롬프트를 종이 카드(인쇄)·메일·복사로 가져간다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RELATIONS } from "@/lib/profile/build";
import { api, currentSessionId, startNewSession, type ChatTurn, type Profile, type Relation } from "./api";
import AppNav from "./AppNav";
import CompareSky, { SKY_H, type SkyEvent, type SkyHit } from "./CompareSky";
import MicButton from "./MicButton";
import { domeY } from "./sky";
import PromptCard from "./PromptCard";
import styles from "./MeView.module.css";

interface Turn {
  me: string;
  basic: string;
  personal: string;
  looked: number[];
}

const RELATION_KEYS: Relation[] = ["friend", "teacher", "mentor"];
const RELATION_HINT: Record<Relation, string> = {
  friend: "맞장구치고 공감부터",
  teacher: "차근차근 설명하고 확인",
  mentor: "질문으로 스스로 생각하게",
};
const SAMPLE_ASKS = ["요즘 나 어때 보여?", "오늘 좀 지쳤어", "내가 좋아하는 거 기억나?"];

/** 보내기 → 유성우 → (BEAM_AFTER) 답변 칸 왼쪽 벽에서 천구까지 선을 긋고 → (BEAM_MS) 점 A에서 별빛이 번진다 */
const BEAM_AFTER = 500;
const BEAM_MS = 450;
/** 이벤트·효과 안에서만 부르는 시계 (렌더 중에는 쓰지 않는다) */
const clockNow = () => performance.now();

interface Beam {
  x: number;
  y1: number;
  y2: number;
  kind: SkyHit["kind"];
}
interface Shot {
  id: number;
  x: number;
  y: number;
  fly: number;
  delay: number;
}

export default function MeView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [relation, setRelation] = useState<Relation>("friend");
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [ask, setAsk] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const micBase = useRef("");

  // 천구 연출
  const cmpRef = useRef<HTMLElement>(null);
  const skyBoxRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [beams, setBeams] = useState<{ id: number; lines: Beam[] } | null>(null);
  const [skyEvent, setSkyEvent] = useState<SkyEvent | null>(null);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const [mail, setMail] = useState<{ ready: boolean; mock: boolean } | null>(null);
  const [to, setTo] = useState("");
  const [consent, setConsent] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailDone, setMailDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (sid: string) => {
    const [{ nodes }, { profiles }] = await Promise.all([api.nodes({ sessionId: sid }), api.profiles(sid)]);
    setNodeCount(nodes.length);
    setProfile(profiles[0] ?? null);
    if (profiles[0]) setRelation(profiles[0].relation);
  }, []);

  useEffect(() => {
    // 브라우저에 저장된 세션 번호는 마운트 뒤에만 읽을 수 있다 (서버 렌더와 어긋나지 않게)
    queueMicrotask(() => {
      const sid = currentSessionId();
      setSessionId(sid);
      load(sid).catch((e) => setError((e as Error).message));
      api.mailStatus().then(setMail).catch(() => setMail({ ready: false, mock: false }));
    });
  }, [load]);

  const make = async () => {
    if (!sessionId) return;
    setMaking(true);
    setError(null);
    try {
      const { profile: p } = await api.makeProfile(sessionId, relation);
      setProfile(p);
      setTurns([]);
      setMailDone(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMaking(false);
    }
  };

  /** 비교 칸 기준 좌표: 마지막 턴의 두 답변 칸 왼쪽 벽 → 천구 윗선(점 A) */
  const measureBeams = (): { lines: Beam[]; hits: SkyHit[] } | null => {
    const panel = cmpRef.current;
    const sky = skyBoxRef.current;
    const thread = threadRef.current;
    const blocks = thread?.lastElementChild?.querySelectorAll<HTMLElement>("[data-side]");
    if (!panel || !sky || !thread || !blocks?.length) return null;
    const pr = panel.getBoundingClientRect();
    const sr = sky.getBoundingClientRect();
    const tr = thread.getBoundingClientRect();
    const lines: Beam[] = [];
    const hits: SkyHit[] = [];
    blocks.forEach((b) => {
      const kind = b.dataset.side === "personal" ? "personal" : "basic";
      const r = b.getBoundingClientRect();
      const left = r.left + (kind === "personal" ? 1 : 0); // 내 AI 칸은 2px 달빛 벽의 가운데
      const top = Math.min(Math.max(r.top, tr.top), tr.bottom);
      lines.push({
        x: left - pr.left,
        y1: top - pr.top,
        y2: sr.top - pr.top + domeY(left - sr.left, sr.width, SKY_H),
        kind,
      });
      hits.push({ x: left - sr.left, kind });
    });
    return { lines, hits };
  };

  /** 선을 긋고, 선이 천구에 닿으면 A에서 빛이 번진다 */
  // 나중에 부른 연출이 앞 연출을 대신한다 (답이 0.5초보다 빨리 오면 보내기 단계의 빛이 답 단계의 빛을 덮지 않게)
  const fireToken = useRef(0);
  const sentAt = useRef(0);
  const fireSky = (flare: number[], after: number) => {
    const token = ++fireToken.current;
    later(() => {
      if (token !== fireToken.current) return;
      const m = measureBeams();
      if (!m) return;
      setBeams({ id: ++seq.current, lines: m.lines });
      later(() => {
        if (token === fireToken.current) setSkyEvent({ id: ++seq.current, hits: m.hits, flare });
      }, BEAM_MS);
    }, after);
  };

  /** 보내기 단추에서 천구 윗선까지 유성 세 개 */
  const launchShower = () => {
    const panel = cmpRef.current;
    const sky = skyBoxRef.current;
    const btn = sendBtnRef.current;
    if (!panel || !sky || !btn) return;
    const pr = panel.getBoundingClientRect();
    const sr = sky.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const fresh = [-16, 0, 13].map((dx, i) => {
      const x = br.left + br.width / 2 + dx - pr.left;
      const y = br.top - pr.top;
      const topY = sr.top - pr.top + domeY(x - (sr.left - pr.left), sr.width, SKY_H);
      return { id: ++seq.current, x, y, fly: Math.max(y - topY, 60), delay: i * 90 + (i === 2 ? 40 : 0) };
    });
    setShots((all) => [...all, ...fresh]);
  };

  // 새 턴·기다리는 턴이 생기면 대화 칸 맨 아래로 (선이 잴 답변 칸이 보이게)
  useEffect(() => {
    const t = threadRef.current;
    if (t) t.scrollTop = t.scrollHeight;
  }, [turns, pending]);

  // 답이 도착하면 진짜 답변 칸에서 다시 선을 긋고, 찾아본 위키 별을 번쩍인다
  const seenTurns = useRef(0);
  useEffect(() => {
    if (turns.length > seenTurns.current && turns.length > 0) fireSky(turns[turns.length - 1].looked, Math.max(60, sentAt.current + BEAM_AFTER - clockNow()));
    seenTurns.current = turns.length;
    // fireSky는 타이머·ref만 쓰므로 턴 수가 바뀔 때만 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  const send = async (msg = ask) => {
    const m = msg.trim();
    if (!profile || !m || pending) return;
    launchShower();
    sentAt.current = clockNow();
    fireSky([], BEAM_AFTER);
    setPending(m);
    setAsk("");
    setError(null);
    const history = (side: "basic" | "personal"): ChatTurn[] =>
      turns.flatMap((t) => [
        { role: "user", text: t.me },
        { role: "model", text: t[side] },
      ]);
    try {
      const r = await api.compare(profile.id, m, { basic: history("basic"), personal: history("personal") });
      setTurns((all) => [...all, { me: m, ...r }]);
    } catch (e) {
      setError((e as Error).message);
      setAsk(m);
    } finally {
      setPending(null);
    }
  };

  const lastLooked = useMemo(() => new Set(turns.at(-1)?.looked ?? []), [turns]);
  const titleOf = (id: number) => profile?.wiki.find((w) => w.id === id)?.title ?? `#${id}`;

  const copy = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("복사하지 못했어요. 아래 글을 직접 선택해서 복사해 주세요.");
    }
  };

  const sendMail = async () => {
    if (!profile) return;
    setMailBusy(true);
    setError(null);
    try {
      const r = await api.mail(profile.id, to.trim());
      setMailDone(r.to);
      setTo("");
      setConsent(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMailBusy(false);
    }
  };

  const forgetMe = async () => {
    if (!sessionId) return;
    if (!window.confirm("이 자리의 대화·이야기·내 AI 기록을 모두 지울까요? 되돌릴 수 없어요.")) return;
    try {
      await api.deleteSession(sessionId);
      const sid = startNewSession();
      setSessionId(sid);
      setProfile(null);
      setTurns([]);
      setNodeCount(0);
    } catch (e) {
      setError((e as Error).message);
    }
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

      <main className={styles.main}>
        <section className={styles.make} aria-labelledby="make-h">
          <div>
            <h2 id="make-h">나와 말이 잘 통하는 AI</h2>
            <p className={styles.lead}>
              지금까지 나눈 대화와 이야기에서 의미성을 뽑아, 내 말투와 이야기를 아는 AI를 만들어요. 만든 AI는 여기서 기본 AI와
              비교해 보고, 프롬프트로 가져가 새 채팅에서도 쓸 수 있어요.
            </p>
            <p className={styles.meta}>
              {nodeCount === null ? "기록을 읽는 중…" : nodeCount === 0 ? "아직 기록이 없어요." : `이 세션의 기억 노드 ${nodeCount}개`}
              {nodeCount === 0 && (
                <>
                  {" "}
                  <Link href="/chat">대화하러 가기</Link> · <Link href="/story">이야기 넣기</Link>
                </>
              )}
            </p>
          </div>
          <div className={styles.makeSide}>
            <fieldset className={styles.relations}>
              <legend>어떤 사이가 좋아요?</legend>
              {RELATION_KEYS.map((r) => (
                <label key={r} data-on={relation === r ? "" : undefined}>
                  <input type="radio" name="relation" value={r} checked={relation === r} onChange={() => setRelation(r)} />
                  <b>{RELATIONS[r].label}</b>
                  <span>{RELATION_HINT[r]}</span>
                </label>
              ))}
            </fieldset>
            <button type="button" className={styles.primary} onClick={() => void make()} disabled={making || !nodeCount}>
              {making ? "의미성을 읽는 중…" : profile ? "다시 만들기" : "의미성 추출해서 만들기"}
            </button>
          </div>
        </section>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {profile && (
          <div className={styles.grid}>
            {/* 기억 위키: 대화할 때마다 여기서 관련 칸을 찾아 내 AI에게만 몰래 건넨다 */}
            <aside className={styles.wiki} aria-labelledby="wiki-h" data-scan={pending ? "" : undefined}>
              <h2 id="wiki-h">
                기억 위키 <span>{profile.wiki.length}칸</span>
              </h2>
              <p className={styles.wikiHelp}>내가 한 이야기를 주제별로 정리했어요. 말을 걸면 관련된 칸을 찾아 내 AI에게 건네요.</p>
              <ol className={styles.entries}>
                {profile.wiki.map((w) => (
                  <li key={w.id} data-looked={lastLooked.has(w.id) ? "" : undefined}>
                    <h3>
                      <span className={styles.entryNo}>{w.id}</span>
                      {w.title}
                      {lastLooked.has(w.id) && <em className={styles.found}>방금 찾아봄</em>}
                    </h3>
                    <p>{w.body}</p>
                    {w.keywords.length > 0 && (
                      <p className={styles.keys}>
                        {w.keywords.map((k) => (
                          <span key={k}>{k}</span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              {pending && <span className={styles.scanLine} aria-hidden="true" />}
            </aside>

            <div className={styles.stack}>
              <section className={styles.panel} aria-labelledby="about-h">
                <h2 id="about-h">AI가 알아본 나</h2>
                {profile.about && <p className={styles.about}>{profile.about}</p>}
                <ul className={styles.chips} aria-label="말투">
                  <li>{profile.style.polite ? "존댓말" : "반말"}</li>
                  <li>{{ short: "짧게", medium: "보통 길이", long: "길게" }[profile.style.length]}</li>
                  {profile.style.laughs && <li>ㅋㅋ·ㅎㅎ</li>}
                  {profile.style.emoji && <li>이모티콘</li>}
                  <li>{RELATIONS[profile.relation].label}처럼</li>
                </ul>
                {profile.tips.length > 0 && (
                  <ul className={styles.tips}>
                    {profile.tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
                {profile.method === "rule" && <p className={styles.note}>모델 없이 규칙으로 정리했어요 (가짜 모드이거나 모델이 실패했을 때).</p>}
              </section>

              <section ref={cmpRef} className={`${styles.panel} ${styles.cmp}`} aria-labelledby="cmp-h">
                <h2 id="cmp-h">같은 말, 두 AI</h2>
                <p className={styles.help}>
                  둘 다 앞의 대화 기록은 받지 않아요. 오른쪽 AI는 사전 프롬프트와 기억 위키만으로 나를 기억해요.
                </p>
                <div ref={skyBoxRef} className={styles.skyBox}>
                  <CompareSky wiki={profile.wiki} event={skyEvent} />
                </div>
                <div className={styles.cmpHead} aria-hidden="true">
                  <span>기본 AI</span>
                  <span className={styles.mine}>내 AI</span>
                </div>
                <div ref={threadRef} className={styles.thread} role="log" aria-live="polite" aria-label="비교 대화">
                  {turns.length === 0 && !pending && (
                    <div className={styles.samples}>
                      {SAMPLE_ASKS.map((s) => (
                        <button key={s} type="button" onClick={() => void send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {turns.map((t, i) => (
                    <div key={i} className={styles.turn}>
                      <p className={styles.me}>{t.me}</p>
                      <div className={styles.pairs}>
                        <p className={styles.basic} data-side="basic">
                          {t.basic}
                        </p>
                        <div className={styles.personal} data-side="personal">
                          <p>{t.personal}</p>
                          {t.looked.length > 0 && (
                            <p className={styles.lookedNote}>기억 위키에서 찾아봄: {t.looked.map(titleOf).join(" · ")}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {pending && (
                    <div className={styles.turn}>
                      <p className={styles.me}>{pending}</p>
                      <div className={styles.pairs}>
                        <p className={`${styles.basic} ${styles.wait}`} data-side="basic" aria-label="답을 만드는 중" />
                        <p className={`${styles.personal} ${styles.wait}`} data-side="personal" aria-label="기억을 찾아보는 중">
                          기억 위키를 찾아보는 중…
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <form
                  className={styles.ask}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <MicButton
                    className={styles.mic}
                    disabled={!!pending}
                    onStart={() => {
                      micBase.current = ask && !/\s$/.test(ask) ? `${ask} ` : ask;
                    }}
                    onText={(done, interim) => setAsk(micBase.current + done + interim)}
                    onError={setError}
                  />
                  <input
                    aria-label="두 AI에게 할 말"
                    value={ask}
                    maxLength={1000}
                    placeholder="두 AI에게 같은 말을 걸어 보세요"
                    onChange={(e) => setAsk(e.target.value)}
                  />
                  <button ref={sendBtnRef} type="submit" className={styles.primary} disabled={!ask.trim() || !!pending}>
                    보내기
                  </button>
                </form>

                {/* 답변 칸 왼쪽 벽에서 천구까지 올라가는 선 (글 뒤에 깔린다) */}
                {beams && (
                  <svg key={beams.id} className={styles.beams} aria-hidden="true">
                    {beams.lines.map((b, i) => (
                      <line
                        key={i}
                        className={b.kind === "personal" ? styles.beamP : styles.beamB}
                        x1={b.x}
                        y1={b.y1}
                        x2={b.x}
                        y2={b.y2}
                        pathLength={1}
                      />
                    ))}
                  </svg>
                )}
                {shots.map((m) => (
                  <span
                    key={m.id}
                    className={styles.meteor}
                    style={{ left: m.x, top: m.y, animationDelay: `${m.delay}ms`, ["--fly" as string]: `${-m.fly}px` }}
                    aria-hidden="true"
                    onAnimationEnd={() => setShots((all) => all.filter((x) => x.id !== m.id))}
                  >
                    <span className={styles.meteorTail} />
                    <span className={styles.meteorHead} />
                  </span>
                ))}
              </section>

              <section className={styles.panel} aria-labelledby="take-h">
                <h2 id="take-h">가져가기</h2>
                <p className={styles.help}>
                  학교에서 쓰는 제미나이는 채팅마다 기억이 끊겨요. 새 채팅을 열 때마다 이 프롬프트를 맨 앞에 붙여 넣으면 처음부터 나를 아는
                  상태로 시작해요.
                </p>
                <div className={styles.take}>
                  <div className={styles.cardWrap}>
                    <div className={styles.print} data-print-area="">
                      <PromptCard profile={profile} />
                    </div>
                  </div>
                  <div className={styles.takeSide}>
                    <div className={styles.btns}>
                      <button type="button" className={styles.primary} onClick={() => window.print()}>
                        카드 인쇄
                      </button>
                      <button type="button" className={styles.ghost} onClick={() => void copy()}>
                        {copied ? "복사했어요" : "프롬프트 복사"}
                      </button>
                    </div>

                    {mail?.ready ? (
                      <form
                        className={styles.mail}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void sendMail();
                        }}
                      >
                        <label>
                          <span>메일로 받기</span>
                          <input
                            type="email"
                            value={to}
                            autoComplete="off"
                            placeholder="me@example.com"
                            onChange={(e) => setTo(e.target.value)}
                          />
                        </label>
                        <label className={styles.consent}>
                          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                          <span>이 주소로 프롬프트를 보내는 데 동의해요. 주소는 보내는 데만 쓰고 저장하지 않아요.</span>
                        </label>
                        <button type="submit" className={styles.ghost} disabled={!to.trim() || !consent || mailBusy}>
                          {mailBusy ? "보내는 중…" : "메일 보내기"}
                        </button>
                        {mailDone && (
                          <p className={styles.ok} role="status">
                            {mailDone}로 보냈어요.{mail.mock ? " (연습 모드: 실제로는 보내지 않고 파일로 남겼어요)" : ""}
                          </p>
                        )}
                      </form>
                    ) : (
                      <p className={styles.note}>이 컴퓨터는 메일 보내기가 설정되지 않았어요. 카드 인쇄나 복사를 써 주세요.</p>
                    )}

                    <details className={styles.full}>
                      <summary>프롬프트 전문 보기 ({profile.prompt.length}자)</summary>
                      <pre>{profile.prompt}</pre>
                    </details>
                  </div>
                </div>
              </section>

              <p className={styles.forget}>
                체험을 마쳤나요?{" "}
                <button type="button" onClick={() => void forgetMe()}>
                  이 자리의 내 기록 지우기
                </button>
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
