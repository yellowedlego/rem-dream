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
export interface Piece {
  start: number;
  end: number;
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

/**
 * 맥락 단위로 끊는다. 구간은 빈틈·겹침 없이 원문 전체를 덮는다.
 * 문단(빈 줄) 경계를 먼저 존중하고, 너무 긴 문단은 문장 단위로 목표 길이만큼 묶는다.
 */
export function splitStory(text: string): Piece[] {
  const total = text.length;
  const target = Math.max(120, Math.ceil(total / MAX_PIECES));
  const ends = sentenceEnds(text);

  const cuts: number[] = [];
  let last = 0;
  for (const e of ends) {
    const len = e - last;
    const paragraphBreak = /\n\s*\n\s*$/.test(text.slice(last, e));
    if (len >= target || paragraphBreak || e === total) {
      cuts.push(e);
      last = e;
    }
  }
  if (cuts[cuts.length - 1] !== total) cuts.push(total);

  // 너무 짧은 마지막 조각은 앞에 붙인다
  if (cuts.length > 1 && total - cuts[cuts.length - 2] < target / 3) cuts.splice(cuts.length - 2, 1);
  // 그래도 상한을 넘으면 인접 조각을 합친다
  while (cuts.length > MAX_PIECES) {
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < cuts.length - 1; i++) {
      const len = cuts[i + 1] - (i === 0 ? 0 : cuts[i - 1] ?? 0);
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
    const body = text.slice(start, end).trim();
    pieces.push({ start, end, topic: body.length > 16 ? `${body.slice(0, 16)}…` : body });
    start = end;
  }
  return pieces;
}

/** 조각을 이어 붙이면 원문과 같은지 확인 (백엔드 테스트가 같은 걸 확인한다) */
export function coversExactly(text: string, pieces: Piece[]): boolean {
  let pos = 0;
  for (const p of pieces) {
    if (p.start !== pos || p.end <= p.start) return false;
    pos = p.end;
  }
  return pos === text.length;
}
