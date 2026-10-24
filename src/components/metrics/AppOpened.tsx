'use client';

import { useEffect } from 'react';
import { track } from '@/lib/metrics/track';

const OPENED_KEY = 'hb_app_opened';

// Set on the first page of a page load. Keeps a second page of the app, reached without a reload, from counting again
// when the storage cannot remember it.
let toldThisPage = false;

/**
 * Whether this is the first time the session opens the app. A session is a tab (or an installed app opened from the home
 * screen): `sessionStorage` is the same for every page it shows and for a reload, and new for the next opening. With the
 * storage blocked, it is once for the page.
 */
function firstOpening(): boolean {
  if (toldThisPage) return false;
  toldThisPage = true;
  try {
    if (window.sessionStorage.getItem(OPENED_KEY) !== null) return false;
    window.sessionStorage.setItem(OPENED_KEY, '1');
  } catch {
    // Site data blocked: counted once for this page.
  }
  return true;
}

/**
 * Tells the owner's panel (`app_opened`) that a member opened the app, once per session. It draws nothing. It sits in
 * the pages a member can open the app on (the home page and a song), not in the root layout, which the sign-in page
 * shares: there nobody is a member yet, and the opening would be spent on a request that is turned away.
 */
export function AppOpened() {
  useEffect(() => {
    if (firstOpening()) track('app_opened');
  }, []);
  return null;
}
