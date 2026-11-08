#!/usr/bin/env node
/**
 * End-to-end verification for the Aria Admin Account & System Console:
 *   1. Built-in admin login (POST /api/auth/admin-login), password checks,
 *      and HMAC session verification (GET /api/auth/session, GET /api/bootstrap)
 *   2. Non-admin 403 enforcement on all /api/admin/* endpoints
 *   3. Whole-system statistics & content inventory (GET /api/admin/overview)
 *   4. Maintenance announcements (info banner + full maintenance lockout 503 on
 *      non-admin writes + admin bypass) & registration pause gate
 *   5. User access management: create user, promote/demote admin, suspend/
 *      reactivate user (instant 403), self-protection, cascade deletion
 *   6. System-wide song, lineup, and team deletion + admin password rotation
 *   7. Supabase / PostgreSQL (PGlite) driver verification for system_settings,
 *      admin gate, and user roles/suspension
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaPath = path.join(root, 'supabase', 'schema.sql');

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForApi(baseUrl) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

async function req(baseUrl, pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function makeShim(pg) {
  return {
    from(table) {
      let action = 'select';
      let payload = null;
      let onConflict = null;
      const filters = [];

      const run = async () => {
        const where = filters.length ? ` where ${filters.join(' and ')}` : '';
        if (action === 'select' || action === 'delete') {
          const sql =
            action === 'select'
              ? `select * from ${table}${where}`
              : `delete from ${table}${where}`;
          const result = await pg.query(sql);
          return { data: action === 'select' ? result.rows : null, error: null };
        }
        if (action === 'upsert') {
          const rows = Array.isArray(payload) ? payload : [payload];
          const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
          const cols = keys.map((k) => `"${k}"`).join(', ');
          const values = [];
          const tuples = rows.map((row) => {
            const placeholders = keys.map((k) => {
              const v = row[k];
              values.push(v === undefined ? null : v);
              return `$${values.length}`;
            });
            return `(${placeholders.join(', ')})`;
          });
          const conflict = onConflict || 'id';
          const sql =
            `insert into ${table} (${cols}) values ${tuples.join(', ')} ` +
            `on conflict (${conflict}) do update set ` +
            keys
              .filter((k) => k !== conflict)
              .map((k) => `"${k}" = excluded."${k}"`)
              .join(', ');
          await pg.query(sql, values);
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };

      const builder = {
        select() {
          action = action === 'delete' ? 'delete' : 'select';
          return builder;
        },
        limit() {
          return builder;
        },
        upsert(rows, opts = {}) {
          action = 'upsert';
          payload = Array.isArray(rows) ? rows : [rows];
          onConflict = opts.onConflict || 'id';
          return builder;
        },
        delete() {
          action = 'delete';
          return builder;
        },
        eq(col, val) {
          const safe = String(val).replace(/'/g, "''");
          filters.push(`"${col}" = '${safe}'`);
          return builder;
        },
        in(col, list) {
          if (!list.length) {
            filters.push('false');
            return builder;
          }
          const quoted = list.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
          filters.push(`"${col}" in (${quoted})`);
          return builder;
        },
        then(onFulfilled, onRejected) {
          return run().then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

console.log('\nAria · Admin account & system console test');

console.log('\n1 · Demo driver — Admin login, stats, maintenance & user access');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-admin-demo-'));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = spawn('node', ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ARIA_STORAGE: 'file',
      ARIA_AUTH: 'demo',
      ARIA_DATA_DIR: tmpDir,
    },
    stdio: 'ignore',
  });

  try {
    const ready = await waitForApi(baseUrl);
    check('Demo server boots cleanly', ready);

    // Public status works without auth
    const pub0 = await req(baseUrl, '/api/system/status');
    check(
      'GET /api/system/status returns default status publicly',
      pub0.status === 200 &&
        pub0.data.maintenance?.enabled === false &&
        pub0.data.allowRegistration === true,
    );

    // Register normal user
    const regMember = await req(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Grace Choir', email: 'grace@example.com', password: 'Password123!' },
    });
    const memberToken = regMember.data.token;
    const memberId = regMember.data.user?.id;
    check(
      'Regular user registers with user role (non-admin)',
      regMember.status === 200 &&
        regMember.data.user?.isAdmin === false &&
        regMember.data.user?.role === 'user',
    );

    // Member creates a song, a lineup, and a team
    const songRes = await req(baseUrl, '/api/songs', {
      method: 'POST',
      token: memberToken,
      body: {
        title: 'Cornerstone',
        artist: 'Hillsong',
        tempo: 'slow',
        parts: [
          {
            kind: 'verse',
            label: 'Verse 1',
            lyrics: 'My hope is built on nothing less',
          },
          {
            kind: 'chorus',
            label: 'Chorus',
            lyrics: 'Christ alone, Cornerstone',
          },
        ],
      },
    });
    const songId = songRes.data.song?.id;
    const firstPartId = songRes.data.song?.parts?.[0]?.id;
    const secondPartId = songRes.data.song?.parts?.[1]?.id;

    const teamRes = await req(baseUrl, '/api/teams', {
      method: 'POST',
      token: memberToken,
      body: { name: 'Main Sanctuary' },
    });
    const teamId = teamRes.data.team?.id;

    const lineupRes = await req(baseUrl, '/api/lineups', {
      method: 'POST',
      token: memberToken,
      body: {
        name: 'Sunday Morning',
        teamId,
        items: [
          { songId, partId: firstPartId },
          { songId, partId: secondPartId },
        ],
      },
    });
    const lineupId = lineupRes.data.lineup?.id;
    await req(baseUrl, `/api/lineups/${lineupId}/share`, {
      method: 'POST',
      token: memberToken,
    });

    // Non-admin blocked from /api/admin/overview
    const blocked = await req(baseUrl, '/api/admin/overview', { token: memberToken });
    check(
      'Regular user receives 403 on /api/admin/overview',
      blocked.status === 403,
    );

    // Admin login check for non-admin email returns matched: false
    const nonAdminCheck = await req(baseUrl, '/api/auth/admin-login', {
      method: 'POST',
      body: { email: 'grace@example.com', password: 'Password123!' },
    });
    check(
      'POST /api/auth/admin-login returns matched:false for regular emails',
      nonAdminCheck.status === 200 && nonAdminCheck.data.matched === false,
    );

    // Wrong admin password rejected with 401
    const badAdmin = await req(baseUrl, '/api/auth/admin-login', {
      method: 'POST',
      body: { email: 'admin@aria.app', password: 'WrongPassword!' },
    });
    check(
      'POST /api/auth/admin-login rejects wrong admin password with 401',
      badAdmin.status === 401,
    );

    // Valid built-in admin login
    const adminLogin = await req(baseUrl, '/api/auth/admin-login', {
      method: 'POST',
      body: { email: 'admin@aria.app', password: 'AriaAdmin2026!' },
    });
    const adminToken = adminLogin.data.token;
    check(
      'Built-in admin signs in and receives adm. session token',
      adminLogin.status === 200 &&
        adminLogin.data.matched === true &&
        adminToken?.startsWith('adm.') &&
        adminLogin.data.user?.isAdmin === true,
    );

    // GET /api/auth/session & /api/state accept adm. token
    const meRes = await req(baseUrl, '/api/auth/session', { token: adminToken });
    const bootRes = await req(baseUrl, '/api/state', { token: adminToken });
    check(
      'GET /api/auth/session and /api/state resolve built-in admin session',
      meRes.status === 200 &&
        meRes.data.user?.isAdmin === true &&
        bootRes.status === 200 &&
        bootRes.data.user?.role === 'admin',
    );

    // GET /api/admin/overview returns system-wide statistics & inventory
    const ov = await req(baseUrl, '/api/admin/overview', { token: adminToken });
    check(
      'GET /api/admin/overview aggregates system stats, users, songs, lineups & teams',
      ov.status === 200 &&
        ov.data.stats?.totalSongs === 1 &&
        ov.data.stats?.totalLineups === 1 &&
        ov.data.stats?.totalTeams === 1 &&
        ov.data.stats?.sharedLineups === 1 &&
        ov.data.stats?.usedLineups === 1 &&
        ov.data.stats?.slowSongs === 1 &&
        Array.isArray(ov.data.users) &&
        ov.data.users.length >= 2,
    );

    // Publish maintenance banner
    const bannerRes = await req(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token: adminToken,
      body: {
        maintenance: {
          enabled: true,
          mode: 'info',
          title: 'Scheduled Upgrade',
          message: 'Database maintenance tonight at 11 PM UTC.',
          eta: 'Back by 11:30 PM UTC',
        },
      },
    });
    const pub1 = await req(baseUrl, '/api/system/status');
    check(
      'PATCH /api/admin/settings publishes live maintenance announcement banner',
      bannerRes.status === 200 &&
        pub1.data.maintenance?.enabled === true &&
        pub1.data.maintenance?.mode === 'info' &&
        pub1.data.maintenance?.title === 'Scheduled Upgrade',
    );

    // Enable full maintenance lockout -> non-admin writes get 503, admin still works
    await req(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token: adminToken,
      body: {
        maintenance: {
          enabled: true,
          mode: 'maintenance',
          title: 'Offline Maintenance',
          message: 'Upgrading storage cluster.',
        },
      },
    });
    const writeBlocked = await req(baseUrl, '/api/songs', {
      method: 'POST',
      token: memberToken,
      body: {
        title: 'Blocked Song',
        tempo: 'fast',
        parts: [{ kind: 'verse', label: 'Verse 1', lyrics: 'Test lyrics' }],
      },
    });
    const adminWriteOk = await req(baseUrl, '/api/songs', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Admin Song',
        tempo: 'fast',
        parts: [{ kind: 'verse', label: 'Verse 1', lyrics: 'Admin bypass song' }],
      },
    });
    check(
      'Full maintenance mode blocks non-admin writes (503) while allowing admin bypass',
      writeBlocked.status === 503 && adminWriteOk.status === 200,
    );

    // Turn off maintenance & test allowRegistration: false
    await req(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token: adminToken,
      body: {
        maintenance: { enabled: false },
        allowRegistration: false,
      },
    });
    const regPaused = await req(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'New Person', email: 'new@example.com', password: 'Password123!' },
    });
    check(
      'Pausing registration blocks POST /api/auth/register with 403',
      regPaused.status === 403,
    );
    await req(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token: adminToken,
      body: { allowRegistration: true },
    });

    // Admin creates a user directly
    const createdUserRes = await req(baseUrl, '/api/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Band Director',
        email: 'director@example.com',
        password: 'DirectorPassword1!',
        role: 'user',
      },
    });
    const directorId = createdUserRes.data.user?.id;
    const directorLogin = await req(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'director@example.com', password: 'DirectorPassword1!' },
    });
    check(
      'POST /api/admin/users creates a working user account',
      createdUserRes.status === 200 && directorLogin.status === 200,
    );

    // Promote user to admin -> gains /api/admin/overview access
    const promoteRes = await req(baseUrl, `/api/admin/users/${memberId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { role: 'admin' },
    });
    const promotedOv = await req(baseUrl, '/api/admin/overview', { token: memberToken });
    check(
      'Promoting a user to admin grants immediate /api/admin/overview access',
      promoteRes.status === 200 &&
        promoteRes.data.user?.isAdmin === true &&
        promotedOv.status === 200,
    );

    // Demote back to user & suspend -> revokes session & blocks login with 403
    await req(baseUrl, `/api/admin/users/${memberId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { role: 'user', suspended: true },
    });
    const suspendedBoot = await req(baseUrl, '/api/state', { token: memberToken });
    const suspendedLogin = await req(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'grace@example.com', password: 'Password123!' },
    });
    check(
      'Suspending a user revokes active sessions (401) and blocks sign-in (403)',
      suspendedBoot.status === 401 && suspendedLogin.status === 403,
    );

    // Reactivate user & sign in again
    await req(baseUrl, `/api/admin/users/${memberId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { suspended: false },
    });
    const relogin = await req(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'grace@example.com', password: 'Password123!' },
    });
    check(
      'Reactivating a suspended user restores sign-in access',
      relogin.status === 200,
    );

    // Self-protection: built-in admin cannot suspend or delete self
    const selfSuspend = await req(baseUrl, '/api/admin/users/user_admin', {
      method: 'PATCH',
      token: adminToken,
      body: { suspended: true },
    });
    const selfDelete = await req(baseUrl, '/api/admin/users/user_admin', {
      method: 'DELETE',
      token: adminToken,
    });
    check(
      'Built-in admin account is protected against self-suspension and deletion',
      selfSuspend.status === 400 && selfDelete.status === 400,
    );

    // System-wide content oversight deletion
    const delTeam = await req(baseUrl, `/api/admin/teams/${teamId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    const delLineup = await req(baseUrl, `/api/admin/lineups/${lineupId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    const delSong = await req(baseUrl, `/api/admin/songs/${songId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    check(
      'Admin can delete system-wide teams, lineups, and songs',
      delTeam.status === 200 && delLineup.status === 200 && delSong.status === 200,
    );

    // Delete managed user
    const delUser = await req(baseUrl, `/api/admin/users/${directorId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    check(
      'DELETE /api/admin/users/:id removes user cleanly',
      delUser.status === 200,
    );

    // Rotate built-in admin password
    const passRes = await req(baseUrl, '/api/admin/password', {
      method: 'POST',
      token: adminToken,
      body: { password: 'NewAdminPassword2026!' },
    });
    const oldLogin = await req(baseUrl, '/api/auth/admin-login', {
      method: 'POST',
      body: { email: 'admin@aria.app', password: 'AriaAdmin2026!' },
    });
    const newLogin = await req(baseUrl, '/api/auth/admin-login', {
      method: 'POST',
      body: { email: 'admin@aria.app', password: 'NewAdminPassword2026!' },
    });
    check(
      'POST /api/admin/password rotates built-in admin password persistently',
      passRes.status === 200 && oldLogin.status === 401 && newLogin.status === 200,
    );
  } finally {
    proc.kill('SIGTERM');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log('\n2 · Supabase / PostgreSQL (PGlite) driver — schema & admin persistence');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-admin-pg-'));
  const pg = await PGlite.create();
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pg.exec(sql);

  const shim = makeShim(pg);
  shim.auth = {
    async getUser(token) {
      if (token === 'sb-member-token') {
        return {
          data: {
            user: {
              id: 'sb_user_1',
              email: 'member@church.org',
              user_metadata: { full_name: 'Supabase Member' },
            },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: { message: 'Invalid token' } };
    },
  };
  globalThis.__ariaSupabaseClient = shim;

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.ARIA_STORAGE = 'supabase';
  process.env.ARIA_AUTH = 'supabase';
  process.env.SUPABASE_URL = 'http://pglite.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  process.env.ARIA_DATA_DIR = tmpDir;

  await import(path.join(root, 'server', 'index.js'));
  const ready = await waitForApi(baseUrl);
  check('Supabase/PGlite server boots cleanly', ready);

  try {
    // Member signs in via Supabase token -> stored in Postgres users table
    const memberBoot = await req(baseUrl, '/api/state', { token: 'sb-member-token' });
    const sbUserId = memberBoot.data.user?.id;
    check(
      'Supabase user syncs into Postgres users table with user role',
      memberBoot.status === 200 &&
        memberBoot.data.user?.isAdmin === false &&
        memberBoot.data.user?.role === 'user' &&
        Boolean(sbUserId),
    );

    // Built-in admin signs in even when driver === 'supabase'
    const adminLogin = await req(baseUrl, '/api/auth/admin-login', {
      method: 'POST',
      body: { email: 'admin@aria.app', password: 'AriaAdmin2026!' },
    });
    const adminToken = adminLogin.data.token;
    check(
      'Built-in admin signs in cleanly alongside Supabase driver',
      adminLogin.status === 200 && adminToken?.startsWith('adm.'),
    );

    // Persist maintenance announcement into Postgres system_settings
    const setRes = await req(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token: adminToken,
      body: {
        maintenance: {
          enabled: true,
          mode: 'info',
          title: 'Supabase Maintenance',
          message: 'Upgrading Postgres indexes.',
        },
      },
    });
    // Wait briefly for debounced store.persist()
    await new Promise((r) => setTimeout(r, 200));
    const pgRows = await pg.query(`select id, data from public.system_settings`);
    check(
      'Maintenance settings persist to PostgreSQL public.system_settings',
      setRes.status === 200 &&
        pgRows.rows.some(
          (r) => r.id === 'global' && r.data?.maintenance?.title === 'Supabase Maintenance',
        ),
    );

    // Promote & suspend Supabase user in Postgres
    const prom = await req(baseUrl, `/api/admin/users/${sbUserId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { role: 'admin' },
    });
    const promOv = await req(baseUrl, '/api/admin/overview', { token: 'sb-member-token' });
    check(
      'Supabase user promoted to admin in Postgres gains admin console access',
      prom.status === 200 && promOv.status === 200,
    );

    await req(baseUrl, `/api/admin/users/${sbUserId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { role: 'user', suspended: true },
    });
    const suspBoot = await req(baseUrl, '/api/state', { token: 'sb-member-token' });
    check(
      'Suspending Supabase user in Postgres blocks API access with 403',
      suspBoot.status === 403,
    );
  } finally {
    await pg.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
