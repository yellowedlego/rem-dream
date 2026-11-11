// 꿈(REM) 시스템의 데이터 약속 — docs/plan.md "데이터 모양 (초안)"을 그대로 옮김.
// 화면(/, /debug)은 이 모양을 읽기만 한다.

/** 대화에 첨부한 이미지 한 장. 파일은 서버(uploads/)에 있고 GET /api/images/[id]로 읽는다 */
export interface ImageRef {
  /** 파일 이름 겸 번호: "<uuid>.jpg" 같은 모양 */
  id: string;
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

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
  /** 첨부한 이미지 (없으면 생략). 글 없이 사진만 보냈으면 user가 "(사진)" */
  images?: ImageRef[];
  /** 이야기에서 나왔으면 그 번호 */
  storyId?: number;
  /**
   * 원문(Story.rawText) 안의 [시작, 끝) 글자 위치들. 이야기가 A→B→A처럼 뒤섞였으면
   * 같은 주제(A)의 떨어진 구간이 한 노드에 여러 개 들어간다. 이야기 하나의 모든 노드의 구간을
   * 합치면 원문 전체가 빈틈·겹침 없이 덮인다. (docs/backend-plan.md "이야기 전처리 규칙")
   */
  storySpans?: [number, number][];
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
  /** 이 인격을 만든 의미 파일들 (없으면 빈 배열 또는 생략) */
  sourceMeaningIds?: number[];
}

/**
 * 의미 파일(별): 이야기 노드들을 합쳐 뽑은 의미. 이야기 하나에서 1개 이상 나올 수 있고,
 * 노드 하나가 여러 의미에 속할 수 있다. 인격은 승인된 의미 파일들로 구성한다.
 */
export interface Meaning {
  id: number;
  storyId: number;
  sessionId: string;
  /** 이 별로 합쳐진 노드들 */
  nodeIds: number[];
  /** 한 줄 제목 */
  title: string;
  /** 이 이야기가 말해 주는 것, 한두 문장 */
  essence: string;
  keywords: string[];
  createdAt: string;
}

/** 이야기를 나눈 방법: AI가 맥락을 읽었는지, 규칙으로 나눴는지(모델이 없거나 실패했을 때) */
export type SplitMethod = "ai" | "rule";

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

/** 모델을 부른 목적 */
export type ModelPurpose = "chat" | "story-split" | "story-meaning" | "rem-step" | "rem-proposal" | "profile" | "compare";

/** 모델 요청 한 건 (디버그 화면의 로그·수치용) */
export interface ModelCall {
  id: number;
  at: string;
  purpose: ModelPurpose;
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

/** "내 AI"에서 고르는 관계 */
export type Relation = "friend" | "teacher" | "mentor";

/** 사용자 말에서 계산으로 알아낸 말투 (모델 없이) */
export interface StyleGuess {
  /** 존댓말이 더 많으면 true, 반말이면 false */
  polite: boolean;
  /** 한 번에 보내는 글의 길이 */
  length: "short" | "medium" | "long";
  /** ㅋㅋ·ㅎㅎ를 자주 쓰는지 */
  laughs: boolean;
  /** 이모지·ㅠㅠ를 쓰는지 */
  emoji: boolean;
  /** 계산에 쓴 내 말 개수 */
  samples: number;
}

/** 기억 위키 한 칸: 내가 한 이야기 하나를 정리한 것. 대화마다 찾아서 프롬프트에 넣는다 */
export interface WikiEntry {
  /** 프로필 안에서의 번호 (1부터) */
  id: number;
  title: string;
  /** 내가 한 말 + 필요하면 AI가 뭐라 했는지 (1인칭, 한두 문장) */
  body: string;
  keywords: string[];
  sourceNodeIds: number[];
}

/** 의미성에서 만든 "나와 말이 잘 통하는 AI" 한 벌 */
export interface Profile {
  id: number;
  sessionId: string;
  createdAt: string;
  relation: Relation;
  style: StyleGuess;
  /** 나에 대해 (1인칭, 두세 문장) */
  about: string;
  /** 이 사람과 말이 잘 통하려면 (짧은 문장 몇 개) */
  tips: string[];
  wiki: WikiEntry[];
  /** 가져가는 사전 프롬프트 전문 (새 채팅 맨 앞에 붙여 넣는 글) */
  prompt: string;
  /** 모델이 정리했는지(ai), 모델 없이 규칙으로 만들었는지(rule) */
  method: SplitMethod;
}

/** 메일 보낸 기록. 주소는 가려서만 남긴다 (관리 화면에서 지울 수 있다) */
export interface MailLog {
  id: number;
  at: string;
  sessionId: string;
  profileId: number;
  /** j***@gmail.com 처럼 가린 주소 */
  to: string;
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
  /** 의미 파일(별) 목록 */
  meanings: Meaning[];
  /** "내 AI" 프로필 (없으면 생략) */
  profiles?: Profile[];
  /** 메일 보낸 기록 (없으면 생략) */
  mails?: MailLog[];
}

