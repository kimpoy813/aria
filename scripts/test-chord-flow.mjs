#!/usr/bin/env node
/**
 * Chords and keys, end to end through the real API.
 *
 *   npm run test:chordflow
 *
 * The chord maths has its own suite. This one is about the plumbing that maths
 * cannot prove: that a key survives a save and a reload, that a per-slot key
 * survives the slot being re-snapshotted on the server, and that a public share
 * link carries enough for a stranger's browser to transpose the sheet.
 *
 * Those are the places a chord feature quietly breaks — the field is dropped by
 * a column map, or by the function that rebuilds slots, and nothing fails until
 * someone opens the link on Sunday.
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

const eq = (name, got, want) =>
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

async function waitReady(baseUrl) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) return;
    } catch {
      /* still booting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server failed to start');
}

const PORT = 45233;
const base = `http://127.0.0.1:${PORT}`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-chord-flow-'));
const proc = spawn('node', ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    ARIA_STORAGE: 'file',
    ARIA_AUTH: 'demo',
    ARIA_DATA_FILE: path.join(tmpDir, 'data.json'),
    ARIA_AUTH_FILE: path.join(tmpDir, 'auth.json'),
  },
  stdio: 'ignore',
});

async function run() {
  console.log('\nAria · chords & keys through the API\n');
  await waitReady(base);

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
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };

  const leader = await apiCall('/auth/register', 'POST', {
    name: 'Worship Leader',
    email: 'leader@example.com',
    password: 'password123',
  });
  const tk = leader.token;

  console.log('1. A song keeps the key it was written in');
  {
    const created = await apiCall(
      '/songs',
      'POST',
      {
        title: 'Amazing Grace',
        artist: 'Traditional',
        tempo: 'slow',
        theme: 'Grace',
        key: 'G',
        teamId: null,
        parts: [
          { kind: 'verse', label: 'Verse 1', lyrics: '[G]Amazing [D]grace, how [Em]sweet the [C]sound' },
          { kind: 'chorus', label: 'Chorus', lyrics: '[C]How [G]sweet [D]the [G]sound' },
        ],
        analysis: null,
      },
      tk,
    );
    eq('the key comes back on create', created.song.key, 'G');
    eq('and the chords are stored verbatim', created.song.parts[0].lyrics,
      '[G]Amazing [D]grace, how [Em]sweet the [C]sound');

    const reloaded = (await apiCall('/state', 'GET', null, tk)).songs.find(
      (s) => s.id === created.song.id,
    );
    eq('the key survives a reload', reloaded.key, 'G');

    await apiCall('/songs/' + created.song.id, 'PATCH', { key: 'D' }, tk);
    const moved = (await apiCall('/state', 'GET', null, tk)).songs.find(
      (s) => s.id === created.song.id,
    );
    eq('and can be changed', moved.key, 'D');

    await apiCall('/songs/' + created.song.id, 'PATCH', { key: 'G' }, tk);
  }

  console.log('\n2. A lineup slot keeps its own key');
  {
    const song = (await apiCall('/state', 'GET', null, tk)).songs.find(
      (s) => s.title === 'Amazing Grace',
    );
    const verse = song.parts.find((p) => p.label === 'Verse 1');
    const chorus = song.parts.find((p) => p.label === 'Chorus');

    const other = await apiCall(
      '/songs',
      'POST',
      {
        title: 'Blessed Be',
        artist: 'Unknown',
        tempo: 'fast',
        theme: 'Praise',
        key: 'D',
        teamId: null,
        parts: [{ kind: 'verse', label: 'Verse 1', lyrics: '[D]Blessed [A]be Your [Bm]name' }],
        analysis: null,
      },
      tk,
    );
    const otherVerse = other.song.parts[0];

    // Song 1 in G, Song 2 in D, then Song 1 again — now in D.
    const lineup = (
      await apiCall(
        '/lineups',
        'POST',
        {
          name: 'Sunday morning',
          theme: 'Grace',
          teamId: null,
          items: [
            { songId: song.id, partId: verse.id },
            { songId: other.song.id, partId: otherVerse.id, key: 'D' },
            { songId: song.id, partId: chorus.id, key: 'D' },
          ],
        },
        tk,
      )
    ).lineup;

    eq('slot 1 has no key of its own', lineup.items[0].key, '');
    eq('slot 2 keeps D', lineup.items[1].key, 'D');
    eq('slot 3 keeps D', lineup.items[2].key, 'D');
    eq('slot 3 records where the song was written', lineup.items[2].songKey, 'G');

    const back = (await apiCall('/state', 'GET', null, tk)).lineups.find(
      (l) => l.id === lineup.id,
    );
    eq('the slot keys survive a reload', back.items[2].key, 'D');
    eq('and so does the written key', back.items[2].songKey, 'G');

    // Re-saving the lineup re-snapshots every slot on the server; a key that is
    // not carried through that function disappears here.
    await apiCall(
      '/lineups/' + lineup.id,
      'PATCH',
      { items: back.items.map((i) => ({ songId: i.songId, partId: i.partId, key: i.key })) },
      tk,
    );
    const again = (await apiCall('/state', 'GET', null, tk)).lineups.find(
      (l) => l.id === lineup.id,
    );
    eq('and survive being re-saved', again.items[2].key, 'D');

    console.log('\n3. A public link carries what a stranger needs to transpose');
    const shared = await apiCall('/shared/' + lineup.shareToken);
    eq('the shared verse names the key it was written in', shared.lineup.items[0].songKey, 'G');
    eq('the shared reprise names the key it plays in', shared.lineup.items[2].playKey, 'D');
    eq(
      'and still ships the original words',
      shared.lineup.items[2].lyrics,
      '[C]How [G]sweet [D]the [G]sound',
    );

    const fullSongs = shared.lineup.songs.filter((s) => s.title === 'Amazing Grace');
    eq('the full sheet appears twice, once per key', fullSongs.length, 2);
    eq('one of them is the D reprise', fullSongs.some((s) => s.playKey === 'D'), true);
    eq('and one is as written', fullSongs.some((s) => !s.playKey), true);
    eq('both say where they were written', fullSongs.every((s) => s.key === 'G'), true);
  }

  console.log('\n4. A key that is not a key is not stored');
  {
    const junk = await apiCall(
      '/songs',
      'POST',
      {
        title: 'No Key',
        artist: 'Nobody',
        tempo: 'slow',
        theme: '',
        key: '   H major please   ',
        teamId: null,
        parts: [{ kind: 'verse', label: 'Verse 1', lyrics: 'Just words' }],
        analysis: null,
      },
      tk,
    );
    // A key nobody can transpose from is worse than no key at all: the song
    // would still advertise one to the reader.
    eq('nonsense is refused', junk.song.key, '');

    const real = await apiCall(
      '/songs',
      'POST',
      {
        title: 'Flat Key',
        artist: 'Nobody',
        tempo: 'slow',
        theme: '',
        key: ' B\u266d ',
        teamId: null,
        parts: [{ kind: 'verse', label: 'Verse 1', lyrics: '[Bb]Just words' }],
        analysis: null,
      },
      tk,
    );
    eq('a real key is kept', real.song.key, 'Bb');
    eq('and a unicode flat is normalised to ascii', real.song.key.includes('\u266d'), false);

    const minor = await apiCall(
      '/songs',
      'POST',
      {
        title: 'Minor Key',
        artist: 'Nobody',
        tempo: 'slow',
        theme: '',
        key: 'F#m',
        teamId: null,
        parts: [{ kind: 'verse', label: 'Verse 1', lyrics: '[F#m]Just words' }],
        analysis: null,
      },
      tk,
    );
    eq('a minor key with an accidental is kept', minor.song.key, 'F#m');
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
}

run()
  .catch((e) => {
    console.error('\nTest crashed:', e);
    failed++;
  })
  .finally(() => {
    proc.kill('SIGTERM');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    process.exit(failed === 0 ? 0 : 1);
  });
