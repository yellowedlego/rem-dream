import "server-only";
import { getEnv } from "@/lib/env";
import { callModelJson } from "@/lib/model/client";
import {
  MAX_GROUPS,
  MAX_MEANINGS,
  MEANING_SCHEMA,
  MEANING_SYSTEM,
  SPLIT_SCHEMA,
  SPLIT_SYSTEM,
  buildMeaningPrompt,
  buildSplitPrompt,
} from "@/lib/prompts/story";
import type { SplitMethod } from "@/lib/types";
import {
  coversExactly,
  groupsToPieces,
  pieceText,
  splitSentences,
  validateMeanings,
  type GroupAnswer,
  type MeaningAnswer,
  type MeaningDraft,
  type Piece,
} from "./groups";
import { heuristicSplit } from "./split";
import { numberedWithSpeakers, speakersOf, type Speaker } from "./speakers";

/**
 * 이야기 전처리 (docs/backend-plan.md "이야기 전처리 규칙").
 * AI가 문장 번호로 주제를 묶는 것이 기본이고, 모델이 없거나(가짜 모드) 두 번 다 검증에 실패하면 규칙으로 순서대로 자른다.
 * 어느 쪽이든 조각들의 구간을 합치면 원문 전체가 빈틈·겹침 없이 덮인다.
 */
export async function splitWithModel(text: string): Promise<{ pieces: Piece[]; method: SplitMethod }> {
  const sentences = splitSentences(text);
  const env = getEnv();

  if (!env.isMock && sentences.length > 0) {
    const prompt = buildSplitPrompt(numberedWithSpeakers(text, sentences, speakersOf(text, sentences)));
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const answer = await callModelJson<GroupAnswer>({
          prompt,
          systemInstruction: SPLIT_SYSTEM,
          temperature: 0.1,
          json: { schema: SPLIT_SCHEMA as unknown as Record<string, unknown> },
          purpose: "story-split",
        });
        const pieces = groupsToPieces(text, sentences, answer, MAX_GROUPS);
        if (pieces && coversExactly(text, pieces)) return { pieces, method: "ai" };
        console.warn(`[story] model grouping failed validation (attempt ${attempt + 1})`);
      } catch (err) {
        console.warn(`[story] model grouping call failed (attempt ${attempt + 1}):`, err);
      }
    }
  }

  // 대체 경로: 문단 → 문장 → 글자 수 규칙 (순서대로, 구간 하나씩)
  const spans = heuristicSplit(text, MAX_GROUPS);
  return {
    pieces: spans.map((s) => ({ spans: [[s.start, s.end]], topic: s.topic, reply: null })),
    method: "rule",
  };
}

/**
 * 의미 파일(별) 초안 뽑기. 모델이 하는 일이고, 실패하거나 모델이 없으면 빈 배열.
 * 가짜 모드에서는 화면 개발용으로 주제 이름을 모은 임시 의미 하나를 돌려준다.
 */
export async function extractMeanings(text: string, pieces: Piece[]): Promise<MeaningDraft[]> {
  if (pieces.length === 0) return [];
  const env = getEnv();
  if (env.isMock) {
    return [
      {
        title: pieces.map((p) => p.topic).slice(0, 2).join(" · ").slice(0, 20),
        essence: `주제 ${pieces.length}개가 오가는 이야기예요. (가짜 모드의 임시 의미)`,
        pieceIndexes: pieces.map((_, i) => i),
        keywords: [],
      },
    ];
  }
  try {
    const answer = await callModelJson<MeaningAnswer>({
      prompt: buildMeaningPrompt(pieces.map((p) => ({ topic: p.topic, text: markedPieceText(text, p) }))),
      systemInstruction: MEANING_SYSTEM,
      temperature: 0.3,
      json: { schema: MEANING_SCHEMA as unknown as Record<string, unknown> },
      purpose: "story-meaning",
    });
    return validateMeanings(answer, pieces.length, MAX_MEANINGS);
  } catch (err) {
    console.warn("[story] meaning extraction failed:", err);
    return [];
  }
}

/** 의미 뽑기에 보여 줄 조각 글: 대화 기록이면 문장마다 [나]/[AI] 표시를 붙인다 */
function markedPieceText(text: string, piece: Piece): string {
  const sentences = splitSentences(text);
  const speakers: Speaker[] | null = speakersOf(text, sentences);
  if (!speakers) return pieceText(text, piece);
  return sentences
    .map((s, i) => ({ s, who: speakers[i] }))
    .filter(({ s }) => piece.spans.some(([a, b]) => s.start >= a && s.end <= b))
    .map(({ s, who }) => `${who === "ai" ? "[AI]" : "[나]"} ${text.slice(s.start, s.end).trim()}`)
    .join("\n");
}
