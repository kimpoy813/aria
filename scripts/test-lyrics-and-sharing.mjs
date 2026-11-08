/**
 * End-to-end verification for:
 *   1. Automatic lyric section identification & splitting (with and without headers)
 *   2. Shared lineup lyric rendering (public share link, song re-edits, and team sharing)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createViteServer } from 'vite';

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
  console.log('\nAria · lyric auto-split & shared lineup rendering test\n');

  /* ---------------------------------------------- 1. Lyric auto-splitting */
  console.log('1. Automatic lyric section detection & splitting');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { splitPastedLyrics, shouldAutoSplitPaste, isChordLine } =
      await vite.ssrLoadModule('/src/lib/lyricSplit.ts');

    // 1a. Unlabelled Google/Spotify style lyrics with repeating chorus, bridge & outro
    const unlabelledSong = `
Walking through the quiet night
Searching for a steady light
Every shadow fades away
At the breaking of the day

Shine Your light upon my road
Lift the weight of every load
Shine Your light upon my road
Lead my wandering spirit home

Morning rises on the hill
Troubled waters growing still
Grace isspoken over me
Now my heavy heart is free

Shine Your light upon my road
Lift the weight of every load
Shine Your light upon my road
Lead my wandering spirit home

Even in the deepest valley
I will never walk alone
Every promise You have spoken
Carries me unto Your throne

Shine Your light upon my road
Lift the weight of every load
Shine Your light upon my road
Lead my wandering spirit home

Lead my spirit home
Lead my spirit home
    `.trim();

    const r1 = splitPastedLyrics(unlabelledSong);
    check(
      'unlabelled song detects Verse 1, Chorus, Verse 2, Bridge, Outro',
      r1.parts.map((p) => p.kind).join(',') === 'verse,chorus,verse,bridge,outro',
      `got ${r1.parts.map((p) => `${p.label}(${p.kind})`).join(', ')}`,
    );
    check(
      'merges identical repeated choruses automatically',
      r1.collapsedCount === 2 && r1.parts.filter((p) => p.kind === 'chorus').length === 1,
      `collapsed=${r1.collapsedCount}`,
    );

    // 1b. Genius / CCLI headers with singer annotations & empty [Chorus] repeat tag
    const geniusSong = `
[Verse 1: Lead Vocal]
Through the storm You remain
Anchor in the hurricane

[Pre-Chorus]
My hope is rising now
My fear is bowing down

[Chorus: All]
Forever faithful, forever strong
You are my shelter, You are my song

[Verse 2]
Mercy greets the morning sky
Every tear You gently dry

[Chorus]

[Bridge (x2)]
Nothing can separate us now
Nothing can shake this solid ground
    `.trim();

    const r2 = splitPastedLyrics(geniusSong);
    check(
      'parses Genius/CCLI headers and strips singer/repeat clutter',
      r2.parts.map((p) => p.label).join(' | ') ===
        'Verse 1 | Pre-Chorus | Chorus | Verse 2 | Bridge',
      `got ${r2.parts.map((p) => p.label).join(' | ')}`,
    );

    // 1c. Hymn-style sheet (unlabelled Verse 1 + "Chorus:" + unlabelled Verse 2)
    const hymnSong = `
When peace like a river attendeth my way
When sorrows like sea billows roll

Chorus:
It is well with my soul
It is well, it is well with my soul

Though trials should buffet and storms gather near
My anchor is holding secure
    `.trim();

    const r3 = splitPastedLyrics(hymnSong);
    check(
      'preserves unlabelled opening verse before Chorus: and splits trailing verse',
      r3.parts.map((p) => p.label).join(' | ') === 'Verse 1 | Chorus | Verse 2',
      `got ${r3.parts.map((p) => p.label).join(' | ')}`,
    );

    // 1d. Continuous unbroken lines (no headers, no blank lines) with repeated chorus
    const unbroken = [
      'I hear the sound of distant rain',
      'Washing away the yesterday',
      'Hallelujah sing aloud',
      'Grace is falling like a cloud',
      'Hallelujah sing aloud',
      'Mercy covers us right now',
      'A brand new dawn is breaking through',
      'Every promise ringing true',
      'Hallelujah sing aloud',
      'Grace is falling like a cloud',
      'Hallelujah sing aloud',
      'Mercy covers us right now',
    ].join('\n');

    const r4 = splitPastedLyrics(unbroken);
    check(
      'splits unbroken continuous lines by detecting repeated chorus block',
      r4.parts.length === 3 &&
        r4.parts[0].kind === 'verse' &&
        r4.parts[1].kind === 'chorus' &&
        r4.parts[2].kind === 'verse',
      `got ${r4.parts.map((p) => `${p.label}(${p.kind})`).join(', ')}`,
    );

    // 1e. Chord lines are recognized as chords and NOT misread as headers
    check('recognizes chord lines like "G   D/F#   Em7   C"', isChordLine('G   D/F#   Em7   C'));
    check('does not treat lyric lines as chord lines', !isChordLine('Amazing grace how sweet'));
    check(
      'triggers auto-split on paste into empty textarea',
      shouldAutoSplitPaste(unlabelledSong, '', false),
    );
    check(
      'does not hijack single-line paste',
      !shouldAutoSplitPaste('Just a single lyric line', '', false),
    );

    // 1f. Christian / Church worship classification & message
    const { analyzeLyrics, applyClassificationOverride, defaultMessageForTheme } =
      await vite.ssrLoadModule('/src/lib/nlp.ts');
    const graceAnalysis = analyzeLyrics([
      {
        id: 'p1',
        kind: 'verse',
        label: 'Verse 1',
        lyrics: 'Amazing grace how sweet the sound, washed in the blood at the cross of Jesus my Savior',
      },
    ]);
    check(
      'classifies cross & redemption lyrics as Grace & Salvation with Christian message',
      graceAnalysis.theme === 'Grace & Salvation' &&
        /cross|Christ|salvation/i.test(graceAnalysis.message),
      `${graceAnalysis.theme}: ${graceAnalysis.message}`,
    );

    const overridden = applyClassificationOverride(graceAnalysis, {
      theme: 'Surrender & Devotion',
      message: 'A personal prayer of full surrender to Jesus as Lord over every area of life.',
    });
    check(
      'allows user to override classified worship theme and message when they know the song message',
      overridden.theme === 'Surrender & Devotion' &&
        overridden.message ===
          'A personal prayer of full surrender to Jesus as Lord over every area of life.' &&
        overridden.manualOverride === true &&
        Boolean(defaultMessageForTheme('Hope & Heaven').message),
    );

    const fatherLoveAnalysis = analyzeLyrics([
      {
        id: 'p1',
        kind: 'chorus',
        label: 'Chorus',
        lyrics: 'Your love never fails, how great the Father love for us, faithful forever',
      },
    ]);
    check(
      'classifies love lyrics in a Christian Father/covenant context (not secular romance)',
      fatherLoveAnalysis.theme === 'God’s Love' &&
        /Father|God|mercy/i.test(fatherLoveAnalysis.message) &&
        !/two people/i.test(fatherLoveAnalysis.message),
      `${fatherLoveAnalysis.theme}: ${fatherLoveAnalysis.message}`,
    );

    const praiseAnalysis = analyzeLyrics([
      {
        id: 'p1',
        kind: 'chorus',
        label: 'Chorus',
        lyrics: 'Holy holy King of Kings, hallelujah we praise and exalt Your glorious name',
      },
    ]);
    check(
      'classifies congregational praise lyrics as Praise & Adoration',
      praiseAnalysis.theme === 'Praise & Adoration' &&
        /worship|Lord|praise/i.test(praiseAnalysis.message),
      `${praiseAnalysis.theme}: ${praiseAnalysis.message}`,
    );

    const { summarizeLineupSongs, summarizeSongsUsed, groupLineupSongBlocks } =
      await vite.ssrLoadModule('/src/lib/lru.ts');
    const mockSongs = [
      {
        id: 's1',
        title: 'Goodness of God',
        artist: 'Bethel Music',
        tempo: 'slow',
        theme: "God's Love",
        parts: [
          { id: 's1_v1', kind: 'verse', label: 'Verse 1', lyrics: 'I love You Lord' },
          { id: 's1_c', kind: 'chorus', label: 'Chorus', lyrics: 'All my life You have been faithful' },
          { id: 's1_v2', kind: 'verse', label: 'Verse 2', lyrics: 'I love Your voice' },
          { id: 's1_b', kind: 'bridge', label: 'Bridge', lyrics: 'Your goodness is running after me' },
        ],
        analysis: null,
        ownerId: 'u1',
        ownerName: 'Ana',
        teamId: null,
        sourceSongId: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 's2',
        title: 'Praise',
        artist: 'Elevation Worship',
        tempo: 'fast',
        theme: 'Praise & Adoration',
        parts: [
          { id: 's2_v1', kind: 'verse', label: 'Verse 1', lyrics: 'Let everything that has breath' },
          { id: 's2_c', kind: 'chorus', label: 'Chorus', lyrics: 'Praise the Lord oh my soul' },
        ],
        analysis: null,
        ownerId: 'u1',
        ownerName: 'Ana',
        teamId: null,
        sourceSongId: null,
        createdAt: 2000,
        updatedAt: 2000,
      },
      {
        id: 's3',
        title: 'Cornerstone',
        artist: 'Hillsong',
        tempo: 'slow',
        theme: 'Faith & Trust',
        parts: [
          { id: 's3_c', kind: 'chorus', label: 'Chorus', lyrics: 'Christ alone Cornerstone' },
        ],
        analysis: null,
        ownerId: 'u1',
        ownerName: 'Ana',
        teamId: null,
        sourceSongId: null,
        createdAt: 3000,
        updatedAt: 3000,
      },
    ];
    const mockLineup = {
      id: 'l1',
      name: 'Sunday Morning Worship',
      theme: 'Praise & Adoration',
      ownerId: 'u1',
      ownerName: 'Ana',
      teamId: null,
      items: [
        { id: 'i1', songId: 's1', partId: 's1_v1' },
        { id: 'i2', songId: 's1', partId: 's1_c' },
        { id: 'i3', songId: 's1', partId: 's1_v2' },
        { id: 'i4', songId: 's1', partId: 's1_c' },
        { id: 'i5', songId: 's1', partId: 's1_b' },
        { id: 'i6', songId: 's1', partId: 's1_c' },
        { id: 'i7', songId: 's2', partId: 's2_v1' },
        { id: 'i8', songId: 's2', partId: 's2_c' },
        { id: 'i9', songId: 's3', partId: 's3_c' },
      ],
      shareToken: 'tok1',
      sourceLineupId: null,
      createdAt: 5000,
      updatedAt: 5000,
      lastUsedAt: 9000,
      useCount: 2,
      lastUsedReason: 'link_shared',
    };

    const usedInLineup = summarizeLineupSongs(mockLineup, mockSongs);
    check(
      'summarizeLineupSongs surfaces all 3 unique songs in order even when Song 1 has 6 parts',
      usedInLineup.length === 3 &&
        usedInLineup[0].song.title === 'Goodness of God' &&
        usedInLineup[0].parts.length === 6 &&
        usedInLineup[1].song.title === 'Praise' &&
        usedInLineup[2].song.title === 'Cornerstone',
    );

    const songStats = summarizeSongsUsed(mockSongs, [mockLineup]);
    check(
      'summarizeSongsUsed tracks lastUsedAt, useCount, and lineup names for used songs',
      songStats.length === 3 &&
        songStats.every((st) => st.inLineupsCount === 1 && st.lastUsedAt === 9000 && st.useCount === 2),
    );

    const groupedBlocks = groupLineupSongBlocks([
      { songTitle: 'Goodness of God', partLabel: 'Verse 1', lyrics: 'I love You Lord' },
      { songTitle: 'Goodness of God', partLabel: 'Chorus', lyrics: 'All my life You have been faithful' },
      { songTitle: 'Goodness of God', partLabel: 'Verse 2', lyrics: 'I love Your voice' },
      { songTitle: 'Goodness of God', partLabel: 'Chorus', lyrics: 'All my life You have been faithful' },
      { songTitle: 'Praise', partLabel: 'Chorus', lyrics: 'Praise the Lord oh my soul' },
    ]);
    check(
      'groupLineupSongBlocks shows each song title once and marks repeated identical sections cleanly',
      groupedBlocks.length === 2 &&
        groupedBlocks[0].songTitle === 'Goodness of God' &&
        groupedBlocks[0].sections.length === 4 &&
        groupedBlocks[0].sections[1].isRepeat === false &&
        groupedBlocks[0].sections[3].isRepeat === true &&
        groupedBlocks[1].songTitle === 'Praise',
    );

    const builderSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'BuilderPage.tsx'),
      'utf8',
    );
    const homeSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'HomePage.tsx'),
      'utf8',
    );
    const lineupsSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'LineupsPage.tsx'),
      'utf8',
    );
    const songFormSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'SongFormPage.tsx'),
      'utf8',
    );
    const stylesSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'styles.css'),
      'utf8',
    );
    check(
      'BuilderPage keeps all song parts expanded by default (no songs.slice(0, 3) collapse)',
      !builderSrc.includes('songs.slice(0, 3)') &&
        builderSrc.includes('const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})') &&
        /\.part-chip\s*\{[\s\S]*?touch-action:\s*manipulation/m.test(stylesSrc),
    );
    check(
      'BuilderPage displays a prominent labeled Lineup title input',
      builderSrc.includes('id="lineup-title"') &&
        builderSrc.includes('lineup-title-input') &&
        stylesSrc.includes('.lineup-title-input'),
    );
    check(
      'SongFormPage lets users directly edit the classified song message',
      songFormSrc.includes('id="song-message"') &&
        songFormSrc.includes('applyClassificationOverride'),
    );
    check(
      'Paste lyrics and Lineup builder keep instructions minimal (no multi-line explanatory bloat)',
      !songFormSrc.includes('Stanzas separated by blank lines') &&
        !songFormSrc.includes('No manual formatting needed') &&
        !builderSrc.includes('Tap song parts below to add more, or drag slots to reorder.'),
    );
    check(
      'HomePage and LineupsPage stay minimal without redundant stat grids or part-count clutter',
      !homeSrc.includes('home-stats') &&
        !homeSrc.includes('parts.join(') &&
        !lineupsSrc.includes('parts ·'),
    );
    check(
      'App CSS enforces a disciplined neutral + single brand accent palette (no orange/blue tempo rainbow)',
      !/#d97706|#b45309|#fbbf24|#1d4ed8|#3b82f6|#60a5fa/i.test(stylesSrc),
    );
  } finally {
    await vite.close();
  }

  /* ------------------------------------ 2. Shared lineup lyric rendering */
  console.log('\n2. Shared lineup lyric rendering (public link, re-edits & team lineups)');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-share-test-'));
  const port = 45219;
  const base = `http://127.0.0.1:${port}`;

  const proc = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      ARIA_STORAGE: 'file',
      ARIA_AUTH: 'demo',
      ARIA_DATA_FILE: path.join(tmpDir, 'data.json'),
      ARIA_AUTH_FILE: path.join(tmpDir, 'auth.json'),
    },
    stdio: 'ignore',
  });

  try {
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

    const userA = await apiCall('/auth/register', 'POST', {
      name: 'Leader Ana',
      email: 'ana@example.com',
      password: 'password123',
    });
    const userB = await apiCall('/auth/register', 'POST', {
      name: 'Singer Ben',
      email: 'ben@example.com',
      password: 'password123',
    });

    // Create personal slow + fast songs
    const slowSong = (
      await apiCall(
        '/songs',
        'POST',
        {
          title: 'Still Waters',
          artist: 'Ana',
          tempo: 'slow',
          theme: 'Peace',
          teamId: null,
          parts: [
            { kind: 'verse', label: 'Verse 1', lyrics: 'Beside the quiet stream\nYou restore my soul' },
            { kind: 'chorus', label: 'Chorus', lyrics: 'Peace like a river flows\nDeep within my heart' },
          ],
          analysis: null,
        },
        userA.token,
      )
    ).song;

    const fastSong = (
      await apiCall(
        '/songs',
        'POST',
        {
          title: 'Rising Dawn',
          artist: 'Ana',
          tempo: 'fast',
          theme: 'Joy',
          teamId: null,
          parts: [
            { kind: 'verse', label: 'Verse 1', lyrics: 'Wake the morning with a shout\nLet every heart rejoice' },
            { kind: 'chorus', label: 'Chorus', lyrics: 'Sing aloud across the earth\nJoy has come today' },
          ],
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
          name: 'Sunday Morning Set',
          theme: 'Joy',
          teamId: null,
          items: [
            { songId: slowSong.id, partId: slowSong.parts[0].id },
            { songId: slowSong.id, partId: slowSong.parts[1].id },
            { songId: fastSong.id, partId: fastSong.parts[1].id },
          ],
        },
        userA.token,
      )
    ).lineup;

    // Public share endpoint renders complete multi-line lyrics
    const shared1 = (await apiCall(`/shared/${lineup.shareToken}`)).lineup;
    check(
      'public shared view returns all 3 parts in order',
      shared1.items.length === 3,
      `got ${shared1.items.length}`,
    );
    check(
      'public shared view preserves exact multi-line lyrics',
      shared1.items[0].lyrics === 'Beside the quiet stream\nYou restore my soul' &&
        shared1.items[2].lyrics === 'Sing aloud across the earth\nJoy has come today',
    );

    // Re-paste / edit song WITHOUT passing old part IDs (simulating full re-split!)
    await apiCall(
      `/songs/${slowSong.id}`,
      'PATCH',
      {
        parts: [
          { kind: 'verse', label: 'Verse 1', lyrics: 'Beside the crystal stream\nYou restore my soul' },
          { kind: 'chorus', label: 'Chorus', lyrics: 'Peace like a river flows\nDeep within my soul' },
        ],
      },
      userA.token,
    );

    const sharedAfterEdit = (await apiCall(`/shared/${lineup.shareToken}`)).lineup;
    check(
      'shared view still renders all 3 parts after song lyrics are re-split/updated',
      sharedAfterEdit.items.length === 3,
      `got ${sharedAfterEdit.items.length}`,
    );
    check(
      'shared view reflects updated lyrics after song edit',
      sharedAfterEdit.items[0].lyrics.includes('Beside the crystal stream') &&
        sharedAfterEdit.items[1].lyrics.includes('Deep within my soul'),
    );

    // Automatic team sharing: as soon as User B joins User A's team (without manual share calls!),
    // every song and lineup owned by User A & User B is shared across all team members.
    const extraSongA = (
      await apiCall(
        '/songs',
        'POST',
        {
          title: 'Private Before Team',
          artist: 'User A',
          tempo: 'slow',
          parts: [{ kind: 'chorus', label: 'Chorus', lyrics: 'Shared automatically with team' }],
        },
        userA.token,
      )
    ).song;

    const songFromB = (
      await apiCall(
        '/songs',
        'POST',
        {
          title: 'Member B Worship Song',
          artist: 'User B',
          tempo: 'fast',
          parts: [{ kind: 'chorus', label: 'Chorus', lyrics: 'Lift up the name of Jesus' }],
        },
        userB.token,
      )
    ).song;

    const team = (await apiCall('/teams', 'POST', { name: 'Worship Band' }, userA.token)).team;
    await apiCall('/teams/join', 'POST', { code: team.code }, userB.token);

    const stateB = await apiCall('/state', 'GET', null, userB.token);
    const sharedLineupForB = stateB.lineups.find((l) => l.id === lineup.id);
    const songsForB = new Set(stateB.songs.map((s) => s.id));
    check(
      'joining a team automatically shares all member songs and lineups without manual per-item sharing',
      Boolean(sharedLineupForB) &&
        songsForB.has(slowSong.id) &&
        songsForB.has(fastSong.id) &&
        songsForB.has(extraSongA.id),
    );

    const stateA = await apiCall('/state', 'GET', null, userA.token);
    check(
      'existing team members also immediately see newly joined member songs',
      stateA.songs.some((s) => s.id === songFromB.id),
    );

    // Teammate copies a song and a lineup onto their own account
    const copiedSongRes = await apiCall(`/songs/${extraSongA.id}/copy`, 'POST', {}, userB.token);
    const copiedLineupRes = await apiCall(`/lineups/${lineup.id}/copy`, 'POST', {}, userB.token);
    check(
      'teammate can copy a shared song and lineup onto their own account',
      copiedSongRes.song?.ownerId === stateB.user.id &&
        copiedLineupRes.lineup?.ownerId === stateB.user.id &&
        copiedLineupRes.lineup?.items?.length === 3,
    );

    // Even if User B leaves the team, copied items stay permanently on User B's account
    await apiCall(`/teams/${team.id}/leave`, 'POST', {}, userB.token);
    const stateBAfterLeave = await apiCall('/state', 'GET', null, userB.token);
    check(
      'copied songs and lineups remain on the member account even after leaving the team',
      stateBAfterLeave.songs.some((s) => s.id === copiedSongRes.song.id) &&
        stateBAfterLeave.lineups.some((l) => l.id === copiedLineupRes.lineup.id) &&
        !stateBAfterLeave.songs.some((s) => s.id === extraSongA.id),
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
