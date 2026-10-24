import { randomUuid } from '@/lib/uuid';
import type { Mode } from '@/lib/types';
import { isSessionId, MAX_EVENTS_PER_REQUEST, type EventName, type EventProps } from './events';

const ENDPOINT = '/api/events';
const SESSION_KEY = 'hb_session';

/** The events of the last stretch go out together, this often. */
const FLUSH_EVERY_MS = 5000;

/** What an action may say about itself: the song and the mode it happened in, and the few numbers of `EventProps`. */
export interface TrackData {
  youtubeId?: string;
  mode?: Mode;
  props?: EventProps;
}

interface QueuedEvent extends TrackData {
  name: EventName;
}

const queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
// The page is being left: whatever is tracked from now on goes out at once, since there will be no next 5 seconds.
let leaving = false;
let session: string | undefined;

/**
 * This tab's session: a uuid kept in `sessionStorage`, so a page opened again in the same tab (a reload, a link) goes
 * on with it and a new tab or a reopened app starts another. With the storage blocked it lives in memory, for the page.
 */
function sessionId(): string {
  if (session) return session;
  let id: string | undefined;
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (isSessionId(stored)) id = stored;
  } catch {
    // Site data blocked (SecurityError): the session is only kept for this page.
  }
  if (!id) {
    id = randomUuid();
    try {
      window.sessionStorage.setItem(SESSION_KEY, id);
    } catch {
      // Blocked or full: as above.
    }
  }
  session = id;
  return id;
}

/**
 * One request with these events. When the page is going, it is `sendBeacon`, which the browser finishes after the page
 * is gone (same-origin, so the session cookies go along); when the browser will not take the beacon, a `fetch` that is
 * allowed to outlive the page (`keepalive`, which only a request sent as the page goes needs). A failure is not retried:
 * a lost event is a missing number on a panel.
 */
function send(events: QueuedEvent[], beacon: boolean): void {
  const body = JSON.stringify({ sessionId: sessionId(), events });
  if (beacon && typeof navigator.sendBeacon === 'function') {
    if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: beacon,
  }).catch(() => {});
}

/** Sends everything that is waiting, in requests of at most 20 events. */
function flush(beacon: boolean): void {
  clearTimeout(timer);
  timer = undefined;
  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_EVENTS_PER_REQUEST);
    try {
      send(batch, beacon);
    } catch {
      // The storage, the network or the browser failed: these events are lost, and the page does not notice.
    }
  }
}

function onPageHide(): void {
  leaving = true;
  flush(true);
}

function onPageShow(): void {
  leaving = false;
}

// A phone that puts the app away often says only that it is hidden, and never that the page is gone.
function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') flush(true);
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/**
 * Records an action of the app for the owner's panel (`POST /api/events`). The events of 5 seconds are joined in one
 * request, and what is waiting goes out with `sendBeacon` as the page is left or put away.
 *
 * It is for the browser only: on the server it does nothing. It never throws and never waits, so a blocked storage or
 * a network that is down changes nothing for the player.
 */
export function track(name: EventName, data: TrackData = {}): void {
  try {
    if (typeof window === 'undefined') return;
    listen();
    queue.push({ name, youtubeId: data.youtubeId, mode: data.mode, props: data.props });

    if (leaving || document.visibilityState === 'hidden') flush(true);
    else if (queue.length >= MAX_EVENTS_PER_REQUEST) flush(false);
    else timer ??= setTimeout(() => flush(false), FLUSH_EVERY_MS);
  } catch {
    // Metrics are never worth a broken game.
  }
}
