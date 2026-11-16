import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidToken } from "@/lib/admin-auth";

/**
 * Next.js 16 Proxy for admin route protection (Ticket B-12).
 * Locked routes:
 * - /admin, /debug
 * - /api/admin/** (except /api/admin/login)
 * - /api/debug/**
 * - /api/demo
 * - DELETE /api/sessions/* (deleting others' sessions)
 */
/**
 * 관람객이 자기 기록을 지우는 "나 잊기": 화면이 자기 세션 번호를 x-rem-session 머리글로 함께 보내면 통과.
 * 남의 세션을 지우는 것(관리 화면)은 로그인이 필요하다.
 */
function isOwnSession(request: NextRequest, pathname: string): boolean {
  const target = decodeURIComponent(pathname.slice("/api/sessions/".length));
  const own = request.headers.get("x-rem-session");
  return !!own && own === target;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Unlocked if ADMIN_PASSWORD_HASH is not set (development mode)
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_PASSWORD_HASH.trim()) {
    return NextResponse.next();
  }

  // Allow login endpoint
  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const isLockedApi =
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/debug/") ||
    pathname === "/api/demo" ||
    (request.method === "DELETE" && pathname.startsWith("/api/sessions/") && !isOwnSession(request, pathname));

  const isLockedPage =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/debug" ||
    pathname.startsWith("/debug/");

  if (!isLockedApi && !isLockedPage) {
    return NextResponse.next();
  }

  // Extract session token from cookie or Authorization header
  const token =
    request.cookies.get("admin_token")?.value ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (isValidToken(token)) {
    return NextResponse.next();
  }

  // Unauthorized
  if (isLockedApi) {
    return NextResponse.json({ error: "아이디나 비밀번호가 맞지 않아요" }, { status: 401 });
  }

  // 화면은 로그인 페이지로 보낸다 (로그인 페이지는 잠기지 않아서 되돌이 고리가 생기지 않는다)
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

// Support both named export and default export
export default proxy;

export const config = {
  matcher: [
    "/admin/:path*",
    "/debug/:path*",
    "/api/admin/:path*",
    "/api/debug/:path*",
    "/api/demo",
    "/api/sessions/:path*",
  ],
};
