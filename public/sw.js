/**
 * Aria Service Worker — PWA & Google Play Trusted Web Activity (TWA) shell cache.
 *
 * - Never intercepts /api/*, /auth/*, /.well-known/*, or OAuth callback navigations.
 * - Uses network-first for HTML navigations (caching only HTTP 200 OK responses)
 *   and stale-while-revalidate for static assets.
 */

const CACHE_NAME = 'aria-shell-v11';
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((u) =>
            fetch(u, { cache: 'no-cache' }).then((res) => (res.ok ? cache.put(u, res) : undefined)),
          ),
        ),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API, OAuth routes/callbacks, service worker script, or Digital Asset Links
  if (
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/.well-known/') ||
    url.searchParams.has('code') ||
    url.searchParams.has('relay') ||
    url.searchParams.has('error') ||
    url.searchParams.has('error_description')
  ) {
    return;
  }

  // Network-first (bypassing browser HTTP cache) for HTML navigations so deploys appear immediately.
  // Only cache HTTP 200 OK HTML responses so transient 502/503 deploy pages never poison the cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async (response) => {
          if (response && response.ok && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
            return response;
          }
          if (response && response.status >= 500) {
            const cached = await caches.match('/');
            if (cached) return cached;
          }
          return response;
        })
        .catch(() => caches.match('/') || caches.match(request)),
    );
    return;
  }

  // Stale-while-revalidate for local static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    }),
  );
});
