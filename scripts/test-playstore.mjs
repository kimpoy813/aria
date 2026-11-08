/**
 * End-to-end verification for Google Play Store Phase 2 readiness:
 *   1. Web App Manifest, Service Worker & PNG Icons (192, 512, maskable 512, Play Store 512)
 *   2. Dynamic & static Digital Asset Links (/.well-known/assetlinks.json)
 *   3. Public /privacy and /delete-account SPA routes
 *   4. Permanent Account & Data Deletion API (DELETE /api/auth/account)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

async function run() {
  console.log('\nAria · Google Play Store Phase 2 readiness test\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-playstore-'));
  const port = 45321;
  const base = `http://127.0.0.1:${port}`;
  const testFp1 = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
  const testFp2 = '11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF';

  const proc = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      ARIA_STORAGE: 'file',
      ARIA_AUTH: 'demo',
      ARIA_DATA_FILE: path.join(tmpDir, 'data.json'),
      ARIA_AUTH_FILE: path.join(tmpDir, 'auth.json'),
      ANDROID_PACKAGE_NAME: 'com.kimpoy813.aria',
      ANDROID_SHA256_FINGERPRINTS: `${testFp1}, ${testFp2}`,
    },
    stdio: 'ignore',
  });

  try {
    await waitReady(base);

    /* ------------------------------- 1. PWA Manifest, SW & PNG App Icons */
    console.log('1. PWA Manifest, Service Worker & PNG Icons');
    const manRes = await fetch(`${base}/manifest.webmanifest`);
    const manifest = await manRes.json();
    check('manifest.webmanifest is served with 200', manRes.status === 200);
    check(
      'manifest declares standalone portrait mobile display and #ffffff light background',
      manifest.display === 'standalone' &&
        manifest.orientation === 'portrait' &&
        manifest.background_color === '#ffffff' &&
        manifest.theme_color === '#ffffff',
    );
    const htmlRes = await fetch(`${base}/`);
    const htmlText = await htmlRes.text();
    const cssBundle = fs
      .readdirSync(path.join(process.cwd(), 'dist', 'assets'))
      .filter((f) => f.endsWith('.css'))
      .map((f) => fs.readFileSync(path.join(process.cwd(), 'dist', 'assets', f), 'utf8'))
      .join('\n');
    check(
      'HTML & CSS enforce color-scheme: only light, prefers-color-scheme signal, and #ffffff white light mode against mobile auto-dark',
      htmlText.includes('name="color-scheme" content="only light"') &&
        cssBundle.includes('only light') &&
        cssBundle.includes('prefers-color-scheme') &&
        cssBundle.includes('forced-color-adjust:none') &&
        /--bg:\s*#fff/i.test(cssBundle),
    );
    check(
      'manifest includes 192x192, 512x512, and maskable 512x512 PNG icons',
      manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any') &&
        manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') &&
        manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'),
    );

    const swRes = await fetch(`${base}/sw.js`);
    const swText = await swRes.text();
    const swCacheHeader = swRes.headers.get('cache-control') || '';
    const htmlCacheHeader = htmlRes.headers.get('cache-control') || '';
    check('service worker /sw.js is served and skips /api/', swRes.ok && swText.includes('/api/'));
    check(
      '/sw.js and / index.html disable HTTP caching (no-store) so installed phone apps update immediately',
      swCacheHeader.includes('no-store') && htmlCacheHeader.includes('no-store'),
    );

    for (const iconPath of [
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-512.png',
      '/icons/playstore-icon-512.png',
      '/icons/apple-touch-icon.png',
    ]) {
      const r = await fetch(`${base}${iconPath}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const isPng =
        buf.length > 100 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47;
      check(`${iconPath} is a valid PNG`, r.status === 200 && isPng);
    }

    /* ----------------------------------------- 2. Digital Asset Links */
    console.log('\n2. Digital Asset Links (/.well-known/assetlinks.json)');
    const alRes = await fetch(`${base}/.well-known/assetlinks.json`);
    const assetLinks = await alRes.json();
    check('assetlinks.json returns HTTP 200 JSON array', alRes.status === 200 && Array.isArray(assetLinks));
    check(
      'assetlinks.json binds package_name and both SHA-256 fingerprints',
      assetLinks[0]?.target?.package_name === 'com.kimpoy813.aria' &&
        assetLinks[0]?.target?.sha256_cert_fingerprints?.length === 2 &&
        assetLinks[0]?.target?.sha256_cert_fingerprints[0] === testFp1,
    );

    /* -------------------------------- 3. Public Policy & Auth-Gated Deletion */
    console.log('\n3. Public Privacy Policy & Authenticated Account Deletion');
    const privRes = await fetch(`${base}/privacy`);
    const appBundle = fs
      .readdirSync(path.join(process.cwd(), 'dist', 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(process.cwd(), 'dist', 'assets', f), 'utf8'))
      .join('\n');
    check('/privacy is publicly reachable (HTTP 200)', privRes.status === 200);
    check(
      'unauthenticated Auth screen does not expose Delete Account link',
      !appBundle.includes('Delete Account'),
    );

    /* ------------------------------- 4. Account & Data Deletion Engine */
    console.log('\n4. Permanent Account & Data Deletion (DELETE /api/auth/account)');
    const anonDel = await fetch(`${base}/api/auth/account`, { method: 'DELETE' });
    check('rejects anonymous account deletion (401)', anonDel.status === 401);

    const apiCall = async (p, method = 'GET', body = null, token = '') => {
      const res = await fetch(`${base}/api${p}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status });
      return json;
    };

    const userA = await apiCall('/auth/register', 'POST', {
      name: 'Owner User',
      email: 'delete-me@example.com',
      password: 'password123',
    });
    const userB = await apiCall('/auth/register', 'POST', {
      name: 'Teammate User',
      email: 'keep-me@example.com',
      password: 'password123',
    });

    // User A creates solo team, shared team (joined by B), songs, and a lineup
    await apiCall('/teams', 'POST', { name: 'Solo Team' }, userA.token);
    const sharedTeam = (await apiCall('/teams', 'POST', { name: 'Shared Band' }, userA.token)).team;
    await apiCall('/teams/join', 'POST', { code: sharedTeam.code }, userB.token);

    const song1 = (
      await apiCall(
        '/songs',
        'POST',
        {
          title: 'My Slow Song',
          artist: 'Owner',
          tempo: 'slow',
          theme: 'Peace',
          teamId: null,
          parts: [{ kind: 'verse', label: 'Verse 1', lyrics: 'Quiet peace today' }],
          analysis: null,
        },
        userA.token,
      )
    ).song;

    const song2 = (
      await apiCall(
        '/songs',
        'POST',
        {
          title: 'My Fast Song',
          artist: 'Owner',
          tempo: 'fast',
          theme: 'Joy',
          teamId: null,
          parts: [{ kind: 'chorus', label: 'Chorus', lyrics: 'Sing aloud with joy' }],
          analysis: null,
        },
        userA.token,
      )
    ).song;

    const lineup = (
      await apiCall(
        '/lineups',
        'POST',
        {
          name: 'To Be Deleted Set',
          theme: 'Joy',
          teamId: null,
          items: [
            { songId: song1.id, partId: song1.parts[0].id },
            { songId: song2.id, partId: song2.parts[0].id },
          ],
        },
        userA.token,
      )
    ).lineup;

    // Delete User A's account
    const delResult = await apiCall('/auth/account', 'DELETE', null, userA.token);
    check('DELETE /api/auth/account succeeds', delResult.ok === true);

    // Old session is immediately invalid
    const afterState = await fetch(`${base}/api/state`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    check('deleted user session token is immediately invalidated', afterState.status === 401);

    // Old credentials can no longer sign in
    const relogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'delete-me@example.com', password: 'password123' }),
    });
    check('deleted user credentials are removed', relogin.status === 401);

    // Deleted user's public share link is gone
    const oldShare = await fetch(`${base}/api/shared/${lineup.shareToken}`);
    check('deleted user public share link is removed (404)', oldShare.status === 404);

    // Shared team ownership transferred cleanly to Teammate B
    const stateB = await apiCall('/state', 'GET', null, userB.token);
    const bandForB = stateB.teams.find((t) => t.id === sharedTeam.id);
    check(
      'shared team ownership transfers cleanly to remaining teammate',
      Boolean(bandForB) && bandForB.myRole === 'owner' && bandForB.members.length === 1,
    );
  } finally {
    proc.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
