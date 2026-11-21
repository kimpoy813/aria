#!/usr/bin/env node
/**
 * Multiple teams, and the Mine / All / Team scoping that keeps them apart.
 *
 *   npm run test:teams
 *
 * It also pins down the account sheet, which used to print `songs.length`
 * straight off the store and so reported your teammates' work as yours, and the
 * lineup builder, which used to offer teammates' songs for picking.
 *
 * The question this answers: joining a second team does not create a second
 * library. `canView()` on the server returns the union of everything every team
 * you are in can see, so `/api/state` hands the client one flat pile. Part 2
 * proves that against a real server with two teams, and part 1 proves the
 * client-side scoping splits it back up correctly.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

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

/** Bundles a .ts module so the test runs the shipped code, not a copy. */
async function loadTs(rel) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, rel)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    mainFields: [],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const {
  applyScope,
  builderLibrary,
  ownRecords,
  sharedWithTeam,
  isTheOriginal,
  lineageRoot,
  lineupSignature,
  songSignature,
  teamSharedCounts,
  teamsForRecord,
  yourVersionOf,
} = await loadTs('src/lib/scopes.ts');
const { lineupFullLyricBlocks, repointSlotsToCopy } = await loadTs('src/lib/lru.ts');

const team = (id, name, memberIds) => ({
  id,
  name,
  code: `ARIA-${id}`,
  ownerId: memberIds[0],
  createdAt: 1,
  members: memberIds.map((userId, i) => ({
    userId,
    name: userId,
    role: i === 0 ? 'owner' : 'member',
    joinedAt: 1,
  })),
  myRole: null,
});
const rec = (id, ownerId, teamId = null) => ({ id, ownerId, teamId });
const ids = (list) => list.map((r) => r.id).sort().join(',');

const ME = 'me';
const sunday = team('t1', 'Sunday Band', ['alice', 'me', 'carol']);
const wedding = team('t2', 'Wedding Duo', ['me', 'bob']);
const teams2 = [sunday, wedding];

console.log('\nAria · teams & scoping\n\n1. Mine / All / Team');
{
  const songs = [
    rec('mine', ME),
    rec('alice', 'alice'),
    rec('bob', 'bob'),
  ];
  check(
    'Mine shows only your own',
    ids(applyScope(songs, { scope: 'mine', viewerId: ME, teams: teams2 })) === 'mine',
    ids(applyScope(songs, { scope: 'mine', viewerId: ME, teams: teams2 })),
  );
  check(
    'All shows everything the server sent',
    ids(applyScope(songs, { scope: 'all', viewerId: ME, teams: teams2 })) ===
      'alice,bob,mine',
  );
  check(
    'Team shows everyone else, never your own',
    ids(applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2 })) ===
      'alice,bob',
  );
}

console.log('\n1b. What the account sheet counts');
{
  const songs = [rec('mine', ME), rec('alice', 'alice'), rec('bob', 'bob')];
  const lineups = [rec('l-mine', ME), rec('l-alice', 'alice')];

  check(
    'your song count excludes teammates',
    ownRecords(songs, ME).length === 1,
    `${ownRecords(songs, ME).length} of ${songs.length}`,
  );
  check(
    'your lineup count excludes teammates',
    ownRecords(lineups, ME).length === 1,
    `${ownRecords(lineups, ME).length} of ${lineups.length}`,
  );
  // The sheet and the Songs page must never disagree about what "mine" means.
  check(
    'the account sheet agrees with the Mine tab',
    ownRecords(songs, ME).length ===
      applyScope(songs, { scope: 'mine', viewerId: ME, teams: teams2 }).length,
  );
}

console.log('\n1c. What the lineup builder offers');
{
  const song = (id, title, ownerId, extra = {}) => ({
    id,
    title,
    artist: extra.artist ?? 'Nobody',
    tempo: extra.tempo ?? 'slow',
    theme: extra.theme ?? '',
    parts: [{ id: `${id}-p1`, kind: 'verse', label: 'Verse 1', lyrics: extra.lyrics ?? 'la' }],
    analysis: null,
    ownerId,
    ownerName: ownerId === ME ? 'Kim' : 'Alice',
    teamId: null,
    sourceSongId: extra.sourceSongId ?? null,
    copiedFrom: extra.copiedFrom ?? null,
    createdAt: 1,
    updatedAt: 1,
  });

  const mine = song('mine', 'My Song', ME);
  const copied = song('copy', 'Alice Song', ME, {
    sourceSongId: 'alice-1',
    copiedFrom: 'Alice Song · Alice',
  });
  const teammate = song('alice-1', 'Alice Song', 'alice');
  const all = [mine, copied, teammate];

  check(
    'the picker offers your own songs',
    builderLibrary(all, { viewerId: ME }).map((s) => s.id).join(',') === 'mine,copy',
    builderLibrary(all, { viewerId: ME })
      .map((s) => s.id)
      .join(','),
  );
  check(
    'a song you copied is offered, because a copy is yours',
    builderLibrary(all, { viewerId: ME }).some((s) => s.id === 'copy' && s.sourceSongId === 'alice-1'),
  );
  check(
    'the original it was copied from is not',
    !builderLibrary(all, { viewerId: ME }).some((s) => s.id === 'alice-1'),
  );
  check(
    'search still reaches into lyrics',
    builderLibrary(all, { viewerId: ME, search: 'la' }).length === 2,
  );
  check(
    'the tempo filter still works',
    builderLibrary(all, { viewerId: ME, tempo: 'fast' }).length === 0,
  );

  /*
   * A lineup built before this rule can still hold a teammate's song. The
   * picker must not offer it again, but the lineup itself must keep rendering —
   * tightening this by dropping items would quietly delete someone's sequence.
   */
  const legacyLineup = {
    id: 'l1',
    name: 'Old',
    theme: '',
    ownerId: ME,
    ownerName: 'Kim',
    teamId: null,
    items: [
      { id: 'i1', songId: 'mine', partId: 'mine-p1', partLabel: 'Verse 1', lyrics: 'la' },
      { id: 'i2', songId: 'alice-1', partId: 'alice-1-p1', partLabel: 'Verse 1', lyrics: 'la' },
    ],
    shareToken: 't',
    sourceLineupId: null,
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    useCount: 0,
    lastUsedReason: null,
  };
  const blocks = lineupFullLyricBlocks(legacyLineup, all);
  check(
    'a legacy lineup keeps its shared song in the sequence',
    blocks.length === 2,
    blocks.map((b) => b.songTitle).join(', '),
  );
}

console.log('\n1d. Taking a shared song into your own library');
{
  const full = (id, title, ownerId, sourceSongId = null) => ({
    id,
    title,
    artist: 'Nobody',
    tempo: 'slow',
    theme: '',
    parts: [
      { id: `${id}-p1`, kind: 'verse', label: 'Verse 1', lyrics: 'one' },
      { id: `${id}-p2`, kind: 'chorus', label: 'Chorus', lyrics: 'two' },
    ],
    analysis: null,
    ownerId,
    ownerName: ownerId === ME ? 'Kim' : 'Alice',
    teamId: null,
    sourceSongId,
    createdAt: 1,
    updatedAt: 1,
  });

  const shared = full('a1', 'Alice Song', 'alice');
  const myCopy = full('c1', 'Alice Song', ME, 'a1');
  const unrelated = full('m1', 'My Own', ME);
  // A copy of a copy: the server stores the *root*, not the immediate parent.
  const chained = full('d1', 'Alice Song', ME, 'a1');

  check(
    'finds the copy you already own',
    yourVersionOf([unrelated, myCopy], shared, ME)?.id === 'c1',
    yourVersionOf([unrelated, myCopy], shared, ME)?.id,
  );
  check(
    'does not mistake an unrelated song of yours for a copy',
    yourVersionOf([unrelated], shared, ME) === undefined,
  );
  check(
    'a copy of a copy still counts, because the root matches',
    yourVersionOf([chained], shared, ME)?.id === 'd1',
  );
  check('says so when you have no copy', yourVersionOf([unrelated], shared, ME) === undefined);

  const slots = [
    { id: 's1', songId: 'a1', partId: 'a1-p1', partLabel: 'Verse 1' },
    { id: 's2', songId: 'm1', partId: 'm1-p2', partLabel: 'Chorus' },
    { id: 's3', songId: 'a1', partId: 'a1-p2', partLabel: 'Chorus' },
    { id: 's4', songId: 'a1', partId: 'a1-missing', partLabel: 'Bridge' },
  ];
  const moved = repointSlotsToCopy(slots, shared, myCopy);

  check(
    'slots move to the copy',
    moved[0].songId === 'c1' && moved[2].songId === 'c1',
    moved.map((m) => m.songId).join(','),
  );
  check(
    'and pick up the copy’s new part ids',
    moved[0].partId === 'c1-p1' && moved[2].partId === 'c1-p2',
    moved.map((m) => m.partId).join(','),
  );
  check(
    'other songs are left alone',
    moved[1].songId === 'm1' && moved[1].partId === 'm1-p2',
  );
  check(
    'a slot that cannot be mapped is kept, not dropped',
    moved.length === 4 && moved[3].songId === 'a1' && moved[3].partId === 'a1-missing',
    `${moved.length} slots`,
  );
}

console.log('\n1e. Someone copies your song back at you');
{
  const song = (id, ownerId, sourceSongId = null, lyrics = 'one\ntwo') => ({
    id,
    title: 'Grace',
    artist: 'Nobody',
    tempo: 'slow',
    theme: '',
    parts: [{ id: `${id}-p1`, kind: 'verse', label: 'Verse 1', lyrics }],
    analysis: null,
    ownerId,
    ownerName: ownerId === ME ? 'Kim' : 'Alice',
    teamId: null,
    sourceSongId,
    createdAt: 1,
    updatedAt: 1,
  });

  const mine = song('k1', ME);
  const aliceTookIt = song('a1', 'alice', 'k1');
  const aliceEditedIt = song('a2', 'alice', 'k1', 'one\nchanged');
  const alicesOwn = song('a3', 'alice');
  const bobTookAlices = song('b1', 'bob', 'a3');

  check('an original is its own root', lineageRoot(mine) === 'k1');
  check('a copy points at the root', lineageRoot(aliceTookIt) === 'k1');
  check(
    'a copy of a copy still points at the same root',
    lineageRoot({ id: 'x', sourceSongId: lineageRoot(bobTookAlices) }) === 'a3',
  );

  check(
    'when Alice copies your song, you already own that version',
    yourVersionOf([mine, aliceTookIt], aliceTookIt, ME)?.id === 'k1',
  );
  check(
    'and it is recognised as your original, so there is nothing to copy back',
    isTheOriginal(yourVersionOf([mine, aliceTookIt], aliceTookIt, ME), aliceTookIt),
  );
  check(
    'an unrelated teammate song still offers a copy',
    yourVersionOf([mine, alicesOwn], alicesOwn, ME) === undefined,
  );
  check(
    'a song you copied yourself is yours but not the original',
    yourVersionOf([mine, aliceTookIt], aliceTookIt, 'alice')?.id === 'a1' &&
      isTheOriginal(aliceTookIt, aliceTookIt) === false,
  );

  check(
    'an untouched copy is not treated as an edit',
    songSignature(mine) === songSignature(aliceTookIt),
  );
  check(
    'a rewritten verse is an edit, so copying it back is legitimate',
    songSignature(mine) !== songSignature(aliceEditedIt),
  );
  check(
    'formatting alone is not an edit',
    songSignature(mine) === songSignature(song('k9', 'alice', 'k1', '  one\n\n  two  ')),
  );

  const lineup = (id, ownerId, sourceLineupId = null, lyrics = 'one') => ({
    id,
    name: 'Sunday',
    theme: '',
    ownerId,
    ownerName: ownerId === ME ? 'Kim' : 'Alice',
    teamId: null,
    items: [
      {
        id: 'i1',
        songId: 's',
        partId: 'p',
        songTitle: 'Grace',
        partLabel: 'Verse 1',
        lyrics,
      },
    ],
    shareToken: 't',
    sourceLineupId,
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    useCount: 0,
    lastUsedReason: null,
  });

  check(
    'the same rule holds for lineups',
    yourVersionOf([lineup('l1', ME), lineup('l2', 'alice', 'l1')], lineup('l2', 'alice', 'l1'), ME)
      ?.id === 'l1',
  );
  check(
    'an unchanged lineup copy is not an edit',
    lineupSignature(lineup('l1', ME)) === lineupSignature(lineup('l2', 'alice', 'l1')),
  );
  check(
    'a rearranged lineup is an edit',
    lineupSignature(lineup('l1', ME)) !== lineupSignature(lineup('l3', 'alice', 'l1', 'two')),
  );
}

console.log('\n2. Two teams at once');
{
  const songs = [
    rec('mine', ME),
    rec('from-sunday', 'alice'),
    rec('from-wedding', 'bob'),
    rec('from-carol', 'carol'), // Sunday only
  ];

  check(
    'the Team tab is the union of both teams',
    ids(applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2 })) ===
      'from-carol,from-sunday,from-wedding',
    ids(applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2 })),
  );
  check(
    'narrowing to Sunday Band leaves out the wedding songs',
    ids(applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2, teamId: 't1' })) ===
      'from-carol,from-sunday',
    ids(applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2, teamId: 't1' })),
  );
  check(
    'narrowing to Wedding Duo leaves out the Sunday songs',
    ids(applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2, teamId: 't2' })) ===
      'from-wedding',
    ids(applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2, teamId: 't2' })),
  );
  check(
    'a team you have left shows nothing',
    applyScope(songs, { scope: 'team', viewerId: ME, teams: teams2, teamId: 'gone' })
      .length === 0,
  );
}

console.log('\n3. Someone who is in two of your teams');
{
  // alice is in both Sunday and Wedding.
  const sharedTeams = [sunday, team('t2', 'Wedding Duo', ['me', 'alice', 'bob'])];
  const aliceSong = rec('alice-song', 'alice');

  check(
    'their song counts toward both teams, because it is shared with both',
    sharedWithTeam(aliceSong, sharedTeams[0], ME) &&
      sharedWithTeam(aliceSong, sharedTeams[1], ME),
  );
  check(
    'it is attributed to both, not to whichever came first',
    teamsForRecord(aliceSong, sharedTeams, ME)
      .map((t) => t.id)
      .join(',') === 't1,t2',
  );
  check(
    'your own record is never counted as shared',
    sharedWithTeam(rec('mine', ME), sharedTeams[0], ME) === false,
  );
}

console.log('\n4. A record tagged with a specific team');
{
  const tagged = rec('tagged', 'stranger', 't1');
  check(
    'a record tagged with your team is shared with it',
    sharedWithTeam(tagged, sunday, ME) === true,
  );
  check(
    'but not with your other team',
    sharedWithTeam(tagged, wedding, ME) === false,
  );
  check(
    'a record tagged with a team you are not in is not shared',
    sharedWithTeam(rec('x', 'stranger', 'other'), sunday, ME) === false,
  );
}

console.log('\n5. The counts a team card shows');
{
  const songs = [
    rec('mine', ME),
    rec('s1', 'alice'),
    rec('s2', 'carol'),
    rec('w1', 'bob'),
  ];
  const lineups = [rec('l1', 'alice'), rec('l2', 'bob'), rec('l3', ME)];
  const counts = teamSharedCounts(teams2, songs, lineups, ME);
  check(
    'Sunday counts its own members’ songs',
    counts.get('t1')?.songs === 2,
    `${counts.get('t1')?.songs}`,
  );
  check(
    'Sunday does not inherit the wedding songs',
    counts.get('t2')?.songs === 1,
    `${counts.get('t2')?.songs}`,
  );
  check(
    'your own lineups are not counted as shared',
    counts.get('t1')?.lineups === 1 && counts.get('t2')?.lineups === 1,
    `${counts.get('t1')?.lineups} / ${counts.get('t2')?.lineups}`,
  );
}

/* ------------------------------------------------- part 6: a real server */

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

console.log('\n6. What the server actually sends a member of two teams');
{
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-teams-'));
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port),
    ARIA_STORAGE: 'file',
    ARIA_AUTH: 'demo',
    ARIA_DATA_DIR: dataDir,
  });
  await import(`${path.join(root, 'server', 'index.js')}?v=${Date.now()}`);
  if (!(await waitFor(port))) throw new Error('server did not start');

  const call = async (method, route, token, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };

  const signUp = async (name, email) => {
    const res = await call('POST', '/api/auth/register', null, {
      name,
      email,
      password: 'hunter2hunter',
    });
    if (!res.data?.token) throw new Error(`could not register ${name}`);
    return res.data.token;
  };
  const addSong = async (token, title) =>
    call('POST', '/api/songs', token, {
      title,
      artist: 'Nobody',
      tempo: 'slow',
      parts: [{ label: 'Verse 1', kind: 'verse', lyrics: `${title} lyric` }],
    });

  const me = await signUp('Kim', 'kim@example.com');
  const alice = await signUp('Alice', 'alice@example.com');
  const bob = await signUp('Bob', 'bob@example.com');

  const teamA = await call('POST', '/api/teams', me, { name: 'Sunday Band' });
  const teamB = await call('POST', '/api/teams', me, { name: 'Wedding Duo' });
  const codeA = teamA.data?.team?.code;
  const codeB = teamB.data?.team?.code;
  check('two teams created', Boolean(codeA) && Boolean(codeB), `${codeA} ${codeB}`);

  check('Alice joined Sunday', (await call('POST', '/api/teams/join', alice, { code: codeA })).status === 200);
  check('Bob joined Wedding', (await call('POST', '/api/teams/join', bob, { code: codeB })).status === 200);

  await addSong(me, 'My Song');
  await addSong(alice, 'Sunday Song');
  await addSong(bob, 'Wedding Song');

  const state = await call('GET', '/api/state', me);
  const songs = state.data?.songs ?? [];
  const teams = state.data?.teams ?? [];
  const myId = state.data?.user?.id;

  check('the caller sees both teams', teams.length === 2, `${teams.length}`);
  check(
    'and one flat list of every song every team can see',
    songs.length === 3,
    songs.map((s) => s.title).join(', '),
  );

  check(
    'the account sheet says 1, not 3',
    songs.length === 3 && ownRecords(songs, myId).length === 1,
    `sheet=${ownRecords(songs, myId).length} store=${songs.length}`,
  );

  const byTitle = (list) => list.map((s) => s.title).sort();
  check(
    'Mine narrows it to your own song',
    byTitle(applyScope(songs, { scope: 'mine', viewerId: myId, teams })).join() === 'My Song',
    byTitle(applyScope(songs, { scope: 'mine', viewerId: myId, teams })).join(),
  );
  check(
    'Team shows both teammates’ songs',
    byTitle(applyScope(songs, { scope: 'team', viewerId: myId, teams })).join() ===
      'Sunday Song,Wedding Song',
    byTitle(applyScope(songs, { scope: 'team', viewerId: myId, teams })).join(),
  );

  const sundayId = teams.find((t) => t.name === 'Sunday Band')?.id;
  const weddingId = teams.find((t) => t.name === 'Wedding Duo')?.id;
  check(
    'Sunday shows only the Sunday song',
    byTitle(
      applyScope(songs, { scope: 'team', viewerId: myId, teams, teamId: sundayId }),
    ).join() === 'Sunday Song',
    byTitle(
      applyScope(songs, { scope: 'team', viewerId: myId, teams, teamId: sundayId }),
    ).join(),
  );
  check(
    'Wedding shows only the Wedding song',
    byTitle(
      applyScope(songs, { scope: 'team', viewerId: myId, teams, teamId: weddingId }),
    ).join() === 'Wedding Song',
    byTitle(
      applyScope(songs, { scope: 'team', viewerId: myId, teams, teamId: weddingId }),
    ).join(),
  );

  /*
   * The whole point of remapping: a copy has new part ids, so a lineup that
   * simply swapped songId would save parts the server cannot resolve.
   */
  const mySong = songs.find((s) => s.title === 'My Song');
  const sundaySong = songs.find((s) => s.title === 'Sunday Song');

  const created = await call('POST', '/api/lineups', me, {
    name: 'Mixed',
    theme: '',
    items: [
      { songId: mySong.id, partId: mySong.parts[0].id },
      { songId: sundaySong.id, partId: sundaySong.parts[0].id },
    ],
  });
  const lineupId = created.data?.lineup?.id;
  check(
    'a lineup can hold a shared song',
    created.status === 200 && created.data?.lineup?.items?.length === 2,
    `${created.status}`,
  );

  const copied = await call('POST', `/api/songs/${sundaySong.id}/copy`, me);
  const copy = copied.data?.song;
  check('the shared song is copied into your library', Boolean(copy?.id));
  check(
    'and the copy has brand-new part ids',
    copy?.parts?.[0]?.id !== sundaySong.parts[0].id,
    `${copy?.parts?.[0]?.id}`,
  );
  check(
    'yourVersionOf now finds it',
    yourVersionOf([...songs, copy], sundaySong, myId)?.id === copy?.id,
  );

  const repointed = repointSlotsToCopy(created.data.lineup.items, sundaySong, copy);
  const saved = await call('PATCH', `/api/lineups/${lineupId}`, me, {
    name: 'Mixed',
    theme: '',
    items: repointed.map((i) => ({ songId: i.songId, partId: i.partId })),
  });
  const savedItems = saved.data?.lineup?.items ?? [];
  check(
    'the remapped lineup saves',
    saved.status === 200 && savedItems.length === 2,
    `${saved.status} / ${savedItems.length} items`,
  );
  check(
    'and now points at your copy, with resolvable parts',
    savedItems.every((i) => i.lyrics) &&
      savedItems.some((i) => i.songId === copy.id),
    savedItems.map((i) => `${i.songId}:${i.partLabel}`).join(', '),
  );

  /*
   * The reported annoyance, against the real thing: Alice copies Kim's song,
   * and Kim must not be offered it back.
   */
  const aliceCopied = await call('POST', `/api/songs/${mySong.id}/copy`, alice);
  const backAtYou = aliceCopied.data?.song;
  check('a teammate can copy your song', Boolean(backAtYou?.id));

  const afterCopy = await call('GET', '/api/state', me);
  const nowSongs = afterCopy.data?.songs ?? [];
  const asKimSeesIt = nowSongs.find((s) => s.id === backAtYou.id);
  const kimsVersion = yourVersionOf(nowSongs, asKimSeesIt, myId);

  check(
    'Kim already owns that lineage',
    kimsVersion?.id === mySong.id,
    `${kimsVersion?.id} vs ${mySong.id}`,
  );
  check(
    'and it is his original — so no Copy button, just “Your song”',
    kimsVersion !== undefined && isTheOriginal(kimsVersion, asKimSeesIt),
  );
  check(
    'the copy is unchanged, so it is not offered as a version either',
    songSignature(kimsVersion) === songSignature(asKimSeesIt),
  );

  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
