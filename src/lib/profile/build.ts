// "내 AI"(나와 말이 잘 통하는 AI)를 만드는 순수 계산. 서버 전용이 아니라 tests/unit에서 바로 시험한다.
// 1) 내 말에서 말투 알아내기 (모델 없이)
// 2) 기억 위키에서 이번 말과 관련된 칸 찾기
// 3) 가져가는 사전 프롬프트 조립 (QR 한 개에 들어가는 길이로)

import type { Relation, StyleGuess, WikiEntry } from "../types";

/**
 * 사전 프롬프트 최대 글자 수. 글자 그대로 QR에 담아 종이에 찍으므로, 600자(한글 약 1.8KB)면
 * 46mm QR의 한 칸이 약 0.34mm로 휴대폰이 읽을 수 있는 크기가 된다 (900자면 0.25mm로 너무 촘촘하다).
 */
export const PROMPT_MAX = 600;
export const WIKI_MAX = 8;
export const TIPS_MAX = 3;

export const RELATIONS: Record<Relation, { label: string; line: string }> = {
  friend: { label: "친구", line: "편하게 맞장구쳐 주고, 조언보다 공감을 먼저 해 줘. 내가 먼저 묻기 전에는 가르치려 하지 마." },
  teacher: { label: "선생님", line: "내가 모르는 걸 물으면 쉬운 예부터 차근차근 설명하고, 이해했는지 한 번 확인해 줘." },
  mentor: { label: "멘토", line: "고민을 말하면 바로 답을 주기보다 내가 스스로 생각해 보게 질문 하나를 먼저 던지고, 그다음 방향을 제안해 줘." },
};

export function isRelation(x: unknown): x is Relation {
  return x === "friend" || x === "teacher" || x === "mentor";
}

const POLITE_END = /(요|니다|세요|까요|죠|습니까|나요|네요)[.!?~…ㅠㅜ\s]*$/;
const CASUAL_END = /(어|아|야|지|냐|니|다|래|자|네|거든|잖아|ㅋ+|ㅎ+|음|듯|함|임|ㅇㅇ)[.!?~…ㅠㅜ\s]*$/;
const LAUGH = /ㅋㅋ|ㅎㅎ/;
const EMOJI = /\p{Extended_Pictographic}|ㅠㅠ|ㅜㅜ/u;

/** 내 말(사용자 입력)들에서 말투를 센다. 말이 없으면 존댓말·보통 길이 */
export function inferStyle(userTexts: string[]): StyleGuess {
  const texts = userTexts.map((t) => t.trim()).filter((t) => t && t !== "(사진)");
  if (texts.length === 0) return { polite: true, length: "medium", laughs: false, emoji: false, samples: 0 };
  let polite = 0;
  let casual = 0;
  for (const t of texts) {
    for (const line of t.split(/(?<=[.!?。？！\n])\s*/)) {
      const l = line.trim();
      if (!l) continue;
      if (POLITE_END.test(l)) polite++;
      else if (CASUAL_END.test(l)) casual++;
    }
  }
  const avg = texts.reduce((n, t) => n + t.length, 0) / texts.length;
  const share = (re: RegExp) => texts.filter((t) => re.test(t)).length / texts.length;
  return {
    polite: polite >= casual,
    length: avg < 25 ? "short" : avg < 60 ? "medium" : "long",
    laughs: share(LAUGH) >= 0.2,
    emoji: share(EMOJI) >= 0.2,
    samples: texts.length,
  };
}

/** 말투를 사람이 읽는 한 줄로 */
export function styleLine(s: StyleGuess): string {
  const parts = [
    s.polite ? "존댓말로 부드럽게" : "반말로 편하게",
    s.length === "short" ? "두세 문장 안으로 짧게" : s.length === "long" ? "충분히 길게 풀어서" : "너무 길지 않게",
  ];
  if (s.laughs) parts.push("ㅋㅋ 같은 웃음도 가끔 섞어서");
  if (s.emoji) parts.push("이모티콘도 조금 써서");
  return `${parts.join(", ")} 말해 줘.`;
}

// ── 기억 위키 찾기: 한글은 낱말 끝이 잘 바뀌어서(시험이/시험을) 두 글자 조각으로 겹침을 센다 ──
function grams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length === 1) continue; // 한 글자 낱말(조사 등)은 버린다
    for (let i = 0; i + 2 <= w.length; i++) out.add(w.slice(i, i + 2));
  }
  return out;
}

export interface WikiHit {
  entry: WikiEntry;
  score: number;
}

/**
 * 이번 말과 관련된 위키 칸 (점수 높은 순, 최대 k개). 제목·키워드가 겹치면 본문보다 무겁게 친다.
 * 겹침이 너무 적으면(우연히 한 조각) 고르지 않는다.
 */
export function searchWiki(entries: WikiEntry[], message: string, k = 2): WikiHit[] {
  const q = grams(message);
  if (q.size === 0) return [];
  const hits: WikiHit[] = [];
  for (const e of entries) {
    const head = grams(`${e.title} ${e.keywords.join(" ")}`);
    const body = grams(e.body);
    let score = 0;
    for (const g of q) {
      if (head.has(g)) score += 2;
      else if (body.has(g)) score += 1;
    }
    if (score >= 2) hits.push({ entry: e, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.id - b.entry.id).slice(0, k);
}

/** 찾은 위키 칸을 대화 시스템 프롬프트에 붙일 글로 */
export function wikiContext(hits: WikiHit[]): string {
  if (hits.length === 0) return "";
  return `[기억 위키에서 찾은 내 이야기 — 관련 있을 때만 자연스럽게 꺼내고, 외운 티를 내지 마]\n${hits
    .map((h) => `- ${h.entry.title}: ${h.entry.body}`)
    .join("\n")}`;
}

export interface PromptParts {
  relation: Relation;
  style: StyleGuess;
  about: string;
  tips: string[];
  wiki: WikiEntry[];
}

/**
 * 가져가는 사전 프롬프트. 제미나이 같은 새 채팅 맨 앞에 그대로 붙여 넣는 글이라
 * 내가 AI에게 말하는 1인칭 반말로 쓴다. PROMPT_MAX를 넘으면 위키 칸을 뒤에서부터 뺀다.
 */
export function buildPrompt(p: PromptParts): string {
  const r = RELATIONS[p.relation];
  const head = [
    "[나와 말이 잘 통하는 AI가 되어 줘]",
    `너는 앞으로 나의 ${r.label}야. ${r.line}`,
    `말투: ${styleLine(p.style)}`,
    p.about.trim() ? `나에 대해: ${p.about.trim()}` : "",
    p.tips.length ? `대화할 때:\n${p.tips.map((t) => `- ${t}`).join("\n")}` : "",
  ].filter(Boolean);
  const tail = "이건 내가 직접 정리해서 준 거야. 첫 답은 짧게 \"알겠어\" 정도로만 하고, 내가 이야기를 꺼내면 위 내용을 자연스럽게 이어 줘.";
  const wikiBlock = (n: number) =>
    n === 0 ? "" : `내가 전에 한 이야기:\n${p.wiki.slice(0, n).map((e) => `- ${e.title}: ${e.body}`).join("\n")}`;

  for (let n = Math.min(p.wiki.length, WIKI_MAX); n >= 0; n--) {
    const text = [...head, wikiBlock(n), tail].filter(Boolean).join("\n\n");
    if (text.length <= PROMPT_MAX) return text;
  }
  // 위키 없이도 길면 나에 대해·요령을 자른다
  return [...head, tail].join("\n\n").slice(0, PROMPT_MAX);
}

/** 메일 주소를 기록용으로 가린다: jiyun@gmail.com → j***@gmail.com */
export function maskEmail(to: string): string {
  const [local, domain] = to.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** 보낼 수 있는 메일 주소 모양인지 (한 개만, 줄바꿈·쉼표 없이) */
export function isEmail(x: unknown): x is string {
  return typeof x === "string" && x.length <= 254 && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(x);
}
