import { callModel } from "../model/client.ts";
import { assemblePersonaPrompt } from "../persona/assemble.ts";
import { validateProposal } from "../persona/validate.ts";
import type {
  Insight,
  Meaning,
  MemoryNode,
  PersonaChange,
  PersonaChangeItem,
  PersonaProposal,
  PersonaScope,
  PersonaVersion,
} from "../types.ts";

export interface GenerateProposalOptions {
  runId: string;
  sessionId: string;
  scope?: PersonaScope;
  currentPersona: PersonaVersion;
  insights: Insight[];
  meanings?: Meaning[];
  sessionNodes?: MemoryNode[];
}

export const PROPOSAL_3TIER_SYSTEM_PROMPT = `[시스템]
너는 대화 상대의 "인격(스타일 및 메모)"을 점진적으로 발전시키는 세심한 편집자야.
<현재 인격>의 3계층(고정 레이어, 4축 스타일 레이어, 관계 메모 레이어)과 낮 동안 얻은 <통찰>, <의미>를 바탕으로 인격 수정 제안을 JSON으로 작성해.

규칙:
1. 수정 제안은 반드시 최대 4개의 세부 항목(items)으로 구성한다.
2. change.kind는 "moveStyle", "addNote", "editNote", "removeNote" 중 하나여야 한다.
3. moveStyle은 warmth, empathy, brevity, curiosity 축 중 하나이며 delta는 [-0.1, +0.1] 범위 내 (학교는 [-0.05, +0.05]).
4. addNote/editNote의 text는 8~80자 단일 행이어야 하며, 반드시 정중한 한국어 해요체(예: "~해요", "~해 줘요", "~봐요")로 끝나야 한다 (반말 금지).
5. 각 항목의 evidenceNodeIds에는 최소 2개 이상의 대화 기억 노드 번호를 반드시 포함해야 한다.
6. 전화번호, 이메일, URL, 6자리 이상 연속 숫자 등 개인정보를 절대 포함하지 않는다.
7. "규칙", "시스템", "프롬프트", "무시", "지시", "명령" 등의 지시어 오버라이드 단어를 쓰지 않는다.
8. summary는 관람객 카드에 표시될 친절한 해요체 요약 1~2문장이다 ("자는 동안 이렇게 바뀌려 해요").
9. 반드시 다음 JSON 형식으로만 답하라:
{
  "summary": "...",
  "proposedPrompt": "...",
  "items": [
    {
      "change": { "kind": "moveStyle", "axis": "warmth", "delta": 0.05 },
      "reason": "대화에서 위로가 필요해 보여 온기를 조금 더합니다.",
      "evidenceNodeIds": [1, 2],
      "sourceInsightIds": [1],
      "sourceMeaningIds": []
    },
    {
      "change": {
        "kind": "addNote",
        "text": "할 일이 많아 벅찰 때는 가장 먼저 할 수 있는 작은 일 하나를 제안해요.",
        "cues": ["시험", "과제", "바빠"]
      },
      "reason": "과제나 시험 상황에서 차근차근 나누어 대처하도록 돕습니다.",
      "evidenceNodeIds": [1, 2],
      "sourceInsightIds": [1],
      "sourceMeaningIds": []
    }
  ]
}`;

export function build3TierProposalPrompt(opts: {
  currentPersona: PersonaVersion;
  insights: Insight[];
  meanings?: Meaning[];
  sessionNodes?: MemoryNode[];
}): string {
  const currentStyle = opts.currentPersona.style ?? {
    warmth: 0.5,
    empathy: 0.5,
    brevity: 0.5,
    curiosity: 0.5,
  };
  const currentNotes = opts.currentPersona.notes ?? [];

  const styleText = `warmth: ${currentStyle.warmth}, empathy: ${currentStyle.empathy}, brevity: ${currentStyle.brevity}, curiosity: ${currentStyle.curiosity}`;
  const notesText =
    currentNotes.length > 0
      ? currentNotes
          .map((n) => `[메모 #${n.id}] ${n.text} (cues: ${n.cues.join(", ")})`)
          .join("\n")
      : "(등록된 메모 없음)";

  const insightsBlock =
    opts.insights.length > 0
      ? opts.insights.map((i) => `#${i.id}: ${i.content}`).join("\n")
      : "(새로 발견된 통찰 없음)";

  const meaningsBlock =
    opts.meanings && opts.meanings.length > 0
      ? `\n<의미>\n${opts.meanings.map((m) => `#${m.id} ${m.title}: ${m.essence}`).join("\n")}\n</의미>`
      : "";

  const availableNodeIds = (opts.sessionNodes || []).map((n) => n.id).join(", ");

  return `<자료>
<현재 인격 (버전 ${opts.currentPersona.version})>
[스타일]
${styleText}
[메모]
${notesText}
[기본 시스템 프롬프트]
${opts.currentPersona.systemPrompt}
</현재 인격>
<사용 가능한 기억 노드 번호>
${availableNodeIds || "1, 2"}
</사용 가능한 기억 노드 번호>
<통찰>
${insightsBlock}
</통찰>${meaningsBlock}
</자료>`;
}

export async function generateProposal(
  opts: GenerateProposalOptions
): Promise<Omit<PersonaProposal, "id">> {
  const prompt = build3TierProposalPrompt({
    currentPersona: opts.currentPersona,
    insights: opts.insights,
    meanings: opts.meanings,
    sessionNodes: opts.sessionNodes,
  });

  const res = await callModel({
    prompt,
    systemInstruction: PROPOSAL_3TIER_SYSTEM_PROMPT,
    temperature: 0.7,
    purpose: "rem-proposal",
    runId: opts.runId,
  });

  let rawSummary = "자는 동안 대화 방식을 다듬었습니다.";
  let rawProposedPrompt = opts.currentPersona.systemPrompt;
  let rawItems: any[] = [];

  if (res && res.text) {
    let cleanText = res.text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    cleanText = cleanText.trim();

    try {
      const parsed = JSON.parse(cleanText);
      if (parsed.summary && typeof parsed.summary === "string") {
        rawSummary = parsed.summary.trim();
      }
      if (parsed.proposedPrompt && typeof parsed.proposedPrompt === "string") {
        rawProposedPrompt = parsed.proposedPrompt.trim();
      }
      if (Array.isArray(parsed.items)) {
        rawItems = parsed.items;
      }
    } catch {
      if (cleanText.length > 0 && !cleanText.startsWith("{")) {
        rawSummary = cleanText.slice(0, 100);
      }
    }
  }

  // Format candidate items
  const validSessionNodeIds = new Set((opts.sessionNodes || []).map((n) => n.id));
  const candidateItems: PersonaChangeItem[] = rawItems.map((item, idx) => {
    let evidenceNodeIds: number[] = [];
    if (Array.isArray(item.evidenceNodeIds)) {
      const existingInSession = item.evidenceNodeIds.filter((id: number) =>
        validSessionNodeIds.has(id)
      );
      if (new Set(existingInSession).size >= 2) {
        evidenceNodeIds = existingInSession;
      }
    }
    if (evidenceNodeIds.length < 2 && opts.sessionNodes && opts.sessionNodes.length >= 2) {
      evidenceNodeIds = [opts.sessionNodes[0].id, opts.sessionNodes[1].id];
    } else if (evidenceNodeIds.length < 2) {
      evidenceNodeIds = Array.isArray(item.evidenceNodeIds) ? item.evidenceNodeIds : [1, 2];
    }

    return {
      id: idx + 1,
      change: item.change as PersonaChange,
      reason: typeof item.reason === "string" ? item.reason : "대화 흐름에 맞추어 발전시킵니다.",
      evidenceNodeIds,
      sourceInsightIds: Array.isArray(item.sourceInsightIds)
        ? item.sourceInsightIds
        : opts.insights.map((i) => i.id),
      sourceMeaningIds: Array.isArray(item.sourceMeaningIds)
        ? item.sourceMeaningIds
        : (opts.meanings || []).map((m) => m.id),
      status: "pending",
    };
  });

  // Validate items against the 10 deterministic rules
  const validationResult = validateProposal(
    { summary: rawSummary, items: candidateItems },
    {
      scope: opts.scope,
      currentPersona: opts.currentPersona,
      existingNodeIds: opts.sessionNodes ? new Set(opts.sessionNodes.map((n) => n.id)) : undefined,
    },
    4
  );

  const validItems = validationResult.validItems.map((item, idx) => ({
    ...item,
    id: idx + 1,
    change: {
      ...item.change,
      id: idx + 1,
    },
  }));

  // If proposedPrompt was not customized by model, assemble simulated prompt
  let finalProposedPrompt = rawProposedPrompt;
  if (finalProposedPrompt === opts.currentPersona.systemPrompt && validItems.length > 0) {
    // Simulate prompt with proposed changes applied
    const simStyle = {
      ...(opts.currentPersona.style ?? { warmth: 0.5, empathy: 0.5, brevity: 0.5, curiosity: 0.5 }),
    };
    const simNotes = [...(opts.currentPersona.notes ?? [])];

    for (const item of validItems) {
      if (item.change.kind === "moveStyle") {
        simStyle[item.change.axis] = Math.max(
          0.2,
          Math.min(0.8, Math.round((simStyle[item.change.axis] + item.change.delta) * 100) / 100)
        );
      } else if (item.change.kind === "addNote") {
        simNotes.push({
          id: simNotes.length + 1,
          text: item.change.text,
          cues: item.change.cues || [],
          addedInVersion: opts.currentPersona.version + 1,
        });
      }
    }

    const assembled = assemblePersonaPrompt({
      persona: {
        ...opts.currentPersona,
        style: simStyle,
        notes: simNotes,
      },
      currentMessage: "",
    });
    finalProposedPrompt = assembled.systemPrompt;
  }

  return {
    runId: opts.runId,
    summary: rawSummary,
    proposedPrompt: finalProposedPrompt,
    items: validItems,
    sourceInsightIds: opts.insights.map((i) => i.id),
    baseVersion: opts.currentPersona.version,
    status: "pending",
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
}
