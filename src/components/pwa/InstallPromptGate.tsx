'use client';

import { useState, useSyncExternalStore } from 'react';
import { clearInstallEvent, getInstallEvent, subscribeInstallEvent } from '@/lib/pwa/installEvent';
import { dismissInstallPrompt, installPromptDue } from '@/lib/pwa/installPromptState';
import { detectPlatform, isStandalone, type Platform } from '@/lib/pwa/platform';
import { InstallPrompt } from './InstallPrompt';

// What the browser is and how the app was opened do not change while a page is open, so there is nothing to subscribe to.
const never = () => () => {};
// While the page is built on the server, nothing is due: the prompt appears after it reaches the browser.
const onServer: Platform = 'other';

/**
 * Puts the install prompt on the page when its time has come: after the player finished a first song, unless they said
 * "Agora não", and not when the app is already installed. Everything it needs comes from the browser, so on the server
 * (and for the first paint of the page) it draws nothing.
 */
export function InstallPromptGate() {
  const platform = useSyncExternalStore(never, detectPlatform, () => onServer);
  const standalone = useSyncExternalStore(never, isStandalone, () => true);
  const due = useSyncExternalStore(never, installPromptDue, () => false);
  const offer = useSyncExternalStore(subscribeInstallEvent, getInstallEvent, () => null);
  const [hidden, setHidden] = useState(false);

  if (!due || hidden) return null;

  function dismiss() {
    dismissInstallPrompt();
    setHidden(true);
  }

  async function install() {
    const event = getInstallEvent();
    if (!event) return;
    // An offer can be used once. Forgetting it also hides the button, and the browser takes over from here.
    clearInstallEvent();
    try {
      await event.prompt();
      const choice = await event.userChoice;
      // Cancelling the browser's dialog is the same answer as "Agora não".
      if (choice.outcome === 'dismissed') dismissInstallPrompt();
    } catch {
      // The browser refused to open its dialog. The offer is gone; the browser menu still has "Instalar app".
    }
    setHidden(true);
  }

  return (
    <InstallPrompt
      platform={platform}
      standalone={standalone}
      onInstall={offer ? install : undefined}
      onDismiss={dismiss}
    />
  );
}
