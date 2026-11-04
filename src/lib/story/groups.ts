// 이야기 전처리의 순수 계산 (서버 전용 아님 → tests/unit에서 node --test로 바로 시험한다)
// 1) 원문을 문장으로 나눈다 (빈틈·겹침 없이 원문 전체를 덮는다)
// 2) 모델이 문장 번호로 준 주제 묶음을 검증하고, 글자 구간(storySpans)으로 바꾼다
// 3) 모델이 준 의미 파일 초안을 검증한다

export type Span = [number, number];

export interface Sentence {
  start: number;
  end: number;
}

/** 노드 하나가 될 조각 */
export interface Piece {
  spans: Span[];
  topic: string;
  /** 이 조각에 대한 짧은 반응 (모델이 만든 것. 규칙 분리면 null) */
  reply: string | null;
}

/** 모델 호출 1의 답 모양 (docs/prompts.md 2절) */
export interface GroupAnswer {
  groups: { topic: string; sentences: number[]; reply?: string }[];
}

/** 모델 호출 2의 답 모양 (docs/prompts.md 3절). nodes는 조각 번호(1부터) */
export interface MeaningAnswer {
  meanings: { title: string; essence: string; nodes: number[]; keywords?: string[] }[];
}

export interface MeaningDraft {
  title: string;
  essence: string;
  /** 조각 번호(0부터) */
  pieceIndexes: number[];
  keywords: string[];
}

const TOPIC_MAX = 16;
const REPLY_MAX = 160;
const TITLE_MAX = 20;
const ESSENCE_MAX = 240;

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** 문장 끝(마침표·물음표·느낌표·말줄임·줄바꿈 뒤 공백까지)에서 자른다. 원문 전체를 빈틈없이 덮는다. */
export function splitSentences(text: string): Sentence[] {
  if (!text) return [];
  const cuts: number[] = [];
  const re = /[.!?。…？！]+["'”’)\]]*\s*|\n+\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const e = m.index + m[0].length;
    if (e > 0 && e < text.length && cuts[cuts.length - 1] !== e) cuts.push(e);
    if (m[0].length === 0) re.lastIndex++;
  }
  const out: Sentence[] = [];
  let start = 0;
  for (const e of [...cuts, text.length]) {
    if (e > start) out.push({ start, end: e });
    start = e;
  }
  // 공백뿐인 문장은 앞 문장에 붙인다 (원문은 그대로 덮인다)
  const merged: Sentence[] = [];
  for (const s of out) {
    if (!text.slice(s.start, s.end).trim() && merged.length > 0) merged[merged.length - 1].end = s.end;
    else merged.push({ ...s });
  }
  if (merged.length > 1 && !text.slice(merged[0].start, merged[0].end).trim()) {
    merged[1].start = merged[0].start;
    merged.shift();
  }
  return merged;
}

/** 모델에게 보여 줄 번호 붙은 문장 목록 */
export function numberedSentences(text: string, sentences: Sentence[]): string {
  return sentences.map((s, i) => `${i + 1}. ${text.slice(s.start, s.end).trim()}`).join("\n");
}

/**
 * 모델 답(문장 번호 묶음)을 검증해 조각으로 바꾼다. 하나라도 어기면 null.
 * - 모든 문장이 정확히 한 묶음에 (빠짐·중복 없음), 번호 범위 안
 * - 묶음 수 1 ~ maxGroups, 빈 묶음 없음
 */
export function groupsToPieces(
  text: string,
  sentences: Sentence[],
  answer: GroupAnswer | null | undefined,
  maxGroups: number,
): Piece[] | null {
  if (!answer || !Array.isArray(answer.groups)) return null;
  const groups = answer.groups;
  if (groups.length < 1 || groups.length > maxGroups) return null;

  const seen = new Set<number>();
  for (const g of groups) {
    if (!g || !Array.isArray(g.sentences) || g.sentences.length === 0) return null;
    for (const n of g.sentences) {
      if (!Number.isInteger(n) || n < 1 || n > sentences.length || seen.has(n)) return null;
      seen.add(n);
    }
  }
  if (seen.size !== sentences.length) return null;

  const pieces = groups.map((g) => {
    const idx = [...g.sentences].sort((a, b) => a - b).map((n) => n - 1);
    const spans: Span[] = [];
    for (const i of idx) {
      const s = sentences[i];
      const last = spans[spans.length - 1];
      if (last && last[1] === s.start) last[1] = s.end; // 이어지는 문장은 한 구간으로
      else spans.push([s.start, s.end]);
    }
    const topic = clip(typeof g.topic === "string" && g.topic.trim() ? g.topic : text.slice(spans[0][0], spans[0][1]), TOPIC_MAX);
    const reply = typeof g.reply === "string" && g.reply.trim() ? clip(g.reply, REPLY_MAX) : null;
    return { spans, topic, reply };
  });
  // 처음 나온 순서대로
  pieces.sort((a, b) => a.spans[0][0] - b.spans[0][0]);
  return pieces;
}

/** 모든 조각의 구간을 합치면 원문 전체가 빈틈·겹침 없이 덮이는지 */
export function coversExactly(text: string, pieces: Piece[]): boolean {
  const spans = pieces.flatMap((p) => p.spans).sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e] of spans) {
    if (s !== pos || e <= s) return false;
    pos = e;
  }
  return pos === text.length;
}

/** 노드 글 = 자기 구간들의 원문을 순서대로, 구간 사이는 줄바꿈 하나 */
export function pieceText(text: string, piece: Piece): string {
  return piece.spans.map(([s, e]) => text.slice(s, e)).join("\n");
}

/**
 * 모델 답(의미 파일들)을 검증한다. 잘못된 의미는 버리고(전체를 버리지 않음), 최대 maxMeanings개.
 * 근거 조각 번호는 1..pieceCount, 중복 제거, 비어 있으면 버림.
 */
export function validateMeanings(
  answer: MeaningAnswer | null | undefined,
  pieceCount: number,
  maxMeanings: number,
): MeaningDraft[] {
  if (!answer || !Array.isArray(answer.meanings)) return [];
  const out: MeaningDraft[] = [];
  for (const m of answer.meanings) {
    if (!m || typeof m.title !== "string" || typeof m.essence !== "string") continue;
    if (!m.title.trim() || !m.essence.trim() || !Array.isArray(m.nodes)) continue;
    const idx = [...new Set(m.nodes.filter((n) => Number.isInteger(n) && n >= 1 && n <= pieceCount))]
      .sort((a, b) => a - b)
      .map((n) => n - 1);
    if (idx.length === 0) continue;
    out.push({
      title: clip(m.title, TITLE_MAX),
      essence: clip(m.essence, ESSENCE_MAX),
      pieceIndexes: idx,
      keywords: (Array.isArray(m.keywords) ? m.keywords : [])
        .filter((k): k is string => typeof k === "string" && !!k.trim())
        .map((k) => clip(k, 12))
        .slice(0, 5),
    });
    if (out.length >= maxMeanings) break;
  }
  return out;
}
