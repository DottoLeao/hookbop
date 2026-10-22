/** What Chrome and the other Chromium browsers send when the app can be installed. Not in TypeScript's DOM types yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// The browser sends the offer once, early, and the install prompt only shows after a song was finished, on the home
// page. So the offer is kept here, where it survives moving between pages without a reload.
let offer: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const subscriber of subscribers) subscriber();
}

/**
 * Starts keeping the browser's install offer, and holds back the browser's own banner so the app can ask in its own
 * words, at the right moment. Gives back the function that stops.
 */
export function listenForInstallEvent(): () => void {
  const onOffer = (event: Event) => {
    event.preventDefault();
    offer = event as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = () => clearInstallEvent();

  window.addEventListener('beforeinstallprompt', onOffer);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onOffer);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** The offer, or null when the browser has not made one (or it was used, or the app got installed). */
export function getInstallEvent(): BeforeInstallPromptEvent | null {
  return offer;
}

/** Forgets the offer. An offer can be used only once. */
export function clearInstallEvent(): void {
  if (offer === null) return;
  offer = null;
  notify();
}

/** For useSyncExternalStore. */
export function subscribeInstallEvent(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}
