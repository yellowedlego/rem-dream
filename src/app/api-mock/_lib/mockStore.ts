import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryNode, Store, Story } from "@/lib/types";

// 프론트용 가짜 API의 저장소. 실제 백엔드(docs/backend-plan.md)가 나오면 이 폴더째 지운다.
// 시드(data/store.json, git 추적)는 건드리지 않고 data/runtime/mock-store.json(git 무시)에만 쓴다.
const SEED_PATH = path.join(process.cwd(), "data", "store.json");
const RUNTIME_DIR = path.join(process.cwd(), "data", "runtime");
const FILE_PATH = path.join(RUNTIME_DIR, "mock-store.json");

async function load(): Promise<Store> {
  let raw: string;
  try {
    raw = await readFile(FILE_PATH, "utf8");
  } catch {
    raw = await readFile(SEED_PATH, "utf8");
  }
  const store = JSON.parse(raw) as Store;
  store.stories ??= [];
  return store;
}

async function save(store: Store) {
  await mkdir(RUNTIME_DIR, { recursive: true });
  const tmp = `${FILE_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, FILE_PATH); // 임시 파일에 쓰고 이름을 바꿔 저장 도중에 깨지지 않게
}

// 요청이 동시에 와도 한 번에 하나씩 처리
let queue: Promise<unknown> = Promise.resolve();

/** 저장소를 읽어 fn에 넘긴다. write가 true면 fn이 고친 저장소를 저장한다. */
export function withStore<T>(fn: (store: Store) => T | Promise<T>, write = false): Promise<T> {
  const run = queue.then(async () => {
    const store = await load();
    const result = await fn(store);
    if (write) await save(store);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function resetToSeed() {
  return withStore(async () => {
    const seed = JSON.parse(await readFile(SEED_PATH, "utf8")) as Store;
    seed.stories = [];
    await save(seed);
  });
}

export const nextNodeId = (s: Store) => s.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
export const nextStoryId = (s: Store) => (s.stories ?? []).reduce((m, x) => Math.max(m, x.id), 0) + 1;
export const nextOrder = (s: Store, sessionId: string) =>
  s.nodes.filter((n) => n.sessionId === sessionId).reduce((m, n) => Math.max(m, n.order), 0) + 1;

export type { MemoryNode, Story };

// ── 가짜 답변 (모델 대신) ──
export function mockReply(user: string): string {
  const t = user.trim().replace(/\s+/g, " ");
  const short = t.length > 18 ? `${t.slice(0, 18)}…` : t;
  if (/[?？]$/.test(t)) return `좋은 질문이에요. “${short}”에 대해서는 같이 천천히 생각해 볼 수 있어요. 어떤 부분이 제일 궁금해요?`;
  if (/힘들|피곤|지쳐|우울|짜증|싫/.test(t)) return `많이 힘들었겠어요. “${short}” 그때 몸이나 마음에서 제일 먼저 느껴진 게 뭐였어요?`;
  if (/좋았|최고|기뻐|행복|재밌|신나/.test(t)) return `좋은 하루였네요. “${short}” 그 순간이 특히 기억에 남는 이유가 있어요?`;
  return `그랬군요. “${short}” 이어서 더 들려줄래요?`;
}

// ── 이야기 쪼개기 (모델 없이, 원문을 한 글자도 바꾸지 않는 대체 경로) ──
// 실제 백엔드는 모델이 구간·주제를 정하고 서버가 검증한다 (docs/backend-plan.md 5절). 여기는 같은 모양의 흉내.
export type Span = [number, number];

/** 노드 하나가 될 조각. 이야기가 뒤섞였으면 같은 주제의 떨어진 구간이 spans에 여러 개 들어간다. */
export interface Piece {
  spans: Span[];
  topic: string;
}

const MAX_PIECES = 12;

/** 문장 끝 위치(공백 포함)를 찾는다. 줄바꿈도 끝으로 본다. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.!?。…？！]+["'”’)\]]*\s*|\n+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const e = m.index + m[0].length;
    if (e > 0 && e < text.length && ends[ends.length - 1] !== e) ends.push(e);
  }
  ends.push(text.length);
  return ends;
}

const shortTopic = (body: string) => {
  const t = body.trim();
  return t.length > 16 ? `${t.slice(0, 16)}…` : t;
};

// ── 뒤섞인 이야기: A 하다가 "아 맞다" B, 또 C, 다시 A → 같은 주제끼리 묶는다 ──
/** 끼어들기·되돌아가기 신호 */
const CUE =
  /^\s*(아[,!.…\s]*(맞다|참|그리고|그런데|아까)|맞다[!,.…\s]|참[,!.\s]|그러고\s*보니|그건\s*그렇고|근데|그나저나|아무튼|다시\s*(돌아와서|말하면)|그래서\s*아까)/;
const PARTICLES = "은는이가을를에의도로와과만서";
const STOP = new Set(["그래서", "그런데", "그리고", "그러고", "오늘", "진짜", "정말", "너무", "아까", "아무튼", "하지만", "그래도", "이번", "다음", "생각", "같은", "그냥"]);

/** 조사를 대충 떼어 낸 단어들 (같은 주제인지 볼 때만 쓴다) */
function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []) {
    let w = raw;
    for (let i = 0; i < 2 && w.length >= 3 && PARTICLES.includes(w[w.length - 1]); i++) w = w.slice(0, -1);
    if (w.length >= 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/** 끼어들기 신호가 없거나 주제가 하나뿐이면 null (그땐 순서대로 끊는다) */
function splitThreads(text: string): Piece[] | null {
  const units: { start: number; end: number; cue: boolean; tok: Set<string> }[] = [];
  let s = 0;
  for (const e of sentenceEnds(text)) {
    if (e <= s) continue;
    const body = text.slice(s, e);
    units.push({ start: s, end: e, cue: CUE.test(body), tok: tokens(body) });
    s = e;
  }
  if (!units.some((u) => u.cue)) return null;

  const threads: { tok: Set<string>; units: number[] }[] = [];
  let cur = -1;
  units.forEach((u, i) => {
    let best = -1;
    let bestScore = 0;
    threads.forEach((t, ti) => {
      let sc = 0;
      for (const w of u.tok) if (t.tok.has(w)) sc++;
      if (sc > bestScore || (sc > 0 && sc === bestScore && ti === cur)) {
        best = ti;
        bestScore = sc;
      }
    });
    let target: number;
    if (best >= 0)
      target = best; // 겹치는 단어가 가장 많은 주제 (되돌아가기 포함)
    else if (cur < 0 || u.cue) {
      threads.push({ tok: new Set(), units: [] }); // 새 주제로 끼어들기
      target = threads.length - 1;
    } else target = cur; // 단서가 없으면 하던 얘기의 연장
    threads[target].units.push(i);
    for (const w of u.tok) threads[target].tok.add(w);
    cur = target;
  });

  // 처음 나온 순서로 정렬하고, 상한을 넘으면 가장 짧은 주제를 앞 주제에 합친다
  threads.sort((a, b) => a.units[0] - b.units[0]);
  const size = (t: { units: number[] }) => t.units.reduce((n, i) => n + units[i].end - units[i].start, 0);
  while (threads.length > MAX_PIECES) {
    let k = 0;
    for (let i = 1; i < threads.length; i++) if (size(threads[i]) < size(threads[k])) k = i;
    const into = k === 0 ? 1 : k - 1;
    threads[into].units = [...threads[into].units, ...threads[k].units].sort((a, b) => a - b);
    threads.splice(k, 1);
  }
  if (threads.length < 2) return null;

  return threads.map((t) => {
    const spans: Span[] = [];
    for (const i of t.units) {
      const u = units[i];
      const last = spans[spans.length - 1];
      if (last && last[1] === u.start) last[1] = u.end;
      else spans.push([u.start, u.end]);
    }
    const first = shortTopic(text.slice(spans[0][0], spans[0][1]));
    return { spans, topic: spans.length > 1 ? `${first} (${spans.length}군데)` : first };
  });
}

/**
 * 순서대로 맥락 단위로 끊는다. 문단(빈 줄)이 충분하면 문단 하나 = 장면 하나,
 * 아니면 문장을 목표 길이만큼 묶는다.
 */
function splitContiguous(text: string): Piece[] {
  const total = text.length;
  const target = Math.max(120, Math.ceil(total / MAX_PIECES));
  const ends = sentenceEnds(text);

  const paraCuts: number[] = [];
  const paraRe = /\n[ \t]*\n\s*/g;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(text))) {
    const e = pm.index + pm[0].length;
    if (e < total) paraCuts.push(e);
  }
  paraCuts.push(total);

  const cuts: number[] = [];
  if (paraCuts.length >= 4) {
    cuts.push(...paraCuts);
  } else {
    let last = 0;
    for (const e of ends) {
      if (e - last >= target || e === total) {
        cuts.push(e);
        last = e;
      }
    }
    if (cuts[cuts.length - 1] !== total) cuts.push(total);
  }

  // 너무 짧은 마지막 조각은 앞에 붙인다
  if (cuts.length > 1 && total - cuts[cuts.length - 2] < target / 3) cuts.splice(cuts.length - 2, 1);
  // 그래도 상한을 넘으면 인접 조각을 합친다
  while (cuts.length > MAX_PIECES) {
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < cuts.length - 1; i++) {
      const len = cuts[i + 1] - (i === 0 ? 0 : cuts[i - 1]);
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    cuts.splice(best, 1);
  }

  const pieces: Piece[] = [];
  let start = 0;
  for (const end of cuts) {
    if (end <= start) continue;
    pieces.push({ spans: [[start, end]], topic: shortTopic(text.slice(start, end)) });
    start = end;
  }
  return pieces;
}

export function splitStory(text: string): Piece[] {
  return splitThreads(text) ?? splitContiguous(text);
}

/** 모든 구간을 합치면 원문 전체가 빈틈·겹침 없이 덮이는지 확인 (백엔드 테스트가 같은 걸 확인한다) */
export function coversExactly(text: string, pieces: Piece[]): boolean {
  const spans = pieces.flatMap((p) => p.spans).sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e] of spans) {
    if (s !== pos || e <= s) return false;
    pos = e;
  }
  return pos === text.length;
}
