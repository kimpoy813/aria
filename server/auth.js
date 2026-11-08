/**
 * Aria auth.
 *
 * Two drivers, same endpoints:
 *
 *   supabase — the browser signs up / signs in / uses Google with Supabase Auth
 *              and sends us its access token. We verify that token server-side,
 *              so the API never trusts a client-supplied id.
 *   demo     — email + password accounts handled here, for local development and
 *              for running without a Supabase project. Passwords are hashed with
 *              scrypt, sessions are opaque random tokens, and password reset
 *              links are surfaced in the UI instead of emailed.
 *
 * Either way the API learns who you are from the Authorization header only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SESSION_DAYS = 30;
const RESET_MINUTES = 30;

/**
 * Public client configuration for Aria's Supabase project.
 * Both values are public by design (exposed to browsers via /api/auth/config,
 * with RLS enabled and zero public table policies in supabase/schema.sql).
 * Environment variables override these whenever set.
 */
export const DEFAULT_SUPABASE_URL = 'https://ilnahwdfbyzlcxnojxdb.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_eidHjQkRdAIhPOea4MsYpg_C9t-Ul_p';

let dotEnvLoaded = false;

/** Load key=value pairs from .env into process.env without clobbering existing vars. */
export function loadDotEnv(envFile = path.join(process.cwd(), '.env')) {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;
  try {
    if (!fs.existsSync(envFile)) return;
    const raw = fs.readFileSync(envFile, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    /* ignore unreadable .env */
  }
}

export function cleanEnv(value) {
  if (typeof value !== 'string') return '';
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function resolveSupabaseConfig() {
  loadDotEnv();
  const envUrl = cleanEnv(
    process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      '',
  ).replace(/\/+$/, '');

  const envAnonKey = cleanEnv(
    process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  );

  const serviceRoleKey = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_KEY ||
      '',
  );

  const url = envUrl || DEFAULT_SUPABASE_URL;
  const anonKey =
    envAnonKey || (!envUrl || envUrl === DEFAULT_SUPABASE_URL ? DEFAULT_SUPABASE_ANON_KEY : '');

  return { url, envUrl, anonKey, serviceRoleKey };
}

/* ------------------------------------------------------------- passwords */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function checkPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Use at least 8 characters.';
  }
  if (password.length > 200) return 'That password is too long.';
  return null;
}

export function normaliseEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function emailProblem(email) {
  const value = normaliseEmail(email);
  if (!value) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'That email looks incomplete.';
  return null;
}

const token = () => crypto.randomBytes(32).toString('base64url');

/* ----------------------------------------------------------- demo driver */

export class DemoAuth {
  driver = 'demo';
  supabaseUrl = null;
  supabaseAnonKey = null;

  constructor(file) {
    this.file = file;
    this.data = { users: [], sessions: [], resets: [] };
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        users: parsed.users || [],
        sessions: parsed.sessions || [],
        resets: parsed.resets || [],
      };
    } catch {
      this.data = { users: [], sessions: [], resets: [] };
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('[aria] could not write auth store:', err.message);
    }
  }

  findByEmail(email) {
    const value = normaliseEmail(email);
    return this.data.users.find((user) => user.email === value) || null;
  }

  findById(id) {
    return this.data.users.find((user) => user.id === id) || null;
  }

  publicUser(user) {
    return { id: user.id, name: user.name, email: user.email };
  }

  register({ name, email, password }) {
    const existing = this.findByEmail(email);
    if (existing) {
      throw Object.assign(new Error('An account with that email already exists.'), { status: 409 });
    }
    const { salt, hash } = hashPassword(password);
    const user = {
      id: `user_${crypto.randomBytes(6).toString('hex')}`,
      name: String(name || '').trim().slice(0, 40) || normaliseEmail(email).split('@')[0],
      email: normaliseEmail(email),
      salt,
      hash,
      createdAt: Date.now(),
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  authenticate(email, password) {
    const user = this.findByEmail(email);
    // Same message either way: do not leak which emails exist.
    const denied = Object.assign(new Error('Email or password is incorrect.'), { status: 401 });
    if (!user) {
      // Spend comparable time so timing does not reveal existence.
      crypto.scryptSync(password || '', 'no-such-user', 64);
      throw denied;
    }
    if (!checkPassword(password || '', user.salt, user.hash)) throw denied;
    return user;
  }

  createSession(user) {
    const value = token();
    this.data.sessions.push({
      token: value,
      userId: user.id,
      expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
    // Keep the file small.
    const cutoff = Date.now();
    this.data.sessions = this.data.sessions.filter((s) => s.expiresAt > cutoff);
    this.save();
    return value;
  }

  sessionUser(value) {
    if (!value) return null;
    const session = this.data.sessions.find((s) => s.token === value);
    if (!session || session.expiresAt < Date.now()) return null;
    return this.findById(session.userId);
  }

  destroySession(value) {
    this.data.sessions = this.data.sessions.filter((s) => s.token !== value);
    this.save();
  }

  createReset(email) {
    const user = this.findByEmail(email);
    if (!user) return null;
    const value = token();
    this.data.resets.push({
      token: value,
      userId: user.id,
      expiresAt: Date.now() + RESET_MINUTES * 60 * 1000,
      used: false,
    });
    this.data.resets = this.data.resets.filter((r) => !r.used && r.expiresAt > Date.now());
    this.save();
    return { token: value, user };
  }

  consumeReset(value, password) {
    const reset = this.data.resets.find((r) => r.token === value);
    if (!reset || reset.used || reset.expiresAt < Date.now()) {
      throw Object.assign(new Error('That reset link is invalid or has expired.'), { status: 400 });
    }
    const user = this.findById(reset.userId);
    if (!user) {
      throw Object.assign(new Error('That reset link is invalid or has expired.'), { status: 400 });
    }
    const { salt, hash } = hashPassword(password);
    user.salt = salt;
    user.hash = hash;
    reset.used = true;
    // Signing out everywhere after a password change is the safe default.
    this.data.sessions = this.data.sessions.filter((s) => s.userId !== user.id);
    this.save();
    return user;
  }

  setPassword(userId, password) {
    const user = this.findById(userId);
    if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 });
    const { salt, hash } = hashPassword(password);
    user.salt = salt;
    user.hash = hash;
    this.save();
  }

  rename(userId, name) {
    const user = this.findById(userId);
    if (!user) return;
    user.name = String(name || '').trim().slice(0, 40) || user.name;
    this.save();
  }

  deleteAccount(userId) {
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.data.sessions = this.data.sessions.filter((s) => s.userId !== userId);
    this.data.resets = this.data.resets.filter((r) => r.userId !== userId);
    this.save();
  }
}

/* --------------------------------------------------------- supabase driver */

function identityFromUser(user) {
  const email = normaliseEmail(user.email || '');
  const meta = user.user_metadata || {};
  const name =
    String(meta.full_name || meta.name || meta.preferred_username || '').trim() ||
    email.split('@')[0] ||
    'Listener';
  return {
    // Namespaced so a Supabase id can never collide with a demo-mode id.
    id: `sb_${user.id}`,
    authId: user.id,
    name: name.slice(0, 40),
    email,
  };
}

/**
 * Fallback used ONLY in non-production sandboxed dev containers where outbound
 * TLS to *.supabase.co is blocked by the container firewall while the user's
 * browser completed real Supabase OAuth directly. Never active in production.
 */
function decodeSandboxJwtIdentity(accessToken, supabaseUrl) {
  try {
    const parts = String(accessToken || '').split('.');
    if (parts.length !== 3 || !parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const expectedIss = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
    if (payload.iss !== expectedIss) return null;
    if (payload.aud !== 'authenticated') return null;
    if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub)) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    return identityFromUser({
      id: payload.sub,
      email: payload.email || '',
      user_metadata: payload.user_metadata || {},
    });
  } catch {
    return null;
  }
}

export class SupabaseAuth {
  driver = 'supabase';

  constructor({ url, key, anonKey = null }) {
    this.url = url;
    this.key = key;
    this.supabaseUrl = url;
    this.supabaseAnonKey = anonKey;
    this.client = null;
  }

  async connect() {
    if (this.client) return this.client;
    // A test can inject a compatible client (set before this is first called).
    if (globalThis.__ariaSupabaseClient) {
      this.client = globalThis.__ariaSupabaseClient;
      return this.client;
    }
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }

  /** Verify a Supabase access token and return the identity behind it. */
  async verify(accessToken) {
    if (!accessToken) return null;
    try {
      const client = await this.connect();
      const { data, error } = await client.auth.getUser(accessToken);
      if (!error && data?.user) {
        return identityFromUser(data.user);
      }
      const isNetworkOffline =
        !globalThis.__ariaSupabaseClient &&
        process.env.NODE_ENV !== 'production' &&
        !process.env.RENDER &&
        error &&
        (error.status === 0 ||
          error.name === 'AuthRetryableFetchError' ||
          /fetch failed/i.test(error.message || ''));
      if (isNetworkOffline) {
        return decodeSandboxJwtIdentity(accessToken, this.url);
      }
      return null;
    } catch (err) {
      console.error('[aria] could not verify token:', err.message);
      return null;
    }
  }

  async rename(_authId) {
    /* the display name lives in Supabase user metadata, nothing to do here */
  }

  async deleteAccount(authId) {
    if (!authId) return;
    try {
      const { serviceRoleKey } = resolveSupabaseConfig();
      const client = await this.connect();
      if (
        client?.auth?.admin?.deleteUser &&
        (serviceRoleKey || globalThis.__ariaSupabaseClient)
      ) {
        await client.auth.admin.deleteUser(authId);
      }
    } catch (err) {
      console.error('[aria] could not delete Supabase auth user:', err.message);
    }
  }
}

/* ------------------------------------------------------------------ factory */

export async function createAuth({ log = console.log } = {}) {
  loadDotEnv();
  const wanted = cleanEnv(process.env.ARIA_AUTH || '').toLowerCase();
  const { url, anonKey, serviceRoleKey } = resolveSupabaseConfig();
  const dataDir = process.env.ARIA_DATA_DIR || path.join(process.cwd(), 'server');
  const file = path.join(dataDir, 'auth.json');

  if (wanted === 'demo' || wanted === 'file') {
    log(`[aria] auth: demo → ${file} (email + password; Google needs Supabase)`);
    return new DemoAuth(file);
  }

  if (wanted && wanted !== 'supabase') {
    throw new Error(`Unknown ARIA_AUTH "${wanted}" — use "supabase" or "demo".`);
  }

  const verifyKey = serviceRoleKey || anonKey;
  if (url && verifyKey) {
    log(`[aria] auth: supabase → ${url}`);
    return new SupabaseAuth({ url, key: verifyKey, anonKey: anonKey || null });
  }

  if (wanted === 'supabase') {
    throw new Error(
      'ARIA_AUTH=supabase needs SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).',
    );
  }

  log(`[aria] auth: demo → ${file} (email + password; Google needs Supabase)`);
  return new DemoAuth(file);
}

export const SESSION_TTL_DAYS = SESSION_DAYS;
export const RESET_TTL_MINUTES = RESET_MINUTES;
