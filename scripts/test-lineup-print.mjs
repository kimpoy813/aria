#!/usr/bin/env node
/**
 * Home scoping, full-lyric previews, and the print sheet.
 *
 *   npm run test:lineup
 *
 * Part 1 — Home scoping: `buildHomeFeed` shows your own lineups and songs and
 *          nothing else, without blanking a lineup that borrows a team song.
 * Part 2 — the real `src/lib/lru.ts`, transpiled: a preview carries every part
 *          of every song, not just the parts the builder picked.
 * Part 3 — the real server over HTTP: the shared payload ships whole songs.
 * Part 4 — the built CSS, resolved through the cascade for the print medium:
 *          the chrome is gone and the tokens are forced light.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { createCascade } from './lib/css-cascade.mjs';

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

const { lineupFullLyricBlocks, fullLyricBlocks, groupLineupSongBlocks, summarizeLineupSongs } =
  await loadTs('src/lib/lru.ts');
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

console.log('\n2. A preview carries the whole song');
{
  const song = mkSong('s1', 'River', [
    mkPart('p1', 'Verse 1', 'one'),
    mkPart('p2', 'Chorus', 'two'),
    mkPart('p3', 'Verse 2', 'three'),
    mkPart('p4', 'Bridge', 'four'),
    mkPart('p5', 'Outro', 'five'),
  ]);
  // The builder only picked the verse and the chorus.
  const lineup = mkLineup([
    { id: 'i1', songId: 's1', partId: 'p1', partLabel: 'Verse 1', lyrics: 'one' },
    { id: 'i2', songId: 's1', partId: 'p2', partLabel: 'Chorus', lyrics: 'two' },
  ]);

  const picked = groupLineupSongBlocks(
    [
      { songKey: 's1', songTitle: 'River', partLabel: 'Verse 1', lyrics: 'one' },
      { songKey: 's1', songTitle: 'River', partLabel: 'Chorus', lyrics: 'two' },
    ],
  );
  check(
    'the picks-only grouping still returns only the picks',
    picked.length === 1 && picked[0].sections.length === 2,
    `${picked.length} blocks / ${picked[0]?.sections.length} sections`,
  );

  const blocks = lineupFullLyricBlocks(lineup, [song]);
  check('one block per song', blocks.length === 1, `${blocks.length}`);
  check(
    'every part of the song is present',
    blocks[0].sections.length === 5,
    blocks[0].sections.map((s) => s.partLabel).join(', '),
  );
  check(
    'parts keep the song’s own order',
    blocks[0].sections.map((s) => s.partLabel).join('|') ===
      'Verse 1|Chorus|Verse 2|Bridge|Outro',
    blocks[0].sections.map((s) => s.partLabel).join('|'),
  );
  check(
    'lyrics that were never in the lineup are included',
    blocks[0].sections.map((s) => s.lyrics).join(',') === 'one,two,three,four,five',
  );
}

{
  const a = mkSong('s1', 'River', [mkPart('p1', 'Verse 1', 'one')]);
  const b = mkSong('s2', 'Mountain', [mkPart('p2', 'Verse 1', 'high')]);
  const lineup = mkLineup([
    { id: 'i1', songId: 's2', partId: 'p2', partLabel: 'Verse 1', lyrics: 'high' },
    { id: 'i2', songId: 's1', partId: 'p1', partLabel: 'Verse 1', lyrics: 'one' },
    // The same song again later in the running order.
    { id: 'i3', songId: 's2', partId: 'p2', partLabel: 'Verse 1', lyrics: 'high' },
  ]);
  const blocks = lineupFullLyricBlocks(lineup, [a, b]);
  check(
    'songs follow the running order, not the library order',
    blocks.map((b2) => b2.songTitle).join('|') === 'Mountain|River',
    blocks.map((b2) => b2.songTitle).join('|'),
  );
  check(
    'a song repeated in the lineup is not printed twice',
    blocks.length === 2,
    `${blocks.length}`,
  );
}

{
  // The song has been deleted; only the snapshot on the item survives.
  const lineup = mkLineup([
    { id: 'i1', songId: 'gone', partId: 'x', partLabel: 'Verse 1', songTitle: 'Ghost', lyrics: 'still here' },
    { id: 'i2', songId: 'gone', partId: 'y', partLabel: 'Chorus', songTitle: 'Ghost', lyrics: 'still singing' },
  ]);
  const blocks = lineupFullLyricBlocks(lineup, []);
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
  const song = mkSong('s1', 'River', [
    mkPart('p1', 'Verse 1', 'one'),
    mkPart('p2', 'Silent', '   '),
    mkPart('p3', 'Chorus', 'two'),
  ]);
  const lineup = mkLineup([
    { id: 'i1', songId: 's1', partId: 'p1', partLabel: 'Verse 1', lyrics: 'one' },
  ]);
  const blocks = lineupFullLyricBlocks(lineup, [song]);
  check(
    'a part with no lyrics is not printed as an empty block',
    blocks[0].sections.length === 2,
    blocks[0].sections.map((s) => s.partLabel).join(', '),
  );
}

{
  check(
    'a song with no usable lyrics produces no block',
    fullLyricBlocks([{ id: 's', title: 'Empty', parts: [] }]).length === 0,
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

console.log('\n3. The shared preview payload ships whole songs');
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
  check('one whole song is attached', payload?.songs?.length === 1, `${payload?.songs?.length}`);
  check(
    'that song carries all four parts',
    payload?.songs?.[0]?.parts?.length === 4,
    payload?.songs?.[0]?.parts?.map((p) => p.label).join(', '),
  );
  check(
    'parts outside the lineup are included',
    (payload?.songs?.[0]?.parts ?? []).some((p) => p.lyrics === 'second line') &&
      (payload?.songs?.[0]?.parts ?? []).some((p) => p.lyrics === 'turn line'),
  );
  check('songCount is unchanged', payload?.songCount === 1, `${payload?.songCount}`);

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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
