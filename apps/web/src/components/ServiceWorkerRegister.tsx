'use client';

import { useEffect } from 'react';

/** Registers the offline service worker and surfaces sync status. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration failure must not break the app */
      });
    }

    function ping() {
      window.dispatchEvent(new CustomEvent('edunet:connectivity', { detail: navigator.onLine }));
    }
    window.addEventListener('online', ping);
    window.addEventListener('offline', ping);
    return () => {
      window.removeEventListener('online', ping);
      window.removeEventListener('offline', ping);
    };
  }, []);

  return null;
}
