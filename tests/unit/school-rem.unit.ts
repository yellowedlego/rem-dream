import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSchoolAutoApplyItems } from "../../src/lib/school/rules.ts";
import type { PersonaChangeItem, PersonaVersion, SchoolMeaning } from "../../src/lib/types.ts";

const basePersona: PersonaVersion = {
  version: 1,
  systemPrompt: "기본 프롬프트",
  style: { warmth: 0.5, empathy: 0.5, brevity: 0.5, curiosity: 0.5 },
  notes: [],
  sourceInsightIds: [],
  approvedAt: new Date().toISOString(),
  parentVersion: null,
  appliedBy: "human",
  scope: "school",
};

const mockSchoolMeanings: SchoolMeaning[] = [
  { id: 1, title: "별1", essence: "내용1", keywords: ["키1"], count: 1, sourceTags: ["tag_A"], createdAt: "" },
  { id: 2, title: "별2", essence: "내용2", keywords: ["키2"], count: 1, sourceTags: ["tag_B"], createdAt: "" },
  { id: 3, title: "별3", essence: "내용3", keywords: ["키3"], count: 1, sourceTags: ["tag_C"], createdAt: "" },
  { id: 4, title: "별4", essence: "내용4", keywords: ["키4"], count: 1, sourceTags: ["tag_A"], createdAt: "" }, // Duplicate tag
];

test("filterSchoolAutoApplyItems accepts style delta within ±0.05 and bounds [0.3, 0.7]", () => {
  const itemValid: PersonaChangeItem = {
    id: 1,
    change: { id: 1, kind: "moveStyle", axis: "warmth", delta: 0.05 },
    reason: "따뜻함 보강",
    evidenceNodeIds: [],
    sourceInsightIds: [],
    sourceMeaningIds: [1, 2, 3],
    status: "pending",
  };
  const itemExcessiveDelta: PersonaChangeItem = {
    id: 2,
    change: { id: 2, kind: "moveStyle", axis: "empathy", delta: 0.1 },
    reason: "과도한 변화",
    evidenceNodeIds: [],
    sourceInsightIds: [],
    sourceMeaningIds: [1, 2, 3],
    status: "pending",
  };

  const approved = filterSchoolAutoApplyItems(
    [itemValid, itemExcessiveDelta],
    basePersona,
    mockSchoolMeanings
  );

  assert.equal(approved.length, 1);
  assert.equal(approved[0].id, 1);
});

test("filterSchoolAutoApplyItems requires at least 3 distinct source tags for addNote", () => {
  const item3Tags: PersonaChangeItem = {
    id: 1,
    change: { id: 1, kind: "addNote", text: "친구 이야기 잘 들어주기", cues: ["친구"] },
    reason: "충분한 출처",
    evidenceNodeIds: [],
    sourceInsightIds: [],
    sourceMeaningIds: [1, 2, 3], // tags A, B, C -> 3 distinct
    status: "pending",
  };
  const item2Tags: PersonaChangeItem = {
    id: 2,
    change: { id: 2, kind: "addNote", text: "선생님 이야기 잘 들어주기", cues: ["선생님"] },
    reason: "부족한 출처",
    evidenceNodeIds: [],
    sourceInsightIds: [],
    sourceMeaningIds: [1, 4], // tags A, A -> only 1 distinct
    status: "pending",
  };

  const approved = filterSchoolAutoApplyItems(
    [item3Tags, item2Tags],
    basePersona,
    mockSchoolMeanings
  );

  assert.equal(approved.length, 1);
  assert.equal(approved[0].id, 1);
});

test("filterSchoolAutoApplyItems enforces maximum of 2 items per run", () => {
  const items: PersonaChangeItem[] = [
    {
      id: 1,
      change: { id: 1, kind: "moveStyle", axis: "warmth", delta: 0.05 },
      reason: "r1",
      evidenceNodeIds: [],
      sourceInsightIds: [],
      sourceMeaningIds: [1, 2, 3],
      status: "pending",
    },
    {
      id: 2,
      change: { id: 2, kind: "moveStyle", axis: "empathy", delta: 0.05 },
      reason: "r2",
      evidenceNodeIds: [],
      sourceInsightIds: [],
      sourceMeaningIds: [1, 2, 3],
      status: "pending",
    },
    {
      id: 3,
      change: { id: 3, kind: "moveStyle", axis: "brevity", delta: -0.05 },
      reason: "r3",
      evidenceNodeIds: [],
      sourceInsightIds: [],
      sourceMeaningIds: [1, 2, 3],
      status: "pending",
    },
  ];

  const approved = filterSchoolAutoApplyItems(items, basePersona, mockSchoolMeanings);
  assert.equal(approved.length, 2);
});
