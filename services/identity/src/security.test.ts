import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateOpaqueToken,
  sha256Hex,
  anonymizeIp,
  tokenTtlMs,
  evaluateLockout,
  normalizeEmail,
  lockoutPolicy,
  type FailureRecord,
} from './security';

const TEST_ENV = {
  JWT_SECRET: 'identity-security-test-secret',
};

describe('opaque tokens', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_ENV.JWT_SECRET;
  });

  it('generates unique 256-bit tokens with a prefix', () => {
    const a = generateOpaqueToken('reset');
    const b = generateOpaqueToken('reset');
    expect(a).toMatch(/^reset_[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('token hashes are stable, hex, and do not contain the raw token', () => {
    const token = generateOpaqueToken();
    const hash = sha256Hex(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(token)).toBe(hash);
    expect(hash).not.toContain(token.slice(0, 16));
  });
});

describe('IP anonymisation', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_ENV.JWT_SECRET;
  });

  it('produces a keyed, non-reversible HMAC hash', () => {
    const hashed = anonymizeIp('203.0.113.55');
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain('203.0.113');
    expect(anonymizeIp('203.0.113.55')).toBe(hashed);
  });

  it('changes when the deployment secret changes', () => {
    const first = anonymizeIp('203.0.113.55');
    process.env.JWT_SECRET = 'another-verification-secret';
    expect(anonymizeIp('203.0.113.55')).not.toBe(first);
  });

  it('refuses to run without a secret configured', () => {
    delete process.env.JWT_SECRET;
    delete process.env.TOKEN_HASH_SECRET;
    expect(() => anonymizeIp('203.0.113.55')).toThrow(/TOKEN_HASH_SECRET|JWT_SECRET/);
  });
});

describe('token TTLs', () => {
  it('password reset expires within an hour, verification longer, phone shorter', () => {
    expect(tokenTtlMs('password_reset')).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(tokenTtlMs('email_verification')).toBe(24 * 60 * 60 * 1000);
    expect(tokenTtlMs('phone_verification')).toBe(10 * 60 * 1000);
  });
});

describe('lockout evaluation', () => {
  const policy = { windowMs: 900_000, maxFailures: 5, durationMs: 300_000 };
  const base: FailureRecord = { at: 1_000_000, ipHash: 'iphash', userId: 'user1' };

  function records(...atOffsets: number[]): FailureRecord[] {
    return atOffsets.map((at) => ({ at, ipHash: base.ipHash, userId: base.userId }));
  }

  it('does not lock below threshold', () => {
    const result = evaluateLockout(records(990_000, 995_000), { userId: 'user1' }, 1_000_000, policy);
    expect(result.locked).toBe(false);
    expect(result.failureCount).toBe(2);
  });

  it('locks at threshold failures inside the window', () => {
    const result = evaluateLockout(
      records(960_000, 970_000, 980_000, 990_000, 999_000),
      { userId: 'user1' },
      1_000_000,
      policy,
    );
    expect(result.locked).toBe(true);
    expect(result.lockedUntil).toBe(999_000 + policy.durationMs);
  });

  it('forgets failures outside the window', () => {
    const result = evaluateLockout(
      records(0, 1, 2, 3, 999_000),
      { userId: 'user1' },
      1_000_000,
      policy,
    );
    expect(result.locked).toBe(false);
  });

  it('scopes evaluation to the requested subject', () => {
    const others: FailureRecord[] = [0, 1, 2, 3, 4].map((i) => ({
      at: 990_000 + i,
      ipHash: 'other-ip',
      userId: 'other-user',
    }));
    const result = evaluateLockout(others, { userId: 'user1', ipHash: 'iphash' }, 1_000_000, policy);
    expect(result.locked).toBe(false);
  });

  it('locks by IP even across different users (credential-stuffing pattern)', () => {
    const byIp: FailureRecord[] = [0, 1, 2, 3, 4].map((i) => ({
      at: 990_000 + i,
      ipHash: 'suspect-ip',
      userId: `user${i}`,
    }));
    const result = evaluateLockout(byIp, { ipHash: 'suspect-ip' }, 1_000_000, policy);
    expect(result.locked).toBe(true);
  });

  it('defaults are sane', () => {
    const defaults = lockoutPolicy();
    expect(defaults.maxFailures).toBeGreaterThanOrEqual(3);
    expect(defaults.windowMs).toBeGreaterThan(60_000);
    expect(defaults.durationMs).toBeGreaterThan(0);
  });
});

describe('email normalisation', () => {
  it('trims and lowercases for stable lookups', () => {
    expect(normalizeEmail('  Student.Name@School.EDU ')).toBe('student.name@school.edu');
  });
});
