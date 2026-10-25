'use client';

import { useCallback, useEffect } from 'react';
import {
  createLocalStorageAdapter,
  flushQueue,
  type ActionSender,
  type OfflineAction,
  type SyncResult,
} from '@edunet/offline';
import { useAuth } from '@edunet/auth';
import { apiUrl } from '@/lib/api-url';

export function useOfflineSync(): { flush: () => Promise<SyncResult> } {
  const { token } = useAuth();

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
        throw new Error(`Offline sync failed for ${action.id}`);
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
    return result;
  }, [send, token]);

  useEffect(() => {
    const handleOnline = () => {
      void flush();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [flush]);

  return { flush };
}
