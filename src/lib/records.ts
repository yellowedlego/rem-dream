// 세션 단위 기록 지우기 (세션 삭제 API와 관리 화면의 "오래된 기록 지우기"가 같이 쓴다).
// 저장소(Store)만 고치고, 지워야 할 이미지 파일 번호를 돌려준다 (파일은 저장소를 고친 뒤에 지운다).
import type { Store } from "./types";

export function removeSession(store: Store, sessionId: string): string[] {
  const imageIds = store.nodes.filter((n) => n.sessionId === sessionId).flatMap((n) => (n.images ?? []).map((i) => i.id));
  const sessionNodeIds = new Set(store.nodes.filter((n) => n.sessionId === sessionId).map((n) => n.id));
  const sessionRunIds = new Set((store.runs || []).filter((r) => r.sessionId === sessionId).map((r) => r.id));
  const sessionRunInsightIds = new Set(
    (store.runs || []).filter((r) => r.sessionId === sessionId).flatMap((r) => r.insightIds || []),
  );

  store.nodes = store.nodes.filter((n) => n.sessionId !== sessionId);
  store.stories = (store.stories ?? []).filter((s) => s.sessionId !== sessionId);
  store.meanings = (store.meanings ?? []).filter((m) => m.sessionId !== sessionId);
  store.profiles = (store.profiles ?? []).filter((p) => p.sessionId !== sessionId);
  store.mails = (store.mails ?? []).filter((m) => m.sessionId !== sessionId);

  // 이 세션의 실행에서 나왔거나, 근거 노드가 모두 이 세션 것인 통찰은 지운다. 남는 통찰에서는 지운 노드 번호만 뺀다
  store.insights = store.insights.filter((i) => {
    if (sessionRunInsightIds.has(i.id)) return false;
    const hasRemaining = i.sourceNodeIds.some((nid) => !sessionNodeIds.has(nid));
    if (!hasRemaining && i.sourceNodeIds.length > 0) return false;
    i.sourceNodeIds = i.sourceNodeIds.filter((nid) => !sessionNodeIds.has(nid));
    return true;
  });
  if (Array.isArray(store.proposals)) store.proposals = store.proposals.filter((p) => !sessionRunIds.has(p.runId));
  if (Array.isArray(store.runs)) store.runs = store.runs.filter((r) => r.sessionId !== sessionId);
  return imageIds;
}

/** 세션마다 마지막으로 무언가 남긴 시각 (노드·이야기·프로필·메일 중 가장 늦은 것) */
export function sessionLastAt(store: Store): Map<string, string> {
  const last = new Map<string, string>();
  const see = (sid: string, at: string) => {
    const prev = last.get(sid);
    if (!prev || Date.parse(at) > Date.parse(prev)) last.set(sid, at);
  };
  for (const n of store.nodes) see(n.sessionId, n.createdAt);
  for (const s of store.stories ?? []) see(s.sessionId, s.createdAt);
  for (const p of store.profiles ?? []) see(p.sessionId, p.createdAt);
  for (const m of store.mails ?? []) see(m.sessionId, m.at);
  return last;
}
