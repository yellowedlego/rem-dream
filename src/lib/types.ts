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

/** data/store.json 한 파일의 모양 */
export interface Store {
  nodes: MemoryNode[];
  insights: Insight[];
  personas: PersonaVersion[];
  /** 지금 쓰는 인격 버전 번호 (되돌리기를 하면 이 값만 바뀐다) */
  activePersona: number;
}
