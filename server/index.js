import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './storage.js';
import {
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
let db = { users: [], teams: [], songs: [], lineups: [] };
let saveTimer = null;
let saveChain = Promise.resolve();
let saveWarning = null;

function save() {
  if (!store) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Serialise writes so two quick actions cannot interleave and clobber rows.
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
  }, 60);
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
  db = await store.load();
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

function canView(record, userId) {
  if (record.ownerId === userId) return true;
  if (record.teamId) {
    const team = getTeam(record.teamId);
    return !!team && team.members.some((m) => m.userId === userId);
  }
  return false;
}

function visibleRecords(records, userId) {
  return records.filter((r) => canView(r, userId));
}

function publicLineup(lineup, songs) {
  const items = [];
  for (const item of lineup.items) {
    const song = songs.find((s) => s.id === item.songId);
    if (!song) continue;
    const part = song.parts.find((p) => p.id === item.partId);
    if (!part) continue;
    items.push({
      songTitle: song.title,
      artist: song.artist,
      tempo: song.tempo,
      partKind: part.kind,
      partLabel: part.label,
      lyrics: part.lyrics,
    });
  }
  return {
    name: lineup.name,
    theme: lineup.theme,
    ownerName: lineup.ownerName,
    createdAt: lineup.createdAt,
    updatedAt: lineup.updatedAt,
    lastUsedAt: lineup.lastUsedAt,
    useCount: lineup.useCount,
    songCount: new Set(lineup.items.map((i) => i.songId)).size,
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
  const songMap = new Map(); // oldSongId -> { newSong, partsByOldId }
  const items = [];

  for (const item of lineup.items) {
    const source = db.songs.find((s) => s.id === item.songId);
    if (!source) continue;

    let mapped = songMap.get(source.id);
    if (!mapped) {
      // Re-use an earlier copy of the same source song so a copied lineup
      // never duplicates the same track twice in the library.
      let existing = db.songs.find(
        (s) => s.ownerId === user.id && s.sourceSongId === (source.sourceSongId || source.id),
      );
      if (!existing) existing = copySong(source, user, teamId);
      const partsByOldId = new Map();
      source.parts.forEach((p, index) => {
        const target = existing.parts[index];
        if (target) partsByOldId.set(p.id, target);
      });
      mapped = { song: existing, partsByOldId };
      songMap.set(source.id, mapped);
    }

    const part = mapped.partsByOldId.get(item.partId);
    if (!part) continue;
    items.push({ id: uid('slot'), songId: mapped.song.id, partId: part.id });
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

/** Ensure a data record exists for this authenticated identity. */
function ensureUserRecord(identity) {
  let user = getUser(identity.id);
  if (!user) {
    user = {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      createdAt: now(),
    };
    db.users.push(user);
    save();
  } else {
    if (identity.email && !user.email) user.email = identity.email;
    if (identity.name && (!user.name || user.name === 'Listener')) {
      user.name = identity.name;
      save();
    }
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
    if (!value || !auth) return next();
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
      }
    }
  } catch (err) {
    console.error('[aria] identity lookup failed:', err.message);
  }
  return next();
}

/**
 * Guard for data routes. Returns true when the request may continue; when it
 * returns false it has already answered (401), so the caller must stop.
 * Deliberately does not call next(): these routes store their handler in a
 * variable that calls the guard inside the handler body.
 */
function requireUser(req, res) {
  if (req.identity) {
    req.user = ensureUserRecord(req.identity);
    return true;
  }
  res.status(401).json({ error: 'Please sign in to continue.' });
  return false;
}

const api = express.Router();
api.use(resolveIdentity);

api.get('/health', (_req, res) => res.json({ ok: true }));

/* ---------------------------------------------------------------- auth */

const oauthRelay = new Map();
const OAUTH_RELAY_TTL_MS = 2 * 60 * 1000;
const validRelayNonce = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);

function pruneOAuthRelay() {
  const cutoff = now();
  for (const [key, entry] of oauthRelay.entries()) {
    if (entry.expiresAt <= cutoff) oauthRelay.delete(key);
  }
}

api.get('/auth/config', (_req, res) => {
  res.json({
    driver: auth?.driver || 'demo',
    supabaseUrl: auth?.driver === 'supabase' ? auth.supabaseUrl : null,
    supabaseAnonKey: auth?.driver === 'supabase' ? auth.supabaseAnonKey : null,
    sessionDays: SESSION_TTL_DAYS,
    resetMinutes: RESET_TTL_MINUTES,
  });
});

/**
 * Short-lived single-use relay for Google OAuth popups opened from inside an
 * iframe (where accounts.google.com blocks framing via X-Frame-Options and
 * COOP / storage partitioning can isolate the popup from the iframe).
 */
api.post('/auth/relay', (req, res) => {
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
  if (!req.identity) return res.json({ user: null });
  const user = ensureUserRecord(req.identity);
  res.json({ user });
});

api.post('/auth/register', (req, res) => {
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

  try {
    const account = auth.register({ name, email, password });
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

api.post('/auth/login', (req, res) => {
  if (!auth || auth.driver !== 'demo') {
    return res.status(400).json({ error: 'Sign-in is handled by Supabase in this deployment.' });
  }
  const email = normaliseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  try {
    const account = auth.authenticate(email, password);
    const session = auth.createSession(account);
    const user = ensureUserRecord({
      id: account.id,
      name: account.name,
      email: account.email,
    });
    res.json({ token: session, user });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
  }
});

api.post('/auth/logout', (req, res) => {
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

api.get('/state', (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const userId = user.id;
  const teams = myTeams(userId);
  res.json({
    user,
    teams: teams.map((t) => teamView(t, userId)),
    songs: visibleRecords(db.songs, userId),
    lineups: visibleRecords(db.lineups, userId),
  });
});

/* teams */

api.post('/teams', (req, res) => {
  if (!requireUser(req, res)) return;
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
  save();
  res.json({ team: teamView(team, user.id) });
});

api.post('/teams/join', (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const code = clean(req.body?.code, 20).toUpperCase();
  const team = db.teams.find((t) => t.code.toUpperCase() === code);
  if (!team) return res.status(404).json({ error: 'That code does not match a team.' });

  if (!team.members.some((m) => m.userId === user.id)) {
    team.members.push({ userId: user.id, name: user.name, role: 'member', joinedAt: now() });
    save();
  }
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

api.post('/teams/:id/leave', (req, res) => {
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
    db.songs = db.songs.filter((s) => s.teamId !== team.id);
    db.lineups = db.lineups.filter((l) => l.teamId !== team.id);
  }
  save();
  res.json({ ok: true });
});

/* songs */

api.post('/songs', (req, res) => {
  if (!requireUser(req, res)) return;
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
  save();
  res.json({ song });
});

api.patch('/songs/:id', (req, res) => {
  if (!requireUser(req, res)) return;
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
    song.parts = body.parts
      .filter((p) => p && clean(p.lyrics, 5000))
      .map((p) => ({
        id: p.id && song.parts.some((x) => x.id === p.id) ? p.id : uid('part'),
        kind: clean(p.kind, 20) || 'verse',
        label: clean(p.label, 40) || 'Part',
        lyrics: clean(p.lyrics, 5000),
      }));
  }
  if (body.teamId !== undefined) {
    song.teamId = body.teamId && getTeam(body.teamId) ? body.teamId : null;
  }
  song.lyrics = song.parts.map((p) => p.lyrics).join('\n');
  song.updatedAt = now();
  save();
  res.json({ song });
});

api.delete('/songs/:id', (req, res) => {
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
  save();
  res.json({ ok: true });
});

api.post('/songs/:id/share', (req, res) => {
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
  save();
  res.json({ song });
});

api.post('/songs/:id/copy', (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const song = db.songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });
  if (!user || !canView(song, user.id)) {
    return res.status(403).json({ error: 'You cannot copy that song.' });
  }
  const teamId = clean(req.body?.teamId, 60) || null;
  res.json({ song: copySong(song, user, teamId) });
});

/* lineups */

api.post('/lineups', (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const body = req.body || {};
  const name = clean(body.name, 80);
  if (!name) return res.status(400).json({ error: 'Give this lineup a name.' });
  const items = Array.isArray(body.items)
    ? body.items
        .map((i) => {
          const song = db.songs.find((s) => s.id === i.songId);
          const part = song?.parts.find((p) => p.id === i.partId);
          if (!song || !part || !canView(song, user.id)) return null;
          return { id: uid('slot'), songId: song.id, partId: part.id };
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
  save();
  res.json({ lineup });
});

api.patch('/lineups/:id', (req, res) => {
  if (!requireUser(req, res)) return;
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
    const items = body.items
      .map((i) => {
        const song = db.songs.find((s) => s.id === i.songId);
        const part = song?.parts.find((p) => p.id === i.partId);
        if (!song || !part || !canView(song, user.id)) return null;
        return { id: uid('slot'), songId: song.id, partId: part.id };
      })
      .filter(Boolean);
    lineup.items = items;
  }
  lineup.updatedAt = now();
  save();
  res.json({ lineup });
});

api.delete('/lineups/:id', (req, res) => {
  if (!requireUser(req, res)) return;
  const userId = req.user.id;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  if (lineup.ownerId !== userId) {
    return res.status(403).json({ error: 'Only the owner can delete this lineup.' });
  }
  db.lineups = db.lineups.filter((l) => l.id !== lineup.id);
  save();
  res.json({ ok: true });
});

/**
 * Sharing is what marks a lineup as "used" — this is the LRU clock.
 * channel: 'link' (public share link copied/shared) or 'team' (shared into a team).
 */
api.post('/lineups/:id/share', (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  // The owner can always share; teammates can pass on a lineup shared with them.
  const ownerTeam = lineup.teamId ? getTeam(lineup.teamId) : null;
  const isTeammate = !!ownerTeam && !!user && ownerTeam.members.some((m) => m.userId === user.id);
  if (!user || (lineup.ownerId !== user.id && !isTeammate)) {
    return res.status(403).json({ error: 'Only the owner or a teammate can share this lineup.' });
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
    save();
    return res.json({ lineup, team: teamView(team, user.id) });
  }
  stampUse(lineup, 'link_shared');
  res.json({ lineup, shareUrl: `/s/${lineup.shareToken}` });
});

api.post('/lineups/:id/copy', (req, res) => {
  if (!requireUser(req, res)) return;
  const user = req.user;
  const lineup = db.lineups.find((l) => l.id === req.params.id);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found.' });
  if (!user || !canView(lineup, user.id)) {
    return res.status(403).json({ error: 'You cannot copy that lineup.' });
  }
  const teamId = clean(req.body?.teamId, 60) || null;
  res.json({ lineup: copyLineup(lineup, user, teamId) });
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

api.get('/shared/:token', (req, res) => {
  const lineup = db.lineups.find((l) => l.shareToken === req.params.token);
  if (!lineup) return res.status(404).json({ error: 'This lineup link is not valid.' });
  const songs = db.songs;
  // Opening a shared link counts as using the lineup.
  stampUse(lineup, 'link_opened');
  res.json({ lineup: publicLineup(lineup, songs) });
});

api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use('/api', api);

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
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
