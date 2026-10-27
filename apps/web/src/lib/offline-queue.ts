import {
  createLocalStorageAdapter,
  enqueue,
  type OfflineActionInput,
} from '@edunet/offline';

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
  adapter.write(enqueue(adapter.read(), input));
}

export function readOfflineQueue() {
  if (typeof window === 'undefined') return [];
  return createLocalStorageAdapter(window.localStorage).read();
}
