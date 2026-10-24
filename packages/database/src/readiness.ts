import { sql } from 'drizzle-orm';
import { getDb } from './index';

/**
 * Readiness check used by every database-backed service.
 *
 * `/health` must stay cheap and process-local; `/ready` answers the different
 * question "can this instance serve traffic right now". A failed ping returns
 * `ready: false` (HTTP 503) without exposing the connection string or driver
 * error. The timeout prevents a hung pool from blocking the probe forever.
 */

export interface DependencyReadiness {
  ready: boolean;
  dependencies: { name: string; healthy: boolean }[];
}

export type DatabasePing = () => Promise<unknown>;

async function defaultPing(): Promise<unknown> {
  return getDb().execute(sql`select 1`);
}

export function createDatabaseReadyCheck(
  ping: DatabasePing = defaultPing,
  timeoutMs = 2_000,
): () => Promise<DependencyReadiness> {
  return async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('readiness timeout')), timeoutMs);
      timer.unref?.();
    });

    try {
      await Promise.race([ping(), timeout]);
      return { ready: true, dependencies: [{ name: 'database', healthy: true }] };
    } catch {
      return { ready: false, dependencies: [{ name: 'database', healthy: false }] };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export const databaseReadyCheck = createDatabaseReadyCheck();
