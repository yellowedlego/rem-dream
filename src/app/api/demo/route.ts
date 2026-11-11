import { NextResponse } from "next/server";
import { addDemo } from "@/lib/demo";

/** 예시 기억을 세션에 채운다 (모델·인터넷 없이): { sessionId } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sessionId?: unknown } | null;
  if (!body || typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  return NextResponse.json(await addDemo(body.sessionId.trim()));
}
