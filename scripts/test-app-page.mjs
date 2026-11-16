/**
 * Checks the public /app page and its Android download plumbing:
 *   1. /app is reachable without a session and the bundle carries the page copy
 *   2. /api/app/release reports the HTTP-404-with-publishing fallback when no APK exists
 *   3. With an APK present the endpoint reports size / sha256 / version and the file downloads
 *   4. Each download is counted, and the counter is public only to signed-in callers
 *   5. /downloads/aria.apk serves the package with the right content type
 *   6. the mirror path: a remote URL is fetched once, cached, and served locally
 *   7. a mirror that returns HTML instead of a package is rejected, not served
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

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

async function waitReady(baseUrl) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) return;
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server failed to start');
}

function startServer(port, dataDir, extraEnv = {}) {
  return spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      ARIA_STORAGE: 'file',
      ARIA_AUTH: 'demo',
      ARIA_DATA_DIR: dataDir,
      ARIA_DATA_FILE: path.join(dataDir, 'data.json'),
      ARIA_AUTH_FILE: path.join(dataDir, 'auth.json'),
      ...extraEnv,
    },
    stdio: 'ignore',
  });
}

async function stop(proc) {
  proc.kill('SIGTERM');
  await new Promise((r) => proc.once('exit', r));
}

async function withServer(port, run, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-app-'));
  const proc = startServer(port, dir, extraEnv);
  try {
    await waitReady(`http://127.0.0.1:${port}`);
    await run(`http://127.0.0.1:${port}`, dir);
  } finally {
    await stop(proc);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Small local stand-in for the Google Drive host. */
function startFixtureServer() {
  const zip = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(9000, 9)]);
  let hits = 0;
  const htmlPage = Buffer.from('<html><body>quota exceeded</body></html>');
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/package.apk')) {
      hits += 1;
      res.writeHead(200, { 'content-length': zip.length, 'content-type': 'application/octet-stream' });
      return res.end(zip);
    }
    if (req.url.startsWith('/not-a-package')) {
      hits += 1;
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(htmlPage);
    }
    res.writeHead(404);
    return res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, zip, base: `http://127.0.0.1:${server.address().port}`, hits: () => hits }),
    );
  });
}

async function run() {
  console.log('\nAria · public app page & Android download\n');

  const fixture = await startFixtureServer();

  /* ---------------------------------------- 1. page + bundle without an APK */
  await withServer(5179, async (base) => {
    console.log('1. Public /app page (no APK published)');
    const res = await fetch(`${base}/app`);
    check('/app returns 200 without a session', res.status === 200);

    const bundle = fs
      .readdirSync(path.join(process.cwd(), 'dist', 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(process.cwd(), 'dist', 'assets', f), 'utf8'))
      .join('\n');
    check('bundle ships the page headline', bundle.includes('Setlists that read the lyric first.'));
    check('page explains the three parts', bundle.includes('How Aria works') && bundle.includes('What is inside'));
    check('page offers the no-download path', bundle.includes('Add Aria to your Home Screen') || bundle.includes('Install without a download'));
    check('login screen links to the page', bundle.includes('Get the app'));

    const release = await (await fetch(`${base}/api/app/release`)).json();
    check('release endpoint reports availability honestly', release.available === false);
    check('release falls back to the web install', release.installType === 'pwa' && release.url === null);
    check('anonymous callers do not see the download counter', release.downloads === null);

    const missing = await fetch(`${base}/api/app/download`);
    check('download endpoint 404s cleanly with no build', missing.status === 404);
    const staticMissing = await fetch(`${base}/downloads/aria.apk`);
    check('/downloads/aria.apk 404s cleanly with no build', staticMissing.status === 404);
  });

  /* ------------------------------------------------- 2. with an APK present */
  const apkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-apk-'));
  const apkFile = path.join(apkDir, 'aria.apk');
  const payload = Buffer.concat([
    Buffer.from('PK\u0003\u0004'), // zip magic, enough to look like a package
    Buffer.alloc(4096, 7),
  ]);
  fs.writeFileSync(apkFile, payload);

  await withServer(
    5180,
    async (base, dataDir) => {
      console.log('\n2. Android package published');
      const release = await (await fetch(`${base}/api/app/release`)).json();
      check('release reports the package as available', release.available === true);
      check('release exposes size, digest and url', release.sizeBytes === payload.length && /^[0-9a-f]{64}$/.test(release.sha256) && release.url === '/downloads/aria.apk');
      check('release uses the configured version', release.version === '1.4.2');
      check('release is typed as an apk install', release.installType === 'apk');

      const dl = await fetch(`${base}/api/app/download`);
      const bytes = Buffer.from(await dl.arrayBuffer());
      check('API download serves the package', dl.status === 200 && bytes.length === payload.length);
      check(
        'API download uses the Android content type',
        (dl.headers.get('content-type') || '').includes('android.package-archive'),
      );
      check('download counter increments', dl.headers.get('x-aria-download') === '1');

      const staticDl = await fetch(`${base}/downloads/aria.apk`);
      check('/downloads/aria.apk serves the same bytes', staticDl.status === 200 && (await staticDl.arrayBuffer()).byteLength === payload.length);
      check(
        'static download is offered as a file attachment',
        (staticDl.headers.get('content-disposition') || '').includes('aria.apk'),
      );

      const counts = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'apk-downloads.json'), 'utf8'),
      );
      check('the counter is persisted next to the data set', counts.total === 1);

      /* signed-in callers see the counter */
      const reg = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Page Check', email: 'page-check@example.com', password: 'password123' }),
      });
      const { token } = await reg.json();
      const authed = await (
        await fetch(`${base}/api/app/release`, { headers: { Authorization: `Bearer ${token}` } })
      ).json();
      check('signed-in callers see the download count', authed.downloads === 1);
    },
    { ARIA_APK_FILE: apkFile, ARIA_APK_VERSION: '1.4.2' },
  );

  fs.rmSync(apkDir, { recursive: true, force: true });

  /* --------------------------------------------------- 3. mirroring a URL */
  console.log('\n3. Mirrored package (ARIA_APK_URL)');
  const expected = crypto.createHash('sha256').update(fixture.zip).digest('hex');
  await withServer(
    5181,
    async (base, dataDir) => {
      const release = await (await fetch(`${base}/api/app/release`)).json();
      check('a remote package is mirrored and reported available', release.available === true && release.source === 'mirror');
      check('mirrored size and digest match the source', release.sizeBytes === fixture.zip.length && release.sha256 === expected);
      check('the package is cached on disk', fs.existsSync(path.join(dataDir, 'apk-cache', 'aria.apk')));

      const dl = await fetch(`${base}/downloads/aria.apk`);
      const bytes = Buffer.from(await dl.arrayBuffer());
      check('the mirrored package downloads byte for byte', dl.status === 200 && bytes.equals(fixture.zip));
      check('the mirror is fetched once, not per request', fixture.hits() === 1);

      const counted = await fetch(`${base}/api/app/download`);
      check('mirrored downloads are counted too', counted.headers.get('x-aria-download') === '1');
    },
    { ARIA_APK_URL: `${fixture.base}/package.apk` },
  );

  /* ------------------------------------------- 4. a bad mirror is rejected */
  console.log('\n4. Mirror guard');
  await withServer(
    5182,
    async (base, dataDir) => {
      const release = await (await fetch(`${base}/api/app/release`)).json();
      check('an HTML page from the mirror is not treated as a package', release.available === false);
      check('the failure is reported, not hidden', release.mirrorStatus === 'failed' && /package/i.test(release.mirrorError || ''));
      check('nothing bogus is written to the cache', !fs.existsSync(path.join(dataDir, 'apk-cache', 'aria.apk')));
      const dl = await fetch(`${base}/downloads/aria.apk`);
      check('the download stays 404 after a bad mirror', dl.status === 404);
    },
    { ARIA_APK_URL: `${fixture.base}/not-a-package` },
  );

  fixture.server.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
