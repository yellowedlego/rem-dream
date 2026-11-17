import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addDemo } from "@/lib/demo";
import { isValidToken } from "@/lib/admin-auth";

/** 예시 기억을 세션에 채운다 (모델·인터넷 없이): { sessionId }. 관람객도 쓸 수 있다 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sessionId?: unknown } | null;
  if (!body || typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  // 학교 AI 풀에는 운영자가 넣은 예시만 (잠금이 꺼진 개발 환경도 포함)
  const locked = !!process.env.ADMIN_PASSWORD_HASH?.trim();
  const admin = !locked || isValidToken((await cookies()).get("admin_token")?.value);
  return NextResponse.json(await addDemo(body.sessionId.trim(), { toSchoolPool: admin }));
}
