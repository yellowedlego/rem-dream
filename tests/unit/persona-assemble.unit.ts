import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChatSystemPrompt, SAFETY_RULES } from "../../src/lib/prompts/safety.ts";
import { assemblePersonaPrompt, selectPersonaNotes } from "../../src/lib/persona/assemble.ts";
import { formatStyleLines, getStyleSentence } from "../../src/lib/persona/style-lines.ts";
import type { PersonaNote, PersonaVersion } from "../../src/lib/types.ts";

test("zero-delta baseline parity: style=0.5 and notes=[] produces byte-identical output to buildChatSystemPrompt", () => {
  const basePrompt = "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.";
  const persona: PersonaVersion = {
    version: 1,
    systemPrompt: basePrompt,
    sourceInsightIds: [],
    approvedAt: "2026-11-15T00:00:00Z",
    parentVersion: null,
    style: {
      warmth: 0.5,
      empathy: 0.5,
      brevity: 0.5,
      curiosity: 0.5,
    },
    notes: [],
  };

  const baseline = buildChatSystemPrompt(basePrompt);
  const assembled = assemblePersonaPrompt({ persona });

  assert.equal(assembled.systemPrompt, baseline);
  assert.equal(assembled.systemPrompt.length, baseline.length);
  assert.deepEqual(assembled.usedNoteIds, []);
});

test("zero-delta parity when style and notes are omitted/undefined", () => {
  const basePrompt = "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야.";
  const persona: PersonaVersion = {
    version: 1,
    systemPrompt: basePrompt,
    sourceInsightIds: [],
    approvedAt: "2026-11-15T00:00:00Z",
    parentVersion: null,
  };

  const baseline = buildChatSystemPrompt(basePrompt);
  const assembled = assemblePersonaPrompt({ persona });

  assert.equal(assembled.systemPrompt, baseline);
  assert.deepEqual(assembled.usedNoteIds, []);
});

test("style tiers: formatStyleLines maps 4 axes according to 3 tiers (<0.35, 0.35..0.65, >0.65)", () => {
  const customStyle = {
    warmth: 0.2,   // low
    empathy: 0.8,  // high
    brevity: 0.5,  // mid
    curiosity: 0.1 // low
  };

  const lines = formatStyleLines(customStyle);
  assert.equal(lines.length, 4);
  assert.equal(lines[0], getStyleSentence("warmth", 0.2));
  assert.ok(lines[0].includes("차분하고 정중한"));
  assert.equal(lines[1], getStyleSentence("empathy", 0.8));
  assert.ok(lines[1].includes("깊이 공감한 뒤"));
  assert.equal(lines[2], getStyleSentence("brevity", 0.5));
  assert.ok(lines[2].includes("존댓말(해요체)로"));
  assert.equal(lines[3], getStyleSentence("curiosity", 0.1));
  assert.ok(lines[3].includes("되묻기를 아끼고"));
});

test("assemblePersonaPrompt includes [말투] section when style is non-neutral", () => {
  const persona: PersonaVersion = {
    version: 2,
    systemPrompt: "기본 정체성 프롬프트",
    sourceInsightIds: [],
    approvedAt: "2026-11-15T00:00:00Z",
    parentVersion: 1,
    style: {
      warmth: 0.7,
      empathy: 0.5,
      brevity: 0.5,
      curiosity: 0.5,
    },
    notes: [],
  };

  const assembled = assemblePersonaPrompt({ persona });
  assert.ok(assembled.systemPrompt.includes("[말투]"));
  assert.ok(assembled.systemPrompt.includes("친구처럼 매우 친근하고"));
  assert.ok(!assembled.systemPrompt.includes("[참고사항]"));
});

test("note selection: <= 6 notes includes all notes", () => {
  const notes: PersonaNote[] = [
    { id: 1, text: "노트 1", cues: ["시험"], addedInVersion: 1 },
    { id: 2, text: "노트 2", cues: ["운동"], addedInVersion: 1 },
  ];

  const selected = selectPersonaNotes(notes, ["안녕"], "오늘 시험 봤어");
  assert.equal(selected.length, 2);
  assert.equal(selected[0].id, 1);
  assert.equal(selected[1].id, 2);
});

test("note selection: > 6 notes scores cues and selects top 6 with tie-breaking", () => {
  const notes: PersonaNote[] = [
    { id: 1, text: "노트 1", cues: ["음악"], addedInVersion: 1 },
    { id: 2, text: "노트 2", cues: ["시험", "수학"], addedInVersion: 1 }, // 2 matches
    { id: 3, text: "노트 3", cues: ["시험"], addedInVersion: 1 },         // 1 match, ver 1
    { id: 4, text: "노트 4", cues: ["시험"], addedInVersion: 2 },         // 1 match, ver 2 (higher priority)
    { id: 5, text: "노트 5", cues: [], addedInVersion: 1 },               // 0.5 base score
    { id: 6, text: "노트 6", cues: ["영화"], addedInVersion: 1 },         // 0 matches
    { id: 7, text: "노트 7", cues: ["그림"], addedInVersion: 1 },         // 0 matches
    { id: 8, text: "노트 8", cues: ["요리"], addedInVersion: 1 },         // 0 matches
  ];

  const selected = selectPersonaNotes(notes, ["지난주에 시험 봄"], "오늘 수학 문제 풀었어");
  assert.equal(selected.length, 6);
  // Highest score: note 2 (score 2: "시험", "수학")
  assert.equal(selected[0].id, 2);
  // Next: note 4 (score 1, ver 2) before note 3 (score 1, ver 1)
  assert.equal(selected[1].id, 4);
  assert.equal(selected[2].id, 3);
  // Next: note 5 (score 0.5 because cues is empty)
  assert.equal(selected[3].id, 5);
});

test("assemblePersonaPrompt includes [참고사항] when notes are present", () => {
  const persona: PersonaVersion = {
    version: 3,
    systemPrompt: "정체성",
    sourceInsightIds: [],
    approvedAt: "2026-11-15T00:00:00Z",
    parentVersion: 2,
    style: {
      warmth: 0.5,
      empathy: 0.5,
      brevity: 0.5,
      curiosity: 0.5,
    },
    notes: [
      { id: 10, text: "지친 하루를 이야기할 때는 해결책보다 가볍게 맞장구쳐 줘요.", cues: ["피곤"], addedInVersion: 2 },
    ],
  };

  const assembled = assemblePersonaPrompt({
    persona,
    recentUserMessages: ["오늘 너무 피곤했어"],
    currentMessage: "힘들어",
  });

  assert.ok(assembled.systemPrompt.includes("[고정 규칙"));
  assert.ok(assembled.systemPrompt.includes("[인격]\n정체성"));
  assert.ok(assembled.systemPrompt.includes("[참고사항]\n- 지친 하루를 이야기할 때는"));
  assert.deepEqual(assembled.usedNoteIds, [10]);
});
