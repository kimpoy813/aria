#!/usr/bin/env node
/**
 * Home scoping, full-lyric previews, and the print sheet.
 *
 *   npm run test:lineup
 *
 * Part 1 — Home scoping: `buildHomeFeed` shows your own lineups and songs and
 *          nothing else, without blanking a lineup that borrows a team song.
 * Part 2 — the real `src/lib/lru.ts`, transpiled: a preview carries exactly the
 *          slots that were placed, in the order they were placed.
 * Part 3 — the real server over HTTP: the shared payload is that same sequence.
 * Part 4 — the built CSS, resolved through the cascade for the print medium:
 *          the chrome is gone and the tokens are forced light.
 * Part 5 — the real `LineupViewPage`, server-rendered: the page a leader opens
 *          carries the set they placed, and the key controls are on it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { createCascade } from './lib/css-cascade.mjs';
import {
  pageRenderer,
  songBlocksOf,
  partLabelsOf,
  keyBadgesOf,
  keyPickersOf,
  panelRowOf,
  firstOptionOf,
} from './lib/render-page.mjs';

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

/* --------------------------------------- parts 1–2: home scoping and lyrics */

/**
 * Bundles a .ts module so the test runs the shipped code, not a copy.
 *
 * Bundled rather than transpiled file-by-file because these modules import each
 * other — a lone transpiled file in a temp dir cannot resolve `./lru`.
 */
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
  lineupSequenceBlocks,
  sharedSequenceBlocks,
  songKeyState,
  withSlotKeys,
  summarizeLineupSongs,
} = await loadTs('src/lib/lru.ts');
const { buildHomeFeed } = await loadTs('src/lib/home.ts');

const mkPart = (id, label, lyrics) => ({ id, kind: 'verse', label, lyrics });
const mkSong = (id, title, parts, ownerId = 'u1') => ({
  id,
  title,
  artist: 'The Band',
  tempo: 'slow',
  theme: 'hope',
  parts,
  analysis: null,
  ownerId,
  ownerName: ownerId === 'u1' ? 'Kim' : 'Sam',
  teamId: null,
  sourceSongId: null,
  createdAt: 1,
  updatedAt: 1,
});
const mkLineup = (items, ownerId = 'u1') => ({
  id: 'l1',
  name: 'Sunday',
  theme: 'hope',
  ownerId,
  ownerName: 'Kim',
  teamId: null,
  items,
  shareToken: 'tok',
  sourceLineupId: null,
  createdAt: 1,
  updatedAt: 1,
  lastUsedAt: null,
  useCount: 0,
  lastUsedReason: null,
});

console.log('\nAria · home scoping, lineup preview & print\n\n1. Home shows only your own work');
{
  const mine = mkSong('s1', 'River', [mkPart('p1', 'Verse 1', 'one')], 'u1');
  const theirs = mkSong('s2', 'Mountain', [mkPart('p2', 'Verse 1', 'high')], 'u2');
  const myLineup = mkLineup(
    [
      { id: 'i1', songId: 's1', partId: 'p1', partLabel: 'Verse 1', lyrics: 'one' },
      // A teammate's song, legitimately inside a lineup of mine.
      { id: 'i2', songId: 's2', partId: 'p2', partLabel: 'Verse 1', lyrics: 'high' },
    ],
    'u1',
  );
  const theirLineup = mkLineup(
    [{ id: 'i3', songId: 's2', partId: 'p2', partLabel: 'Verse 1', lyrics: 'high' }],
    'u2',
  );
  theirLineup.id = 'l2';
  const songs = [mine, theirs];
  const lineups = [myLineup, theirLineup];

  const feed = buildHomeFeed(lineups, songs, 'u1');
  check(
    'a teammate’s lineup is not on Home',
    feed.lineups.length === 1 && feed.lineups[0].id === 'l1',
    feed.lineups.map((l) => l.id).join(', '),
  );
  check(
    'a teammate’s song is not on Home',
    feed.songs.length === 1 && feed.songs[0].id === 's1',
    feed.songs.map((x) => x.id).join(', '),
  );
  check(
    'a teammate’s song is not smuggled back in through a lineup of mine',
    feed.songStats.every((stat) => stat.song.ownerId === 'u1'),
    feed.songStats.map((stat) => stat.song.id).join(', '),
  );
  check(
    'but the lineup spotlight can still resolve that song',
    summarizeLineupSongs(myLineup, songs).map((u) => u.song.id).join('|') === 's1|s2',
    summarizeLineupSongs(myLineup, songs)
      .map((u) => u.song.id)
      .join('|'),
  );
  check('Home knows there is team work to point at', feed.hasTeamLineups === true);
  check(
    'a solo account does not claim to have a team',
    buildHomeFeed([myLineup], [mine], 'u1').hasTeamLineups === false,
  );
}

{
  const old = mkLineup([], 'u1');
  old.id = 'l1';
  old.lastUsedAt = 1000;
  const recent = mkLineup([], 'u1');
  recent.id = 'l2';
  recent.lastUsedAt = 9000;
  const never = mkLineup([], 'u1');
  never.id = 'l3';
  never.lastUsedAt = null;

  const songA = mkSong('sa', 'A', [mkPart('pa', 'V', 'a')], 'u1');
  const songB = mkSong('sb', 'B', [mkPart('pb', 'V', 'b')], 'u1');
  old.items = [{ id: 'i', songId: 'sa', partId: 'pa', partLabel: 'V', lyrics: 'a' }];
  recent.items = [{ id: 'i', songId: 'sb', partId: 'pb', partLabel: 'V', lyrics: 'b' }];

  const feed = buildHomeFeed([recent, old, never], [songA, songB], 'u1');
  check(
    'song stats stay in least-recently-used order',
    feed.songStats.map((stat) => stat.song.id).join('|') === 'sa|sb',
    feed.songStats.map((stat) => stat.song.id).join('|'),
  );
}

console.log('\n2. A preview carries exactly what was placed');
{
  const song = mkSong('s1', 'River', [
    mkPart('p1', 'Verse 1', 'one'),
    mkPart('p2', 'Chorus', 'two'),
    mkPart('p3', 'Verse 2', 'three'),
    mkPart('p4', 'Bridge', 'four'),
    mkPart('p5', 'Outro', 'five'),
  ]);
  // The builder picked the chorus and the bridge, and put the chorus first.
  const lineup = mkLineup([
    { id: 'i1', songId: 's1', partId: 'p2', partLabel: 'Chorus', lyrics: 'two' },
    { id: 'i2', songId: 's1', partId: 'p4', partLabel: 'Bridge', lyrics: 'four' },
  ]);

  const blocks = lineupSequenceBlocks(lineup, [song]);
  check('one block for the one song placed', blocks.length === 1, `${blocks.length}`);
  check(
    'only the placed parts are on the page',
    blocks[0].sections.length === 2,
    blocks[0].sections.map((s) => s.partLabel).join(', '),
  );
  check(
    'in the order they were placed, not the song’s own order',
    blocks[0].sections.map((s) => s.partLabel).join('|') === 'Chorus|Bridge',
    blocks[0].sections.map((s) => s.partLabel).join('|'),
  );
  check(
    'parts that were never placed stay off the page',
    blocks[0].sections.map((s) => s.lyrics).join(',') === 'two,four',
    blocks[0].sections.map((s) => s.lyrics).join(','),
  );
}

{
  // The chorus is placed three times and the song comes back after another one.
  const river = mkSong('s1', 'River', [
    mkPart('p1', 'Verse 1', 'one'),
    mkPart('p2', 'Chorus', 'two'),
  ]);
  const mountain = mkSong('s2', 'Mountain', [mkPart('p3', 'Verse 1', 'high')]);
  const lineup = mkLineup([
    { id: 'i1', songId: 's1', partId: 'p2', partLabel: 'Chorus', lyrics: 'two' },
    { id: 'i2', songId: 's2', partId: 'p3', partLabel: 'Verse 1', lyrics: 'high' },
    { id: 'i3', songId: 's1', partId: 'p2', partLabel: 'Chorus', lyrics: 'two' },
    { id: 'i4', songId: 's1', partId: 'p2', partLabel: 'Chorus', lyrics: 'two' },
  ]);

  const blocks = lineupSequenceBlocks(lineup, [river, mountain]);
  const order = blocks
    .map((b) => `${b.songTitle}:${b.sections.map((x) => x.partLabel).join('+')}`)
    .join(' | ');
  check(
    'a song coming back later in the set is its own block, where it was put',
    order === 'River:Chorus | Mountain:Verse 1 | River:Chorus+Chorus',
    order,
  );
  check(
    'a part placed three times is written out three times, with its words',
    blocks.reduce((n, b) => n + b.sections.length, 0) === 4 &&
      blocks.every((b) => b.sections.every((x) => x.lyrics.length > 0)),
    `${blocks.reduce((n, b) => n + b.sections.length, 0)} sections`,
  );
  check(
    'consecutive slots of one song share a heading rather than repeating it',
    blocks.length === 3,
    `${blocks.length}`,
  );
}

{
  // The song has been deleted; only the snapshot on the item survives.
  const lineup = mkLineup([
    { id: 'i1', songId: 'gone', partId: 'x', partLabel: 'Verse 1', songTitle: 'Ghost', lyrics: 'still here' },
    { id: 'i2', songId: 'gone', partId: 'y', partLabel: 'Chorus', songTitle: 'Ghost', lyrics: 'still singing' },
  ]);
  const blocks = lineupSequenceBlocks(lineup, []);
  check(
    'a deleted song still prints from the lineup snapshot',
    blocks.length === 1 && blocks[0].sections.length === 2,
    `${blocks.length} blocks / ${blocks[0]?.sections.length} sections`,
  );
  check(
    'the snapshot lyrics are the ones printed',
    blocks[0]?.sections.map((s) => s.lyrics).join('|') === 'still here|still singing',
  );
}

{
  // A slot whose part has since been emptied still holds the lyric snapshot the
  // builder took, so the sequence cannot silently lose a place in the order.
  const song = mkSong('s1', 'River', [mkPart('p1', 'Verse 1', '   ')]);
  const lineup = mkLineup([
    { id: 'i1', songId: 's1', partId: 'p1', partLabel: 'Verse 1', lyrics: 'kept' },
  ]);
  const blocks = lineupSequenceBlocks(lineup, [song]);
  check(
    'an emptied part falls back to the snapshot rather than vanishing',
    blocks.length === 1 && blocks[0].sections.length === 1,
    `${blocks.length} blocks`,
  );
}

console.log('\n2b. The shared page reads the same sequence');
{
  const items = [
    { songTitle: 'River', partLabel: 'Chorus', lyrics: 'two', songKey: 'G' },
    { songTitle: 'River', partLabel: 'Chorus', lyrics: 'two', songKey: 'G', playKey: 'D' },
    { songTitle: 'Mountain', partLabel: 'Verse 1', lyrics: 'high', songKey: 'D' },
  ];
  const blocks = sharedSequenceBlocks(items);
  check(
    'the stranger sees the same three moments, in the same order',
    blocks
      .map((b) => `${b.songTitle}[${b.playKey || b.writtenKey}]`)
      .join(' | ') === 'River[G] | River[D] | Mountain[D]',
    blocks.map((b) => `${b.songTitle}[${b.playKey || b.writtenKey}]`).join(' | '),
  );
  check(
    'and the reprise arrives already moved into its key',
    blocks[1].sections[0].lyrics === blocks[1].sections[0].lyrics &&
      blocks[1].interval === 7,
    `${blocks[1].interval}`,
  );
}

console.log('\n2c. The key controls in the preview');
{
  const items = [
    { id: 'i1', songId: 'a', partId: 'p1', key: '' },
    { id: 'i2', songId: 'a', partId: 'p2', key: '' },
    { id: 'i3', songId: 'b', partId: 'p3', key: 'D' },
  ];
  check(
    'a song left alone offers the written key',
    songKeyState(items, 'a').key === '' && songKeyState(items, 'a').mixed === false,
    JSON.stringify(songKeyState(items, 'a')),
  );
  check(
    'a song nobody placed offers nothing to select',
    songKeyState(items, 'nope').key === '' && songKeyState(items, 'nope').mixed === false,
  );
  check(
    'a song whose parts disagree says so rather than guessing one of them',
    songKeyState([...items, { id: 'i4', songId: 'a', partId: 'p4', key: 'E' }], 'a').mixed === true,
    JSON.stringify(songKeyState([...items, { id: 'i4', songId: 'a', partId: 'p4', key: 'E' }], 'a')),
  );
  check(
    'and a song already all in one key offers that key',
    songKeyState([{ id: 'x', songId: 'b', partId: 'p3', key: 'D' }, { id: 'y', songId: 'b', partId: 'p9', key: 'D' }], 'b').key === 'D',
  );

  // The whole-song control: every part of one song, and nothing else.
  const moved = withSlotKeys(items, (it) => it.songId === 'a', 'G');
  check(
    'moving a whole song writes every part of it',
    moved.map((m) => `${m.songId}=${m.key}`).join(',') === 'a=G,a=G,b=D',
    moved.map((m) => `${m.songId}=${m.key}`).join(','),
  );
  check(
    'another song in the same set keeps the key it had',
    moved.find((m) => m.songId === 'b').key === 'D',
  );
  check(
    'the running order is sent back unchanged',
    moved.map((m) => m.partId).join(',') === 'p1,p2,p3',
    moved.map((m) => m.partId).join(','),
  );

  // The per-part control: one slot, on top of whatever the song is in.
  const one = withSlotKeys(
    items.map((it) => ({ ...it, key: it.songId === 'a' ? 'G' : it.key })),
    (it) => it.id === 'i2',
    '',
  );
  check(
    'a single part can be put back without disturbing the rest of its song',
    one.map((m) => `${m.songId}=${m.key || 'written'}`).join(',') === 'a=G,a=written,b=D',
    one.map((m) => `${m.songId}=${m.key || 'written'}`).join(','),
  );
  check(
    'and the payload carries no slot ids, because the server mints new ones',
    one.every((m) => Object.keys(m).join(',') === 'songId,partId,key'),
    Object.keys(one[0]).join(','),
  );
}

/* --------------------------------------------- part 3: the shared payload */

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

console.log('\n3. The shared payload is the placed sequence');
{
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-print-'));
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

  const reg = await call('POST', '/api/auth/register', null, {
    name: 'Kim',
    email: 'kim@example.com',
    password: 'hunter2hunter',
  });
  const token = reg.data?.token;
  check('account created', reg.status === 200 && Boolean(token));

  const songRes = await call('POST', '/api/songs', token, {
    title: 'River',
    artist: 'The Band',
    tempo: 'slow',
    parts: [
      { label: 'Verse 1', kind: 'verse', lyrics: 'first line' },
      { label: 'Chorus', kind: 'chorus', lyrics: 'lift line' },
      { label: 'Verse 2', kind: 'verse', lyrics: 'second line' },
      { label: 'Bridge', kind: 'bridge', lyrics: 'turn line' },
    ],
  });
  const songId = songRes.data?.song?.id;
  const partIds = songRes.data?.song?.parts?.map((p) => p.id) ?? [];
  check('song created with four parts', partIds.length === 4, `${partIds.length}`);

  const lineupRes = await call('POST', '/api/lineups', token, {
    name: 'Sunday',
    theme: 'hope',
    items: [
      { songId, partId: partIds[0] },
      { songId, partId: partIds[1] },
    ],
  });
  const shareToken = lineupRes.data?.lineup?.shareToken;
  check(
    'lineup created from two of the four parts',
    lineupRes.status === 200 && lineupRes.data?.lineup?.items?.length === 2,
    `${lineupRes.status}`,
  );

  const shared = await call('GET', `/api/shared/${shareToken}`);
  const payload = shared.data?.lineup;

  check('shared link resolves', shared.status === 200 && Boolean(payload));
  check(
    'the running order is still just the picks',
    payload?.items?.length === 2,
    `${payload?.items?.length}`,
  );
  check(
    'the picks are in the order they were placed',
    payload?.items?.map((i) => i.partLabel).join('|') === 'Verse 1|Chorus',
    payload?.items?.map((i) => i.partLabel).join('|'),
  );
  check(
    'no whole song is attached beside them',
    payload?.songs === undefined,
    `${JSON.stringify(payload?.songs)?.slice(0, 60)}`,
  );
  check(
    'parts outside the lineup are nowhere in the payload',
    JSON.stringify(payload).indexOf('second line') === -1 &&
      JSON.stringify(payload).indexOf('turn line') === -1,
  );
  check('songCount is unchanged', payload?.songCount === 1, `${payload?.songCount}`);

  // The shared page builds its blocks from these items alone, so they have to
  // carry both ends of any key move the builder made.
  check(
    'each slot still names the key it was written in',
    (payload?.items ?? []).every((i) => i.songKey === ''),
    (payload?.items ?? []).map((i) => i.songKey).join(','),
  );

  fs.rmSync(dataDir, { recursive: true, force: true });
}

/* -------------------------------------------------- part 4: the print sheet */

/**
 * Resolves the cascade for the print medium.
 *
 * css-cascade.mjs deliberately refuses non-width media queries, so print rules
 * never win there. This mirrors its ranking — !important, then specificity,
 * then source order — but admits rules that apply to print. That matters: the
 * dark theme redefines every token from `:root[data-theme='dark']`, so a print
 * override written against plain `:root` would lose and the sheet would print
 * white-on-black. This fails the check if that happens.
 */
function createPrintCascade(css) {
  const cascade = createCascade(css);
  const rules = cascade.rules;

  const appliesToPrint = (media) => !media || /(?:^|[\s,(])print(?:$|[\s,)])/.test(media);

  const rankOf = (rule, decl) => [decl.important ? 1 : 0, ...rule.spec, rule.order];
  const compare = (x, y) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };

  function declaredAt(selector, prop) {
    let best = null;
    for (const rule of rules) {
      if (rule.sel !== selector) continue;
      if (!appliesToPrint(rule.media)) continue;
      for (const decl of rule.decls) {
        if (decl.prop !== prop) continue;
        const rank = rankOf(rule, decl);
        if (!best || compare(rank, best.rank) > 0) best = { value: decl.value, rank };
      }
    }
    return best ? best.value : null;
  }

  return {
    valueAt(selector, prop) {
      const value = declaredAt(selector, prop);
      if (value === null) return null;
      return value.replace(
        /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
        (m, name, fallback) => declaredAt(':root', name) ?? (fallback ? fallback.trim() : m),
      );
    },
  };
}

console.log('\n4. The print sheet (resolved from the built CSS)');
{
  const assets = path.join(root, 'dist', 'assets');
  const cssFile = fs.existsSync(assets)
    ? fs
        .readdirSync(assets)
        .filter((f) => f.endsWith('.css'))
        .map((f) => path.join(assets, f))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]
    : null;

  if (!cssFile) {
    console.log('  · no built CSS — run `npm run build` first');
  } else {
    const css = fs.readFileSync(cssFile, 'utf8');
    const print = createPrintCascade(css);
    const screen = createCascade(css);

    for (const sel of [
      '.topbar',
      '.tabbar',
      '.backbar',
      '.sticky-bar',
      '.sheet-backdrop',
      '.toast-stack',
      '.btn',
      '.icon-btn',
      '.link-button',
    ]) {
      check(
        `${sel} is hidden on paper`,
        print.valueAt(sel, 'display') === 'none',
        `display=${print.valueAt(sel, 'display')}`,
      );
    }

    /*
     * The builder's own layout, resolved at phone width: rows short enough to
     * scan, a key that reads as a label, and a bar that reports the set above
     * the buttons instead of hiding it behind a scroll.
     */
    const PHONE = 375;
    const at = (sel, prop) => screen.valueAt(sel, prop, PHONE);
    check(
      'the sequence groups a song’s parts under one heading',
      at('.seq-run-head', 'font-weight') === '600',
      `font-weight=${at('.seq-run-head', 'font-weight')}`,
    );
    check(
      'the key chip takes the space of a label, not a dropdown',
      at('.key-chip', 'flex') === '0 0 auto' && at('.key-chip', 'min-width') === '46px',
      `flex=${at('.key-chip', 'flex')} min-width=${at('.key-chip', 'min-width')}`,
    );
    check(
      'a key the builder moved is picked out in the brand colour',
      /var\(--brand-text\)/.test(screen.declaredAt('.key-chip.moved', 'color', PHONE) || ''),
    );
    check(
      'the key sheet offers thumb-sized targets in a wrapping grid',
      at('.key-option', 'min-height') === '38px' &&
        at('.key-grid', 'grid-template-columns') === 'repeat(auto-fill,minmax(56px,1fr))',
      `min-height=${at('.key-option', 'min-height')}`,
    );
    check(
      'the builder’s bar stacks its summary above the buttons',
      at('.sticky-bar.sticky-bar-stack', 'flex-direction') === 'column' &&
        at('.sticky-bar.sticky-bar-stack', 'align-items') === 'stretch' &&
        at('.sticky-bar-actions', 'display') === 'flex',
      `flex-direction=${at('.sticky-bar.sticky-bar-stack', 'flex-direction')}`,
    );
    check(
      'the guardrail sentence is quiet until the set is ready',
      /var\(--muted\)/.test(screen.declaredAt('.guardrail', 'color', PHONE) || '') &&
        /var\(--brand-text\)/.test(screen.declaredAt('.guardrail.ok', 'color', PHONE) || ''),
    );

    check(
      'the print footer is hidden on screen',
      screen.valueAt('.print-only', 'display', 375) === 'none',
      `display=${screen.valueAt('.print-only', 'display', 375)}`,
    );
    check(
      'the print footer shows on paper',
      print.valueAt('.print-only', 'display') === 'flex',
      `display=${print.valueAt('.print-only', 'display')}`,
    );

    /*
     * Both theme blocks redefine every token, and the dark one is the dangerous
     * case: without a print-scoped override at the same specificity, a dark
     * session prints white text on a black page. The minifier may or may not
     * keep the quotes on the attribute value, so accept either spelling.
     */
    const themed = (quote) => ({
      dark: `:root[data-theme=${quote}dark${quote}]`,
      light: `:root[data-theme=${quote}light${quote}]`,
    });
    const valueFor = (forms, prop) => {
      for (const sel of forms) {
        const v = print.valueAt(sel, prop);
        if (v !== null) return v;
      }
      return null;
    };

    const isInk = (v) => v === '#000000' || v === '#000' || v === '#111318';
    const isPaper = (v) => v === '#ffffff' || v === '#fff';

    for (const [token, ok] of [
      ['--ink', isInk],
      ['--bg', isPaper],
      ['--brand-text', isInk],
    ]) {
      const got = valueFor(
        [themed("'").dark, themed('').dark],
        token,
      );
      check(
        `a dark session prints ${token} as ink-friendly`,
        ok(got),
        `${got}`,
      );
    }

    check(
      'a light session also prints on paper, not on a tinted sheet',
      isPaper(valueFor([themed("'").light, themed('').light], '--bg')),
      `${valueFor([themed("'").light, themed('').light], '--bg')}`,
    );

    check(
      'the app column is not width-capped on paper',
      print.valueAt('.app', 'max-width') === 'none',
      `${print.valueAt('.app', 'max-width')}`,
    );
    check(
      'the tab bar gutter is gone from the page',
      print.valueAt('.app-main', 'padding') === '0',
      `${print.valueAt('.app-main', 'padding')}`,
    );
    check(
      'a song block is not clipped where it breaks across pages',
      print.valueAt('.song-group-block', 'overflow') === 'visible',
      `${print.valueAt('.song-group-block', 'overflow')}`,
    );
    check(
      'a stanza stays on one page',
      print.valueAt('.lyric-stanza', 'break-inside') === 'avoid',
      `${print.valueAt('.lyric-stanza', 'break-inside')}`,
    );
    check(
      'lyrics are set at a readable print size',
      print.valueAt('.lyric-line', 'font-size') === '11.5pt',
      `${print.valueAt('.lyric-line', 'font-size')}`,
    );
  }
}

/* ------------------------------------------------- part 5: the rendered page */

console.log('\n5. The preview page, actually rendered');
{
  /*
   * There is no browser in here, so the page is rendered the way a server would:
   * `react-dom/server`, with the router, the store and the API stubbed out and
   * everything else — the real `lru.ts`, the real `chords.ts`, the real
   * components — left alone. This is the only check that sees the JSX.
   */
  const render = await pageRenderer('./src/pages/LineupViewPage', 'LineupViewPage');

  const part = (id, label, lyrics) => ({ id, kind: 'verse', label, lyrics });
  const grace = {
    id: 'a', title: 'Amazing Grace', artist: 'x', tempo: 'slow', theme: '', key: 'G',
    parts: [part('a1', 'Verse 1', '[G]v1'), part('a2', 'Chorus', '[C]ch'),
            part('a3', 'Verse 2', 'v2'), part('a4', 'Bridge', 'br')],
    analysis: null, ownerId: 'u1', ownerName: 'Kim', teamId: null, sourceSongId: null,
    createdAt: 1, updatedAt: 1,
  };
  const blessed = {
    ...grace, id: 'b', title: 'Blessed Be', key: 'D',
    parts: [part('b1', 'Verse 1', '[D]b-v1'), part('b2', 'Chorus', 'b-ch')],
  };
  const slot = (id, songId, partId, partLabel, lyrics, key) => ({
    id, songId, partId, partLabel, lyrics, key,
    songTitle: songId === 'a' ? 'Amazing Grace' : 'Blessed Be',
  });

  const storeFor = (items, songs) => ({
    lineups: [{
      id: 'L1', name: 'Sunday', theme: '', ownerId: 'u1', ownerName: 'Kim', teamId: null,
      items, shareToken: 'tok', sourceLineupId: null, createdAt: 1, updatedAt: 1,
      lastUsedAt: null, useCount: 0, lastUsedReason: null,
    }],
    songs,
    user: { id: 'u1', name: 'Kim' },
  });

  const placed = [
    slot('i1', 'a', 'a2', 'Chorus', '[C]ch', ''),
    slot('i2', 'b', 'b1', 'Verse 1', '[D]b-v1', ''),
    slot('i3', 'a', 'a2', 'Chorus', '[C]ch', 'D'),
    slot('i4', 'a', 'a4', 'Bridge', 'br', ''),
  ];

  const html = render({ store: storeFor(placed, [grace, blessed]), route: { id: 'L1' } });
  const titles = songBlocksOf(html);
  const labels = partLabelsOf(html);

  check(
    'the page opens on the song that was placed first',
    titles.join('|') === 'Amazing Grace|Blessed Be|Amazing Grace|Amazing Grace',
    titles.join('|'),
  );
  check(
    'and carries every placed part, in the order it was placed',
    labels.join('|') === 'Chorus|Verse 1|Chorus|Bridge',
    labels.join('|'),
  );
  check(
    'a chorus placed twice is printed twice',
    labels.filter((l) => l === 'Chorus').length === 2,
    `${labels.filter((l) => l === 'Chorus').length}`,
  );
  check(
    'no part the builder never picked sneaks onto the page',
    !html.includes('Verse 2') && !html.includes('v2'),
  );
  check(
    'each block names the key it is actually played in',
    keyBadgesOf(html).join('|') === 'G|D|D|G',
    keyBadgesOf(html).join('|'),
  );

  const chordsIn = (block) =>
    [...block.matchAll(/chord-note[^>]*>([^<]*)</g)].map((m) => m[1]).join(' ');
  const blocks = html.split('song-group-block').slice(1);
  check(
    'the reprise is moved into the key its slot asked for',
    chordsIn(blocks[0]) === 'C' && chordsIn(blocks[2]) === 'G',
    `${chordsIn(blocks[0])} / ${chordsIn(blocks[2])}`,
  );
  check(
    'and the song written in D is left exactly as it was written',
    chordsIn(blocks[1]) === 'D',
    chordsIn(blocks[1]),
  );

  // The panel is open when the page loads, so the pickers are already there.
  const open = render({ store: storeFor(placed, [grace, blessed]), route: { id: 'L1' } });
  check(
    'the key controls are on the page without a tap to reveal them',
    keyPickersOf(open).length > 0,
  );
  // Hook 5 of the page is `orderOpen`; putting it away must still hide the rows.
  const shut = render({
    store: storeFor(placed, [grace, blessed]),
    route: { id: 'L1' },
    hooks: { 5: false },
  });
  check(
    'and putting the panel away takes the pickers with it',
    shut.includes('running-order-head') && keyPickersOf(shut).length === 0,
    `${keyPickersOf(shut).length}`,
  );

  check('the panel is on the page for the owner', open.includes('running-order-head'));
  check(
    'a whole-song picker is offered for every song in the set',
    keyPickersOf(open)
      .filter((a) => a.startsWith('Key for every part'))
      .map((a) => a.replace('Key for every part of ', ''))
      .join('|') === 'Amazing Grace|Blessed Be|Amazing Grace',
    keyPickersOf(open).join('|'),
  );
  check(
    'and one picker per placed part',
    keyPickersOf(open).length === 7,
    `${keyPickersOf(open).length}`,
  );
  check(
    'a song whose parts disagree says so instead of guessing one of them',
    firstOptionOf(panelRowOf(open, 'Key for every part of Amazing Grace')) === 'Mixed — set all',
    firstOptionOf(panelRowOf(open, 'Key for every part of Amazing Grace')),
  );
  check(
    'a song left as written offers the key it was written in',
    firstOptionOf(panelRowOf(open, 'Key for every part of Blessed Be')) === 'D (written)',
    firstOptionOf(panelRowOf(open, 'Key for every part of Blessed Be')),
  );
  check(
    'a part with no chords written still gets a picker',
    panelRowOf(open, 'Key for Amazing Grace Bridge').includes('<select'),
  );

  /*
   * Most of a real library has no chords written down at all — 33 of the 38 songs
   * in the live one. The key of a song is not a property of its chord notation,
   * it is the key the band plays it in, so the controls have to be there for
   * those songs too and the key still has to reach the page.
   */
  const wordOnly = {
    id: 'w', title: 'How Great', artist: 'x', tempo: 'slow', theme: '', key: 'G',
    parts: [part('w1', 'Verse 1', 'How great Thou art'), part('w2', 'Chorus', 'Then sings my soul')],
    analysis: null, ownerId: 'u1', ownerName: 'Kim', teamId: null, sourceSongId: null,
    createdAt: 1, updatedAt: 1,
  };
  const bare = (id, partId, label, lyrics, key) => ({
    id, songId: 'w', partId, partLabel: label, lyrics, key, songTitle: 'How Great',
  });
  const bareStore = (items) => storeFor(items, [wordOnly]);
  const bareHooks = { route: { id: 'L1' } };

  const noChords = render({
    store: bareStore([
      bare('j1', 'w1', 'Verse 1', 'How great Thou art', ''),
      bare('j2', 'w2', 'Chorus', 'Then sings my soul', ''),
    ]),
    ...bareHooks,
  });
  check(
    'a song with no chords written still gets the key panel',
    noChords.includes('running-order-head') &&
      keyPickersOf(noChords).join('|') ===
        'Key for every part of How Great|Key for How Great Verse 1|Key for How Great Chorus',
    keyPickersOf(noChords).join('|'),
  );
  check(
    'and its written key is still printed on the page',
    keyBadgesOf(noChords).join('|') === 'G',
    keyBadgesOf(noChords).join('|'),
  );

  const movedBare = render({
    store: bareStore([
      bare('j1', 'w1', 'Verse 1', 'How great Thou art', 'D'),
      bare('j2', 'w2', 'Chorus', 'Then sings my soul', ''),
    ]),
    ...bareHooks,
  });
  check(
    'a key set on a song with no chords is written down too',
    keyBadgesOf(movedBare).join('|') === 'D|G',
    keyBadgesOf(movedBare).join('|'),
  );
  check(
    'and the whole-song picker reports that its parts now disagree',
    firstOptionOf(panelRowOf(movedBare, 'Key for every part of How Great')) === 'Mixed — set all',
    firstOptionOf(panelRowOf(movedBare, 'Key for every part of How Great')),
  );
  check(
    'with nothing to transpose, the words are left exactly alone',
    movedBare.includes('How great Thou art') && movedBare.includes('Then sings my soul'),
  );
}

console.log('\n5b. The builder: grouped runs, the key as a chip, per-slot actions, an insert-at');
{
  const render = await pageRenderer('./src/pages/BuilderPage', 'BuilderPage');
  const part = (id, label, lyrics) => ({ id, kind: 'verse', label, lyrics });
  const base = {
    artist: 'x', tempo: 'slow', theme: '', analysis: null, ownerId: 'u1', ownerName: 'Kim',
    teamId: null, sourceSongId: null, createdAt: 1, updatedAt: 1,
  };
  // A keyed song placed twice, and a song with no key and no chords at all.
  const grace = {
    ...base, id: 'g', title: 'Grace', key: 'G',
    parts: [part('g1', 'Verse 1', 'Amazing grace'), part('g2', 'Chorus', 'How sweet the sound')],
  };
  const plain = {
    ...base, id: 'w', title: 'How Great', key: '',
    parts: [part('w1', 'Verse 1', 'How great Thou art')],
  };
  const slot = (id, songId, songTitle, partId, label, lyrics, key) => ({
    id, songId, songTitle, partId, partLabel: label, lyrics, key,
  });
  const store = {
    lineups: [{
      id: 'L1', name: 'Sunday', theme: '', ownerId: 'u1', ownerName: 'Kim', teamId: null,
      items: [
        slot('i1', 'g', 'Grace', 'g1', 'Verse 1', 'Amazing grace', 'D'),
        slot('i2', 'g', 'Grace', 'g2', 'Chorus', 'How sweet the sound', ''),
        slot('i3', 'w', 'How Great', 'w1', 'Verse 1', 'How great Thou art', ''),
      ],
      shareToken: 't', sourceLineupId: null, createdAt: 1, updatedAt: 1,
      lastUsedAt: null, useCount: 0, lastUsedReason: null,
    }],
    songs: [grace, plain],
    user: { id: 'u1', name: 'Kim' },
  };
  // useState order in BuilderPage: 14 keyIndex, 15 menuIndex, 16 confirmClear,
  // 17 insertAfter, 18 keyScope.
  const at = (hooks) => render({ route: { id: 'L1' }, store, hooks });
  const count = (s, re) => (s.match(re) || []).length;

  const html = at();
  const chips = count(html, /class="key-chip/g);
  check('every slot still has a key control', chips === 3, `${chips} chips for 3 slots`);
  check(
    'and it is a chip, not a select repeated on every row',
    !/slot-key-select/.test(html) && !/slot-key-label/.test(html),
  );
  check(
    'a key the builder moved says so, and where it went',
    /class="key-chip moved"[^>]*>→ D</.test(html) && /title="Moved to D from G"/.test(html),
  );
  check(
    'a key that was not moved shows just the written key',
    /class="key-chip"[^>]*title="As written in G"[^>]*>G</.test(html),
  );
  check(
    'a song with no key and no chords still gets a key control per part',
    /class="key-chip"[^>]*>Key</.test(html),
    'How Great has no written key, so its chip says "Key"',
  );
  check(
    'the parts of one song are grouped under a single heading',
    count(html, /class="seq-run-head"/g) === 2,
    'two songs, two headings',
  );
  check(
    'which counts the parts instead of repeating the title',
    /class="truncate seq-run-title">Grace<\/span><span class="tiny">2 parts<\/span>/.test(html) &&
      /class="truncate seq-run-title">How Great<\/span><span class="tiny">1 part<\/span>/.test(html),
  );
  check(
    'every slot is still rendered inside its run',
    count(html, /class="seq-item"/g) === 3,
  );
  check(
    'the guardrail is one sentence that names what is missing',
    /class="guardrail" role="status">A set needs a fast song — you have 3 parts from 2 songs, 0 fast and 3 slow\./.test(html) &&
      !/guardrail-pill/.test(html),
  );
  check(
    'the sticky bar carries a running summary of the sequence',
    /class="sticky-bar sticky-bar-stack">[\s\S]*?class="sticky-bar-summary"[\s\S]*?>3 parts · 2 songs<\/span>[\s\S]*?class="sticky-bar-todo">needs a fast song<\/span>[\s\S]*?class="sticky-bar-actions">/.test(html),
  );
  check(
    'Clear is there, but nothing is confirmed yet',
    /Clear<\/button>/.test(html) && !/sheet-backdrop/.test(html),
  );

  // Clear asks first.
  check(
    'Clear asks before it wipes the sequence',
    /aria-label="Clear the sequence\?"/.test(at({ 16: true })) &&
      /All 3 parts will be removed\. The songs themselves are untouched\./.test(at({ 16: true })),
  );

  // Per-slot actions in one sheet — no dragging required.
  const menu = at({ 15: 2 });
  check(
    'a slot’s actions live in one sheet, named after the slot',
    /role="dialog" aria-modal="true" aria-label="How Great"[\s\S]*?<p class="small">Verse 1<\/p>/.test(menu),
  );
  for (const action of ['Move up', 'Move down', 'Insert a part after this', 'Duplicate', 'Preview', 'Remove from the set']) {
    check(`the sheet offers “${action}”`, menu.includes(action));
  }
  check(
    'the last slot cannot move down — the action is disabled, not missing',
    count(menu, /<button type="button" class="btn btn-quiet btn-block" disabled/g) === 1,
  );
  check(
    'and the first slot cannot move up',
    count(at({ 15: 0 }), /<button type="button" class="btn btn-quiet btn-block" disabled/g) === 1,
  );
  check(
    'a middle slot can go either way',
    count(at({ 15: 1 }), /<button type="button" class="btn btn-quiet btn-block" disabled/g) === 0,
  );

  // An insert lands where the builder asked for it.
  check(
    'the builder is told where the next part will land',
    /class="insert-banner"[\s\S]*?Adding after Grace · Chorus/.test(at({ 17: 1 })),
  );

  // The key sheet reaches one part, or the whole song.
  const keySheet = at({ 14: 1 });
  check(
    'the key sheet names the song and the part it is changing',
    /role="dialog" aria-modal="true" aria-label="Grace"[\s\S]*?<p class="small">Chorus<\/p>/.test(keySheet),
  );
  check(
    'it says what the choice does to the rest of the song',
    /Only this part moves\. The rest of the song keeps its key\./.test(keySheet),
  );
  check(
    'it offers the same change for the whole song when it is played twice',
    /class="filter-pill active">This part<\/button>[\s\S]*?class="filter-pill ">Whole song<\/button>/.test(keySheet),
  );
  check(
    'the picker offers every key, major and minor, plus "as written"',
    count(keySheet, /class="key-option/g) === 1 + 11 + 10,
  );
  check(
    'the key currently in force is marked',
    /class="key-option active"[^>]*>As written \(G\)</.test(keySheet),
  );
  check(
    'a song played once is not offered a whole-song scope',
    !/Whole song/.test(at({ 14: 2, 18: 'song' })),
  );
  check(
    'and the whole-song hint replaces the per-part one',
    /Every part of Grace in this set will play in the key you pick\./.test(at({ 14: 1, 18: 'song' })),
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
