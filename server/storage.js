/**
 * Aria storage.
 *
 * The API keeps working against in-memory arrays, and this module decides where
 * they actually live:
 *
 *   - `file`      (default locally) — server/data.json, resets on redeploy when
 *                 the host has an ephemeral disk.
 *   - `supabase`  (used on Render)  — the same rows in Postgres via the service
 *                 role key, so data survives deploys and restarts.
 *
 * Pick the driver with ARIA_STORAGE=file|supabase. If it is unset we use Supabase
 * as soon as SUPABASE_URL and a service key are present, otherwise the file.
 */

import fs from 'node:fs';
import path from 'node:path';

export const COLLECTIONS = ['users', 'teams', 'songs', 'lineups'];

/* ------------------------------------------------------------------ helpers */

function emptyState() {
  return { users: [], teams: [], songs: [], lineups: [] };
}

/** Field name → Postgres column, per table. Explicit on purpose: a typo here
 *  should fail loudly in the smoke test rather than silently drop a column. */
const COLUMNS = {
  users: {
    id: 'id',
    name: 'name',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  teams: {
    id: 'id',
    name: 'name',
    code: 'code',
    ownerId: 'owner_id',
    members: 'members',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  songs: {
    id: 'id',
    title: 'title',
    artist: 'artist',
    tempo: 'tempo',
    theme: 'theme',
    parts: 'parts',
    analysis: 'analysis',
    lyrics: 'lyrics',
    ownerId: 'owner_id',
    ownerName: 'owner_name',
    teamId: 'team_id',
    sourceSongId: 'source_song_id',
    copiedFrom: 'copied_from',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  lineups: {
    id: 'id',
    name: 'name',
    theme: 'theme',
    ownerId: 'owner_id',
    ownerName: 'owner_name',
    teamId: 'team_id',
    items: 'items',
    shareToken: 'share_token',
    sourceLineupId: 'source_lineup_id',
    copiedFrom: 'copied_from',
    lastUsedAt: 'last_used_at',
    useCount: 'use_count',
    lastUsedReason: 'last_used_reason',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
};

/** Values Postgres fills itself, so they must never be written explicitly. */
const GENERATED = new Set(['created_at', 'updated_at']);

/** Columns that reject null and what to write instead. */
const REQUIRED_DEFAULTS = {
  teams: { name: '', code: '', owner_id: '', members: [] },
  songs: { title: '', artist: 'Unknown artist', tempo: 'slow', theme: '', parts: [], lyrics: '' },
  lineups: { name: '', theme: '', owner_id: '', owner_name: '', items: [], use_count: 0 },
  // note: team_id, source_*_id, last_used_at, copied_from and share_token are
  // intentionally nullable and are left as null.
  users: { name: '' },
};

function toRow(collection, record) {
  const map = COLUMNS[collection];
  const defaults = REQUIRED_DEFAULTS[collection] || {};
  const row = {};
  for (const [field, column] of Object.entries(map)) {
    if (GENERATED.has(column)) continue;
    const value = record[field];
    if (value === undefined || value === null) {
      // Never write null into a required column; let the column default stand
      // only when the schema says so, otherwise use a safe value.
      row[column] = column in defaults ? defaults[column] : null;
    } else {
      row[column] = value;
    }
  }
  return row;
}

function fromRow(collection, row) {
  const map = COLUMNS[collection];
  const value = {};
  for (const [field, column] of Object.entries(map)) {
    const raw = row[column];
    if (column === 'created_at' || column === 'updated_at') {
      value[field] = Number(raw ?? 0);
    } else {
      value[field] = raw === undefined ? null : raw;
    }
  }
  // Normalise the fields the app treats as optional.
  if (collection === 'users') {
    value.isDemo = !!row.is_demo;
  }
  if (collection === 'teams') {
    value.members = row.members ?? [];
  }
  if (collection === 'songs') {
    value.theme = row.theme ?? '';
    value.parts = row.parts ?? [];
    value.lyrics = row.lyrics ?? '';
    value.copiedFrom = row.copied_from ?? null;
  }
  if (collection === 'lineups') {
    value.theme = row.theme ?? '';
    value.items = row.items ?? [];
    value.shareToken = row.share_token ?? '';
    value.copiedFrom = row.copied_from ?? null;
    value.lastUsedAt =
      row.last_used_at === null || row.last_used_at === undefined ? null : Number(row.last_used_at);
    value.useCount = Number(row.use_count ?? 0);
    value.lastUsedReason = row.last_used_reason ?? null;
  }
  return value;
}

/* --------------------------------------------------------------- file store */

export class FileStore {
  driver = 'file';

  constructor(file) {
    this.file = file;
  }

  async load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        users: parsed.users || [],
        teams: parsed.teams || [],
        songs: parsed.songs || [],
        lineups: parsed.lineups || [],
      };
    } catch {
      return emptyState();
    }
  }

  async persist(state) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error(`[aria] could not write ${this.file}:`, err.message);
    }
  }

  describe() {
    return this.file;
  }
}

/* ----------------------------------------------------------- supabase store */

export class SupabaseStore {
  driver = 'supabase';

  constructor({ url, key }) {
    this.url = url;
    this.key = key;
    this.client = null;
  }

  async connect() {
    if (this.client) return this.client;
    // A test (or a future proxy) can inject a compatible client.
    if (globalThis.__ariaSupabaseClient) {
      this.client = globalThis.__ariaSupabaseClient;
      return this.client;
    }
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Fail fast (and loudly) if the project is unreachable or keyed wrong.
    const { error } = await this.client.from('users').select('id').limit(1);
    if (error) {
      throw new Error(
        `Supabase is not ready (${error.message}). Did you run supabase/schema.sql?`,
      );
    }
    return this.client;
  }

  async load() {
    const client = await this.connect();
    const state = emptyState();
    await Promise.all(
      COLLECTIONS.map(async (collection) => {
        const { data, error } = await client.from(collection).select('*');
        if (error) throw new Error(`Could not read ${collection}: ${error.message}`);
        state[collection] = (data || []).map((row) => fromRow(collection, row));
      }),
    );
    return state;
  }

  /**
   * Mirror the whole state into Postgres.
   * Upsert everything, then delete rows that disappeared locally. Row counts are
   * tiny for this app, and doing it in one pass keeps deletes consistent.
   */
  async persist(state) {
    const client = await this.connect();
    for (const collection of COLLECTIONS) {
      const records = state[collection] || [];
      if (records.length > 0) {
        const rows = records.map((record) => toRow(collection, record));
        const { error } = await client.from(collection).upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Could not save ${collection}: ${error.message}`);
      }
      const { data: existing, error: readError } = await client.from(collection).select('id');
      if (readError) throw new Error(`Could not read ${collection}: ${readError.message}`);
      const keep = new Set(records.map((record) => record.id));
      const stale = (existing || []).map((row) => row.id).filter((id) => !keep.has(id));
      if (stale.length > 0) {
        const { error: deleteError } = await client.from(collection).delete().in('id', stale);
        if (deleteError) throw new Error(`Could not prune ${collection}: ${deleteError.message}`);
      }
    }
  }

  describe() {
    return `${this.url} (Postgres via service role)`;
  }
}

/* ------------------------------------------------------------------ factory */

export async function createStore({ log = console.log } = {}) {
  const wanted = (process.env.ARIA_STORAGE || '').toLowerCase();
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  const dataDir = process.env.ARIA_DATA_DIR || path.join(process.cwd(), 'server');
  const file = path.join(dataDir, 'data.json');

  const useSupabase = wanted === 'supabase' || (!wanted && Boolean(url && key));

  if (useSupabase) {
    if (!url || !key) {
      throw new Error(
        'ARIA_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.',
      );
    }
    const store = new SupabaseStore({ url, key });
    await store.connect();
    log(`[aria] storage: supabase → ${url}`);
    return store;
  }

  if (wanted && wanted !== 'file') {
    throw new Error(`Unknown ARIA_STORAGE "${wanted}" — use "file" or "supabase".`);
  }

  log(`[aria] storage: file → ${file}`);
  return new FileStore(file);
}
