import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FixedWindowLimiter,
  PostgresRateLimitLimiter,
  limitForPrefix,
  rateLimit,
  rateLimitConfigFromEnv,
  rateLimitStoreFromEnv,
  replicaCountFromEnv,
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

describe('shared postgres limiter', () => {
  function sharedStore() {
    const counts = new Map<string, number>();
    const calls: Array<{ key: string; windowStart: number; windowMs: number }> = [];
    return {
      counts,
      calls,
      increment: async (key: string, windowStart: number, windowMs: number) => {
        calls.push({ key, windowStart, windowMs });
        const bucket = `${key}|${windowStart}`;
        const next = (counts.get(bucket) ?? 0) + 1;
        counts.set(bucket, next);
        return next;
      },
    };
  }

  it('enforces one limit across replicas sharing the store', async () => {
    const store = sharedStore();
    const replicaA = new PostgresRateLimitLimiter(store.increment);
    const replicaB = new PostgresRateLimitLimiter(store.increment);
    const now = 2_000_000;

    expect(await replicaA.check('client|/api/auth', 2, 60_000, now)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(await replicaB.check('client|/api/auth', 2, 60_000, now + 1)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(await replicaA.check('client|/api/auth', 2, 60_000, now + 2)).toMatchObject({
      allowed: false,
      remaining: 0,
    });
    expect(await replicaB.check('client|/api/auth', 2, 60_000, now + 3)).toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it('resets the count in a new window and passes the window to the store', async () => {
    const store = sharedStore();
    const limiter = new PostgresRateLimitLimiter(store.increment);

    await limiter.check('client|/api/ai', 1, 60_000, 0);
    expect((await limiter.check('client|/api/ai', 1, 60_000, 59_999)).allowed).toBe(false);
    expect((await limiter.check('client|/api/ai', 1, 60_000, 60_000)).allowed).toBe(true);

    expect(store.calls).toEqual([
      { key: 'client|/api/ai', windowStart: 0, windowMs: 60_000 },
      { key: 'client|/api/ai', windowStart: 0, windowMs: 60_000 },
      { key: 'client|/api/ai', windowStart: 60_000, windowMs: 60_000 },
    ]);
  });

  it('does not touch the shared store when the limit is disabled', async () => {
    const store = sharedStore();
    const limiter = new PostgresRateLimitLimiter(store.increment);

    expect((await limiter.check('client|/api/auth', 0, 60_000, 0)).allowed).toBe(true);
    expect(store.calls).toHaveLength(0);
  });

  it('propagates store failures to the middleware error handler', async () => {
    const limiter = new PostgresRateLimitLimiter(async () => {
      throw new Error('database unavailable');
    });

    const app = express();
    app.use(rateLimit({ limiter, limit: 5, scope: '/api/auth' }));
    app.get('/api/auth/login', (_req, res) => res.json({ ok: true }));
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(503).json({ error: error.message });
    });

    const edge = await new Promise<ReturnType<ReturnType<typeof express>['listen']>>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const url = `http://127.0.0.1:${(edge.address() as AddressInfo).port}`;

    try {
      const response = await fetch(`${url}/api/auth/login`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'database unavailable' });
    } finally {
      await new Promise<void>((resolve) => edge.close(() => resolve()));
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

  it('selects the store and replica count from the environment', () => {
    expect(rateLimitStoreFromEnv({} as NodeJS.ProcessEnv)).toBe('memory');
    expect(rateLimitStoreFromEnv({ GATEWAY_RATE_LIMIT_STORE: 'memory' } as NodeJS.ProcessEnv)).toBe('memory');
    expect(rateLimitStoreFromEnv({ GATEWAY_RATE_LIMIT_STORE: ' POSTGRES ' } as NodeJS.ProcessEnv)).toBe('postgres');
    expect(() =>
      rateLimitStoreFromEnv({ GATEWAY_RATE_LIMIT_STORE: 'redis' } as NodeJS.ProcessEnv),
    ).toThrow(/memory.*postgres/);

    expect(replicaCountFromEnv({} as NodeJS.ProcessEnv)).toBe(1);
    expect(replicaCountFromEnv({ GATEWAY_REPLICA_COUNT: '3' } as NodeJS.ProcessEnv)).toBe(3);
    expect(replicaCountFromEnv({ GATEWAY_REPLICA_COUNT: '0' } as NodeJS.ProcessEnv)).toBe(1);
    expect(replicaCountFromEnv({ GATEWAY_REPLICA_COUNT: 'lots' } as NodeJS.ProcessEnv)).toBe(1);
  });
});
