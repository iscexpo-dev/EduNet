import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';

/**
 * Pure security primitives for the identity service.
 *
 * Rules enforced by tests:
 * - Opaque one-time tokens are 256-bit random values; only their SHA-256 hash
 *   is persisted so a database leak cannot mint password-reset links.
 * - IPs are hashed with HMAC under a deployment-wide secret before storage:
 *   we need correlation for lockout/suspicious-login detection but not the
 *   raw address (data minimisation, docs/security/security.md).
 * - Lockout is deterministic and time-window based, evaluated server-side.
 */

export type TokenKind = 'password_reset' | 'email_verification' | 'phone_verification';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PHONE_VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function tokenTtlMs(kind: TokenKind): number {
  switch (kind) {
    case 'password_reset':
      return PASSWORD_RESET_TTL_MS;
    case 'email_verification':
      return EMAIL_VERIFICATION_TTL_MS;
    case 'phone_verification':
      return PHONE_VERIFICATION_TTL_MS;
  }
}

/** 256-bit URL-safe opaque token, prefixed for log greppability. */
export function generateOpaqueToken(prefix = 'edn'): string {
  return `${prefix}_${randomBytes(32).toString('hex')}`;
}

/** SHA-256 hex digest of a token/IP string. Never persist the raw value. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Keyed hash for client IPs; requires TOKEN_HASH_SECRET or JWT_SECRET. */
export function anonymizeIp(ip: string): string {
  const secret = process.env.TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('TOKEN_HASH_SECRET or JWT_SECRET is required to anonymise IPs');
  }
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export function newSessionId(): string {
  return randomUUID();
}

/**
 * Lockout policy
 *
 * `LOCKOUT_MAX_FAILURES` attempts within `LOCKOUT_WINDOW_MS` trigger a lockout
 * for `LOCKOUT_DURATION_MS`. Defaults: 5 failures / 15 min window / 15 min lock.
 */
export interface LockoutPolicy {
  windowMs: number;
  maxFailures: number;
  durationMs: number;
}

export function lockoutPolicy(): LockoutPolicy {
  return {
    windowMs: Number(process.env.LOCKOUT_WINDOW_MS ?? 15 * 60 * 1000),
    maxFailures: Number(process.env.LOCKOUT_MAX_FAILURES ?? 5),
    durationMs: Number(process.env.LOCKOUT_DURATION_MS ?? 15 * 60 * 1000),
  };
}

export interface FailureRecord {
  at: number;
  ipHash: string | null;
  userId: string | null;
}

export interface LockoutEvaluation {
  locked: boolean;
  failureCount: number;
  /** Earliest timestamp at which the window clears, when locked. */
  lockedUntil?: number;
}

/**
 * Evaluates whether an identifier (user id and/or IP hash) is locked out.
 * Rows must be pre-filtered to the same identifier by the caller.
 */
export function evaluateLockout(
  records: FailureRecord[],
  subject: { userId?: string | null; ipHash?: string | null },
  now: number,
  policy: LockoutPolicy = lockoutPolicy(),
): LockoutEvaluation {
  const filtered = records.filter((record) => {
    if (subject.userId && record.userId === subject.userId) return true;
    if (subject.ipHash && record.ipHash === subject.ipHash) return true;
    return false;
  });

  const recent = filtered.filter((record) => now - record.at <= policy.windowMs);
  const failureCount = recent.length;

  const lastAt = recent.length > 0 ? Math.max(...recent.map((record) => record.at)) : null;
  if (failureCount >= policy.maxFailures && lastAt !== null) {
    return {
      locked: true,
      failureCount,
      lockedUntil: lastAt + policy.durationMs,
    };
  }

  return { locked: false, failureCount };
}

/** Normalises an email to a canonical comparison form. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const SUPPORTED_TOKEN_KINDS: readonly string[] = [
  'password_reset',
  'email_verification',
  'phone_verification',
];

export function isSupportedTokenKind(kind: string): kind is TokenKind {
  return SUPPORTED_TOKEN_KINDS.includes(kind);
}
