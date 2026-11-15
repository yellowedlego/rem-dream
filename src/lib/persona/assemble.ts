import { SAFETY_RULES, buildChatSystemPrompt } from "../prompts/safety.ts";
import { formatStyleLines } from "./style-lines.ts";
import type { PersonaNote, PersonaVersion } from "../types.ts";

export interface AssembleOptions {
  persona: PersonaVersion;
  recentUserMessages?: string[]; // Up to 3 recent turns
  currentMessage?: string;
  forceBaselineFormat?: boolean; // For exact byte parity test
}

export interface AssembledPersona {
  systemPrompt: string;
  usedNoteIds: number[];
}

export function selectPersonaNotes(
  notes?: PersonaNote[],
  recentUserMessages: string[] = [],
  currentMessage = ""
): PersonaNote[] {
  if (!notes || notes.length === 0) return [];
  if (notes.length <= 6) return [...notes];

  const combinedContext = [...recentUserMessages, currentMessage].join(" ").toLowerCase();

  const scored = notes.map((note) => {
    let score = 0;
    if (!note.cues || note.cues.length === 0) {
      score = 0.5; // Baseline candidate
    } else {
      for (const cue of note.cues) {
        if (cue && combinedContext.includes(cue.toLowerCase())) {
          score += 1;
        }
      }
    }
    return { note, score };
  });

  // Sort descending by score, tie-break by addedInVersion desc, then note.id desc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aVer = a.note.addedInVersion ?? 0;
    const bVer = b.note.addedInVersion ?? 0;
    if (bVer !== aVer) return bVer - aVer;
    return b.note.id - a.note.id;
  });

  return scored.slice(0, 6).map((s) => s.note);
}

export function assemblePersonaPrompt(opts: AssembleOptions): AssembledPersona {
  const { persona, recentUserMessages = [], currentMessage = "" } = opts;
  const isNeutralStyle =
    !persona.style ||
    (persona.style.warmth === 0.5 &&
      persona.style.empathy === 0.5 &&
      persona.style.brevity === 0.5 &&
      persona.style.curiosity === 0.5);

  const selectedNotes = selectPersonaNotes(persona.notes, recentUserMessages, currentMessage);
  const usedNoteIds = selectedNotes.map((n) => n.id);

  // Non-negotiable acceptance criterion:
  // If notes are empty and style is 0.5 (or undefined), result MUST be byte-for-byte identical to baseline buildChatSystemPrompt
  if (selectedNotes.length === 0 && isNeutralStyle) {
    return {
      systemPrompt: buildChatSystemPrompt(persona.systemPrompt),
      usedNoteIds: [],
    };
  }

  const sections: string[] = [SAFETY_RULES, `[인격]\n${persona.systemPrompt.trim()}`];

  if (persona.style && !isNeutralStyle) {
    const styleLines = formatStyleLines(persona.style);
    sections.push(`[말투]\n${styleLines.join("\n")}`);
  }

  if (selectedNotes.length > 0) {
    const noteLines = selectedNotes.map((n) => `- ${n.text}`);
    sections.push(`[참고사항]\n${noteLines.join("\n")}`);
  }

  return {
    systemPrompt: sections.join("\n\n"),
    usedNoteIds,
  };
}
