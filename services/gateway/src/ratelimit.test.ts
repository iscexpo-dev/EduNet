import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FixedWindowLimiter,
  limitForPrefix,
  rateLimit,
  rateLimitConfigFromEnv,
} from './ratelimit';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let baseUrl = '';

describe('fixed-window limiter', () => {
  it('allows up to the limit then blocks until the next window', () => {
    const limiter = new FixedWindowLimiter();
    const now = 1_000_000;

    expect(limiter.check('client|/api/auth', 2, 60_000, now)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.check('client|/api/auth', 2, 60_000, now + 1)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check('client|/api/auth', 2, 60_000, now + 2)).toMatchObject({
      allowed: false,
      remaining: 0,
    });
    expect(limiter.check('client|/api/auth', 2, 60_000, now + 60_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });

  it('keeps clients and scopes independent', () => {
    const limiter = new FixedWindowLimiter();
    expect(limiter.check('a|/api/ai', 1, 60_000, 0).allowed).toBe(true);
    expect(limiter.check('a|/api/ai', 1, 60_000, 0).allowed).toBe(false);
    expect(limiter.check('b|/api/ai', 1, 60_000, 0).allowed).toBe(true);
    expect(limiter.check('a|/api/courses', 1, 60_000, 0).allowed).toBe(true);
  });

  it('treats a zero limit as disabled', () => {
    const limiter = new FixedWindowLimiter();
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.check('a|/api/auth', 0, 60_000, 0).allowed).toBe(true);
    }
  });
});

describe('rate-limit middleware', () => {
  beforeAll(async () => {
    const limiter = new FixedWindowLimiter();
    const app = express();
    app.use(rateLimit({ limiter, limit: 2, scope: '/api/auth' }));
    app.get('/api/auth/login', (_req, res) => res.json({ ok: true }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns rate-limit headers and then 429', async () => {
    const first = await fetch(`${baseUrl}/api/auth/login`);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-ratelimit-limit')).toBe('2');
    expect(first.headers.get('x-ratelimit-remaining')).toBe('1');

    const second = await fetch(`${baseUrl}/api/auth/login`);
    expect(second.status).toBe(200);
    expect(second.headers.get('x-ratelimit-remaining')).toBe('0');

    const third = await fetch(`${baseUrl}/api/auth/login`);
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBeTruthy();
    await expect(third.json()).resolves.toEqual({ error: 'Too many requests' });
  });
});

describe('rate-limit configuration', () => {
  it('uses conservative defaults and parses overrides', () => {
    expect(rateLimitConfigFromEnv({} as NodeJS.ProcessEnv)).toEqual({
      defaultPerMinute: 120,
      authPerMinute: 20,
      aiPerMinute: 30,
    });
    expect(
      rateLimitConfigFromEnv({
        GATEWAY_RATE_LIMIT_PER_MINUTE: '300',
        GATEWAY_AUTH_RATE_LIMIT_PER_MINUTE: '10',
        GATEWAY_AI_RATE_LIMIT_PER_MINUTE: '0',
      } as NodeJS.ProcessEnv),
    ).toEqual({ defaultPerMinute: 300, authPerMinute: 10, aiPerMinute: 0 });
  });

  it('applies the stricter auth and AI buckets by prefix', () => {
    const config = { defaultPerMinute: 100, authPerMinute: 10, aiPerMinute: 25 };
    expect(limitForPrefix('/api/auth', config)).toBe(10);
    expect(limitForPrefix('/api/ai', config)).toBe(25);
    expect(limitForPrefix('/api/courses', config)).toBe(100);
  });
});
