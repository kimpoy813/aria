import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCallerBridge, createStore, defaultSettings } from './storage.js';
import {
  createAdminGate,
  createAuth,
  loadDotEnv,
  normaliseEmail,
  emailProblem,
  passwordProblem,
  SESSION_TTL_DAYS,
  RESET_TTL_MINUTES,
} from './auth.js';

loadDotEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 5174);


const uid = (prefix = 'id') => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
const now = () => Date.now();
const clean = (value, max = 400) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/* ------------------------------------------------------------------ store */

let store = null;
let auth = null;
let callerBridge = null;
let adminGate = null;
let db = { users: [], teams: [], songs: [], lineups: [], settings: defaultSettings() };
let saveTimer = null;
let saveChain = Promise.resolve();
let saveWarning = null;

function flushSaveChain() {
  if (!store) return Promise.resolve();
  clearTimeout(saveTimer);
  saveChain = saveChain
    .then(() => store.persist(db))
    .then(() => {
      saveWarning = null;
    })
    .catch((err) => {
      const message = err?.message || String(err);
      if (message !== saveWarning) {
        saveWarning = message;
        console.error('[aria] save failed:', message);
      }
    });
  return saveChain;
}

function save() {
  if (!store) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flushSaveChain();
  }, 60);
}

async function persistForCaller(req) {
  if (store?.driver === 'supabase') {
    await flushSaveChain();
    return;
  }
  save();
  if (callerBridge && req?.supabaseAccessToken && req?.user?.id?.startsWith('sb_')) {
    await callerBridge.syncCaller(req.supabaseAccessToken, req.user, db);
  }
}

/* -------------------------------------------------------- legacy demo purge */

/**
 * Ensure legacy seeded demo records (Aria Studio / ARIA-123) are removed if
 * an older local store file still contains them.
 */
function purgeLegacyDemoData() {
  const demoUserIds = new Set(
    db.users.filter((u) => u.isDemo || u.name === 'Aria Studio').map((u) => u.id),
  );
  const demoTeamIds = new Set(
    db.teams
      .filter((t) => t.code === 'ARIA-123' && demoUserIds.has(t.ownerId))
      .map((t) => t.id),
  );

  if (demoUserIds.size === 0 && demoTeamIds.size === 0) return;

  db.users = db.users.filter((u) => !demoUserIds.has(u.id));
  db.teams = db.teams.filter((t) => !demoTeamIds.has(t.id));
  db.songs = db.songs.filter(
    (s) => !demoUserIds.has(s.ownerId) && !(s.teamId && demoTeamIds.has(s.teamId)),
  );
  db.lineups = db.lineups.filter(
    (l) => !demoUserIds.has(l.ownerId) && !(l.teamId && demoTeamIds.has(l.teamId)),
  );
  save();
}

/* ------------------------------------------------------------ boot sequence */

async function boot() {
  store = await createStore({ log: (line) => console.log(line) });
  auth = await createAuth({ log: (line) => console.log(line) });
  callerBridge = createCallerBridge({
    store,
    auth,
    log: (line) => console.log(line),
  });
  adminGate = createAdminGate();
  db = await store.load();
  if (!db.settings) db.settings = defaultSettings();
  purgeLegacyDemoData();
  return store;
}

/* --------------------------------------------------------------- helpers */

function getUser(userId) {
  return db.users.find((u) => u.id === userId) || null;
}

function getTeam(teamId) {
  return db.teams.find((t) => t.id === teamId) || null;
}

function myTeams(userId) {
  return db.teams.filter((t) => t.members.some((m) => m.userId === userId));
}

function teamIdsFor(userId) {
  return myTeams(userId).map((t) => t.id);
}

function teamView(team, userId) {
  return {
    id: team.id,
    name: team.name,
    code: team.code,
    ownerId: team.ownerId,
    createdAt: team.createdAt,
    members: team.members.map((m) => ({
      userId: m.userId,
      name: m.name,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    myRole: team.members.find((m) => m.userId === userId)?.role || null,
  };
}

function areTeammates(ownerId, viewerId) {
  if (!ownerId || !viewerId) return false;
  if (ownerId === viewerId) return true;
  return db.teams.some(
    (t) =>
      Array.isArray(t.members) &&
      t.members.some((m) => m.userId === ownerId) &&
      t.members.some((m) => m.userId === viewerId),
  );
}

function canView(record, userId) {
  if (record.ownerId === userId) return true;
  if (areTeammates(record.ownerId, userId)) return true;
  if (record.teamId) {
    const team = getTeam(record.teamId);
    return !!team && team.members.some((m) => m.userId === userId);
  }
  return false;
}

function visibleRecords(records, userId) {
  return records.filter((r) => canView(r, userId));
}

function resolvePartFromSong(song, item) {
  if (!song || !Array.isArray(song.parts)) return null;
  let part = song.parts.find((p) => p.id === item.partId);
  if (!part && item.partLabel) {
    const targetLabel = String(item.partLabel).toLowerCase();
    part = song.parts.find((p) => String(p.label || '').toLowerCase() === targetLabel);
  }
  if (!part && item.partKind) {
    part = song.parts.find((p) => p.kind === item.partKind);
  }
  return part || null;
}

function snapshotSlot(song, part, slotId = uid('slot')) {
  return {
    id: slotId,
    songId: song.id,
    partId: part.id,
    songTitle: song.title,
    artist: song.artist || 'Unknown artist',
    tempo: song.tempo === 'fast' ? 'fast' : 'slow',
    partKind: part.kind || 'verse',
    partLabel: part.label || 'Part',
    lyrics: part.lyrics || '',
  };
}

function publicLineup(lineup, songs) {
  const items = [];
  const songKeys = new Set();

  for (const item of lineup.items) {
    const song = songs.find((s) => s.id === item.songId);
    const part = resolvePartFromSong(song, item);

    if (song && part && part.lyrics) {
      songKeys.add(song.id);
      items.push({
        songTitle: song.title,
        artist: song.artist || 'Unknown artist',
        tempo: song.tempo === 'fast' ? 'fast' : 'slow',
        partKind: part.kind || 'verse',
        partLabel: part.label || 'Part',
        lyrics: part.lyrics,
      });
    } else if (item && item.lyrics) {
      songKeys.add(item.songId || item.songTitle || item.id);
      items.push({
        songTitle: song?.title || item.songTitle || 'Untitled song',
        artist: song?.artist || item.artist || 'Unknown artist',
        tempo: (song?.tempo || item.tempo) === 'fast' ? 'fast' : 'slow',
        partKind: item.partKind || 'verse',
        partLabel: item.partLabel || 'Part',
        lyrics: item.lyrics,
      });
    }
  }

  return {
    name: lineup.name,
    theme: lineup.theme,
    ownerName: lineup.ownerName,
    createdAt: lineup.createdAt,
    updatedAt: lineup.updatedAt,
    lastUsedAt: lineup.lastUsedAt,
    useCount: lineup.useCount,
    songCount: songKeys.size || new Set(lineup.items.map((i) => i.songId)).size,
    items,
  };
}

function stampUse(lineup, reason) {
  lineup.lastUsedAt = now();
  lineup.useCount = (lineup.useCount || 0) + 1;
  lineup.lastUsedReason = reason;
  save();
}

function lruSort(lineups) {
  return [...lineups].sort((a, b) => {
    const ak = a.lastUsedAt || 0;
    const bk = b.lastUsedAt || 0;
    if (ak !== bk) return ak - bk;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

/** Deep copy a song into a user's library. Returns the copy. */
function copySong(song, user, teamId = null) {
  const parts = song.parts.map((p) => ({
    id: uid('part'),
    kind: p.kind,
    label: p.label,
    lyrics: p.lyrics,
  }));
  const copy = {
    ...song,
    id: uid('song'),
    parts,
    ownerId: user.id,
    ownerName: user.name,
    teamId,
    sourceSongId: song.sourceSongId || song.id,
    copiedFrom: `${song.title} · ${song.ownerName}`,
    createdAt: now(),
    updatedAt: now(),
  };
  db.songs.push(copy);
  save();
  return copy;
}

/** Deep copy a lineup (and the songs it needs) into a user's library. */
function copyLineup(lineup, user, teamId = null) {
  const songMap = new Map(); // oldSongId -> { song, partsByOldId }
  const items = [];

  for (const item of lineup.items) {
    const source = db.songs.find((s) => s.id === item.songId);
    if (!source) {
      if (item && item.lyrics) {
        items.push({ ...item, id: uid('slot') });
      }
      continue;
    }

    let mapped = songMap.get(source.id);
    if (!mapped) {
      let existing =
        source.ownerId === user.id
          ? source
          : db.songs.find(
              (s) =>
                s.ownerId === user.id &&
                (s.id === source.id ||
                  s.sourceSongId === (source.sourceSongId || source.id)),
            );
      if (!existing) existing = copySong(source, user, teamId);
      const partsByOldId = new Map();
      source.parts.forEach((p, index) => {
        const target =
          existing.parts[index] ||
          resolvePartFromSong(existing, { partId: p.id, partLabel: p.label, partKind: p.kind });
        if (target) partsByOldId.set(p.id, target);
      });
      mapped = { song: existing, partsByOldId };
      songMap.set(source.id, mapped);
    }

    const sourcePart = resolvePartFromSong(source, item);
    const part =
      mapped.partsByOldId.get(item.partId) ||
      (sourcePart ? mapped.partsByOldId.get(sourcePart.id) : null) ||
      resolvePartFromSong(mapped.song, item);
    if (!part) continue;
    items.push(snapshotSlot(mapped.song, part));
  }

  const sourceSongs = db.songs.filter((s) => songMap.has(s.id));
  const generated = sourceSongs.length > 0 ? JSON.stringify(
    sourceSongs.flatMap((s) => s.parts.map((p) => p.lyrics)),
  ) : '';
  if (generated.length > 400000) {
    throw Object.assign(new Error('Lineup too large to copy'), { status: 400 });
  }

  const copy = {
    ...lineup,
    id: uid('lineup'),
    name: lineup.name,
    ownerId: user.id,
    ownerName: user.name,
    teamId,
    items,
    shareToken: crypto.randomBytes(6).toString('base64url'),
    sourceLineupId: lineup.sourceLineupId || lineup.id,
    copiedFrom: `${lineup.name} · ${lineup.ownerName}`,
    createdAt: now(),
    updatedAt: now(),
    lastUsedAt: null,
    useCount: 0,
    lastUsedReason: null,
  };
  db.lineups.push(copy);
  save();
  return copy;
}

/* ------------------------------------------------------------------- app */

const app = express();
app.use(express.json({ limit: '2mb' }));

/* ------------------------------------------------------------- identity */

function isAdminUser(user) {
  if (!user) return false;
  if (user.id === 'user_admin' || user.role === 'admin') return true;
  if (adminGate && user.email && adminGate.isConfiguredAdminEmail(user.email)) return true;
  return false;
}

function publicUserView(user) {
  if (!user) return null;
  const admin = isAdminUser(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: admin ? 'admin' : 'user',
    isAdmin: admin,
    suspended: admin ? false : Boolean(user.suspended),
    createdAt: user.createdAt,
  };
}

/** Ensure a data record exists for this authenticated identity. */
function ensureUserRecord(identity) {
  let user = getUser(identity.id);
  const shouldBeAdmin =
    identity.id === 'user_admin' ||
    identity.role === 'admin' ||
    Boolean(adminGate && identity.email && adminGate.isConfiguredAdminEmail(identity.email));

  if (!user) {
    user = {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      role: shouldBeAdmin ? 'admin' : 'user',
      suspended: false,
      createdAt: now(),
    };
    db.users.push(user);
    save();
  } else {
    let dirty = false;
    if (identity.email && !user.email) {
      user.email = identity.email;
      dirty = true;
    }
    if (identity.name && (!user.name || user.name === 'Listener')) {
      user.name = identity.name;
      dirty = true;
    }
    if (shouldBeAdmin && user.role !== 'admin') {
      user.role = 'admin';
      user.suspended = false;
      dirty = true;
    }
    if (dirty) save();
  }
  return user;
}

function bearer(req) {
  const header = req.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

/** Attaches req.user when the request carries valid credentials. */
async function resolveIdentity(req, _res, next) {
  try {
    const value = bearer(req);
    if (!value) return next();

    if (adminGate && value.startsWith('adm.')) {
      const adminIdentity = adminGate.verifySession(value);
      if (adminIdentity) {
        req.authId = adminIdentity.id;
        req.identity = adminIdentity;
        req.adminSessionToken = value;
      }
      return next();
    }

    if (!auth) return next();
    if (auth.driver === 'demo') {
      const user = auth.sessionUser(value);
      if (user) {
        req.authId = user.id;
        req.identity = { id: user.id, name: user.name, email: user.email };
        req.sessionToken = value;
      }
    } else {
      const identity = await auth.verify(value);
      if (identity) {
        req.authId = identity.authId;
        req.identity = identity;
        req.supabaseAccessToken = value;
        if (callerBridge && identity.id?.startsWith('sb_')) {
          await callerBridge.hydrateCaller(value, identity.id, db);
        }
      }
    }
  } catch (err) {
    console.error('[aria] identity lookup failed:', err.message);
  }
  return next();
}

/**
 * Guard for data routes. Returns true when the request may continue; when it
 * returns false it has already answered (401/403), so the caller must stop.
 */
function requireUser(req, res) {
  if (req.identity) {
    const user = ensureUserRecord(req.identity);
    if (user.suspended && !isAdminUser(user)) {
      res.status(403).json({
        error: 'Your account has been suspended by an administrator.',
        code: 'ACCOUNT_SUSPENDED',
      });
      return false;
    }
    req.user = user;
    return true;
  }
  res.status(401).json({ error: 'Please sign in to continue.' });
  return false;
}

function requireAdmin(req, res) {
  if (!requireUser(req, res)) return false;
  if (!isAdminUser(req.user)) {
    res.status(403).json({ error: 'Administrator access required.' });
    return false;
  }
  return true;
}

function checkMaintenanceWrite(req, res) {
  if (isAdminUser(req.user)) return true;
  const m = db.settings?.maintenance;
  if (m?.enabled && m?.mode === 'maintenance') {
    res.status(503).json({
      error: m.title || 'Aria is currently undergoing scheduled maintenance.',
      code: 'MAINTENANCE_MODE',
    });
    return false;
  }
  return true;
}

function purgeUserContent(userId) {
  const deletedSongIds = new Set(
    db.songs.filter((s) => s.ownerId === userId).map((s) => s.id),
  );
  db.songs = db.songs.filter((s) => s.ownerId !== userId);
  db.lineups = db.lineups.filter((l) => l.ownerId !== userId);

  for (const l of db.lineups) {
    if (!Array.isArray(l.items)) continue;
    l.items = l.items.filter((i) => !deletedSongIds.has(i.songId) || Boolean(i.lyrics));
  }

  const emptyTeamIds = new Set();
  for (const team of db.teams) {
    if (!Array.isArray(team.members)) continue;
    const hadUser = team.members.some((m) => m.userId === userId);
    if (!hadUser) continue;
    team.members = team.members.filter((m) => m.userId !== userId);
    if (team.members.length === 0) {
      emptyTeamIds.add(team.id);
    } else if (team.ownerId === userId) {
      team.ownerId = team.members[0].userId;
      team.members[0].role = 'owner';
    }
  }
  if (emptyTeamIds.size > 0) {
    db.teams = db.teams.filter((t) => !emptyTeamIds.has(t.id));
    db.songs.forEach((s) => {
      if (s.teamId && emptyTeamIds.has(s.teamId)) s.teamId = null;
    });
    db.lineups.forEach((l) => {
      if (l.teamId && emptyTeamIds.has(l.teamId)) l.teamId = null;
    });
  }

  db.users = db.users.filter((u) => u.id !== userId);
}

const api = express.Router();
api.use(resolveIdentity);

api.get('/health', (_req, res) => res.json({ ok: true }));

api.get('/system/status', (_req, res) => {
  const settings = db.settings || defaultSettings();
  res.json({
    maintenance: settings.maintenance,
    allowRegistration: settings.allowRegistration !== false,
  });
});

/* ---------------------------------------------------------------- auth */

const oauthRelay = new Map();
const OAUTH_RELAY_TTL_MS = 10 * 60 * 1000;
const validRelayNonce = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);

function pruneOAuthRelay() {
  const cutoff = now();
  for (const [key, entry] of oauthRelay.entries()) {
    if (entry.expiresAt <= cutoff) oauthRelay.delete(key);
  }
}

api.get('/auth/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    driver: auth?.driver || 'demo',
    supabaseUrl: auth?.driver === 'supabase' ? auth.supabaseUrl : null,
    supabaseAnonKey: auth?.driver === 'supabase' ? auth.supabaseAnonKey : null,
    sessionDays: SESSION_TTL_DAYS,
    resetMinutes: RESET_TTL_MINUTES,
  });
});

/**
 * Short-lived single-use relay for Google OAuth popups & standalone PWA Custom Tabs
 * (where accounts.google.com blocks framing via X-Frame-Options and COOP / Custom Tab
 * storage partitioning isolates the OAuth tab from the opener or installed app).
 */
api.post('/auth/relay', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  pruneOAuthRelay();
  const nonce = clean(req.body?.nonce, 128);
  if (!validRelayNonce(nonce)) {
    return res.status(400).json({ error: 'Invalid OAuth relay nonce.' });
  }
  const accessToken = clean(req.body?.accessToken, 8192) || null;
  const refreshToken = clean(req.body?.refreshToken, 4096) || null;
  const error = clean(req.body?.error, 500) || null;
  if (!accessToken && !error) {
    return res.status(400).json({ error: 'Relay payload is empty.' });
  }
  if (oauthRelay.size >= 200) {
    const oldest = oauthRelay.keys().next().value;
    if (oldest) oauthRelay.delete(oldest);
  }
  oauthRelay.set(nonce, {
    accessToken,
    refreshToken,
    error,
    expiresAt: now() + OAUTH_RELAY_TTL_MS,
  });
  res.json({ ok: true });
});

api.get('/auth/relay/:nonce', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  pruneOAuthRelay();
  const nonce = clean(req.params.nonce, 128);
  if (!validRelayNonce(nonce)) {
    return res.status(400).json({ error: 'Invalid OAuth relay nonce.' });
  }
  const entry = oauthRelay.get(nonce);
  if (!entry) return res.json({ pending: true });
  oauthRelay.delete(nonce);
  res.json({
    pending: false,
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
    error: entry.error,
  });
});

api.get('/auth/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.identity) return res.json({ user: null });
  const user = ensureUserRecord(req.identity);
  if (user.suspended && !isAdminUser(user)) {
    return res.status(403).json({
      error: 'Your account has been suspended by an administrator.',
      code: 'ACCOUNT_SUSPENDED',
    });
  }
  res.json({ user: publicUserView(user) });
});

/**
 * Built-in system administrator login — works regardless of whether the regular
 * auth driver is Supabase or Demo.
 */
api.post('/auth/admin-login', (req, res) => {
  const email = normaliseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!adminGate || !adminGate.matchesAdminEmail(email)) {
    return res.json({ matched: false });
  }
  const identity = adminGate.authenticate(email, password);
  if (!identity) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const user = ensureUserRecord(identity);
  const session = adminGate.createSession();
  res.json({ matched: true, token: session, user: publicUserView(user) });
});

api.post('/auth/register', (req, res) => {
  if (db.settings?.allowRegistration === false) {
    return res
      .status(403)
      .json({ error: 'New account registration is currently paused by the administrator.' });
  }
  if (!auth || auth.driver !== 'demo') {
    return res.status(400).json({ error: 'Registration is handled by Supabase in this deployment.' });
  }
  const name = clean(req.body?.name, 40);
  const email = normaliseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const emailIssue = emailProblem(email);
  if (emailIssue) return res.status(400).json({ error: emailIssue });
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) return res.status(400).json({ error: passwordIssue });
  if (adminGate && adminGate.matchesAdminEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  try {
    const account = auth.register({ name, email, password });
    const session = auth.createSession(account);
    const user = ensureUserRecord({
      id: account.id,
      name: account.name,
      email: account.email,
    });
    res.json({ token: session, user: publicUserView(user) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

api.post('/auth/login', (req, res) => {
  const email = normaliseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (adminGate && adminGate.matchesAdminEmail(email)) {
    const identity = adminGate.authenticate(email, password);
    if (!identity) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const user = ensureUserRecord(identity);
    const session = adminGate.createSession();
    return res.json({ token: session, user: publicUserView(user) });
  }

  if (!auth || auth.driver !== 'demo') {
    return res.status(400).json({ error: 'Sign-in is handled by Supabase in this deployment.' });
  }
  try {
    const account = auth.authenticate(email, password);
    const user = ensureUserRecord({
      id: account.id,
      name: account.name,
      email: account.email,
    });
    if (user.suspended && !isAdminUser(user)) {
      return res.status(403).json({
        error: 'Your account has been suspended by an administrator.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }
    const session = auth.createSession(account);
    res.json({ token: session, user: publicUserView(user) });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
  }
});

api.post('/auth/logout', (req, res) => {
  if (req.adminSessionToken && adminGate) adminGate.revokeSession(req.adminSessionToken);
  if (auth?.driver === 'demo' && req.sessionToken) auth.destroySession(req.sessionToken);
  res.json({ ok: true });
});

/** Step one of a reset: ask for a link. Always the same answer. */
api.post('/auth/forgot', (req, res) => {
  if (!auth || auth.driver !== 'demo') {
    return res.status(400).json({ error: 'Password reset is handled by Supabase in this deployment.' });
  }
  const email = normaliseEmail(req.body?.email);
  const issue = emailProblem(email);
  if (issue) return res.status(400).json({ error: issue });

  const reset = auth.createReset(email);
  if (!reset) {
    // No such account: say nothing that reveals it.
    return res.json({ ok: true, delivered: false });
  }
  res.json({
    ok: true,
    delivered: false,
    // Demo mode has no mail server, so the link is returned once for the UI.
    resetPath: `/reset?token=${reset.token}`,
    email,
  });
});

/** Step two: set a new password with the token. */
api.post('/auth/reset', (req, res) => {
  if (!auth || auth.driver !== 'demo') {
    return res.status(400).json({ error: 'Password reset is handled by Supabase in this deployment.' });
  }
  const value = clean(req.body?.token, 200);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const issue = passwordProblem(password);
  if (issue) return res.status(400).json({ error: issue });
  try {
    const account = auth.consumeReset(value, password);
    const session = auth.createSession(account);
    const user = ensureUserRecord({
      id: account.id,
      name: account.name,
      email: account.email,
    });
    res.json({ token: session, user });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/** Signed-in password change (Supabase driver: the UI calls Supabase directly). */
api.post('/auth/password', (req, res) => {
  if (!requireUser(req, res)) return;
  if (!auth || auth.driver !== 'demo') {
    return res.status(400).json({ error: 'Use Supabase to change your password.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const issue = passwordProblem(password);
  if (issue) return res.status(400).json({ error: issue });
  const account = auth.findById(req.user.id);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  auth.setPassword(req.user.id, password);
  res.json({ ok: true });
});

/**
 * Permanently delete the signed-in user's account and all associated content
 * (required by Google Play Data Safety Account Deletion policy).
 */
api.delete('/auth/account', async (req, res) => {
  if (!requireUser(req, res)) return;
  const userId = req.user.id;
  const authId = req.authId;
  if (userId === 'user_admin') {
    return res.status(400).json({ error: 'The built-in system admin account cannot be deleted.' });
  }

  try {
    purgeUserContent(userId);

    if (callerBridge && req.supabaseAccessToken && userId.startsWith('sb_')) {
      await callerBridge.teamOp(req.supabaseAccessToken, { op: 'delete_account' });
    }

    await flushSaveChain();

    if (auth?.driver === 'demo') {
      auth.deleteAccount(userId);
    } else if (auth?.deleteAccount) {
      await auth.deleteAccount(authId);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not delete account.' });
  }
});

api.get('/state', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (callerBridge && req.supabaseAccessToken && req.user?.id?.startsWith('sb_')) {
    await callerBridge.hydrateCaller(req.supabaseAccessToken, req.user.id, db, { force: true });
  }
  const user = ensureUserRecord(req.identity);
  const userId = user.id;
  const teams = myTeams(userId);
  const lineups = visibleRecords(db.lineups, userId);
  const referencedSongIds = new Set(
    lineups.flatMap((l) => (Array.isArray(l.items) ? l.items.map((i) => i.songId) : [])),
  );
  const songs = db.songs.filter((s) => canView(s, userId) || referencedSongIds.has(s.id));
  const settings = db.settings || defaultSettings();
  res.json({
    user: publicUserView(user),
    teams: teams.map((t) => teamView(t, userId)),
    songs,
    lineups,
    system: {
      maintenance: settings.maintenance,
      allowRegistration: settings.allowRegistration !== false,
    },
  });
});

/* ----------------------------------------------------------------- admin */

api.get('/admin/overview', (req, res) => {
  if (!requireAdmin(req, res)) return;

  // Merge db.users with any DemoAuth accounts and the built-in admin account
  const userMap = new Map();
  for (const u of db.users) {
    userMap.set(u.id, { ...u });
  }
  if (auth?.driver === 'demo' && typeof auth.listAccounts === 'function') {
    for (const acc of auth.listAccounts()) {
      const existing = userMap.get(acc.id);
      if (existing) {
        if (!existing.email && acc.email) existing.email = acc.email;
      } else {
        userMap.set(acc.id, {
          id: acc.id,
          name: acc.name,
          email: acc.email,
          role: 'user',
          suspended: false,
          createdAt: acc.createdAt,
        });
      }
    }
  }
  if (adminGate && !userMap.has('user_admin')) {
    const adm = adminGate.identity();
    userMap.set('user_admin', {
      id: adm.id,
      name: adm.name,
      email: adm.email,
      role: 'admin',
      suspended: false,
      createdAt: 0,
    });
  }

  const songsByOwner = new Map();
  for (const s of db.songs) {
    songsByOwner.set(s.ownerId, (songsByOwner.get(s.ownerId) || 0) + 1);
  }
  const lineupsByOwner = new Map();
  for (const l of db.lineups) {
    lineupsByOwner.set(l.ownerId, (lineupsByOwner.get(l.ownerId) || 0) + 1);
  }
  const teamsByMember = new Map();
  for (const t of db.teams) {
    for (const m of t.members || []) {
      teamsByMember.set(m.userId, (teamsByMember.get(m.userId) || 0) + 1);
    }
  }

  const users = Array.from(userMap.values())
    .map((u) => {
      const pub = publicUserView(u);
      return {
        ...pub,
        isBuiltInAdmin: u.id === 'user_admin',
        songsCount: songsByOwner.get(u.id) || 0,
        lineupsCount: lineupsByOwner.get(u.id) || 0,
        teamsCount: teamsByMember.get(u.id) || 0,
      };
    })
    .sort((a, b) => {
      if (a.isBuiltInAdmin !== b.isBuiltInAdmin) return a.isBuiltInAdmin ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  const themeCounts = new Map();
  let fastSongs = 0;
  let sharedSongs = 0;
  for (const s of db.songs) {
    if (s.tempo === 'fast') fastSongs++;
    if (s.teamId) sharedSongs++;
    if (s.theme) themeCounts.set(s.theme, (themeCounts.get(s.theme) || 0) + 1);
  }
  const topThemes = Array.from(themeCounts.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  let sharedLineups = 0;
  let usedLineups = 0;
  let totalLineupUses = 0;
  for (const l of db.lineups) {
    if (l.teamId) sharedLineups++;
    if (l.lastUsedAt) usedLineups++;
    totalLineupUses += Number(l.useCount || 0);
  }

  const totalTeamMemberships = db.teams.reduce(
    (sum, t) => sum + (Array.isArray(t.members) ? t.members.length : 0),
    0,
  );

  const settings = db.settings || defaultSettings();

  res.json({
    stats: {
      totalUsers: users.length,
      activeUsers: users.filter((u) => !u.suspended).length,
      suspendedUsers: users.filter((u) => u.suspended).length,
      adminUsers: users.filter((u) => u.isAdmin).length,
      totalSongs: db.songs.length,
      fastSongs,
      slowSongs: db.songs.length - fastSongs,
      sharedSongs,
      topThemes,
      totalLineups: db.lineups.length,
      sharedLineups,
      usedLineups,
      totalLineupUses,
      totalTeams: db.teams.length,
      totalTeamMemberships,
      storageDriver: store?.driver || 'file',
      authDriver: auth?.driver || 'demo',
    },
    settings: {
      maintenance: settings.maintenance,
      allowRegistration: settings.allowRegistration !== false,
    },
    adminEmail: adminGate?.email || 'admin@aria.app',
    users,
    songs: [...db.songs]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        tempo: s.tempo,
        theme: s.theme,
        ownerId: s.ownerId,
        ownerName: s.ownerName,
        teamId: s.teamId,
        partsCount: Array.isArray(s.parts) ? s.parts.length : 0,
        createdAt: s.createdAt,
      })),
    lineups: [...db.lineups]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((l) => ({
        id: l.id,
        name: l.name,
        theme: l.theme,
        ownerId: l.ownerId,
        ownerName: l.ownerName,
        teamId: l.teamId,
        partsCount: Array.isArray(l.items) ? l.items.length : 0,
        useCount: l.useCount || 0,
        lastUsedAt: l.lastUsedAt,
        shareToken: l.shareToken,
        createdAt: l.createdAt,
      })),
    teams: [...db.teams]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        ownerId: t.ownerId,
        membersCount: Array.isArray(t.members) ? t.members.length : 0,
        members: t.members || [],
        createdAt: t.createdAt,
      })),
  });
});

api.patch('/admin/settings', (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!db.settings) db.settings = defaultSettings();

  const body = req.body || {};
  if (body.maintenance && typeof body.maintenance === 'object') {
    const m = body.maintenance;
    const cur = db.settings.maintenance || defaultSettings().maintenance;
    db.settings.maintenance = {
      enabled: m.enabled === undefined ? cur.enabled : Boolean(m.enabled),
      mode: m.mode === 'maintenance' ? 'maintenance' : m.mode === 'info' ? 'info' : cur.mode,
      title: m.title !== undefined ? clean(m.title, 100) || 'System Notice' : cur.title,
      message: m.message !== undefined ? clean(m.message, 600) : cur.message,
      eta: m.eta !== undefined ? clean(m.eta, 80) : cur.eta,
      updatedAt: now(),
      updatedBy: req.user.name || 'Admin',
    };
  }
  if (body.allowRegistration !== undefined) {
    db.settings.allowRegistration = Boolean(body.allowRegistration);
  }

  save();
  res.json({
    settings: {
      maintenance: db.settings.maintenance,
      allowRegistration: db.settings.allowRegistration !== false,
    },
  });
});

api.post('/admin/users', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = clean(req.body?.name, 40);
  const email = normaliseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = req.body?.role === 'admin' ? 'admin' : 'user';

  const emailIssue = emailProblem(email);
  if (emailIssue) return res.status(400).json({ error: emailIssue });
  if (adminGate && adminGate.matchesAdminEmail(email)) {
    return res.status(409).json({ error: 'That email belongs to the built-in admin account.' });
  }
  if (db.users.some((u) => normaliseEmail(u.email || '') === email)) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }

  if (auth?.driver === 'demo') {
    const pwIssue = passwordProblem(password);
    if (pwIssue) return res.status(400).json({ error: pwIssue });
    try {
      const account = auth.register({ name, email, password });
      const user = ensureUserRecord({
        id: account.id,
        name: account.name,
        email: account.email,
        role,
      });
      user.role = role;
      save();
      return res.json({ user: publicUserView(user) });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }

  // In Supabase mode, pre-register/authorize user record by email & role
  const user = {
    id: uid('user'),
    name: name || email.split('@')[0],
    email,
    role,
    suspended: false,
    createdAt: now(),
  };
  db.users.push(user);
  save();
  res.json({ user: publicUserView(user) });
});

api.patch('/admin/users/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const targetId = req.params.id;
  if (targetId === 'user_admin') {
    return res.status(400).json({ error: 'The built-in admin account cannot be modified here.' });
  }

  let target = getUser(targetId);
  if (!target && auth?.driver === 'demo') {
    const demoAcc = auth.findById(targetId);
    if (demoAcc) {
      target = ensureUserRecord({
        id: demoAcc.id,
        name: demoAcc.name,
        email: demoAcc.email,
      });
    }
  }
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const body = req.body || {};
  if (target.id === req.user.id) {
    if (body.suspended === true) {
      return res.status(400).json({ error: 'You cannot suspend your own admin account.' });
    }
    if (body.role && body.role !== 'admin') {
      return res.status(400).json({ error: 'You cannot revoke your own admin role.' });
    }
  }

  if (body.name !== undefined) {
    const nextName = clean(body.name, 40);
    if (nextName) {
      target.name = nextName;
      if (auth?.driver === 'demo') auth.rename(target.id, nextName);
    }
  }
  if (body.role === 'admin' || body.role === 'user') {
    target.role = body.role;
    if (body.role === 'admin') target.suspended = false;
  }
  if (body.suspended !== undefined && target.role !== 'admin') {
    target.suspended = Boolean(body.suspended);
    if (target.suspended && auth?.driver === 'demo' && typeof auth.revokeUserSessions === 'function') {
      auth.revokeUserSessions(target.id);
    }
  }

  save();
  res.json({ user: publicUserView(target) });
});

api.delete('/admin/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const targetId = req.params.id;
  if (targetId === 'user_admin') {
    return res.status(400).json({ error: 'The built-in admin account cannot be deleted.' });
  }
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your currently active admin account.' });
  }

  try {
    purgeUserContent(targetId);
    clearTimeout(saveTimer);
    if (store) {
      saveChain = saveChain.then(() => store.persist(db));
      await saveChain;
    }
    if (auth?.driver === 'demo') {
      auth.deleteAccount(targetId);
    } else if (auth?.deleteAccount && targetId.startsWith('sb_')) {
      await auth.deleteAccount(targetId.slice(3));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not delete user.' });
  }
});

api.post('/admin/password', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  const issue = passwordProblem(newPassword);
  if (issue) return res.status(400).json({ error: issue });
  if (!adminGate) return res.status(500).json({ error: 'Admin gate unavailable.' });
  adminGate.setPassword(newPassword);
  const freshSession = req.user.id === 'user_admin' ? adminGate.createSession() : null;
  res.json({ ok: true, token: freshSession });
});

api.delete('/admin/songs/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const song = db.songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });
  db.songs = db.songs.filter((s) => s.id !== song.id);
  db.lineups.forEach((l) => {
    l.items = l.items.filter((i) => i.songId !== song.id || Boolean(i.lyrics));
  });
  save();
  res.json({ ok: true });
});

api.delete('/admin/lineups/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  db.lineups = db.lineups.filter((l) => l.id !== lineup.id);
  save();
  res.json({ ok: true });
});

api.delete('/admin/teams/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const team = getTeam(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  db.teams = db.teams.filter((t) => t.id !== team.id);
  db.songs.forEach((s) => {
    if (s.teamId === team.id) s.teamId = null;
  });
  db.lineups.forEach((l) => {
    if (l.teamId === team.id) l.teamId = null;
  });
  save();
  res.json({ ok: true });
});

/* teams */

api.post('/teams', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (!checkMaintenanceWrite(req, res)) return;
  const user = req.user;
  const name = clean(req.body?.name, 50);
  if (!name) return res.status(400).json({ error: 'Give your team a name.' });

  let code = '';
  do {
    code = `ARIA-${crypto.randomInt(100, 999)}`;
  } while (db.teams.some((t) => t.code === code));

  const team = {
    id: uid('team'),
    name,
    code,
    ownerId: user.id,
    createdAt: now(),
    members: [{ userId: user.id, name: user.name, role: 'owner', joinedAt: now() }],
  };
  db.teams.push(team);
  if (callerBridge && req.supabaseAccessToken && user.id.startsWith('sb_')) {
    await callerBridge.teamOp(req.supabaseAccessToken, {
      op: 'create',
      team,
      memberName: user.name,
    });
  }
  await persistForCaller(req);
  res.json({ team: teamView(team, user.id) });
});

api.post('/teams/join', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (!checkMaintenanceWrite(req, res)) return;
  const user = req.user;
  const code = clean(req.body?.code, 20).toUpperCase();
  let team = db.teams.find((t) => t.code.toUpperCase() === code);

  if (callerBridge && req.supabaseAccessToken && user.id.startsWith('sb_')) {
    const remoteTeam = await callerBridge.teamOp(req.supabaseAccessToken, {
      op: 'join',
      code,
      memberName: user.name,
    });
    if (remoteTeam && remoteTeam.id) {
      const idx = db.teams.findIndex((t) => t.id === remoteTeam.id);
      if (idx >= 0) db.teams[idx] = remoteTeam;
      else db.teams.push(remoteTeam);
      team = remoteTeam;
      await callerBridge.hydrateCaller(req.supabaseAccessToken, user.id, db, {
        force: true,
        immediate: true,
      });
    }
  }

  if (!team) return res.status(404).json({ error: 'That code does not match a team.' });

  if (!team.members.some((m) => m.userId === user.id)) {
    team.members.push({ userId: user.id, name: user.name, role: 'member', joinedAt: now() });
  }
  await persistForCaller(req);
  res.json({ team: teamView(team, user.id) });
});

api.get('/teams/:id', (req, res) => {
  if (!requireUser(req, res)) return;
  const userId = req.user.id;
  const team = getTeam(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (!team.members.some((m) => m.userId === userId)) {
    return res.status(403).json({ error: 'You are not in this team.' });
  }
  res.json({ team: teamView(team, userId) });
});

api.post('/teams/:id/leave', async (req, res) => {
  if (!requireUser(req, res)) return;
  const userId = req.user.id;
  const team = getTeam(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  team.members = team.members.filter((m) => m.userId !== userId);
  if (team.ownerId === userId && team.members.length > 0) {
    team.ownerId = team.members[0].userId;
    team.members[0].role = 'owner';
  }
  if (team.members.length === 0) {
    db.teams = db.teams.filter((t) => t.id !== team.id);
    db.songs.forEach((s) => {
      if (s.teamId === team.id) s.teamId = null;
    });
    db.lineups.forEach((l) => {
      if (l.teamId === team.id) l.teamId = null;
    });
  }
  if (callerBridge && req.supabaseAccessToken && userId.startsWith('sb_')) {
    await callerBridge.teamOp(req.supabaseAccessToken, {
      op: 'leave',
      teamId: team.id,
    });
  }
  await persistForCaller(req);
  res.json({ ok: true });
});

/* songs */

api.post('/songs', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (!checkMaintenanceWrite(req, res)) return;
  const user = req.user;
  const body = req.body || {};
  const title = clean(body.title, 80);
  if (!title) return res.status(400).json({ error: 'A song needs a title.' });
  const parts = Array.isArray(body.parts)
    ? body.parts
        .filter((p) => p && clean(p.lyrics, 5000))
        .map((p) => ({
          id: uid('part'),
          kind: clean(p.kind, 20) || 'verse',
          label: clean(p.label, 40) || 'Part',
          lyrics: clean(p.lyrics, 5000),
        }))
    : [];
  if (parts.length === 0) {
    return res.status(400).json({ error: 'Add at least one part with lyrics.' });
  }
  const teamId = body.teamId && getTeam(body.teamId) ? body.teamId : null;
  const song = {
    id: uid('song'),
    title,
    artist: clean(body.artist, 80) || 'Unknown artist',
    tempo: body.tempo === 'fast' ? 'fast' : 'slow',
    parts,
    theme: clean(body.theme, 40),
    analysis: body.analysis || null,
    ownerId: user.id,
    ownerName: user.name,
    teamId,
    sourceSongId: null,
    copiedFrom: null,
    lyrics: parts.map((p) => p.lyrics).join('\n'),
    createdAt: now(),
    updatedAt: now(),
  };
  db.songs.push(song);
  await persistForCaller(req);
  res.json({ song });
});

api.patch('/songs/:id', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (!checkMaintenanceWrite(req, res)) return;
  const user = req.user;
  const song = db.songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });
  if (!user || song.ownerId !== user.id) {
    return res.status(403).json({ error: 'Only the owner can edit this song.' });
  }
  const body = req.body || {};
  if (body.title !== undefined) song.title = clean(body.title, 80) || song.title;
  if (body.artist !== undefined) song.artist = clean(body.artist, 80) || 'Unknown artist';
  if (body.tempo !== undefined) song.tempo = body.tempo === 'fast' ? 'fast' : 'slow';
  if (body.theme !== undefined) song.theme = clean(body.theme, 40);
  if (body.analysis !== undefined) song.analysis = body.analysis;
  if (Array.isArray(body.parts)) {
    const oldParts = Array.isArray(song.parts) ? song.parts : [];
    const usedIds = new Set();
    song.parts = body.parts
      .filter((p) => p && clean(p.lyrics, 5000))
      .map((p) => {
        const kind = clean(p.kind, 20) || 'verse';
        const label = clean(p.label, 40) || 'Part';
        let matchedId = null;
        if (p.id && oldParts.some((x) => x.id === p.id) && !usedIds.has(p.id)) {
          matchedId = p.id;
        } else {
          const byLabel = oldParts.find(
            (x) =>
              !usedIds.has(x.id) &&
              String(x.label || '').toLowerCase() === label.toLowerCase(),
          );
          const byKind = oldParts.find((x) => !usedIds.has(x.id) && x.kind === kind);
          matchedId = byLabel?.id || byKind?.id || null;
        }
        const finalId = matchedId || uid('part');
        usedIds.add(finalId);
        return {
          id: finalId,
          kind,
          label,
          lyrics: clean(p.lyrics, 5000),
        };
      });
  }
  if (body.teamId !== undefined) {
    song.teamId = body.teamId && getTeam(body.teamId) ? body.teamId : null;
  }
  song.lyrics = song.parts.map((p) => p.lyrics).join('\n');
  song.updatedAt = now();

  // Keep lineup slot snapshots in sync with updated song metadata & lyrics
  for (const lineup of db.lineups) {
    if (!Array.isArray(lineup.items)) continue;
    lineup.items = lineup.items.map((item) => {
      if (item.songId !== song.id) return item;
      const part = resolvePartFromSong(song, item);
      if (!part) {
        return {
          ...item,
          songTitle: song.title,
          artist: song.artist,
          tempo: song.tempo,
        };
      }
      return snapshotSlot(song, part, item.id);
    });
  }

  await persistForCaller(req);
  res.json({ song });
});

api.delete('/songs/:id', async (req, res) => {
  if (!requireUser(req, res)) return;
  const userId = req.user.id;
  const song = db.songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });
  if (song.ownerId !== userId) {
    return res.status(403).json({ error: 'Only the owner can delete this song.' });
  }
  db.songs = db.songs.filter((s) => s.id !== song.id);
  db.lineups.forEach((l) => {
    l.items = l.items.filter((i) => i.songId !== song.id);
  });
  await persistForCaller(req);
  res.json({ ok: true });
});

api.post('/songs/:id/share', async (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const song = db.songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });
  if (!user || song.ownerId !== user.id) {
    return res.status(403).json({ error: 'Only the owner can share this song.' });
  }
  const teamId = clean(req.body?.teamId, 60) || null;
  if (teamId) {
    const team = getTeam(teamId);
    if (!team || !team.members.some((m) => m.userId === user.id)) {
      return res.status(403).json({ error: 'Join that team first.' });
    }
  }
  song.teamId = teamId;
  song.updatedAt = now();
  await persistForCaller(req);
  res.json({ song });
});

api.post('/songs/:id/copy', async (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const song = db.songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });
  if (!user || !canView(song, user.id)) {
    return res.status(403).json({ error: 'You cannot copy that song.' });
  }
  const teamId = clean(req.body?.teamId, 60) || null;
  const copied = copySong(song, user, teamId);
  await persistForCaller(req);
  res.json({ song: copied });
});

/* lineups */

api.post('/lineups', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (!checkMaintenanceWrite(req, res)) return;
  const user = req.user;
  const body = req.body || {};
  const name = clean(body.name, 80);
  if (!name) return res.status(400).json({ error: 'Give this lineup a name.' });
  const items = Array.isArray(body.items)
    ? body.items
        .map((i) => {
          const song = db.songs.find((s) => s.id === i.songId);
          const part = song ? resolvePartFromSong(song, i) : null;
          if (!song || !part || !canView(song, user.id)) return null;
          return snapshotSlot(song, part);
        })
        .filter(Boolean)
    : [];
  if (items.length < 2) {
    return res.status(400).json({ error: 'A lineup needs at least 2 parts.' });
  }
  const teamId = body.teamId && getTeam(body.teamId) ? body.teamId : null;
  const lineup = {
    id: uid('lineup'),
    name,
    theme: clean(body.theme, 40),
    ownerId: user.id,
    ownerName: user.name,
    teamId,
    items,
    shareToken: crypto.randomBytes(6).toString('base64url'),
    sourceLineupId: null,
    copiedFrom: null,
    createdAt: now(),
    updatedAt: now(),
    lastUsedAt: null,
    useCount: 0,
    lastUsedReason: null,
  };
  db.lineups.push(lineup);
  await persistForCaller(req);
  res.json({ lineup });
});

api.patch('/lineups/:id', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (!checkMaintenanceWrite(req, res)) return;
  const user = req.user;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  if (!user || lineup.ownerId !== user.id) {
    return res.status(403).json({ error: 'Only the owner can edit this lineup.' });
  }
  const body = req.body || {};
  if (body.name !== undefined) lineup.name = clean(body.name, 80) || lineup.name;
  if (body.theme !== undefined) lineup.theme = clean(body.theme, 40);
  if (body.teamId !== undefined) {
    lineup.teamId = body.teamId && getTeam(body.teamId) ? body.teamId : null;
  }
  if (Array.isArray(body.items)) {
    const visibleSongIds = new Set(
      (lineup.items || []).map((existingItem) => existingItem.songId),
    );
    const items = body.items
      .map((i) => {
        const song = db.songs.find((s) => s.id === i.songId);
        const part = song ? resolvePartFromSong(song, i) : null;
        if (!song || !part || (!canView(song, user.id) && !visibleSongIds.has(song.id))) {
          const prev = (lineup.items || []).find(
            (x) => x.songId === i.songId && x.partId === i.partId && x.lyrics,
          );
          return prev ? { ...prev, id: uid('slot') } : null;
        }
        return snapshotSlot(song, part);
      })
      .filter(Boolean);
    lineup.items = items;
  }
  lineup.updatedAt = now();
  await persistForCaller(req);
  res.json({ lineup });
});

api.delete('/lineups/:id', async (req, res) => {
  if (!requireUser(req, res)) return;
  const userId = req.user.id;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  if (lineup.ownerId !== userId) {
    return res.status(403).json({ error: 'Only the owner can delete this lineup.' });
  }
  db.lineups = db.lineups.filter((l) => l.id !== lineup.id);
  await persistForCaller(req);
  res.json({ ok: true });
});

/**
 * Sharing is what marks a lineup as "used" — this is the LRU clock.
 * channel: 'link' (public share link copied/shared) or 'team' (shared into a team).
 */
api.post('/lineups/:id/share', async (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  // The owner can always share; teammates can pass on a lineup shared with them.
  const isTeammate = !!user && lineup.ownerId !== user.id && canView(lineup, user.id);
  if (!user || (lineup.ownerId !== user.id && !isTeammate)) {
    return res.status(403).json({ error: 'Only the owner or a teammate can share this lineup.' });
  }
  if (!lineup.shareToken) {
    lineup.shareToken = crypto.randomBytes(6).toString('base64url');
  }
  const channel = req.body?.channel === 'team' ? 'team' : 'link';
  if (channel === 'team') {
    const teamId = clean(req.body?.teamId, 60);
    const team = getTeam(teamId);
    if (!team || !team.members.some((m) => m.userId === user.id)) {
      return res.status(403).json({ error: 'Join that team first.' });
    }
    lineup.teamId = teamId;
    stampUse(lineup, 'shared_to_team');
    if (lineup.ownerId !== user.id && callerBridge && req.supabaseAccessToken) {
      await callerBridge.teamOp(req.supabaseAccessToken, {
        op: 'stamp_lineup',
        team: { id: lineup.id },
        code: 'shared_to_team',
        teamId,
      });
    }
    await persistForCaller(req);
    return res.json({ lineup, team: teamView(team, user.id) });
  }
  stampUse(lineup, 'link_shared');
  if (lineup.ownerId !== user.id && callerBridge && req.supabaseAccessToken) {
    await callerBridge.teamOp(req.supabaseAccessToken, {
      op: 'stamp_lineup',
      team: { id: lineup.id },
      code: 'link_shared',
      teamId: lineup.teamId,
    });
  }
  await persistForCaller(req);
  res.json({ lineup, shareUrl: `/s/${lineup.shareToken}` });
});

api.post('/lineups/:id/copy', async (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  if (!user || !canView(lineup, user.id)) {
    return res.status(403).json({ error: 'You cannot copy that lineup.' });
  }
  const teamId = clean(req.body?.teamId, 60) || null;
  const copied = copyLineup(lineup, user, teamId);
  await persistForCaller(req);
  res.json({ lineup: copied });
});

api.get('/lru', (req, res) => {
  if (!requireUser(req, res)) return;
  const userId = req.user.id;
  const theme = clean(req.query.theme, 40);
  const pool = visibleRecords(db.lineups, userId).filter(
    (l) => !theme || l.theme.toLowerCase() === theme.toLowerCase(),
  );
  const ordered = lruSort(pool);
  res.json({
    suggested: ordered[0] || null,
    ordered: ordered.map((l) => ({
      id: l.id,
      name: l.name,
      lastUsedAt: l.lastUsedAt,
      useCount: l.useCount,
    })),
  });
});

api.get('/shared/:token', async (req, res) => {
  const rawToken = String(req.params.token || '').trim();
  const cleanToken = rawToken.replace(/[.,;:!?)]+$/, '');

  if (callerBridge) {
    const remote = await callerBridge.loadSharedLineup(rawToken);
    if (remote?.lineup) {
      const local = db.lineups.find((l) => l.id === remote.lineup.id);
      if (local) {
        local.lastUsedAt = remote.lineup.lastUsedAt;
        local.useCount = remote.lineup.useCount;
        local.lastUsedReason = remote.lineup.lastUsedReason;
      }
      const songPool = remote.songs.length > 0 ? remote.songs : db.songs;
      return res.json({ lineup: publicLineup(remote.lineup, songPool) });
    }
  }

  const lineup =
    db.lineups.find((l) => l.shareToken === rawToken) ||
    (cleanToken ? db.lineups.find((l) => l.shareToken === cleanToken) : null);
  if (!lineup) return res.status(404).json({ error: 'This lineup link is not valid.' });
  const songs = db.songs;
  // Opening a shared link counts as using the lineup.
  stampUse(lineup, 'link_opened');
  if (store?.driver === 'supabase') {
    await flushSaveChain();
  }
  res.json({ lineup: publicLineup(lineup, songs) });
});

api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Google Play Trusted Web Activity (TWA) Digital Asset Links endpoint.
 * Set ANDROID_PACKAGE_NAME and ANDROID_SHA256_FINGERPRINTS (comma-separated)
 * in Render environment variables to verify full-screen Android mode without
 * editing static files.
 */
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const pkg = clean(process.env.ANDROID_PACKAGE_NAME || 'app.aria.lineups', 120);
  const rawFingerprints = String(process.env.ANDROID_SHA256_FINGERPRINTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (rawFingerprints.length > 0 && pkg) {
    return res.send(
      JSON.stringify(
        [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: pkg,
              sha256_cert_fingerprints: rawFingerprints,
            },
          },
        ],
        null,
        2,
      ),
    );
  }

  const staticCandidates = [
    path.join(DIST_DIR, '.well-known', 'assetlinks.json'),
    path.join(PUBLIC_DIR, '.well-known', 'assetlinks.json'),
  ];
  for (const candidate of staticCandidates) {
    if (fs.existsSync(candidate)) {
      return res.sendFile(candidate);
    }
  }

  return res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: pkg,
        sha256_cert_fingerprints: [],
      },
    },
  ]);
});

app.use('/api', api);

if (fs.existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      setHeaders: (res, filePath) => {
        const base = path.basename(filePath);
        if (
          base === 'sw.js' ||
          base === 'index.html' ||
          base === 'manifest.webmanifest'
        ) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

boot()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Aria API listening on http://0.0.0.0:${PORT}`);
      console.log(`Store: ${store.describe()}`);
      if (!fs.existsSync(DIST_DIR)) {
        console.log('No dist/ build found — run "npm run build" to serve the app from this server.');
      }
    });
  })
  .catch((err) => {
    console.error('[aria] failed to start:', err.message);
    process.exit(1);
  });
