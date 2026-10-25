import { lt, sql } from 'drizzle-orm';
import { getDb } from './client';
import { rateLimitWindows } from './platform-schema';

export interface RateLimitWindowInput {
  /** Client + route scope, e.g. `203.0.113.7|/api/auth`. */
  key: string;
  /** Epoch milliseconds for the start of the fixed window. */
  windowStart: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** How long expired rows are retained before the opportunistic prune removes them. */
const RETENTION_MS = 5 * 60_000;
const PRUNE_INTERVAL_MS = 60_000;
let lastPruneAt = 0;

/**
 * Atomically increments the counter for a client/window pair and returns the
 * new count.
 *
 * The `ON CONFLICT` update is a single statement, so two gateway replicas
 * racing on the same key cannot both observe a stale count. A new window resets
 * the row instead of inserting another one, which keeps the table bounded.
 */
export async function incrementRateLimitWindow(input: RateLimitWindowInput): Promise<number> {
  const now = new Date();
  const expiresAt = new Date(input.windowStart + input.windowMs * 2);

  const [row] = await getDb()
    .insert(rateLimitWindows)
    .values({
      key: input.key,
      windowStart: input.windowStart,
      count: 1,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: rateLimitWindows.key,
      set: {
        count: sql`case when ${rateLimitWindows.windowStart} = ${input.windowStart} then ${rateLimitWindows.count} + 1 else 1 end`,
        windowStart: input.windowStart,
        expiresAt,
        updatedAt: now,
      },
    })
    .returning({ count: rateLimitWindows.count });

  if (!row) {
    throw new Error('rate limit increment returned no row');
  }

  await pruneExpired(now.getTime());
  return Number(row.count);
}

/**
 * Opportunistically removes rows that have been expired beyond the retention
 * window. Runs at most once per minute per process; a failed prune must not
 * reject the request that triggered it, because the limit itself was applied.
 */
async function pruneExpired(now: number): Promise<void> {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;

  await getDb()
    .delete(rateLimitWindows)
    .where(lt(rateLimitWindows.expiresAt, new Date(now - RETENTION_MS)))
    .catch(() => undefined);
}
