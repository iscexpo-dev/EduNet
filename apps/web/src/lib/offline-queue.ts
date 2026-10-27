import {
  createLocalStorageAdapter,
  enqueue,
  type OfflineAction,
  type OfflineActionInput,
} from '@edunet/offline';

function writeOfflineQueue(actions: OfflineAction[]): void {
  if (typeof window === 'undefined') return;
  createLocalStorageAdapter(window.localStorage).write(actions);
  window.dispatchEvent(new Event('edunet:queue-changed'));
}

/**
 * Persists one mutation in the offline queue.
 *
 * Existing pages previously called `enqueue([], ...)` without writing the
 * result back, so queued work was discarded on navigation. This helper is the
 * single write path used by the UI; `useOfflineSync` reads the same storage.
 */
export function enqueueOfflineAction(input: OfflineActionInput): void {
  if (typeof window === 'undefined') return;
  const adapter = createLocalStorageAdapter(window.localStorage);
  writeOfflineQueue(enqueue(adapter.read(), input));
}

export function readOfflineQueue(): OfflineAction[] {
  if (typeof window === 'undefined') return [];
  return createLocalStorageAdapter(window.localStorage).read();
}

/**
 * Clears backoff for every queued action (or just `ids`) so the next flush
 * retries immediately. Used by the manual retry controls in the queue UI.
 */
export function retryOfflineActions(ids?: readonly string[]): OfflineAction[] {
  if (typeof window === 'undefined') return [];
  const selected = ids ? new Set(ids) : null;
  const now = Date.now();
  const next = readOfflineQueue().map((action) =>
    selected && !selected.has(action.id)
      ? action
      : { ...action, state: 'pending' as const, nextAttemptAt: now }
  );
  writeOfflineQueue(next);
  return next;
}

/** Removes one queued action after the user resolves or abandons it. */
export function removeOfflineAction(id: string): OfflineAction[] {
  const next = readOfflineQueue().filter((action) => action.id !== id);
  writeOfflineQueue(next);
  return next;
}
