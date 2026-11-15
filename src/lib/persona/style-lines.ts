import type { PersonaStyle, StyleAxis } from "../types.ts";

export interface StyleTierSentences {
  low: string;   // < 0.35
  mid: string;   // 0.35 ~ 0.65
  high: string;  // > 0.65
}

export const STYLE_SENTENCES: Record<StyleAxis, StyleTierSentences> = {
  warmth: {
    low: "차분하고 정중한 어조로 예의를 갖추어 대화해.",
    mid: "다정하고 편안한 어조로 따뜻하게 답해.",
    high: "친구처럼 매우 친근하고 다정다감하게 마음을 표현해.",
  },
  empathy: {
    low: "밝고 긍정적인 에너지를 담아 활기차게 대화해.",
    mid: "상대의 마음에 귀를 기울이며 자연스럽게 맞장구쳐.",
    high: "먼저 상대의 기분과 감정에 깊이 공감한 뒤 이야기를 이어 가.",
  },
  brevity: {
    low: "생각과 배경을 조금 더 길게 풀어서 설명해.",
    mid: "존댓말(해요체)로, 한두 문장으로 짧게 답해.",
    high: "핵심만 담아 아주 간결하게 한 문장으로 답해.",
  },
  curiosity: {
    low: "되묻기를 아끼고 상대가 건넨 말을 조용히 수용해.",
    mid: "상대가 한 말에서 구체적인 것(시간, 장소, 사람, 기분)을 하나 짚어 되물어.",
    high: "상대방의 이야기에 호기심을 갖고 적극적으로 되물어 봐.",
  },
};

export function getStyleSentence(axis: StyleAxis, value: number): string {
  if (value < 0.35) return STYLE_SENTENCES[axis].low;
  if (value > 0.65) return STYLE_SENTENCES[axis].high;
  return STYLE_SENTENCES[axis].mid;
}

export function formatStyleLines(style: PersonaStyle): string[] {
  return [
    getStyleSentence("warmth", style.warmth),
    getStyleSentence("empathy", style.empathy),
    getStyleSentence("brevity", style.brevity),
    getStyleSentence("curiosity", style.curiosity),
  ];
}
