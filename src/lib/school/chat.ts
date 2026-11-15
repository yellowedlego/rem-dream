import "server-only";
import { readStore } from "../store";
import { assemblePersonaPrompt } from "../persona/assemble";
import type { PersonaVersion, SchoolMeaning } from "../types";
import { searchSchoolPool } from "./pool";

export const SCHOOL_NOTICE =
  "이 AI는 우리 학교 학생들이 들려준 이야기(이름 등은 지운 것)로 자랐어요. 친구들 이야기를 많이 들은 사람이 처음 만난 친구를 대강 짐작하는 것처럼, 당신에 대해 짐작해서 말할 수 있어요. 틀리면 알려 주세요.";

export const SCHOOL_GUESS_PROMPT =
  "이건 이 학교 학생들에게서 자주 들은 이야기야. 상대가 그렇다고 단정하지 말고 짐작으로만 말해:";

export interface SchoolPromptResult {
  systemPrompt: string;
  persona: PersonaVersion;
  meanings: SchoolMeaning[];
  usedNoteIds: number[];
}

export async function assembleSchoolPrompt(
  currentMessage: string = "",
  recentUserMessages: string[] = []
): Promise<SchoolPromptResult> {
  const store = await readStore();

  // Find school active persona
  const activeVersionNum = store.activePersonas?.["school"] ?? 1;
  const schoolPersona =
    store.personas.find((p) => p.scope === "school" && p.version === activeVersionNum) ||
    store.personas.find((p) => p.scope === "school") ||
    store.personas[0];

  const assembled = assemblePersonaPrompt({
    persona: schoolPersona,
    recentUserMessages,
    currentMessage,
  });

  const matchedMeanings = await searchSchoolPool(currentMessage, 4);

  const parts = [
    assembled.systemPrompt,
    `\n[안내]\n${SCHOOL_NOTICE}`,
  ];

  if (matchedMeanings.length > 0) {
    const memoryLines = matchedMeanings.map((m) => `- ${m.title}: ${m.essence}`);
    parts.push(`\n[학교 기억]\n${SCHOOL_GUESS_PROMPT}\n${memoryLines.join("\n")}`);
  }

  return {
    systemPrompt: parts.join("\n"),
    persona: schoolPersona,
    meanings: matchedMeanings,
    usedNoteIds: assembled.usedNoteIds,
  };
}
