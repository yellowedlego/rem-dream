// 붙여 넣은 글이 "나 ↔ AI" 대화 기록인지 알아보고, 문장마다 누가 한 말인지 붙인다.
// AI 답을 버리지 않는다: 맥락(무슨 말에 대한 반응인지)으로 함께 보여 주되, "이 사람"에 대한 의미는 내 말에서만 뽑게 한다.
// 순수 계산이라 tests/unit에서 바로 시험한다.

import type { Sentence } from "./groups";

export type Speaker = "me" | "ai";

const ME = ["나", "내가", "저", "제가", "사용자", "유저", "질문", "q", "user", "me", "you", "you said", "prompt"];
const AI = [
  "ai",
  "에이아이",
  "gemini",
  "제미나이",
  "제미니",
  "gemini said",
  "chatgpt",
  "gpt",
  "챗gpt",
  "챗지피티",
  "claude",
  "클로드",
  "챗봇",
  "bot",
  "assistant",
  "model",
  "답변",
  "a",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alt = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).map(esc).join("|");
// 줄 맨 앞의 이름표: "나:", "**Gemini**:", "[AI]", "You said" (이름표만 있는 줄은 콜론이 없어도 된다)
const LABEL = new RegExp(
  `^[ \\t]*(?:[-*>]\\s*)?(?:\\*\\*|\\[|【)?\\s*(${alt(ME)}|${alt(AI)})\\s*(?:[\\]】]|(?:\\*\\*)?\\s*(?:[:：]|$))`,
  "i",
);

/** 한 줄이 이름표로 시작하면 그 화자 */
export function labelOf(line: string): Speaker | null {
  const m = LABEL.exec(line);
  if (!m) return null;
  const name = m[1].toLowerCase();
  // "a"·"q" 한 글자 이름표는 콜론이 있을 때만 (영어 문장 "A cat..." 오인 방지)
  if ((name === "a" || name === "q") && !/^[^:：]*[:：]/.test(line)) return null;
  return AI.includes(name) ? "ai" : "me";
}

/**
 * 문장마다 화자. 나와 AI 이름표가 둘 다 한 번 이상 나와야 대화 기록으로 본다 (아니면 null: 한 사람의 이야기).
 * 첫 이름표 앞의 글은 "나"로 본다.
 */
export function speakersOf(text: string, sentences: Sentence[]): Speaker[] | null {
  const marks: { at: number; who: Speaker }[] = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    const who = labelOf(line);
    if (who) marks.push({ at: pos, who });
    pos += line.length + 1;
  }
  if (!marks.some((m) => m.who === "me") || !marks.some((m) => m.who === "ai")) return null;

  let k = -1;
  return sentences.map((s) => {
    // 문장 안의 첫 글자(앞 공백 제외) 기준
    const first = s.start + (text.slice(s.start, s.end).length - text.slice(s.start, s.end).trimStart().length);
    while (k + 1 < marks.length && marks[k + 1].at <= first) k++;
    return k >= 0 ? marks[k].who : "me";
  });
}

/** 모델에 보여 줄 번호 붙은 문장 목록 (화자가 있으면 [나]/[AI] 표시) */
export function numberedWithSpeakers(text: string, sentences: Sentence[], speakers: Speaker[] | null): string {
  return sentences
    .map((s, i) => {
      const who = speakers ? (speakers[i] === "ai" ? "[AI] " : "[나] ") : "";
      return `${i + 1}. ${who}${text.slice(s.start, s.end).trim()}`;
    })
    .join("\n");
}
