/**
 * Runs the real service worker (public/sw.js) inside a mocked
 * ServiceWorkerGlobalScope and asserts what it actually does.
 *
 * Why this exists: an installed PWA has no address bar and no reload button, so
 * a navigation the worker answers badly is a dead white screen — while the same
 * failure in a browser tab still shows the browser's own error page. Nothing
 * else in this repo exercises that path.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

const ORIGIN = 'https://aria.example';
const SW_PATH = path.join(process.cwd(), 'public', 'sw.js');

class MockResponse {
  constructor(body = '', init = {}) {
    this.body = String(body);
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.type = init.type ?? 'basic';
    this.url = init.url ?? '';
    const headers = {};
    for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
    this._headers = headers;
    this.headers = { get: (k) => this._headers[String(k).toLowerCase()] ?? null };
  }
  clone() {
    return new MockResponse(this.body, {
      status: this.status,
      type: this.type,
      url: this.url,
      headers: { ...this._headers },
    });
  }
  async text() {
    return this.body;
  }
}
MockResponse.error = () => new MockResponse('', { status: 0, type: 'error' });

const keyOf = (req) => new URL(typeof req === 'string' ? req : req.url, `${ORIGIN}/`).href;

function makeCaches() {
  const store = new Map();
  return {
    store,
    entries: () => [...store.values()].flatMap((b) => [...b.entries()]),
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const bucket = store.get(name);
      return {
        put: async (req, res) => bucket.set(keyOf(req), res),
        match: async (req) => bucket.get(keyOf(req)) ?? undefined,
      };
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name) {
      return store.delete(name);
    },
    async match(req) {
      for (const bucket of store.values()) {
        const hit = bucket.get(keyOf(req));
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

/** Boots public/sw.js in a sandbox and returns the listeners it registered. */
function bootWorker({ handler, caches = makeCaches() } = {}) {
  const listeners = {};

  // Stands in for fetch(): resolves relative URLs against the origin and stamps
  // the final URL onto the response, the way the network stack does.
  const fetchImpl = async (input) => {
    const url = new URL(keyOf(input), `${ORIGIN}/`).href;
    const res = await handler(url);
    if (!res) throw new TypeError('Failed to fetch');
    if (!res.url) res.url = url;
    return res;
  };

  const sandbox = {
    URL,
    URLSearchParams,
    console,
    Response: MockResponse,
    caches,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (type, fn) => {
    (listeners[type] = listeners[type] || []).push(fn);
  };
  sandbox.skipWaiting = async () => {};
  sandbox.clients = { claim: async () => {} };
  sandbox.location = { origin: ORIGIN, href: `${ORIGIN}/sw.js` };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SW_PATH, 'utf8'), sandbox, { filename: SW_PATH });
  return { listeners, caches };
}

async function fire(listeners, type, event) {
  for (const fn of listeners[type] || []) await fn(event);
}

async function install(listeners) {
  const pending = [];
  await fire(listeners, 'install', { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
}

/** Fires a navigation and resolves whatever the worker handed respondWith. */
async function navigate(listeners, pathname = '/') {
  let responded;
  let called = false;
  await fire(listeners, 'fetch', {
    request: { method: 'GET', url: `${ORIGIN}${pathname}`, mode: 'navigate' },
    respondWith: (p) => {
      called = true;
      responded = p;
    },
  });
  if (!called) return { handled: false };
  try {
    return { handled: true, value: await responded };
  } catch (err) {
    return { handled: true, threw: err };
  }
}

const html = (body, status = 200) =>
  new MockResponse(body, { status, headers: { 'content-type': 'text/html' } });

const SHELL_HTML =
  '<!doctype html><html><head>' +
  '<script type="module" src="/assets/index-ABC123.js"></script>' +
  '<link rel="stylesheet" href="/assets/index-ABC123.css">' +
  '</head><body><div id="root"></div></body></html>';

const offline = () => null; // -> fetch rejects

const FULL_SITE = new Map([
  [`${ORIGIN}/`, () => html(SHELL_HTML)],
  [`${ORIGIN}/assets/index-ABC123.js`, () => new MockResponse('console.log(1)', { headers: { 'content-type': 'text/javascript' } })],
  [`${ORIGIN}/assets/index-ABC123.css`, () => new MockResponse('body{}', { headers: { 'content-type': 'text/css' } })],
  [`${ORIGIN}/manifest.webmanifest`, () => new MockResponse('{}', { headers: { 'content-type': 'application/manifest+json' } })],
  [`${ORIGIN}/logo.svg`, () => new MockResponse('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })],
  [`${ORIGIN}/icons/icon-192.png`, () => new MockResponse('png', { headers: { 'content-type': 'image/png' } })],
  [`${ORIGIN}/icons/icon-512.png`, () => new MockResponse('png', { headers: { 'content-type': 'image/png' } })],
  [`${ORIGIN}/icons/icon-maskable-512.png`, () => new MockResponse('png', { headers: { 'content-type': 'image/png' } })],
]);

const siteHandler = (extra = {}) => {
  const routes = new Map(FULL_SITE);
  for (const [k, v] of Object.entries(extra)) routes.set(k, v);
  return async (url) => {
    if (routes.has(url)) return routes.get(url)(url);
    // The Express SPA fallback: any other path is the app shell.
    if (!/\.[a-z0-9]+$/i.test(new URL(url).pathname)) return html(SHELL_HTML);
    return new MockResponse('', { status: 404 });
  };
};

const describe = (res) =>
  res instanceof MockResponse ? `status=${res.status} ${res.body.slice(0, 40)}` : String(res);

/* ------------------------------------------------------------------------ */
console.log('\n1. Launching the installed app with nothing cached and no network');
{
  const { listeners } = bootWorker({ handler: offline });
  await install(listeners);
  const res = await navigate(listeners);
  check(
    'the launch still gets a Response',
    res.handled && res.value instanceof MockResponse,
    res.threw ? `threw ${res.threw.message}` : `respondWith got ${describe(res.value)}`,
  );
  check(
    'that Response is Aria HTML, not an empty body',
    res.value instanceof MockResponse && res.value.body.includes('id="root"'),
    describe(res.value),
  );
}

console.log('\n2. The host returns its 502 page while the container wakes');
{
  const caches = makeCaches();
  const { listeners } = bootWorker({
    caches,
    handler: async () => html('<html><body>502 Bad Gateway</body></html>', 502),
  });
  await install(listeners);
  const res = await navigate(listeners);
  check(
    'the worker never hands the host error page to the app',
    res.value instanceof MockResponse && !res.value.body.includes('502 Bad Gateway'),
    describe(res.value),
  );
  check(
    'the error page is not cached as the app shell',
    !caches.entries().some(([, r]) => r.body.includes('502 Bad Gateway')),
  );
}

console.log('\n3. A captive portal answers 200 with somebody else\'s HTML');
{
  const caches = makeCaches();
  const { listeners } = bootWorker({
    caches,
    handler: async () => html('<html><body>Sign in to Wi-Fi to continue</body></html>'),
  });
  await install(listeners);
  await navigate(listeners);
  check(
    'a non-Aria 200 is not cached as the app shell',
    !caches.entries().some(([, r]) => r.body.includes('Sign in to Wi-Fi')),
    `${caches.entries().length} responses cached`,
  );
}

console.log('\n4. A network redirects the navigation to another origin');
{
  const caches = makeCaches();
  const { listeners } = bootWorker({
    caches,
    handler: async () =>
      new MockResponse('<html><body>Portal</body></html>', {
        url: 'https://portal.example/login',
        type: 'opaqueredirect',
        headers: { 'content-type': 'text/html' },
      }),
  });
  await install(listeners);
  const res = await navigate(listeners);
  check(
    'the cross-origin page is not served as the app',
    res.value instanceof MockResponse && !res.value.body.includes('Portal'),
    describe(res.value),
  );
}

console.log('\n5. Install precaches what the shell actually needs');
{
  const caches = makeCaches();
  const { listeners } = bootWorker({ caches, handler: siteHandler() });
  await install(listeners);
  const urls = caches.entries().map(([u]) => u);
  check('the shell HTML is cached under /', urls.includes(`${ORIGIN}/`), urls.join(' '));
  check(
    'the hashed JS bundle the shell references is cached',
    urls.some((u) => u.includes('/assets/index-ABC123.js')),
    urls.join(' '),
  );
  check(
    'the hashed stylesheet the shell references is cached',
    urls.some((u) => u.includes('/assets/index-ABC123.css')),
    urls.join(' '),
  );
  check('the manifest and icons are cached', urls.some((u) => u.endsWith('/manifest.webmanifest')));
}

console.log('\n6. A good launch, then the network drops');
{
  const caches = makeCaches();
  let online = true;
  const { listeners } = bootWorker({
    caches,
    handler: async (url) => (online && url.startsWith(`${ORIGIN}/`) ? html(SHELL_HTML) : null),
  });
  await install(listeners);
  await navigate(listeners, '/app');
  online = false;
  const res = await navigate(listeners, '/app');
  check(
    'a deep link still opens from cache when offline',
    res.value instanceof MockResponse && res.value.body.includes('id="root"'),
    describe(res.value),
  );
}

console.log('\n7. A fresh deep link with no cache and no network');
{
  const { listeners } = bootWorker({ handler: offline });
  await install(listeners);
  const res = await navigate(listeners, '/songs/42');
  check(
    'an uncached deep link falls back to the shell instead of nothing',
    res.value instanceof MockResponse && res.value.body.includes('id="root"'),
    describe(res.value),
  );
}

console.log('\n8. Cache entries stay bounded');
{
  const caches = makeCaches();
  const { listeners } = bootWorker({ caches, handler: siteHandler() });
  await install(listeners);
  await navigate(listeners, '/songs/1?tab=chords');
  await navigate(listeners, '/songs/1?tab=notes');
  await navigate(listeners, '/songs/2#top');
  const navKeys = caches
    .entries()
    .map(([u]) => u)
    .filter((u) => !u.includes('/assets/') && !/\.(png|svg|webmanifest)$/.test(u));
  check(
    'query strings and hashes do not multiply cache entries',
    navKeys.filter((u) => u.endsWith('/songs/1')).length === 1,
    navKeys.join(' '),
  );
}

console.log('\n9. Static assets never resolve to nothing');
{
  const { listeners } = bootWorker({ handler: offline });
  await install(listeners);
  let responded;
  await fire(listeners, 'fetch', {
    request: { method: 'GET', url: `${ORIGIN}/assets/missing.js` },
    respondWith: (p) => {
      responded = p;
    },
  });
  const value = await responded;
  check('an offline asset miss resolves to a Response', value !== undefined, String(value));
}

console.log('\n10. The fallback shell is presentable and theme-safe');
{
  const { listeners } = bootWorker({ handler: offline });
  await install(listeners);
  const res = await navigate(listeners);
  const body = res.value.body;
  check('it declares a colour scheme', /color-scheme/.test(body));
  check(
    'it follows the device theme',
    body.includes("prefers-color-scheme: dark") && body.includes("[data-theme='dark']"),
  );
  check(
    'it uses the app tokens, not invented colours',
    body.includes('--canvas: #f6f7f9') && body.includes('--brand: #0f8a65'),
  );
  check('it offers a way out', /onclick="location.reload\(\)"/.test(body));
}

console.log('\n11. The message names the actual failure');
{
  // No signal: fetch rejects.
  const offlineWorker = bootWorker({ handler: offline });
  await install(offlineWorker.listeners);
  const noSignal = await navigate(offlineWorker.listeners, '/lineups/9');
  check(
    'no network says you appear to be offline',
    noSignal.value.body.includes('You appear to be offline'),
    noSignal.value.body.match(/<p id="aria-shell-note">[^<]*/)?.[0] || 'no note',
  );

  // Server is up enough to answer, but it is answering 502.
  const downWorker = bootWorker({ handler: async () => html('<html>502 Bad Gateway</html>', 502) });
  await install(downWorker.listeners);
  const down = await navigate(downWorker.listeners, '/lineups/9');
  check(
    'a failing server is not reported as no signal',
    down.value.body.includes('could not reach its server'),
    down.value.body.match(/<p id="aria-shell-note">[^<]*/)?.[0] || 'no note',
  );
}

console.log('\n12. A real cached shell always beats the message');
{
  const caches = makeCaches();
  let online = true;
  const { listeners } = bootWorker({
    caches,
    handler: async (url) => (online ? html(SHELL_HTML) : null),
  });
  await install(listeners);
  await navigate(listeners, '/');
  online = false;
  const res = await navigate(listeners, '/');
  check(
    'the app boots normally offline instead of showing a notice',
    res.value.body.includes('<div id="root"></div>') && !res.value.body.includes('aria-shell-note'),
    res.value.body.slice(0, 80),
  );
}

/* ------------------------------------------------------------------------ */
/* The second half of the same bug: the shell can load and React still never
   mounts. Drive the real inline script from index.html against a stub DOM. */

const INDEX_HTML = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

/** Pulls the boot-watchdog IIFE out of the shipped HTML. */
function watchdogScript() {
  const blocks = [...INDEX_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const found = blocks.find((b) => b.includes('firstElementChild'));
  if (!found) throw new Error('no boot watchdog script found in index.html');
  return found;
}

function runWatchdog({ rootChildren = 0, visibility = 'visible', readyState = 'loading' }) {
  const timers = [];
  let now = 0;
  const listeners = {};
  let observerCb = null;
  let observed = false;

  const root = {
    _children: rootChildren,
    _html: '',
    get firstElementChild() {
      return this._children > 0 ? {} : null;
    },
    set innerHTML(v) {
      this._html = v;
      this._children = v ? 1 : 0;
    },
    get innerHTML() {
      return this._html;
    },
  };

  const sandbox = {
    document: {
      readyState,
      get visibilityState() {
        return visibility;
      },
      getElementById: (id) => (id === 'root' ? root : null),
      addEventListener: (t, fn) => {
        (listeners[t] = listeners[t] || []).push(fn);
      },
    },
    MutationObserver: function (cb) {
      observerCb = cb;
      return {
        observe: () => {
          observed = true;
        },
        disconnect: () => {
          observerCb = null;
        },
      };
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, at: now + ms });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].fn = null;
    },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(watchdogScript(), sandbox, { filename: 'index.html#watchdog' });

  // The script defers to DOMContentLoaded while the document is still loading.
  for (const fn of listeners.DOMContentLoaded || []) fn();

  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      const due = timers
        .filter((t) => t && t.fn && t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      const fn = due.fn;
      due.fn = null;
      fn();
    }
    now = target;
  };

  return {
    root,
    advance,
    mount: () => {
      root._children = 1;
      if (observerCb) observerCb();
    },
    isObserving: () => observed,
    pendingTimers: () => timers.filter((t) => t && t.fn).length,
    fireVisibility: (state) => {
      visibility = state;
      for (const fn of listeners.visibilitychange || []) fn();
    },
  };
}

console.log('\n13. The boot watchdog in index.html');
{
  const ok = runWatchdog({ readyState: 'interactive' });
  ok.advance(15000);
  check(
    'nothing is shown while the app is still loading',
    !ok.root.innerHTML && ok.pendingTimers() > 0,
    ok.root.innerHTML.slice(0, 60),
  );
  ok.mount();
  check('the mount clears the pending timer', ok.pendingTimers() === 0);
  ok.advance(60000);
  check('a normal mount cancels the watchdog', !ok.root.innerHTML);
}

{
  const stuck = runWatchdog({ readyState: 'interactive' });
  stuck.advance(60000);
  check('a boot that never happens says so', stuck.root.innerHTML.includes("didn&#39;t start") || stuck.root.innerHTML.includes('start'), stuck.root.innerHTML.slice(0, 80));
  check(
    'it offers a reload',
    stuck.root.innerHTML.includes('location.reload()'),
  );
}

{
  const late = runWatchdog({ readyState: 'interactive' });
  late.mount();
  late.advance(60000);
  check('a mount before the deadline wins', !late.root.innerHTML);
}

{
  const already = runWatchdog({ rootChildren: 1, readyState: 'interactive' });
  check('an already-mounted root is left alone', already.pendingTimers() === 0 && !already.root.innerHTML);
}

{
  const bg = runWatchdog({ readyState: 'interactive', visibility: 'hidden' });
  bg.advance(60000);
  check('a background launch is not failed', !bg.root.innerHTML, bg.root.innerHTML.slice(0, 60));
  bg.fireVisibility('visible');
  bg.advance(60000);
  check('it only fails once someone is actually looking', bg.root.innerHTML.includes('Try again'));
}

/* ------------------------------------------------------------------------ */
/* The precache reads bundle names out of the shell with a regex. Run the
   shipped regex against the shipped HTML, or the offline path is a guess. */

console.log('\n14. The shipped precache regex matches the shipped shell');
{
  const sw = fs.readFileSync(SW_PATH, 'utf8');
  const start = sw.indexOf('/(?:src|href)');
  const end = sw.indexOf('/g', start);
  const source = sw.slice(start, end + 2);

  const distHtml = path.join(process.cwd(), 'dist', 'index.html');
  if (!fs.existsSync(distHtml)) {
    console.log('  · dist/index.html not built — skipping (run `npm run build`)');
  } else {
    const doc = fs.readFileSync(distHtml, 'utf8');
    const re = new RegExp(source.slice(1, source.lastIndexOf('/')), source.slice(source.lastIndexOf('/') + 1));
    const found = [...doc.matchAll(re)].map((m) => m[1]);
    const bundles = [...doc.matchAll(/\/assets\/[\w.-]+/g)].map((m) => m[0]);
    check('the shell references hashed bundles at all', bundles.length > 0, doc.slice(0, 120));
    check(
      'every hashed bundle the shell loads is discoverable by the worker',
      bundles.every((b) => found.includes(b)),
      `shell=${bundles.join(' ')} found=${found.join(' ')}`,
    );
  }
}

console.log('\n15. OAuth callbacks are left entirely alone');
{
  const { listeners } = bootWorker({ handler: siteHandler() });
  await install(listeners);
  for (const qs of ['?code=abc&state=x', '?relay=1', '?error=access_denied', '?error_description=nope']) {
    let intercepted = false;
    await fire(listeners, 'fetch', {
      request: { method: 'GET', url: `${ORIGIN}/${qs}`, mode: 'navigate' },
      respondWith: () => {
        intercepted = true;
      },
    });
    check(`a ${qs.split('=')[0]} navigation is not intercepted`, !intercepted);
  }
}

console.log('\n16. A portal cannot poison an asset slot either');
{
  const caches = makeCaches();
  const { listeners } = bootWorker({
    caches,
    handler: async (url) =>
      url.endsWith('.js') || url.endsWith('.css')
        ? html('<html><body>Sign in to Wi-Fi</body></html>')
        : siteHandler()(url),
  });
  await install(listeners);
  const poisoned = caches
    .entries()
    .filter(([u, r]) => /\/assets\//.test(u) && r.body.includes('Sign in to Wi-Fi'))
    .map(([u]) => u);
  check(
    'HTML served as a JS bundle is refused',
    poisoned.length === 0,
    poisoned.join(' '),
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);


