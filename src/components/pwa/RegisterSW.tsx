'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker (public/sw.js), which keeps the pages and static files for a visit with no network.
 * Only in the production build: in development a cached page or script would hide the code being edited.
 * Draws nothing.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // updateViaCache: 'none' makes the browser look for a new sw.js on every visit, not only when its HTTP cache expires.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Working offline is an extra. If the browser refuses (private mode, blocked site data), the app works as always.
    });
  }, []);
  return null;
}
