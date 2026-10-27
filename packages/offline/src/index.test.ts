import { describe, expect, it, vi } from 'vitest';
import {
  backoffDelay,
  createLocalStorageAdapter,
  enqueue,
  estimateBytes,
  flushQueue,
  markFailed,
  markSyncing,
  planDownloads,
  resolveConflict,
  selectReady,
  type OfflineAction,
} from './index';

const baseInput = {
  id: 'a1',
  type: 'assignment_autosave' as const,
  entityId: 'sub-1',
  endpoint: '/api/submissions/sub-1/autosave',
  method: 'PUT' as const,
  body: { content: 'first' },
  createdAt: 1_000,
};

describe('enqueue', () => {
  it('adds a new action', () => {
    const queue = enqueue([], baseInput);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: 'a1', state: 'pending', attempts: 0, version: 1 });
  });

  it('collapses repeated autosaves for the same entity', () => {
    let queue = enqueue([], baseInput);
    queue = enqueue(queue, { ...baseInput, id: 'a2', body: { content: 'second' }, createdAt: 2_000 });
    expect(queue).toHaveLength(1);
    expect(queue[0]!.body).toEqual({ content: 'second' });
    expect(queue[0]!.version).toBe(2);
    expect(queue[0]!.updatedAt).toBe(2_000);
  });

  it('keeps separate entities and non-deduped actions', () => {
    let queue = enqueue([], baseInput);
    queue = enqueue(queue, { ...baseInput, id: 'a2', entityId: 'sub-2' });
    queue = enqueue(queue, { ...baseInput, id: 'a3', type: 'assignment_submit' });
    expect(queue).toHaveLength(3);
  });

  it('does not collapse into an action currently syncing', () => {
    let queue = enqueue([], baseInput);
    queue = queue.map((action) => ({ ...action, state: 'syncing' as const }));
    queue = enqueue(queue, { ...baseInput, id: 'a2', body: { content: 'new' } });
    expect(queue).toHaveLength(2);
  });
});

describe('backoff', () => {
  it('grows exponentially and caps', () => {
    expect(backoffDelay(0)).toBe(0);
    expect(backoffDelay(1)).toBe(1_000);
    expect(backoffDelay(2)).toBe(2_000);
    expect(backoffDelay(3)).toBe(4_000);
    expect(backoffDelay(50)).toBe(300_000);
  });
});

describe('selectReady', () => {
  it('returns ready actions oldest-first and respects backoff', () => {
    const queue: OfflineAction[] = [
      { ...enqueue([], { ...baseInput, id: 'b', createdAt: 2_000 })[0]!, nextAttemptAt: 2_000 },
      { ...enqueue([], { ...baseInput, id: 'a', createdAt: 1_000 })[0]!, nextAttemptAt: 1_000 },
      { ...enqueue([], { ...baseInput, id: 'c', createdAt: 3_000 })[0]!, nextAttemptAt: 9_999 },
    ];
    expect(selectReady(queue, 3_000).map((action) => action.id)).toEqual(['a', 'b']);
  });

  it('honours the limit', () => {
    const queue = enqueue([], { ...baseInput, id: 'a', createdAt: 1 });
    expect(selectReady(queue, 10, 0)).toHaveLength(0);
  });
});

describe('markFailed', () => {
  it('sets state and schedules a retry', () => {
    const queue = markFailed(enqueue([], baseInput), 'a1', 10_000);
    expect(queue[0]).toMatchObject({ state: 'failed', nextAttemptAt: 11_000 });
  });

  it('records failure metadata and clears it on retry', () => {
    const failed = markFailed(enqueue([], baseInput), 'a1', 10_000, {}, {
      message: 'Version conflict',
      status: 409,
    });
    expect(failed[0]).toMatchObject({ lastError: 'Version conflict', lastStatus: 409 });
    expect(markSyncing(failed, 'a1')[0]).toMatchObject({
      state: 'syncing',
      lastError: undefined,
      lastStatus: undefined,
    });
  });
});

describe('flushQueue', () => {
  it('sends ready actions and removes them', async () => {
    const queue = enqueue([], baseInput);
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await flushQueue(queue, send, () => 2_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.synced).toEqual(['a1']);
    expect(result.remaining).toEqual([]);
  });

  it('keeps failures queued with backoff', async () => {
    const queue = enqueue([], baseInput);
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await flushQueue(queue, send, () => 2_000);
    expect(result.failed).toEqual(['a1']);
    expect(result.remaining[0]).toMatchObject({ state: 'failed', attempts: 1, nextAttemptAt: 3_000 });
    expect(result.remaining[0]).toMatchObject({ lastError: 'offline' });
  });

  it('preserves HTTP status for conflict triage', async () => {
    const queue = enqueue([], baseInput);
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const result = await flushQueue(queue, send, () => 2_000);
    expect(result.remaining[0]).toMatchObject({ lastError: 'conflict', lastStatus: 409 });
  });

  it('does not send actions not yet due', async () => {
    const queue = markFailed(enqueue([], baseInput), 'a1', 2_000);
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await flushQueue(queue, send, () => 2_500);
    expect(send).not.toHaveBeenCalled();
    expect(result.remaining).toHaveLength(1);
  });
});

describe('resolveConflict', () => {
  it('server-wins always takes the server value', () => {
    expect(
      resolveConflict(
        { value: 'local', updatedAt: 20, version: 2 },
        { value: 'server', updatedAt: 10, version: 1 },
        'server-wins',
      ),
    ).toMatchObject({ value: 'server', source: 'server' });
  });

  it('client-wins always takes the local value', () => {
    expect(
      resolveConflict(
        { value: 'local', updatedAt: 10, version: 1 },
        { value: 'server', updatedAt: 20, version: 2 },
        'client-wins',
      ),
    ).toMatchObject({ value: 'local', source: 'client' });
  });

  it('last-write-wins prefers the higher version', () => {
    expect(
      resolveConflict(
        { value: 'local', updatedAt: 100, version: 2 },
        { value: 'server', updatedAt: 1, version: 3 },
      ),
    ).toMatchObject({ value: 'server' });
    expect(
      resolveConflict(
        { value: 'local', updatedAt: 1, version: 5 },
        { value: 'server', updatedAt: 100, version: 3 },
      ),
    ).toMatchObject({ value: 'local' });
  });

  it('falls back to timestamps for equal versions', () => {
    expect(
      resolveConflict(
        { value: 'local', updatedAt: 10, version: 1 },
        { value: 'server', updatedAt: 20, version: 1 },
      ),
    ).toMatchObject({ value: 'server' });
    expect(
      resolveConflict(
        { value: 'local', updatedAt: 30, version: 1 },
        { value: 'server', updatedAt: 20, version: 1 },
      ),
    ).toMatchObject({ value: 'local' });
  });
});

describe('planDownloads', () => {
  const candidates = [
    { id: 'req', title: 'Required', durationSeconds: 600, required: true },
    { id: 'opt', title: 'Optional', durationSeconds: 600, required: false },
  ];

  it('degrades quality to fit required lessons', () => {
    const plan = planDownloads(candidates, estimateBytes(600, 'low'), 'high');
    expect(plan.selected[0]).toMatchObject({ id: 'req', quality: 'low' });
    expect(plan.degraded).toBe(true);
    expect(plan.totalBytes).toBeLessThanOrEqual(plan.budgetBytes);
  });

  it('skips required lessons that cannot fit even at audio quality', () => {
    const plan = planDownloads(candidates, 1, 'high');
    expect(plan.selected).toHaveLength(0);
    expect(plan.skipped.map((entry) => entry.reason).sort()).toEqual(['not_required', 'over_budget']);
  });

  it('uses explicit sizes when provided', () => {
    const sized = [
      {
        id: 'x',
        title: 'x',
        durationSeconds: 10,
        required: true,
        sizeBytes: { high: 500 },
      },
    ];
    expect(planDownloads(sized, 600, 'high').selected[0]!.estimatedBytes).toBe(500);
  });
});

describe('localStorage adapter', () => {
  it('round-trips actions and ignores corrupt data', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
    const adapter = createLocalStorageAdapter(storage);
    const queue = enqueue([], baseInput);
    adapter.write(queue);
    expect(adapter.read()).toEqual(queue);

    storage.setItem('edunet-offline-queue-v1', '{not json');
    expect(adapter.read()).toEqual([]);
  });
});
