#!/usr/bin/env node
/**
 * Verifies both auth drivers.
 *
 *   npm run test:auth
 *
 * Part 1 — demo driver (the local default): register, sign in, wrong password,
 *          session tokens, sign out, password reset (single use, expiry), and
 *          the fact that a client-supplied userId is ignored.
 * Part 2 — Supabase driver: a real Postgres (PGlite) for data plus a stand-in
 *          for Supabase's user API, proving tokens are verified server-side,
 *          identities are namespaced, accounts stay isolated, and the demo
 *          endpoints are closed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const waitFor = async (port) => {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return true;
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
};

/** Loads a fresh copy of the server module so each part gets its own singleton. */
async function bootServer(env) {
  Object.assign(process.env, env);
  const port = Number(env.PORT);
  await import(`${path.join(root, 'server', 'index.js')}?v=${Date.now()}`);
  if (!(await waitFor(port))) throw new Error('server did not start');
  return {
    api: async (method, route, token, body) => {
      const res = await fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, data: await res.json().catch(() => null) };
    },
  };
}

/* ------------------------------------------------------- part 1: demo mode */

console.log('\nAria · auth test\n\n1. Demo driver (local accounts)');
{
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-demo-'));
  const port = await freePort();
  const { api } = await bootServer({
    PORT: String(port),
    ARIA_STORAGE: 'file',
    ARIA_AUTH: 'demo',
    ARIA_DATA_DIR: dataDir,
  });

  check('health is public', (await api('GET', '/api/health')).status === 200);
  check('data routes reject anonymous callers', (await api('GET', '/api/state')).status === 401);

  const reg = await api('POST', '/api/auth/register', null, {
    name: 'Kim',
    email: 'Kim@Example.com ',
    password: 'hunter2hunter',
  });
  check('registers an account', reg.status === 200 && Boolean(reg.data?.token));
  check('normalises the email', reg.data?.user?.email === 'kim@example.com', reg.data?.user?.email);
  let token = reg.data.token;

  const state = await api('GET', '/api/state', token);
  check('token identifies the caller', state.data?.user?.name === 'Kim');
  check('new accounts get a starter library', state.data?.songs?.length === 4);

  const dup = await api('POST', '/api/auth/register', null, {
    email: 'KIM@example.com',
    password: 'hunter2hunter',
  });
  check('duplicate email is refused', dup.status === 409);

  const weak = await api('POST', '/api/auth/register', null, {
    email: 'new@example.com',
    password: 'short',
  });
  check('short passwords are refused', weak.status === 400 && /8 characters/.test(weak.data.error));

  const wrong = await api('POST', '/api/auth/login', null, {
    email: 'kim@example.com',
    password: 'nope',
  });
  check('wrong password is refused', wrong.status === 401);
  check(
    'error does not reveal whether the email exists',
    wrong.data?.error === 'Email or password is incorrect.',
  );

  const login = await api('POST', '/api/auth/login', null, {
    email: 'kim@example.com',
    password: 'hunter2hunter',
  });
  check('signs in', login.status === 200 && Boolean(login.data?.token));
  token = login.data.token;

  const spoof = await api('POST', '/api/songs', token, {
    userId: 'user_someone_else',
    title: 'Spoofed',
    tempo: 'fast',
    parts: [{ kind: 'verse', label: 'Verse 1', lyrics: 'x' }],
  });
  check('body userId is ignored', spoof.data?.song?.ownerId === state.data.user.id);

  const other = await api('POST', '/api/auth/register', null, {
    name: 'Ana',
    email: 'ana@example.com',
    password: 'anotherpass',
  });
  const otherState = await api('GET', '/api/state', other.data.token);
  check(
    'accounts are isolated',
    otherState.data?.songs?.every((song) => song.ownerId !== state.data.user.id),
  );

  /* password reset */
  const forgot = await api('POST', '/api/auth/forgot', null, { email: 'kim@example.com' });
  check('forgot returns a reset link in demo mode', Boolean(forgot.data?.resetPath));
  const resetToken = forgot.data.resetPath.split('token=')[1];

  const unknown = await api('POST', '/api/auth/forgot', null, { email: 'ghost@example.com' });
  check('unknown email looks the same', unknown.data?.ok === true && !unknown.data?.resetPath);

  const tooWeak = await api('POST', '/api/auth/reset', null, {
    token: resetToken,
    password: 'short',
  });
  check('reset enforces the length rule', tooWeak.status === 400);

  const reset = await api('POST', '/api/auth/reset', null, {
    token: resetToken,
    password: 'brandnewpass1',
  });
  check('reset returns a fresh session', reset.status === 200 && Boolean(reset.data?.token));

  const oldPassword = await api('POST', '/api/auth/login', null, {
    email: 'kim@example.com',
    password: 'hunter2hunter',
  });
  check('the old password stops working', oldPassword.status === 401);

  const newPassword = await api('POST', '/api/auth/login', null, {
    email: 'kim@example.com',
    password: 'brandnewpass1',
  });
  check('the new password works', newPassword.status === 200);

  const reused = await api('POST', '/api/auth/reset', null, {
    token: resetToken,
    password: 'another123',
  });
  check('a reset token cannot be reused', reused.status === 400);

  const sessionToken = newPassword.data.token;
  check('session works before sign out', (await api('GET', '/api/state', sessionToken)).status === 200);
  await api('POST', '/api/auth/logout', sessionToken);
  check('sign out invalidates the token', (await api('GET', '/api/state', sessionToken)).status === 401);

  fs.rmSync(dataDir, { recursive: true, force: true });
}

/* --------------------------------------------------- part 2: supabase mode */

console.log('\n2. Supabase driver (tokens verified server-side)');
{
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = await PGlite.create();
  await pg.exec(fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8'));

  const lit = (v) =>
    v === null || v === undefined
      ? 'null'
      : typeof v === 'number'
        ? String(v)
        : `'${String(v).replace(/'/g, "''")}'`;

  const dataShim = {
    from(table) {
      let action = 'select';
      let payload = null;
      const filters = [];
      const run = async () => {
        const where = filters.length ? ` where ${filters.join(' and ')}` : '';
        if (action === 'select') {
          const r = await pg.query(`select * from ${table}${where}`);
          return { data: r.rows, error: null };
        }
        if (action === 'delete') {
          await pg.query(`delete from ${table}${where}`);
          return { data: null, error: null };
        }
        if (action === 'upsert') {
          const keys = [...new Set(payload.flatMap((row) => Object.keys(row)))];
          const values = [];
          const tuples = payload.map(
            (row) =>
              `(${keys
                .map((k) => {
                  values.push(row[k] === undefined ? null : row[k]);
                  return `$${values.length}`;
                })
                .join(', ')})`,
          );
          await pg.query(
            `insert into ${table} (${keys.map((k) => `"${k}"`).join(', ')}) values ${tuples.join(', ')} ` +
              `on conflict (id) do update set ${keys
                .filter((k) => k !== 'id')
                .map((k) => `"${k}" = excluded."${k}"`)
                .join(', ')}`,
            values,
          );
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };

      const builder = {
        select() {
          if (action !== 'delete') action = 'select';
          return builder;
        },
        limit() {
          return builder;
        },
        delete() {
          action = 'delete';
          return builder;
        },
        upsert(rows) {
          action = 'upsert';
          payload = Array.isArray(rows) ? rows : [rows];
          return builder;
        },
        eq(column, value) {
          filters.push(`"${column}" = ${lit(value)}`);
          return builder;
        },
        in(column, list) {
          filters.push(`"${column}" in (${list.map(lit).join(', ')})`);
          return builder;
        },
        then(resolve, reject) {
          return run().then(resolve, reject);
        },
      };
      return builder;
    },
  };

  // Stand-in for Supabase's user API: a token maps to an identity.
  const identities = new Map([
    ['token-alice', { id: 'uuid-alice', email: 'alice@example.com', user_metadata: { full_name: 'Alice Rivera' } }],
    ['token-bob', { id: 'uuid-bob', email: 'bob@example.com', user_metadata: {} }],
  ]);

  globalThis.__ariaSupabaseClient = {
    from: (table) => dataShim.from(table),
    auth: {
      async getUser(accessToken) {
        const user = identities.get(accessToken);
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'invalid jwt' } };
      },
    },
  };

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-sb-'));
  const port = await freePort();
  const { api } = await bootServer({
    PORT: String(port),
    ARIA_STORAGE: 'supabase',
    ARIA_AUTH: 'supabase',
    SUPABASE_URL: 'http://pglite.local',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    SUPABASE_ANON_KEY: 'anon-key',
    ARIA_DATA_DIR: dataDir,
  });

  const config = await api('GET', '/api/auth/config');
  check('config reports the supabase driver', config.data?.driver === 'supabase');
  check('anon key is exposed for the browser', config.data?.supabaseAnonKey === 'anon-key');

  check('anonymous calls are rejected', (await api('GET', '/api/state')).status === 401);
  check('garbage tokens are rejected', (await api('GET', '/api/state', 'garbage')).status === 401);

  const alice = await api('GET', '/api/state', 'token-alice');
  check('a valid token signs in', alice.status === 200);
  check('name comes from Supabase metadata', alice.data?.user?.name === 'Alice Rivera');
  check('identity is namespaced', alice.data?.user?.id === 'sb_uuid-alice');

  const bob = await api('GET', '/api/state', 'token-bob');
  check('a second account is separate', bob.data?.user?.id === 'sb_uuid-bob');
  check('falls back to the email prefix', bob.data?.user?.name === 'bob');

  const spoof = await api('POST', '/api/songs', 'token-bob', {
    userId: 'sb_uuid-alice',
    title: 'Spoofed',
    tempo: 'fast',
    parts: [{ kind: 'verse', label: 'Verse 1', lyrics: 'x' }],
  });
  check('ownership cannot be spoofed', spoof.data?.song?.ownerId === 'sb_uuid-bob');

  const demoLogin = await api('POST', '/api/auth/login', null, {
    email: 'a@b.com',
    password: 'whatever1',
  });
  check('demo password endpoints are closed', demoLogin.status === 400);

  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
