'use client';

import { useEffect } from 'react';

/**
 * Takes away every service worker of this origin. A production build served on localhost (`next start`, the offline
 * e2e test) leaves its worker behind, and that worker would then serve cached pages and scripts to a later `next dev`
 * on the same port, hiding the code being edited. Nothing comes of a failure: there was nothing to take away.
 */
async function unregisterAll(container: ServiceWorkerContainer): Promise<void> {
  try {
    const registrations = await container.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  } catch {
    // Site data blocked, or no access to the registrations: nothing to clean up.
  }
}

/**
 * Registers the service worker (public/sw.js), which keeps the pages and static files for a visit with no network.
 * Only in the production build: in development a cached page or script would hide the code being edited, so there it
 * takes away any worker an earlier production run left. Draws nothing.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      void unregisterAll(navigator.serviceWorker);
      return;
    }
    // updateViaCache: 'none' makes the browser look for a new sw.js on every visit, not only when its HTTP cache expires.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Working offline is an extra. If the browser refuses (private mode, blocked site data), the app works as always.
    });
  }, []);
  return null;
}
