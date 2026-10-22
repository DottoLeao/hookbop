'use client';

import { useEffect } from 'react';
import { listenForInstallEvent } from '@/lib/pwa/installEvent';

/**
 * Sits in the root layout so the browser's install offer is caught on whatever page it arrives, and is still there when
 * the install prompt shows on the home page. Draws nothing.
 */
export function InstallEventCapture() {
  useEffect(() => listenForInstallEvent(), []);
  return null;
}
