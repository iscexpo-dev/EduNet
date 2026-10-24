import { describe, expect, it } from 'vitest';
import { createDatabaseReadyCheck } from './readiness';

describe('database readiness', () => {
  it('reports ready when the ping succeeds', async () => {
    const check = createDatabaseReadyCheck(async () => ({ ok: true }));
    await expect(check()).resolves.toEqual({
      ready: true,
      dependencies: [{ name: 'database', healthy: true }],
    });
  });

  it('reports not ready when the ping rejects', async () => {
    const check = createDatabaseReadyCheck(async () => {
      throw new Error('connection refused: postgres://user:secret@host/db');
    });
    const result = await check();
    expect(result.ready).toBe(false);
    expect(result.dependencies).toEqual([{ name: 'database', healthy: false }]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('times out a hung ping', async () => {
    const check = createDatabaseReadyCheck(() => new Promise(() => undefined), 10);
    const result = await check();
    expect(result.ready).toBe(false);
  });
});
