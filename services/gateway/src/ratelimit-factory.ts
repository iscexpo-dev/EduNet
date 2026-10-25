import { incrementRateLimitWindow } from '@edunet/database';
import {
  FixedWindowLimiter,
  PostgresRateLimitLimiter,
  type Limiter,
  type RateLimitStoreKind,
} from './ratelimit';

/**
 * Builds the limiter selected by `GATEWAY_RATE_LIMIT_STORE`.
 *
 * The Postgres store opens its connection lazily on the first request, so
 * importing the gateway (for example in tests) does not require a database.
 */
export function createLimiter(kind: RateLimitStoreKind): Limiter {
  if (kind === 'postgres') {
    return new PostgresRateLimitLimiter((key, windowStart, windowMs) =>
      incrementRateLimitWindow({ key, windowStart, windowMs }),
    );
  }
  return new FixedWindowLimiter();
}
