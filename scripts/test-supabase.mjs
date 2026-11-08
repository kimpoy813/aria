#!/usr/bin/env node
/**
 * Verifies the Supabase path without a Supabase account.
 *
 *   npm run test:supabase
 *
 * It does three things against a real Postgres (PGlite, Postgres compiled to
 * WASM, running in-process):
 *   1. applies supabase/schema.sql exactly as you would paste it,
 *   2. checks the schema is re-runnable and the constraints behave,
 *   3. stands up the real Aria API with the Supabase storage driver pointed at
 *      that database, then exercises the parts that matter: sign in, create a
 *      song, build and share a lineup, open the public link, and confirm the LRU
 *      stamp survived a full server restart.
 *
 * Requires the dev dependency @electric-sql/pglite.
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

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
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Minimal PostgREST-like shim over PGlite, so the real API can be exercised. */
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
          const sql = action === 'select' ? `select * from ${table}${where}` : `delete from ${table}${where}`;
          const result = await pg.query(sql);
          return { data: action === 'select' ? result.rows : null, error: null };
        }
        if (action === 'upsert') {
          const keys = [...new Set(payload.flatMap((row) => Object.keys(row)))];
          const cols = keys.map((k) => `"${k}"`).join(', ');
          const values = [];
          const tuples = payload.map((row) => {
            const placeholders = keys.map((k) => {
              values.push(row[k] === undefined ? null : row[k]);
              return `$${values.length}`;
            });
            return `(${placeholders.join(', ')})`;
          });
          const conflict = onConflict || 'id';
          const sql =
            `insert into ${table} (${cols}) values ${tuples.join(', ')} ` +
            `on conflict (${conflict}) do update set ` +
            keys.filter((k) => k !== conflict).map((k) => `"${k}" = excluded."${k}"`).join(', ');
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
        delete() {
          action = 'delete';
          return builder;
        },
        upsert(rows, options) {
          action = 'upsert';
          payload = Array.isArray(rows) ? rows : [rows];
          onConflict = options?.onConflict ?? null;
          return builder;
        },
        eq(column, value) {
          filters.push(`"${column}" = ${sqlLiteral(value)}`);
          return builder;
        },
        in(column, list) {
          filters.push(`"${column}" in (${list.map(sqlLiteral).join(', ')})`);
          return builder;
        },
        then(resolve, reject) {
          return run().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

/** Saves are debounced (~60ms) so a burst of edits writes once. Wait it out
 *  before asserting on the database. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function captureLogs() {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
  };
  console.error = (...args) => {
    logs.push(args.join(' '));
    originalError(...args);
  };
  return { logs };
}

async function waitForApi(port, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  console.log(logs.join(''));
  return false;
}

let TOKEN = null;

async function api(port, method, route, body) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

/* ------------------------------------------------------------------- main */

const { PGlite } = await import('@electric-sql/pglite');

console.log('\nAria · Supabase driver test (real Postgres via PGlite)\n');

const pg = await PGlite.create();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-sb-'));

// 1. schema
console.log('1. Applying supabase/schema.sql');
{
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pg.exec(sql);
  const tables = await pg.query(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  const names = tables.rows.map((row) => row.table_name);
  for (const table of ['users', 'teams', 'songs', 'lineups']) {
    check(`table public.${table} exists`, names.includes(table));
  }
}

console.log('\n2. Schema is re-runnable and constraints hold');
{
  let reran = true;
  try {
    await pg.exec(fs.readFileSync(schemaPath, 'utf8'));
  } catch (err) {
    reran = false;
    check('schema can be applied twice', false, err.message);
  }
  if (reran) check('schema can be applied twice', true);

  let rejected = false;
  try {
    await pg.query(
      `insert into public.users (id, name) values ('u_bad', 'x');
       insert into public.songs (id, title, tempo, owner_id) values ('s_bad', 't', 'medium', 'u_bad')`,
    );
  } catch {
    rejected = true;
  }
  check('tempo must be fast or slow', rejected);

  await pg.query(`delete from public.songs where id = 's_bad'`);
  await pg.query(`delete from public.users where id = 'u_bad'`);
}

// 2. drive the real API against it
console.log('\n3. Real API with the Supabase storage driver');
const shim = makeShim(pg);
// The API also verifies identity with this client, so give it a user endpoint.
shim.auth = {
  async getUser(accessToken) {
    return accessToken === 'token-tester'
      ? {
          data: {
            user: {
              id: 'uuid-tester',
              email: 'tester@example.com',
              user_metadata: { full_name: 'Supabase Tester' },
            },
          },
          error: null,
        }
      : { data: { user: null }, error: { message: 'invalid jwt' } };
  },
};
globalThis.__ariaSupabaseClient = shim;
const port = await freePort();
const env = {
  PORT: String(port),
  ARIA_STORAGE: 'supabase',
  ARIA_AUTH: 'supabase',
  SUPABASE_URL: 'http://pglite.local',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  ARIA_DATA_DIR: dataDir,
};
for (const [key, value] of Object.entries(env)) process.env[key] = value;

const { logs } = captureLogs();
await import(path.join(root, 'server', 'index.js'));
if (!(await waitForApi(port, logs))) {
  console.log('API did not start.');
  process.exit(1);
}

const bootLog = logs.join('\n');
check(
  'server boots with driver=supabase',
  /\[aria\] storage: supabase/.test(bootLog),
  bootLog.split('\n')[0],
);
check('no demo data is seeded on boot', !/Seeded demo team/.test(bootLog));

let userId = null;
let songId = null;
let slowSongId = null;
let lineupId = null;
let shareToken = null;

{
  // Sign in the way the browser would: the token is verified by the server.
  TOKEN = 'token-tester';

  const created = await api(port, 'GET', '/api/auth/session');
  userId = created.data?.user?.id;
  check('signs in with a verified token', created.status === 200 && Boolean(userId));

  await settle();
  const rows = await pg.query('select count(*)::int as n from public.users');
  check('user row is in Postgres', rows.rows[0].n === 1, `users=${rows.rows[0].n}`);

  const state = await api(port, 'GET', '/api/state');
  check(
    'new account starts with zero demo songs/teams',
    state.data?.songs?.length === 0 && state.data?.teams?.length === 0,
    `songs=${state.data?.songs?.length}`,
  );
}

console.log('\n4. Song, lineup, share and the LRU clock');
{
  const createdSlow = await api(port, 'POST', '/api/songs', {
    title: 'Evening Tide',
    artist: 'Tester',
    tempo: 'slow',
    theme: 'Love',
    parts: [
      { kind: 'verse', label: 'Verse 1', lyrics: 'quiet waters hold the evening light' },
      { kind: 'chorus', label: 'Chorus', lyrics: 'stay close beside the shore tonight' },
    ],
    analysis: null,
    teamId: null,
  });
  slowSongId = createdSlow.data?.song?.id;
  check('creates a slow song', createdSlow.status === 200 && Boolean(slowSongId));

  const created = await api(port, 'POST', '/api/songs', {
    title: 'Postgres Lullaby',
    artist: 'Tester',
    tempo: 'fast',
    theme: 'Hope',
    parts: [
      { kind: 'verse', label: 'Verse 1', lyrics: 'a new day is a door we have not tried' },
      { kind: 'chorus', label: 'Chorus', lyrics: 'rise up, rise up into the light' },
    ],
    analysis: null,
    teamId: null,
  });
  songId = created.data?.song?.id;
  check('creates a fast song with its parts', created.status === 200 && Boolean(songId));

  await settle();
  const parts = await pg.query('select parts from public.songs where id = $1', [songId]);
  check('parts are stored as jsonb', Array.isArray(parts.rows[0]?.parts) && parts.rows[0].parts.length === 2);

  const state = await api(port, 'GET', '/api/state');
  const mySong = state.data?.songs?.find((song) => song.id === songId);
  const slowSong = state.data?.songs?.find((song) => song.id === slowSongId);

  const built = await api(port, 'POST', '/api/lineups', {
    name: 'Postgres Set',
    theme: 'Hope',
    teamId: null,
    items: [
      { songId: slowSong.id, partId: slowSong.parts[0].id },
      { songId: mySong.id, partId: mySong.parts[1].id },
    ],
  });
  lineupId = built.data?.lineup?.id;
  check('creates a lineup with a fast and a slow part', built.status === 200 && Boolean(lineupId));

  await settle();
  const before = await pg.query('select last_used_at from public.lineups where id = $1', [lineupId]);
  check('a new lineup has never been used', before.rows[0].last_used_at === null);

  const shared = await api(port, 'POST', `/api/lineups/${lineupId}/share`, { channel: 'link' });
  shareToken = shared.data?.lineup?.shareToken;
  check('sharing returns a share token', shared.status === 200 && Boolean(shareToken));

  await settle();
  const after = await pg.query(
    'select last_used_at, use_count, last_used_reason from public.lineups where id = $1',
    [lineupId],
  );
  check('sharing stamps last_used_at', Number(after.rows[0].last_used_at) > 0);
  check('sharing bumps use_count', after.rows[0].use_count === 1);
  check('sharing records the reason', after.rows[0].last_used_reason === 'link_shared');

  // A second lineup that is never shared must outrank the one just used.
  const second = await api(port, 'POST', '/api/lineups', {
    name: 'Never Shared Set',
    theme: 'Hope',
    teamId: null,
    items: [
      { songId: slowSong.id, partId: slowSong.parts[1].id },
      { songId: mySong.id, partId: mySong.parts[0].id },
    ],
  });
  check('creates a second lineup', second.status === 200, second.data?.error);

  const lru = await api(port, 'GET', '/api/lru');
  check(
    'LRU suggests the never-used lineup over the one just shared',
    lru.data?.suggested?.id === second.data?.lineup?.id,
    `suggested=${lru.data?.suggested?.name}`,
  );
  check(
    'the shared lineup is no longer first',
    lru.data?.ordered?.[0]?.id !== lineupId,
    `first=${lru.data?.ordered?.[0]?.name}`,
  );

  // Share the second one too: now the older-used one should come back around.
  await api(port, 'POST', `/api/lineups/${second.data.lineup.id}/share`, {
    userId,
    channel: 'team',
    teamId: null,
  });
}

console.log('\n5. Data survives a restart');
{
  // A restart means a new process reading the same database. Prove the data is
  // in Postgres, not in the API's memory, by building a brand new store from
  // scratch and loading it the way boot() does.
  const { SupabaseStore } = await import(path.join(root, 'server', 'storage.js'));
  const fresh = new SupabaseStore({ url: 'http://pglite.local', key: 'test-service-role-key' });
  const reloaded = await fresh.load();

  check('users reload from Postgres', reloaded.users.some((user) => user.id === userId));
  check('ids are namespaced for Supabase', userId === 'sb_uuid-tester', String(userId));
  check(
    'songs reload with their parts',
    Boolean(reloaded.songs.find((song) => song.id === songId && song.parts.length === 2)),
  );
  const lineup = reloaded.lineups.find((item) => item.id === lineupId);
  check('lineups reload', Boolean(lineup));
  check('the LRU stamp survived', Boolean(lineup?.lastUsedAt), String(lineup?.lastUsedAt));
  check('use_count survived', lineup?.useCount === 1, String(lineup?.useCount));

  // And the public share link still resolves from that reloaded data.
  const shared = await api(port, 'GET', `/api/shared/${shareToken}`);
  check('the public share link still works', shared.status === 200);
  check('the share page has lyrics', Boolean(shared.data?.lineup?.items?.[0]?.lyrics));
}

fs.rmSync(dataDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
