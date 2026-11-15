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
    (request.method === "DELETE" && pathname.startsWith("/api/sessions/"));

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

  // For UI pages, redirect to home or return 401
  const loginUrl = new URL("/admin", request.url);
  loginUrl.searchParams.set("auth", "required");
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
