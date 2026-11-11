// 화면이 서버와 이야기하는 곳은 여기 하나. 주소·응답 모양은 docs/backend-plan.md 5절과 같다.
// 서버는 src/app/api/ (진짜 백엔드). 모양이 다른 곳은 아래 api 객체 안에서 화면이 쓰던 모양으로 맞춘다.
import type { Insight, MailLog, Meaning, MemoryNode, PersonaVersion, Profile, Relation, SplitMethod, Story } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

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

export type { Meaning, Profile, Relation, SplitMethod, MailLog };

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export interface CompareResult {
  basic: string;
  personal: string;
  /** 이번 말로 찾아본 기억 위키 칸 번호 */
  looked: number[];
}

export interface SessionRecord {
  sessionId: string;
  lastAt: string;
  nodes: number;
  stories: number;
  meanings: number;
  profiles: number;
  images: number;
  mails: number;
}

export interface StoryResult {
  story: Story;
  nodes: MemoryNode[];
  /** 의미 파일(별)들. 0개일 수 있다 (모델이 의미를 못 뽑았을 때) */
  meanings: Meaning[];
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
  meanings: Meaning[];
}

/** GET /api/state 의 실제 응답 (원문 rawText는 빼고 length만 온다) */
interface ServerState {
  nodes: MemoryNode[];
  insights: Insight[];
  personas: PersonaVersion[];
  activePersona: number;
  stories: (Omit<Story, "rawText"> & { length: number })[];
  meanings: Meaning[];
}

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  chat: (sessionId: string, message: string, images?: { mimeType: string; data: string }[]) =>
    call<{ node: MemoryNode }>("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId, message, ...(images && images.length > 0 ? { images } : {}) }),
    }),
  story: (sessionId: string, text: string) =>
    call<StoryResult>("/story", { method: "POST", body: JSON.stringify({ sessionId, text }) }),
  // 서버는 배열 그대로 준다
  sessions: async () => ({ sessions: await call<SessionSummary[]>("/sessions") }),
  // 서버 기본 limit은 50이라 화면이 전부 볼 수 있게 상한(500)으로 요청한다
  nodes: (o: { sessionId?: string; q?: string } = {}) => call<{ nodes: MemoryNode[] }>(`/nodes${qs({ ...o, limit: "500" })}`),
  state: async (): Promise<DebugState> => {
    const s = await call<ServerState>("/state");
    return {
      nodeCount: s.nodes.length,
      insights: s.insights,
      personas: s.personas,
      activePersona: s.activePersona,
      stories: s.stories.map(({ length, ...rest }) => ({ ...rest, chars: length })),
      meanings: s.meanings,
    };
  },
  deleteNode: (id: number) => call<{ ok: true }>(`/nodes/${id}`, { method: "DELETE" }),
  deleteStory: (id: number) => call<{ ok: true }>(`/stories/${id}`, { method: "DELETE" }),
  deleteSession: (sessionId: string) =>
    call<{ ok: true }>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
  deleteInsight: (id: number) => call<{ ok: true }>(`/insights/${id}`, { method: "DELETE" }),
  resetAll: () => call<{ ok: true }>("/debug/reset-all", { method: "POST" }),

  // ── 내 AI ──
  profiles: (sessionId: string) => call<{ profiles: Profile[] }>(`/profiles${qs({ sessionId })}`),
  makeProfile: (sessionId: string, relation: Relation) =>
    call<{ profile: Profile }>("/profiles", { method: "POST", body: JSON.stringify({ sessionId, relation }) }),
  deleteProfile: (id: number) => call<{ ok: true }>(`/profiles/${id}`, { method: "DELETE" }),
  compare: (id: number, message: string, history: { basic: ChatTurn[]; personal: ChatTurn[] }) =>
    call<CompareResult>(`/profiles/${id}/compare`, { method: "POST", body: JSON.stringify({ message, history }) }),
  mailStatus: () => call<{ ready: boolean; mock: boolean }>("/mail"),
  mail: (id: number, to: string) =>
    call<{ ok: true; to: string }>(`/profiles/${id}/mail`, { method: "POST", body: JSON.stringify({ to, consent: true }) }),

  // ── 기록 관리 ──
  records: () => call<{ sessions: SessionRecord[]; mails: MailLog[] }>("/admin/records"),
  prune: (olderThanHours: number) =>
    call<{ ok: true; removed: string[] }>("/admin/prune", { method: "POST", body: JSON.stringify({ olderThanHours }) }),
  clearMails: () => call<{ ok: true }>("/admin/mails", { method: "DELETE" }),
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
