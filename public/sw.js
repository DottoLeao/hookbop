/* Hookbop service worker: lets a member open the app with no network.
 *
 * A plain script that the browser runs on its own, so it cannot import anything from src/. It is tested by running
 * this very file in a sandbox (src/lib/pwa/sw.test.ts); swStrategy and isCacheableResponse are plain top-level
 * functions so the tests can reach them.
 *
 * What it does, from ruling R76:
 *  - Only same-origin GET requests. Everything else is left to the browser: YouTube, youtube-nocookie, lrclib.net,
 *    Supabase and Google never pass through the cache.
 *  - Pages (navigations): network first. With no network, the copy of that page, else the copy of "/", else a 503.
 *    Pages are kept even though Next.js sends the dynamic ones with Cache-Control: no-store (ruling R86): the spec asks
 *    for the app to open with no network, and every member page is dynamic. What makes that safe is the list of what
 *    is never kept, below, which leaves out every page that carries a session, an invite code or a one-time redirect.
 *  - /_next/static/* and /icons/*: cache first. The names under /_next/static change when their content does. The
 *    names under /icons do not: after running `npm run icons` (scripts/make-icons.mjs) again, bump CACHE_NAME below,
 *    or the copies already kept go on being served.
 *  - Never kept: /api, /auth, /compartilhar, /convite, /convidar, /entrar and /admin. These carry sessions, invite
 *    codes and one-time redirects, and a copy of them could outlive the person who asked for them.
 *  - A response is only kept when it is a 200 from this site and not a redirect. */

'use strict';

// Bump the version to throw away everything kept by earlier versions of this file, and whenever the icons change.
const CACHE_PREFIX = 'hookbop-';
const CACHE_NAME = CACHE_PREFIX + 'v1';

const NEVER_CACHED = ['/api', '/auth', '/compartilhar', '/convite', '/convidar', '/entrar', '/admin'];
const STATIC_FOLDERS = ['/_next/static/', '/icons/'];

/** What to do with a request: 'network-first' (pages), 'cache-first' (static files) or 'bypass' (not ours). */
function swStrategy(url, request, origin) {
  if (request.method !== 'GET') return 'bypass';
  if (url.origin !== origin) return 'bypass';

  // Compared as the server will read it: decoded and in lower case, so /%61pi/ and /API/ are not a way around the list.
  let path;
  try {
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return 'bypass';
  }
  if (NEVER_CACHED.some((root) => path === root || path.startsWith(root + '/'))) return 'bypass';

  if (STATIC_FOLDERS.some((folder) => path.startsWith(folder))) return 'cache-first';
  if (request.mode === 'navigate') return 'network-first';
  return 'bypass';
}

/** True for a plain 200 from this site that did not come through a redirect: the only kind that is kept. */
function isCacheableResponse(response) {
  return response.status === 200 && response.type === 'basic' && !response.redirected;
}

function remember(event, request, response) {
  if (!isCacheableResponse(response)) return;
  // The copy is taken now, before the page starts reading the body. A copy that cannot be kept (no room) is no reason
  // to fail the request.
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, copy))
      .catch(() => {}),
  );
}

async function networkFirst(event) {
  try {
    const response = await fetch(event.request);
    remember(event, event.request, response);
    return response;
  } catch {
    // The network is out. The Vary header of a page changes with the navigation, so it is ignored when looking.
    const cache = await caches.open(CACHE_NAME);
    const lookup = { ignoreVary: true };
    return (
      (await cache.match(event.request, lookup)) ||
      (await cache.match('/', lookup)) ||
      new Response(null, { status: 503, statusText: 'Service Unavailable' })
    );
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(CACHE_NAME);
  const kept = await cache.match(event.request);
  if (kept) return kept;
  const response = await fetch(event.request);
  remember(event, event.request, response);
  return response;
}

// Taking over at once is safe: the worker precaches nothing, so no page depends on a set of files that must match
// this version. It also means the first visit is already covered, and a new version does not wait for every open
// window of the installed app to close, which on a phone can be never.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const strategy = swStrategy(new URL(event.request.url), event.request, self.location.origin);
  if (strategy === 'network-first') event.respondWith(networkFirst(event));
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(event));
});
