/* Aria offline shell. Keep this byte-light; it is served with no-store. */

const CACHE_NAME = 'aria-shell-v13';
const SHELL_KEY = '/';

// The shell itself is deliberately absent: it is fetched above and only stored
// when it passes isAriaShell, so a portal cannot overwrite the fallback here.
const SHELL_PATHS = [
  '/manifest.webmanifest',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

/**
 * The shell we ship ourselves, not the one we fetch.
 *
 * An installed app has no address bar and no reload button, so there is no
 * second chance if the very first navigation answers with nothing. This is
 * what stands behind the cache: valid HTML, the theme colours the pre-mount
 * script expects, and enough of a message that a blank window can explain
 * itself instead of looking broken.
 */
const OFFLINE_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#ffffff" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <title>Aria</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="/logo.svg" />
    <style>
      /* Values are the app's own tokens, copied in: this document can be
         served with no network at all, so it cannot ask styles.css for them. */
      :root {
        color-scheme: light dark;
        --canvas: #f6f7f9; --bg: #ffffff; --ink: #111318; --muted: #6e7482;
        --brand: #0f8a65; --brand-ink: #ffffff;
      }
      :root[data-theme='dark'] {
        color-scheme: dark;
        --canvas: #050608; --bg: #0b0c10; --ink: #f3f4f6; --muted: #808696;
        --brand: #26b888; --brand-ink: #061711;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme='light']) {
          color-scheme: dark;
          --canvas: #050608; --bg: #0b0c10; --ink: #f3f4f6; --muted: #808696;
          --brand: #26b888; --brand-ink: #061711;
        }
      }
      html, body { margin: 0; min-height: 100%; background: var(--canvas); }
      body { color: var(--ink); font: 400 16px/1.5 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
      #root {
        display: grid; gap: 12px; justify-items: center; place-content: center;
        min-height: 100dvh; padding: 32px; text-align: center;
      }
      strong { font-size: 18px; }
      p { margin: 0; max-width: 34ch; color: var(--muted); }
      button {
        margin-top: 4px; padding: 12px 22px; border: 0; border-radius: 999px;
        background: var(--brand); color: var(--brand-ink);
        font: 650 15px/1 Inter, system-ui, sans-serif; cursor: pointer;
      }
    </style>
    <script>
      try {
        var pref = localStorage.getItem('aria.theme');
        var dark = pref === 'dark' ||
          (pref === 'system' && window.matchMedia &&
           window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      } catch (_e) {}
    </script>
  </head>
  <body>
    <div id="root">
      <strong>Aria could not load</strong>
      <p id="aria-shell-note">You appear to be offline. Reconnect and try again.</p>
      <button type="button" onclick="location.reload()">Try again</button>
    </div>
  </body>
</html>`;

/** Marks "this is the shell we shipped, not the app", so it can be told apart later. */
const FALLBACK_HEADER = 'x-aria-shell';

const shellResponse = (note) =>
  new Response(
    note
      ? OFFLINE_SHELL.replace(
          'id="aria-shell-note">You appear to be offline. Reconnect and try again.',
          `id="aria-shell-note">${note}`,
        )
      : OFFLINE_SHELL,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        [FALLBACK_HEADER]: '1',
      },
    },
  );

const urlOf = (req) => (typeof req === 'string' ? req : req.url);

/** Every cache key is absolute, so a lookup can never miss on a relative form. */
const abs = (u) => new URL(u, self.location.href).href;
const SHELL_KEY_URL = abs(SHELL_KEY);

/**
 * What each precached path is allowed to be. A captive portal answers 200 with
 * HTML for *every* URL, so without this the icon and manifest slots end up
 * holding a login page — which is a broken app that still thinks it is cached.
 */
const expectedType = (pathname) => {
  if (pathname === '/' || pathname.endsWith('.html')) return 'text/html';
  if (pathname.endsWith('.webmanifest')) return 'application/manifest+json';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) return 'javascript';
  if (pathname.endsWith('.css')) return 'text/css';
  return null;
};

const sameOrigin = (u) => {
  try {
    return new URL(u, self.location.href).origin === self.location.origin;
  } catch {
    return false;
  }
};

/** Navigations are addressed by path: query strings would grow the cache forever. */
const navigationKey = (u) => {
  try {
    const url = new URL(u, self.location.href);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return SHELL_KEY;
  }
};

/**
 * Is this response Aria's shell, or somebody else's HTML that happens to be 200?
 *
 * A sleeping container answers with the host's 502 page; a coffee-shop network
 * answers with a captive-portal login. Both are 200-or-better HTML from the
 * same fetch, and caching either one as "the app" turns a one-off bad network
 * into a permanently broken icon.
 */
const isAriaShell = async (res) => {
  if (!res || !res.ok) return false;
  if (res.type === 'opaque' || res.type === 'opaqueredirect') return false;
  if (res.url && !sameOrigin(res.url)) return false;
  const type = res.headers.get('content-type') || '';
  if (type && !type.includes('text/html')) return false;
  try {
    return (await res.clone().text()).includes('id="root"');
  } catch {
    return false;
  }
};

const putIfOk = async (cache, pathname, fetcher) => {
  try {
    const res = await fetcher();
    if (!res || !res.ok) return;
    const want = expectedType(pathname);
    const got = res.headers.get('content-type') || '';
    if (want && got && !got.includes(want)) return;
    await cache.put(abs(pathname), res.clone());
  } catch {
    /* one missing asset is not a failed install */
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Ship the fallback first so a launch can never answer with nothing.
      await cache.put(SHELL_KEY_URL, shellResponse());

      // Then the real shell and the exact bundles it points at. The hashed
      // asset names only exist inside the HTML, so read them out of it.
      try {
        const doc = await fetch('/', { cache: 'no-store' });
        if (await isAriaShell(doc)) {
          const html = await doc.clone().text();
          await cache.put(SHELL_KEY_URL, doc.clone());
          const refs = new Set();
          for (const m of html.matchAll(/(?:src|href)\s*=\s*["'](\/assets\/[^"'\s]+)["']/g)) {
            refs.add(new URL(m[1], self.location.href).href);
          }
          await Promise.all(
            [...refs].map((u) =>
              putIfOk(cache, new URL(u).pathname, () => fetch(u, { cache: 'no-store' })),
            ),
          );
        }
      } catch {
        /* the fallback shell is already in place */
      }

      await Promise.all(
        SHELL_PATHS.map((pathname) =>
          putIfOk(cache, pathname, () => fetch(pathname, { cache: 'no-store' })),
        ),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * The whole reason this worker has to be careful.
 *
 * In a browser tab a failed navigation still shows Chrome's own error page, so
 * "the site is down" is survivable. In an installed window that page does not
 * exist: whatever this function resolves to is the entire app. So it always
 * resolves to a Response, and that Response is always Aria's.
 */
const handleNavigation = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const key = navigationKey(urlOf(request));

  let response = null;
  try {
    response = await fetch(request, { cache: 'no-store' });
  } catch {
    response = null;
  }

  if (await isAriaShell(response)) {
    const copy = response.clone();
    await Promise.all([
      cache.put(SHELL_KEY_URL, response.clone()).catch(() => {}),
      cache.put(key, copy).catch(() => {}),
    ]);
    return response;
  }

  /*
   * Host error page, captive portal, opaque redirect, or nothing at all.
   *
   * Prefer a real cached shell — the app boots and shows its own offline state,
   * which is a far better answer than a message. Only fall through to the
   * shipped shell when that is all there is, and then say which kind of failure
   * this actually was: no signal reads differently from a server that is down.
   */
  const fromCache = (await cache.match(key)) || (await cache.match(SHELL_KEY_URL));
  if (fromCache && fromCache.headers.get(FALLBACK_HEADER) !== '1') return fromCache;

  return shellResponse(
    response
      ? 'Aria could not reach its server. Check the connection and try again.'
      : undefined,
  );
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname === '/sw.js') return;
  if (url.pathname === '/manifest.webmanifest') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/auth/')) return;
  if (url.pathname.startsWith('/.well-known/')) return;
  if (url.pathname.startsWith('/downloads/')) return;
  // Do not cache or rewrite OAuth redirects — the browser must handle the callback.
  if (
    url.searchParams.has('code') ||
    url.searchParams.has('relay') ||
    url.searchParams.has('error') ||
    url.searchParams.has('error_description')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const network = fetch(request, { cache: 'no-store' })
        .then(async (res) => {
          if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
            await cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => null);
      return cached || network || Response.error();
    })(),
  );
});
