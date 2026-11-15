import { NextResponse } from "next/server";
import { revokeSession } from "@/lib/admin-auth";

export async function POST(req: Request) {
  // Read token from cookie or Authorization header
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/admin_token=([^;]+)/);
  const tokenFromCookie = match ? match[1] : undefined;
  const tokenFromAuth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = tokenFromCookie || tokenFromAuth;

  if (token) {
    revokeSession(token);
  }

  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.set("Set-Cookie", "admin_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  return res;
}
