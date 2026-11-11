import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { makeProfile } from "@/lib/profile/make";
import { isRelation } from "@/lib/profile/build";

/** 세션의 "내 AI" 프로필들 (새것부터) */
export async function GET(req: Request) {
  await connection();
  const sessionId = new URL(req.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  const store = await readStore();
  const profiles = (store.profiles ?? []).filter((p) => p.sessionId === sessionId).sort((a, b) => b.id - a.id);
  return NextResponse.json({ profiles });
}

/** 의미성으로 "내 AI"를 만든다: { sessionId, relation: friend|teacher|mentor } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sessionId?: unknown; relation?: unknown } | null;
  if (!body || typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  const relation = body.relation ?? "friend";
  if (!isRelation(relation)) {
    return NextResponse.json({ error: "relation must be friend, teacher or mentor" }, { status: 400 });
  }
  const profile = await makeProfile(body.sessionId.trim(), relation);
  if (!profile) return NextResponse.json({ error: "아직 이 세션에 대화나 이야기가 없어요." }, { status: 404 });
  return NextResponse.json({ profile });
}
