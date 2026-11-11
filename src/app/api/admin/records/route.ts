import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { sessionLastAt } from "@/lib/records";

interface SessionRecord {
  sessionId: string;
  lastAt: string;
  nodes: number;
  stories: number;
  meanings: number;
  profiles: number;
  images: number;
  mails: number;
}

/** 관리 화면: 세션마다 남은 기록 수와 메일 보낸 기록(가린 주소) */
export async function GET() {
  await connection();
  const store = await readStore();
  const count = <T extends { sessionId: string }>(xs: T[] | undefined, sid: string) =>
    (xs ?? []).filter((x) => x.sessionId === sid).length;
  const sessions: SessionRecord[] = [...sessionLastAt(store).entries()]
    .map(([sid, at]) => ({
      sessionId: sid,
      lastAt: at,
      nodes: count(store.nodes, sid),
      stories: count(store.stories, sid),
      meanings: count(store.meanings, sid),
      profiles: count(store.profiles, sid),
      images: store.nodes.filter((n) => n.sessionId === sid).reduce((n, x) => n + (x.images?.length ?? 0), 0),
      mails: count(store.mails, sid),
    }))
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
  return NextResponse.json({ sessions, mails: [...(store.mails ?? [])].reverse() });
}
