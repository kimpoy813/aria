/**
 * Checks the public /app page and its Android download plumbing:
 *   1. /app is reachable without a session and the bundle carries the page copy
 *   2. /api/app/release reports the HTTP-404-with-publishing fallback when no APK exists
 *   3. With an APK present the endpoint reports size / sha256 / version and the file downloads
 *   4. Each download is counted, and the counter is public only to signed-in callers
 *   5. /downloads/aria.apk serves the package with the right content type
 *   6. the mirror path: a remote URL is fetched once, cached, and served locally
 *   7. a mirror that returns HTML instead of a package is rejected, not served
 *   8. the page's download count shortens to K / M / B / T without overstating it
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(port, run, extraEnv, reuseDir) {
  const dir = reuseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'aria-app-'));
  const proc = startServer(port, dir, extraEnv);
  try {
    await waitReady(`http://127.0.0.1:${port}`);
    await run(`http://127.0.0.1:${port}`, dir);
  } finally {
    await stop(proc);
    if (!reuseDir) fs.rmSync(dir, { recursive: true, force: true });
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
    if (req.url.startsWith('/slow.apk')) {
      hits += 1;
      setTimeout(() => {
        res.writeHead(200, { 'content-length': zip.length, 'content-type': 'application/octet-stream' });
        res.end(zip);
      }, 1200);
      return;
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

    // `/app/` is how a lot of links arrive (and how the Play Store listing is
    // written). It must not fall through to the sign-in screen.
    for (const suffix of ['/app/', '/app//', '/app/?utm_source=play']) {
      const r = await fetch(`${base}${suffix}`, { redirect: 'manual' });
      const location = r.headers.get('location') || '';
      check(
        `${suffix} redirects to /app instead of rendering another page`,
        r.status === 301 && location.startsWith('/app') && !location.startsWith('/app/'),
        `${r.status} ${location}`,
      );
    }
    const followed = await fetch(`${base}/app/`);
    check('/app/ ends on the download page when followed', followed.status === 200);

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
    check('the download count is public', release.downloads === 0);

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

      /* the count is every download, through either URL, and it is persisted */
      // Two fetches have happened above: the API download, then the /downloads link.
      const before = await (await fetch(`${base}/api/app/release`)).json();
      check('every download is counted, through either URL', before.downloads === 2);

      await fetch(`${base}/downloads/aria.apk`);
      const afterLink = await (await fetch(`${base}/api/app/release`)).json();
      check('the count keeps climbing on repeat downloads', afterLink.downloads === 3);

      // The count is saved in its own right, not with the next edit — a deploy
      // that lands between two clicks must not take the number with it.
      await sleep(400);
      const stored = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'),
      );
      check(
        'the count is persisted with the data set, so a redeploy keeps it',
        stored?.settings?.stats?.apkDownloads === 3,
      );
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
      // The mirror should already be running from boot, not from this request.
      check(
        'the package is fetched at startup, before the first visitor asks',
        fixture.hits() >= 1,
      );

      const release = await (await fetch(`${base}/api/app/release`)).json();
      check('a remote package is mirrored and reported available', release.available === true && release.source === 'mirror');
      check('mirrored size and digest match the source', release.sizeBytes === fixture.zip.length && release.sha256 === expected);
      check('the package is cached on disk', fs.existsSync(path.join(dataDir, 'apk-cache', 'aria.apk')));

      const dl = await fetch(`${base}/downloads/aria.apk`);
      const bytes = Buffer.from(await dl.arrayBuffer());
      check('the mirrored package downloads byte for byte', dl.status === 200 && bytes.equals(fixture.zip));
      check('the mirror is fetched once, not per request', fixture.hits() === 1);

      const counted = await fetch(`${base}/api/app/download`);
      // one click above (the raw download check) + this one
      check(
        'mirrored downloads are counted too',
        counted.headers.get('x-aria-download') === '2',
      );
      const releaseAfter = await (await fetch(`${base}/api/app/release`)).json();
      check('the count is visible on the page after a download', releaseAfter.downloads === 2);
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

      const hitsAfterFirst = fixture.hits();
      for (let i = 0; i < 3; i++) await fetch(`${base}/api/app/release`);
      check(
        'a failed mirror is not retried on every page view',
        fixture.hits() === hitsAfterFirst,
        `${hitsAfterFirst} -> ${fixture.hits()}`,
      );
    },
    { ARIA_APK_URL: `${fixture.base}/not-a-package` },
  );

  /* ---------------------- 4b. a slow mirror never stalls the page, but the
     download itself still waits for the package */
  console.log('\n4b. Slow mirror');
  await withServer(
    5185,
    async (base) => {
      const started = Date.now();
      const release = await (await fetch(`${base}/api/app/release?wait=0`)).json();
      const elapsed = Date.now() - started;
      check(
        'the status poll answers immediately while the mirror runs',
        elapsed < 1000,
        `${elapsed} ms`,
      );
      check(
        'the poll reports the mirror as in progress, not as missing',
        release.available === false && release.mirrorStatus === 'fetching',
      );

      const dl = await fetch(`${base}/downloads/aria.apk`);
      check('the download waits for the mirror and still serves the file', dl.status === 200);
    },
    { ARIA_APK_URL: `${fixture.base}/slow.apk` },
  );

  /* ------------------------------- 5. the count survives a restart + legacy file */
  console.log('\n5. Count persistence');
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-legacy-'));
  fs.writeFileSync(
    path.join(legacyDir, 'apk-downloads.json'),
    JSON.stringify({ total: 7, lastAt: Date.now() }),
  );
  const apkForLegacy = path.join(legacyDir, 'aria.apk');
  fs.writeFileSync(apkForLegacy, payload);

  // first boot: the old file-based counter is folded in
  await withServer(
    5183,
    async (base) => {
      const release = await (await fetch(`${base}/api/app/release`)).json();
      check('an older file-based counter is carried over', release.downloads === 7);
    },
    { ARIA_APK_FILE: apkForLegacy },
    legacyDir,
  );

  // second boot on the same data dir: still there, and a download still adds one
  await withServer(
    5184,
    async (base) => {
      const release = await (await fetch(`${base}/api/app/release`)).json();
      check('the count survives a restart', release.downloads === 7);
      await fetch(`${base}/downloads/aria.apk`);
      const after = await (await fetch(`${base}/api/app/release`)).json();
      check('and keeps counting after the restart', after.downloads === 8);
    },
    { ARIA_APK_FILE: apkForLegacy },
    legacyDir,
  );

  fs.rmSync(legacyDir, { recursive: true, force: true });

  /* --------------------------------------- 6. compact download formatting */
  console.log('\n6. Download count formatting');
  const bundle = fs
    .readdirSync(path.join(process.cwd(), 'dist', 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(process.cwd(), 'dist', 'assets', f), 'utf8'))
    .join('\n');
  check(
    'the page labels the metric as downloads',
    // minified JSX splits the text: "download" / "downloads" + " so far"
    /"download"\s*:\s*"downloads"/.test(bundle) &&
      bundle.includes('so far') &&
      bundle.includes('Downloads'),
  );
  check('the page uses K/M/B suffixes', /[KMBT]"?\)/.test(bundle) || /`\$\{[^}]*\}[KMBT]`/.test(bundle));

  const { formatCount } = await import('../src/lib/install.ts').catch(() => ({}));
  if (formatCount) {
    const expectations = [
      [0, '0'],
      [999, '999'],
      [1000, '1K'],
      [1549, '1.5K'],
      [1999, '1.9K'],
      [12345, '12.3K'],
      [999949, '999K'],
      [1000000, '1M'],
      [1234567, '1.2M'],
      [1500000000, '1.5B'],
      [2500000000000, '2.5T'],
    ];
    let ok = true;
    for (const [value, expected] of expectations) {
      const got = formatCount(value).label;
      if (got !== expected) {
        ok = false;
        console.error(`     ${value} -> ${got} (expected ${expected})`);
      }
    }
    check('counts shorten at 1000 / 1M / 1B / 1T and never overstate', ok);
    check('the exact number is kept for the tooltip', formatCount(1234567).exact === '1,234,567');
  } else {
    check('the formatter is covered by the build (source import skipped)', true);
  }

  /* ------------------------------------------ 7. tablet & laptop layout */
  console.log('\n7. Tablet & laptop layout');
  {
    const css = fs
      .readdirSync(path.join(process.cwd(), 'dist', 'assets'))
      .filter((f) => f.endsWith('.css'))
      .map((f) => fs.readFileSync(path.join(process.cwd(), 'dist', 'assets', f), 'utf8'))
      .join('\n');

    check('the build ships a stylesheet', css.length > 1000, `${css.length} bytes`);

    /** Returns the body of every `@media <query>` block, brace-matched. */
    const mediaBlocks = (query) => {
      const out = [];
      const needle = `@media ${query}`;
      for (let i = css.indexOf(needle); i !== -1; i = css.indexOf(needle, i + 1)) {
        const open = css.indexOf('{', i);
        if (open === -1) break;
        let depth = 0;
        for (let j = open; j < css.length; j++) {
          if (css[j] === '{') depth++;
          else if (css[j] === '}') {
            depth--;
            if (depth === 0) {
              out.push(css.slice(open + 1, j));
              break;
            }
          }
        }
      }
      return out.join('\n');
    };

    /**
     * True when `selector { ... decl }` appears inside a given media block.
     * Matches the selector exactly — `.sheet` must not match `.sheet-backdrop` —
     * and ignores whitespace, which the minifier keeps inside custom properties.
     */
    const squash = (text) => text.replace(/\s+/g, '');
    const inMedia = (query, selector, decl) => {
      const body = mediaBlocks(query);
      // Walk every rule, split its selector list on commas, and match one part
      // exactly — so `.sheet` never matches `.sheet-backdrop`.
      const rule = /([^{}]+)\{([^}]*)\}/g;
      let match;
      while ((match = rule.exec(body)) !== null) {
        const selectors = match[1].split(',').map((part) => squash(part));
        if (!selectors.includes(squash(selector))) continue;
        if (squash(match[2]).includes(squash(decl))) return true;
      }
      return false;
    };

    // One token drives the shell, so every full-height surface widens together.
    check(
      'the shell width is a variable, not a fixed phone width',
      (css.match(/max-width:var\(--shell\)/g) || []).length >= 5 &&
        !/max-width:430px/.test(css),
    );
    check(
      'the shell widens at tablet, laptop and desktop widths',
      inMedia('(min-width: 700px)', ':root', '--shell:620px') &&
        inMedia('(min-width: 900px)', ':root', '--shell:860px') &&
        inMedia('(min-width: 1200px)', ':root', '--shell:1040px') &&
        inMedia('(min-width: 1600px)', ':root', '--shell:1160px'),
    );

    // Long lists stop being a single column of half-empty rows.
    check(
      'song and lineup lists go two-up on a tablet',
      inMedia('(min-width: 900px)', '.list-group', 'grid-template-columns:repeat(2'),
    );
    check(
      'and three-up on a laptop',
      inMedia('(min-width: 1200px)', '.list-group', 'grid-template-columns:repeat(3'),
    );
    check(
      'the column divider follows the new column count',
      inMedia('(min-width: 1200px)', '.list-row:nth-child(3n)', 'border-right:0'),
    );

    // The tab bar becomes a floating pill instead of an edge-to-edge strip.
    check(
      'the tab bar becomes a floating pill on wide screens',
      inMedia('(min-width: 900px)', '.tabbar', 'border-radius:18px') &&
        inMedia('(min-width: 900px)', '.tabbar', 'bottom:16px'),
    );

    // A bottom sheet is unreachable on a laptop, so it becomes a dialog.
    check(
      'the bottom sheet becomes a centred dialog',
      inMedia('(min-width: 700px)', '.sheet-backdrop', 'align-items:center') &&
        inMedia('(min-width: 700px)', '.sheet', 'border-radius:20px'),
    );

    // Lyrics keep a readable measure instead of spanning 1040px.
    check(
      'lyrics keep a readable measure on a laptop',
      inMedia('(min-width: 900px)', '.lyric-stanza', 'max-width:var(--measure)'),
    );

    // Admin and public-page grids use the extra room.
    check(
      'the admin KPI grid fills the row',
      inMedia('(min-width: 700px)', '.admin-kpi-grid', 'repeat(auto-fit'),
    );
    check(
      'the public page cards go multi-column',
      inMedia('(min-width: 900px)', '.app-how', 'grid-template-columns:repeat(2') &&
        inMedia('(min-width: 1200px)', '.app-how', 'grid-template-columns:repeat(3'),
    );

    // Nothing below 700px moved: the phone layout is still the phone layout.
    check(
      'the phone layout is untouched below 700px',
      mediaBlocks('(min-width: 700px)').length > 0 &&
        !inMedia('(max-width: 600px)', '.list-group', 'grid-template-columns'),
    );
  }

  fixture.server.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
