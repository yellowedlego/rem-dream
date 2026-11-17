import { NextResponse } from "next/server";
import {
  checkRateLimit,
  createSession,
  recordFailedAttempt,
  resetFailedAttempts,
  verifyPassword,
  verifyUsername,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "로그인 시도가 너무 많아 10분 동안 잠겼어요." },
      { status: 429 }
    );
  }

  let body: { username?: unknown; password?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "아이디나 비밀번호가 맞지 않아요" }, { status: 400 });
  }

  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "아이디나 비밀번호가 맞지 않아요" }, { status: 401 });
  }

  const isUserValid = verifyUsername(username);
  const isPassValid = verifyPassword(password);

  if (!isUserValid || !isPassValid) {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "아이디나 비밀번호가 맞지 않아요" }, { status: 401 });
  }

  resetFailedAttempts(ip);
  const token = createSession();

  const isHttps = req.headers.get("x-forwarded-proto") === "https";
  const cookieValue = `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${
    isHttps ? "; Secure" : ""
  }`;

  // 토큰은 HttpOnly 쿠키로만 준다 (응답 본문에 넣으면 페이지 스크립트가 읽을 수 있다)
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.set("Set-Cookie", cookieValue);
  return res;
}
