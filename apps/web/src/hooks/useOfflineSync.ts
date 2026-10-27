'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  createLocalStorageAdapter,
  flushQueue,
  type ActionSender,
  type OfflineAction,
  type SyncResult,
} from '@edunet/offline';
import { useAuth } from '@edunet/auth';
import { apiUrl } from '@/lib/api-url';

const BACKGROUND_SYNC_INTERVAL_MS = 30_000;

export function useOfflineSync(): { flush: () => Promise<SyncResult> } {
  const { token } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const send: ActionSender = useCallback(
    async (action: OfflineAction) => {
      const response = await fetch(apiUrl(action.endpoint), {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });

      if (!response.ok) {
        let message = `Offline sync failed for ${action.id}`;
        try {
          const payload = await response.json();
          if (payload && typeof payload.error === 'string') message = payload.error;
        } catch {
          /* non-JSON error body */
        }
        const error = new Error(message) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
    },
    [token]
  );

  const flush = useCallback(async (): Promise<SyncResult> => {
    if (!token) return { synced: [], failed: [], remaining: [] };

    const adapter = createLocalStorageAdapter(localStorage);
    const queue = adapter.read() as OfflineAction[];
    const result = await flushQueue(queue, send);
    adapter.write(result.remaining);
    window.dispatchEvent(new Event('edunet:queue-changed'));
    return result;
  }, [send, token]);

  const flushIfOnline = useCallback(() => {
    if (!token || !navigator.onLine) return;
    const adapter = createLocalStorageAdapter(localStorage);
    const queue = adapter.read() as OfflineAction[];
    const hasReady = queue.some(
      (action) => action.state !== 'syncing' && action.nextAttemptAt <= Date.now(),
    );
    if (hasReady) void flush();
  }, [token, flush]);

  useEffect(() => {
    const handleOnline = () => {
      void flushIfOnline();
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void flushIfOnline();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisible);

    intervalRef.current = setInterval(flushIfOnline, BACKGROUND_SYNC_INTERVAL_MS);
    if (navigator.onLine) void flushIfOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisible);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [flush, flushIfOnline]);

  return { flush };
}
