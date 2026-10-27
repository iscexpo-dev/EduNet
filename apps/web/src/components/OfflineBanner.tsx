'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createLocalStorageAdapter, STORAGE_KEY, type OfflineAction } from '@edunet/offline';
import { useI18n } from '@/lib/i18n';
import { useOfflineSync } from '@/hooks/useOfflineSync';

/** Non-blocking connectivity banner with the number of queued changes. */
export function OfflineBanner() {
  const { t } = useI18n();
  useOfflineSync();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const adapter = createLocalStorageAdapter(localStorage);
    const refresh = () => {
      setOnline(navigator.onLine);
      const queue = adapter.read() as OfflineAction[];
      setPending(queue.filter((action) => action.state !== 'syncing').length);
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    const onQueue = () => refresh();
    window.addEventListener('edunet:queue-changed', onQueue);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('edunet:queue-changed', onQueue);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
    >
      <span>{online ? t('offline.pending', { count: pending }) : t('common.offline')}</span>{' '}
      <Link href="/offline/queue" className="font-medium underline underline-offset-2">
        Review queue
      </Link>
    </div>
  );
}

export { STORAGE_KEY };
