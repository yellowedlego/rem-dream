// 화면이 서버와 이야기하는 곳은 여기 하나. 주소·응답 모양은 docs/backend-plan.md 5절과 같다.
// 실제 백엔드가 나오면 NEXT_PUBLIC_API_BASE=/api 로 바꾸고 src/app/api-mock/ 을 지운다.
import type { Insight, MemoryNode, PersonaVersion, Story } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api-mock";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("서버에 닿지 않아요. 연결을 확인해 주세요.", 0);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(data?.error ?? `요청에 실패했어요 (${res.status})`, res.status);
  return data as T;
}

/**
 * 의미 파일(별): 이야기 노드들을 합쳐 뽑은 의미. 인격은 승인된 의미 파일들로 구성한다.
 * 계약은 docs/backend-plan.md "의미 파일(별)". 백엔드가 확정하면 src/lib/types.ts로 옮긴다.
 */
export interface Meaning {
  id: number;
  storyId: number;
  sessionId: string;
  nodeIds: number[];
  title: string;
  essence: string;
  keywords: string[];
  createdAt: string;
}

/** 이야기를 나눈 방법: AI가 맥락을 읽었는지, 규칙으로 임시 분리했는지 */
export type SplitMethod = "ai" | "rule";

export interface StoryResult {
  story: Story;
  nodes: MemoryNode[];
  meaning: Meaning;
  method: SplitMethod;
}

export interface SessionSummary {
  sessionId: string;
  nodeCount: number;
  lastAt: string;
  preview: string;
}

export interface StoryMeta extends Omit<Story, "rawText"> {
  chars: number;
}

export interface DebugState {
  nodeCount: number;
  insights: Insight[];
  personas: PersonaVersion[];
  activePersona: number;
  stories: StoryMeta[];
}

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  chat: (sessionId: string, message: string) =>
    call<{ node: MemoryNode }>("/chat", { method: "POST", body: JSON.stringify({ sessionId, message }) }),
  story: (sessionId: string, text: string) =>
    call<StoryResult>("/story", { method: "POST", body: JSON.stringify({ sessionId, text }) }),
  sessions: () => call<{ sessions: SessionSummary[] }>("/sessions"),
  nodes: (o: { sessionId?: string; q?: string } = {}) => call<{ nodes: MemoryNode[] }>(`/nodes${qs(o)}`),
  state: () => call<DebugState>("/state"),
  deleteNode: (id: number) => call<{ ok: true }>(`/nodes/${id}`, { method: "DELETE" }),
  deleteStory: (id: number) => call<{ ok: true; removedNodes: number }>(`/stories/${id}`, { method: "DELETE" }),
  deleteSession: (sessionId: string) =>
    call<{ ok: true; removedNodes: number }>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
  deleteInsight: (id: number) => call<{ ok: true }>(`/insights/${id}`, { method: "DELETE" }),
  resetAll: () => call<{ ok: true }>("/debug/reset-all", { method: "POST" }),
};

// ── 브라우저에 기억해 두는 세션 번호 (관람객·사용자 한 명 = 한 세션) ──
const KEY = "rem.sessionId";
const newId = () => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function currentSessionId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(KEY, id);
  }
  return id;
}
export function switchSession(id: string) {
  localStorage.setItem(KEY, id);
}
export function startNewSession(): string {
  const id = newId();
  localStorage.setItem(KEY, id);
  return id;
}
