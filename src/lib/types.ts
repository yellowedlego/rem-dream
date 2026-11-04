// 꿈(REM) 시스템의 데이터 약속 — docs/plan.md "데이터 모양 (초안)"을 그대로 옮김.
// 화면(/, /debug)은 이 모양을 읽기만 한다.

/** 노드 = 채팅 한 번 = {유저 입력, AI 답변} 한 쌍 */
export interface MemoryNode {
  /** 번호 (전체에서 유일, 1부터) */
  id: number;
  /** 세션(채팅방). 관람객마다 하나 */
  sessionId: string;
  /** 세션 안에서의 순서 (1부터) */
  order: number;
  /** 시각 (ISO 8601) */
  createdAt: string;
  /** 유저 입력 */
  user: string;
  /** AI 답변 */
  ai: string;
  /** 이야기에서 나왔으면 그 번호 */
  storyId?: number;
  /** rawText 안의 [시작, 끝) 글자 위치 */
  storySpan?: [number, number];
  /** 쪼갠 조각의 한 줄 주제 (화면 표시용) */
  topic?: string;
}

/** 긴 이야기 한 편 — 원문은 한 글자도 바꾸지 않고 보관한다 */
export interface Story {
  /** 번호 */
  id: number;
  /** 세션 ID */
  sessionId: string;
  /** 사용자가 넣은 원문 그대로 */
  rawText: string;
  /** 쪼개져 나온 노드 번호들 (순서대로) */
  nodeIds: number[];
  /** 생성 시각 (ISO 8601) */
  createdAt: string;
}

/** REM 모드 이름. 모드는 파일 하나에 하나씩 추가할 수 있어서 문자열로 둔다. */
export type RemModeId = "consolidate" | "dream" | (string & {});

/** 통찰 = REM 중 모델이 노드를 다시 읽고 만든 한 줄 */
export interface Insight {
  /** 번호 */
  id: number;
  /** 만든 모드 */
  mode: RemModeId;
  /** 근거 노드 번호들 */
  sourceNodeIds: number[];
  /** 내용 */
  content: string;
  /** 시각 (ISO 8601) */
  createdAt: string;
}

/** 인격 버전 = 사람이 승인한 시스템 프롬프트 한 벌 */
export interface PersonaVersion {
  /** 버전 번호 (1부터) */
  version: number;
  /** 시스템 프롬프트 전문 */
  systemPrompt: string;
  /** 근거 통찰 번호들 (처음 인격은 빈 배열) */
  sourceInsightIds: number[];
  /** 승인 시각 (ISO 8601). 처음 인격은 만든 시각 */
  approvedAt: string;
  /** 이전 버전 번호 (처음 인격은 null) */
  parentVersion: number | null;
}

/** REM 한 번의 실행 */
export interface RemRun {
  id: string;
  sessionId: string;
  mode: RemModeId;
  temperature: number;
  status: "running" | "done" | "stopped" | "error";
  startedAt: string;
  finishedAt: string | null;
  /** 지금 읽고 있는 노드 번호들 (화면이 빛낼 대상) */
  currentNodeIds: number[];
  /** 이 실행에서 만들어진 통찰 번호 */
  insightIds: number[];
  /** 완료 후 만들어진 수정 제안 번호 (없으면 null) */
  proposalId: number | null;
  error: string | null;
}

/** 인격 수정 제안. 승인 전에는 PersonaVersion이 아니다 */
export interface PersonaProposal {
  id: number;
  runId: string;
  /** 근거 통찰 */
  sourceInsightIds: number[];
  /** 제안하는 시스템 프롬프트 전문 */
  proposedPrompt: string;
  /** 사람에게 보여 줄 한두 줄 요약 ("자는 동안 이렇게 바뀌려 해요") */
  summary: string;
  baseVersion: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
}

/** 모델 요청 한 건 (디버그 화면의 로그·수치용) */
export interface ModelCall {
  id: number;
  at: string;
  purpose: "chat" | "rem-step" | "rem-proposal";
  runId: string | null;
  model: string;
  temperature: number;
  prompt: string;
  response: string;
  inputTokens: number | null;
  outputTokens: number | null;
  ms: number;
  error: string | null;
}

/** data/store.json 한 파일의 모양 */
export interface Store {
  nodes: MemoryNode[];
  insights: Insight[];
  personas: PersonaVersion[];
  /** 지금 쓰는 인격 버전 번호 (되돌리기를 하면 이 값만 바뀐다) */
  activePersona: number;
  /** 인격 수정 제안 목록 */
  proposals: PersonaProposal[];
  /** REM 실행 기록 */
  runs: RemRun[];
  /** 디버그용 모델 호출 기록 (선택) */
  calls?: ModelCall[];
  /** 긴 이야기 목록 */
  stories: Story[];
}
