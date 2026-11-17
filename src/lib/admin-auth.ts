import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface FailedAttempt {
  count: number;
  lockedUntil: number | null;
  firstAttemptAt: number;
}

const failedAttempts = new Map<string, FailedAttempt>();


// Warn once if ADMIN_PASSWORD_HASH is unset
let hasWarnedEmptyHash = false;
export function checkEmptyHashWarning(): void {
  if (!process.env.ADMIN_PASSWORD_HASH && !hasWarnedEmptyHash) {
    hasWarnedEmptyHash = true;
    console.warn("[admin-auth] ADMIN_PASSWORD_HASH is not set; admin routes are unlocked for development.");
  }
}

/**
 * Check rate limit / lockout for an IP address.
 */
export function checkRateLimit(ip: string): { allowed: boolean; remainingLockMs?: number } {
  const now = Date.now();
  const attempt = failedAttempts.get(ip);
  if (!attempt) return { allowed: true };

  if (attempt.lockedUntil && now < attempt.lockedUntil) {
    return { allowed: false, remainingLockMs: attempt.lockedUntil - now };
  }

  // If lockout or window has passed, reset
  if (now - attempt.firstAttemptAt > LOCKOUT_MS) {
    failedAttempts.delete(ip);
    return { allowed: true };
  }

  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.lockedUntil = now + LOCKOUT_MS;
    return { allowed: false, remainingLockMs: LOCKOUT_MS };
  }

  return { allowed: true };
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const attempt = failedAttempts.get(ip);
  if (!attempt || now - attempt.firstAttemptAt > LOCKOUT_MS) {
    failedAttempts.set(ip, {
      count: 1,
      lockedUntil: null,
      firstAttemptAt: now,
    });
  } else {
    attempt.count += 1;
    if (attempt.count >= MAX_ATTEMPTS) {
      attempt.lockedUntil = now + LOCKOUT_MS;
    }
  }
}

export function resetFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

/**
 * Verify admin password using scrypt and constant-time timingSafeEqual.
 */
export function verifyPassword(password: string): boolean {
  checkEmptyHashWarning();
  const expectedHashStr = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedHashStr || !expectedHashStr.trim()) {
    // If empty, unlocked for dev mode
    return true;
  }

  // Format: scrypt:N:r:p:salt(base64url):hash(base64url)
  // ($로 나눈 예전 모양도 받는다. 단, .env 파일에서는 $가 변수로 풀려 값이 망가지므로 : 모양을 쓴다)
  const parts = expectedHashStr.trim().split(/[:$]/);
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    console.error("[admin-auth] Malformed ADMIN_PASSWORD_HASH format.");
    return false;
  }

  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], "base64url");
  const expectedHash = Buffer.from(parts[5], "base64url");

  try {
    const computedHash = scryptSync(password.normalize("NFC"), salt, expectedHash.length, {
      N,
      r,
      p,
    });
    return timingSafeEqual(computedHash, expectedHash);
  } catch (err) {
    console.error("[admin-auth] Hash verification error:", err);
    return false;
  }
}

/**
 * Validate admin username.
 */
export function verifyUsername(username: string): boolean {
  const expectedUser = process.env.ADMIN_USER || "admin";
  return username === expectedUser;
}

/**
 * 서명 키: ADMIN_SESSION_SECRET. 비어 있으면 비밀번호 해시에서 끌어낸다(해시는 서버 .env.local에만 있으므로 밖에서 알 수 없다).
 * 토큰을 메모리 표에 두지 않는다 — proxy와 라우트 핸들러는 서로 다른 모듈 사본이라 메모리를 함께 쓰지 못한다.
 */
function signingKey(): Buffer {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (secret) return Buffer.from(secret, "utf8");
  return createHmac("sha256", "rem-dream-admin").update(process.env.ADMIN_PASSWORD_HASH?.trim() ?? "").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/**
 * 세션 토큰 = 만료시각.무작위값.서명. 서명이 맞고 만료 전이면 유효하다.
 * 비밀번호·해시는 토큰에 담기지 않는다.
 */
export function createSession(): string {
  const payload = `${Date.now() + SESSION_TTL_MS}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Check if token is valid and unexpired.
 */
export function isValidToken(token: string | undefined | null): boolean {
  checkEmptyHashWarning();
  // If hash is not set, allow dev mode
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_PASSWORD_HASH.trim()) {
    return true;
  }
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  const expected = Buffer.from(sign(`${exp}.${nonce}`), "utf8");
  const given = Buffer.from(sig, "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const expiresAt = Number(exp);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

/**
 * 로그아웃: 서명 토큰은 서버에 목록이 없으므로 쿠키를 지우는 것으로 끝난다(라우트가 Max-Age=0 쿠키를 보냄).
 * 모든 세션을 한꺼번에 끊으려면 ADMIN_SESSION_SECRET을 바꾸고 서버를 다시 켠다.
 */
export function revokeSession(token: string | undefined | null): void {
  void token;
}
