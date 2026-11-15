import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const SESSION_FILE = path.join(process.cwd(), "data", "admin_sessions.json");
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface FailedAttempt {
  count: number;
  lockedUntil: number | null;
  firstAttemptAt: number;
}

const failedAttempts = new Map<string, FailedAttempt>();

// In-memory token cache (backed by disk if needed)
interface SessionRecord {
  token: string;
  createdAt: number;
  expiresAt: number;
}

const activeTokens = new Map<string, SessionRecord>();

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

  // Format: scrypt$N$r$p$salt(base64url)$hash(base64url)
  const parts = expectedHashStr.trim().split("$");
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
 * Generate cryptographically secure session token.
 */
export function createSession(): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  activeTokens.set(token, {
    token,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  return token;
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

  const session = activeTokens.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    activeTokens.delete(token);
    return false;
  }

  return true;
}

/**
 * Revoke session token.
 */
export function revokeSession(token: string | undefined | null): void {
  if (token) {
    activeTokens.delete(token);
  }
}
