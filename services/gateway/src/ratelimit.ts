import type { Request, Response, NextFunction } from 'express';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

/**
 * Fixed-window limiter keyed by client and route scope.
 *
 * This is intentionally an in-process default: it protects a single gateway
 * instance without adding a Redis dependency. Before horizontal scaling,
 * replace the `FixedWindowLimiter` instance with a shared implementation that
 * exposes the same `check` method.
 */
export class FixedWindowLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;

  constructor(maxKeys = 10_000) {
    this.maxKeys = maxKeys;
  }

  check(key: string, limit: number, windowMs = 60_000, now = Date.now()): RateLimitDecision {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    if (limit <= 0) {
      return { allowed: true, limit: 0, remaining: 0, resetAt };
    }

    const existing = this.buckets.get(key);
    if (!existing || existing.windowStart !== windowStart) {
      this.buckets.set(key, { windowStart, count: 1 });
      this.prune(windowStart);
      return { allowed: true, limit, remaining: limit - 1, resetAt };
    }

    if (existing.count >= limit) {
      return { allowed: false, limit, remaining: 0, resetAt };
    }

    existing.count += 1;
    return { allowed: true, limit, remaining: limit - existing.count, resetAt };
  }

  reset(): void {
    this.buckets.clear();
  }

  private prune(windowStart: number): void {
    if (this.buckets.size < this.maxKeys) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.windowStart < windowStart) this.buckets.delete(key);
    }
    // If a single window still exceeds the cap, drop the oldest insertion. Map
    // preserves insertion order, so this bounds memory under IP spraying.
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

export interface RateLimitOptions {
  limiter: FixedWindowLimiter;
  limit: number;
  scope: string;
  windowMs?: number;
  now?: () => number;
}

export function rateLimit(options: RateLimitOptions) {
  const windowMs = options.windowMs ?? 60_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (options.limit <= 0) {
      next();
      return;
    }

    const now = options.now?.() ?? Date.now();
    const decision = options.limiter.check(
      `${req.ip ?? 'unknown'}|${options.scope}`,
      options.limit,
      windowMs,
      now,
    );

    res.setHeader('X-RateLimit-Limit', String(decision.limit));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1000)));

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((decision.resetAt - now) / 1000))));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}

export interface RateLimitConfig {
  defaultPerMinute: number;
  authPerMinute: number;
  aiPerMinute: number;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function rateLimitConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    defaultPerMinute: positiveInteger(env.GATEWAY_RATE_LIMIT_PER_MINUTE, 120),
    authPerMinute: positiveInteger(env.GATEWAY_AUTH_RATE_LIMIT_PER_MINUTE, 20),
    aiPerMinute: positiveInteger(env.GATEWAY_AI_RATE_LIMIT_PER_MINUTE, 30),
  };
}

export function limitForPrefix(prefix: string, config: RateLimitConfig): number {
  if (prefix === '/api/auth') return config.authPerMinute;
  if (prefix === '/api/ai') return config.aiPerMinute;
  return config.defaultPerMinute;
}
