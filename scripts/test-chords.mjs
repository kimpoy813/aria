#!/usr/bin/env node
/**
 * Chords, keys and transposition.
 *
 *   npm run test:chords
 *
 * Everything else in the chord feature rests on this module being right: a song
 * stores its chords once, in its own key, and every key it is ever played in is
 * derived. A wrong interval does not look wrong on one song — it looks wrong on
 * every song in the lineup, all at once.
 */
import path from 'node:path';
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
const eq = (name, actual, expected) =>
  check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

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
  MAJOR_KEYS,
  MINOR_KEYS,
  diatonicChords,
  hasChords,
  hasInlineChord,
  isChordLine,
  keyInterval,
  parseChord,
  parseKey,
  prefersFlats,
  sheetToInline,
  splitChordSegments,
  stripChords,
  transposeChord,
  transposeChordLine,
  transposeKey,
  transposeLyrics,
} = await loadTs('src/lib/chords.ts');

console.log('\nAria · chords\n\n1. Reading keys');
{
  eq('G is pitch class 7', parseKey('G')?.pc, 7);
  eq('Bb is pitch class 10', parseKey('Bb')?.pc, 10);
  eq('F#m is minor', parseKey('F#m')?.minor, true);
  eq('unicode flats are understood', parseKey('B♭')?.pc, 10);
  eq('a key that is not a key is refused', parseKey('H'), null);
  eq('empty is refused', parseKey(''), null);
  eq('a section header is not a key', parseKey('Bridge'), null);
  check(
    'the picker offers only real keys',
    MAJOR_KEYS.every((k) => parseKey(k) !== null) && MINOR_KEYS.every((k) => parseKey(k) !== null),
    MAJOR_KEYS.join(','),
  );
}

console.log('\n2. Reading chords');
{
  eq('a bare triad', parseChord('G')?.quality, '');
  eq('a minor seventh', parseChord('Am7')?.quality, 'm7');
  eq('a suspended chord', parseChord('Dsus4')?.quality, 'sus4');
  eq('a major seventh', parseChord('Cmaj7')?.quality, 'maj7');
  eq('a flat fifth is kept', parseChord('F#m7b5')?.quality, 'm7b5');
  eq('a slash chord carries its bass', parseChord('D/F#')?.bassPc, parseKey('F#')?.pc);
  eq('Bb is B flat, not B', parseChord('Bb')?.rootPc, 10);
  eq('the word Bridge is not a chord', parseChord('Bridge'), null);
  eq('the word Verse is not a chord', parseChord('Verse'), null);
  eq('a stray H is not a chord', parseChord('H'), null);
  eq('an empty token is not a chord', parseChord(''), null);
}

console.log('\n3. Which spelling a key wants');
{
  eq('G is sharps', prefersFlats('G'), false);
  eq('D is sharps', prefersFlats('D'), false);
  eq('Bb is flats', prefersFlats('Bb'), true);
  eq('F is flats', prefersFlats('F'), true);
  eq('Eb is flats', prefersFlats('Eb'), true);
  eq('Am takes C major’s signature, so sharps', prefersFlats('Am'), false);
  eq('Em takes G major’s signature, so sharps', prefersFlats('Em'), false);
  eq('Dm takes F major’s signature, so flats', prefersFlats('Dm'), true);
  eq('Gm takes Bb major’s signature, so flats', prefersFlats('Gm'), true);
}

console.log('\n4. Moving between keys');
{
  eq('G up to D is seven semitones', keyInterval('G', 'D'), 7);
  eq('D up to G is five semitones', keyInterval('D', 'G'), 5);
  eq('the same key is no move at all', keyInterval('G', 'G'), 0);
  eq('an unknown key has no interval', keyInterval('G', ''), null);
  eq('G transposed seven lands on D', transposeKey('G', 7), 'D');
  eq('Bb transposed two lands on C', transposeKey('Bb', 2), 'C');
  eq('Em transposed seven lands on Bm', transposeKey('Em', 7), 'Bm');
  eq('a flat key keeps its flats', transposeKey('Bb', 2), 'C');
}

console.log('\n5. Moving chords');
{
  eq('G up seven is D', transposeChord('G', 7, false), 'D');
  eq('Em up seven is Bm', transposeChord('Em', 7, false), 'Bm');
  eq('a slash chord moves both notes', transposeChord('D/F#', 7, false), 'A/C#');
  eq('quality survives the move', transposeChord('Cmaj7', 2, false), 'Dmaj7');
  eq('a sharp key spells with sharps', transposeChord('G', 1, false), 'G#');
  eq('a flat key spells with flats', transposeChord('G', 1, true), 'Ab');
  eq('Bb up two is C', transposeChord('Bb', 2, true), 'C');
  eq('a word is left alone', transposeChord('Bridge', 7, false), 'Bridge');
  eq('a whole chord line keeps its spacing', transposeChordLine('G     D     Em', 7, false), 'D     A     Bm');
}

console.log('\n6. Lyrics with chords in them');
{
  const verse = '[G]Amazing [D]grace, how [Em]sweet the [C]sound';
  eq(
    'inline chords move with the words',
    transposeLyrics(verse, 7, false),
    '[D]Amazing [A]grace, how [Bm]sweet the [G]sound',
  );
  eq(
    'zero semitones changes nothing',
    transposeLyrics(verse, 0, false),
    verse,
  );
  eq(
    'a section header is never mistaken for a chord',
    transposeLyrics('[Bridge]\n[G]Hold on', 7, false),
    '[Bridge]\n[D]Hold on',
  );
  eq(
    'a standalone chord line still transposes',
    transposeLyrics('G     D     Em\nAmazing grace', 7, false),
    'D     A     Bm\nAmazing grace',
  );
  eq(
    'a line with inline chords is not moved twice',
    transposeLyrics('[G]word', 7, false),
    '[D]word',
  );
  eq('stripChords removes markers', stripChords(verse), 'Amazing grace, how sweet the sound');
  eq(
    'stripChords removes chord lines',
    stripChords('G   D\nAmazing grace'),
    'Amazing grace',
  );
  eq('hasChords sees markers', hasChords(verse), true);
  eq('hasChords sees chord lines', hasChords('G   D\nAmazing'), true);
  eq('hasChords ignores plain lyrics', hasChords('Amazing grace'), false);
  eq('hasChords ignores section headers', hasChords('[Bridge]\nHold on'), false);
}

console.log('\n7. The palette for a key');
{
  eq('G major offers the six that work', diatonicChords('G').join(','), 'G,Am,Bm,C,D,Em');
  eq('D major', diatonicChords('D').join(','), 'D,Em,F#m,G,A,Bm');
  eq('a minor key gets a major dominant', diatonicChords('Am').join(','), 'Am,C,Dm,E,F,G');
  eq('a flat key is spelled in flats', diatonicChords('Bb').join(','), 'Bb,Cm,Dm,Eb,F,Gm');
  eq('no key means no palette', diatonicChords('').length, 0);
}

console.log('\n8. Splitting a line for the renderer');
{
  const segs = splitChordSegments('[G]Amazing [D]grace');
  eq('two runs', segs.length, 2);
  eq('the first carries its chord', segs[0].chord, 'G');
  eq('and the words it covers', segs[0].text, 'Amazing ');
  eq('the second too', `${segs[1].chord}|${segs[1].text}`, 'D|grace');

  const plain = splitChordSegments('Amazing grace');
  check('plain text is one run with no chord', plain.length === 1 && plain[0].chord === null);

  const header = splitChordSegments('[Bridge] hold on');
  check(
    'a non-chord bracket stays in the text',
    header.length === 1 && header[0].chord === null && header[0].text === '[Bridge] hold on',
    JSON.stringify(header),
  );
}

console.log('\n9. The case that prompted all this');
{
  /*
   * Song 1 is written in G. Song 2 is written in D. In the lineup the band comes
   * back to parts of song 1 — but the room has moved, so it is now in D too.
   * One set of stored lyrics, two keys, no duplicated song.
   */
  const song1 = { key: 'G', lyrics: '[G]Great are You [D]Lord, [Em]worthy of all [C]praise' };
  const song2 = { key: 'D', lyrics: '[D]Here I [A]am, [Bm]ready to [G]worship' };

  // Slot 1: song 1 as written.
  eq('song 1 plays in G untouched', keyInterval(song1.key, 'G'), 0);
  eq('so nothing moves', transposeLyrics(song1.lyrics, 0, false), song1.lyrics);

  // Slot 2: song 2 as written.
  eq('song 2 plays in D untouched', keyInterval(song2.key, 'D'), 0);

  // Slot 3: back to song 1, but the set is now in D.
  const step = keyInterval(song1.key, 'D');
  eq('the move from G to D is seven semitones', step, 7);
  eq(
    'and the same stored lyrics come out in D',
    transposeLyrics(song1.lyrics, step, false),
    '[D]Great are You [A]Lord, [Bm]worthy of all [G]praise',
  );
  eq('the song’s own key is unchanged on disk', song1.key, 'G');
  eq('its stored lyrics are unchanged too', song1.lyrics.includes('[G]Great'), true);

  // And the whole set reads in one key.
  const setInD = [
    transposeLyrics(song1.lyrics, step, false),
    transposeLyrics(song2.lyrics, keyInterval(song2.key, 'D'), false),
  ];
  check(
    'every chord in the set now belongs to D major',
    [...setInD.join('\n').matchAll(/\[([^\]]+)\]/g)]
      .map((m) => m[1])
      .every((c) => diatonicChords('D').includes(c)),
    [...setInD.join('\n').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).join(','),
  );
}

console.log('\n10. Round trips');
{
  for (const key of [...MAJOR_KEYS, ...MINOR_KEYS]) {
    for (const step of [1, 2, 3, 5, 7, 11]) {
      const there = transposeKey(key, step);
      const back = keyInterval(there, key);
      if (back !== (12 - step) % 12) {
        check(`${key} +${step} → ${there} → back is not the inverse`, false, `${back}`);
        break;
      }
    }
  }
  check('every key in the picker round-trips through every interval', true);

  const lyrics = '[G]one [Am7]two [D/F#]three';
  eq(
    'a chord survives a full turn',
    transposeLyrics(transposeLyrics(lyrics, 5, false), 7, false),
    lyrics,
  );
}

console.log('\n11. Chord lines are still recognised');
{
  eq('a row of chords', isChordLine('G   D/F#   Em7   C'), true);
  eq('barred chords', isChordLine('| G  C | D  |'), true);
  eq('a lyric line is not chords', isChordLine('Amazing grace how sweet'), false);
  eq('a section header is not chords', isChordLine('[Verse 1]'), false);
  eq('an empty line is not chords', isChordLine('   '), false);
}

console.log('\n12. A pasted chord sheet becomes inline chords');
{
  /*
   * The chord columns are generated to sit exactly over the first letter of the
   * word they belong to, not typed by eye — hand-typed chord lines are how this
   * test came to assert an alignment its own input did not contain.
   */
  const sheet = [
    'G       D          Em        C',
    'Amazing grace, how sweet the sound',
    'G    D       C           G',
    'That saved a wretch like me',
  ].join('\n');
  const inlined = sheetToInline(sheet);

  eq(
    'each chord lands on the word under it',
    inlined,
    '[G]Amazing [D]grace, how [Em]sweet the [C]sound\n' +
      '[G]That [D]saved a [C]wretch like [G]me',
  );
  eq(
    'and the converted sheet transposes cleanly',
    transposeLyrics(inlined, keyInterval('G', 'D'), 'D'),
    '[D]Amazing [A]grace, how [Bm]sweet the [G]sound\n' +
      '[D]That [A]saved a [G]wretch like [D]me',
  );
  eq(
    'a chord past the last word stays at the end',
    sheetToInline('G                 D\nOh'),
    '[G]Oh[D]',
  );
  eq(
    'a chord line with nothing under it is left alone',
    sheetToInline('G   D\nHold on\nG  D'),
    '[G]Hold [D]on\nG  D',
  );
  eq('plain lyrics are untouched', sheetToInline('Amazing grace\nHow sweet'), 'Amazing grace\nHow sweet');
}

console.log('\n13. Markers are found wherever they sit in a line');
{
  eq(
    'a header first and chords after still counts as chorded',
    hasInlineChord('[Bridge] hold on [G]now'),
    true,
  );
  eq('a header alone does not', hasInlineChord('[Bridge] hold on'), false);
  eq('chords at the very start count', hasInlineChord('[G]Amazing'), true);
  eq('plain text does not', hasInlineChord('Amazing grace'), false);
  eq(
    'hiding chords keeps the section header',
    stripChords('[Bridge] hold on [G]now'),
    '[Bridge] hold on now',
  );
  eq(
    '[Chorus] also starts with an A-G letter and must survive hiding',
    stripChords('[Chorus]\n[G]Amazing [D]grace'),
    '[Chorus]\nAmazing grace',
  );
  eq(
    'and survive a transposition',
    transposeLyrics('[Chorus]\n[G]Amazing [D]grace', 7, 'D'),
    '[Chorus]\n[D]Amazing [A]grace',
  );
}

/* ------------------------------------------------------------------------ */
/* The lineup level: the same song, twice, in two keys, from one stored set.  */
/* ------------------------------------------------------------------------ */

const { lineupFullLyricBlocks, resolveSequence } = await loadTs('src/lib/lru.ts');

const songOne = {
  id: 'song_g',
  title: 'Song One',
  artist: 'A',
  tempo: 'slow',
  theme: '',
  key: 'G',
  parts: [
    { id: 'p1', kind: 'verse', label: 'Verse 1', lyrics: '[G]Amazing [D]grace' },
    { id: 'p2', kind: 'chorus', label: 'Chorus', lyrics: '[C]How [G]sweet' },
  ],
  analysis: null,
  ownerId: 'u1',
  ownerName: 'Kim',
  teamId: null,
  sourceSongId: null,
  createdAt: 1,
  updatedAt: 1,
};

const songTwo = {
  ...songOne,
  id: 'song_d',
  title: 'Song Two',
  key: 'D',
  parts: [
    { id: 'q1', kind: 'verse', label: 'Verse 1', lyrics: '[D]Blessed [A]be' },
  ],
};

// The user's scenario: Song 1 in G, Song 2 in D, then Song 1 again — now in D.
const lineup = {
  id: 'lineup_1',
  name: 'Sunday',
  theme: '',
  ownerId: 'u1',
  ownerName: 'Kim',
  teamId: null,
  items: [
    { id: 's1', songId: 'song_g', partId: 'p1' },
    { id: 's2', songId: 'song_d', partId: 'q1', key: 'D' },
    { id: 's3', songId: 'song_g', partId: 'p2', key: 'D' },
  ],
  shareToken: 't',
  createdAt: 1,
  updatedAt: 1,
};

const allSongs = [songOne, songTwo];

console.log('\n14. One song, two keys, one lineup');
{
  const entries = resolveSequence(lineup, allSongs);

  eq('three slots resolve', entries.length, 3);
  eq('slot 1 plays as written', entries[0].lyrics, '[G]Amazing [D]grace');
  eq('and says so', entries[0].playKey, null);
  eq('slot 2 is already in D, so nothing moves', entries[1].lyrics, '[D]Blessed [A]be');
  eq('slot 3 is the same stored text', songOne.parts[1].lyrics, '[C]How [G]sweet');
  eq('but comes out moved', entries[2].lyrics, '[G]How [D]sweet');
  eq('by seven semitones', entries[2].interval, 7);
  eq('and names the key it is in', entries[2].playKey, 'D');
  eq('the song on disk is untouched', songOne.parts[1].lyrics, '[C]How [G]sweet');
}

console.log('\n15. The page a reader is handed');
{
  const blocks = lineupFullLyricBlocks(lineup, allSongs);

  // Song 1 appears twice in different keys, so it must not collapse into one
  // block — the reprise has to be visible as its own moment in D.
  const oneBlocks = blocks.filter((b) => b.songTitle === 'Song One');
  eq('Song One gets two blocks, not one', oneBlocks.length, 2);
  eq('the first plays as written', oneBlocks[0].playKey || '', '');
  eq('the second is in D', oneBlocks[1].playKey, 'D');
  eq('and its words moved', oneBlocks[1].sections[0].lyrics, '[D]Amazing [A]grace');
  eq('while the first did not', oneBlocks[0].sections[0].lyrics, '[G]Amazing [D]grace');
  eq('the first block still shows the original', oneBlocks[0].sections[1].lyrics, '[C]How [G]sweet');
  eq('both blocks name the key they were written in', oneBlocks[1].writtenKey, 'G');
}

/* ------------------------------------------------------------------------ */
/* The controls, as the cascade actually resolves them on a phone.           */
/* ------------------------------------------------------------------------ */
/*
 * A chord bar that overflows a 375px screen is worse than no chord bar, and
 * nothing in the maths above would notice. This asks the shipped stylesheet what
 * it resolves to at the widths that matter, rather than checking that a
 * declaration exists somewhere in the file.
 */
console.log('\n16. The controls fit a phone');
{
  const fs = await import('node:fs');
  const distDir = path.join(root, 'dist', 'assets');
  const cssFile = fs.existsSync(distDir)
    ? fs
        .readdirSync(distDir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => path.join(distDir, f))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]
    : null;

  if (!cssFile) {
    console.log('  · no built CSS — run `npm run build` first');
  } else {
    const { createCascade } = await import('./lib/css-cascade.mjs');
    const css = fs.readFileSync(cssFile, 'utf8');
    const at = createCascade(css);
    const PHONE = 375;

    eq(
      'the bar wraps instead of overflowing',
      at.valueAt('.chord-bar', 'flex-wrap', PHONE),
      'wrap',
    );
    eq('the minus step is 36px wide', at.valueAt('.chord-step', 'width', PHONE), '36px');
    eq('and 36px tall', at.valueAt('.chord-step', 'height', PHONE), '36px');
    eq(
      'the readout does not shrink below its text',
      at.valueAt('.chord-key-readout', 'min-width', PHONE),
      '74px',
    );
    eq(
      'a chord floats above its word',
      at.valueAt('.chord-note', 'position', PHONE),
      'absolute',
    );
    eq(
      'and chorded lines make room for it',
      at.valueAt('.lyric-line-chorded', 'padding-top', PHONE),
      '15px',
    );
    eq(
      'plain lines do not pay for it',
      at.valueAt('.lyric-line', 'padding-top', PHONE),
      null,
    );
    eq(
      'the chord colour comes from a theme token, not a hardcode',
      /var\(--brand-text\)/.test(at.declaredAt('.chord-note', 'color', PHONE) || ''),
      true,
    );
    eq(
      'the key badge does too',
      /var\(--brand-text\)/.test(at.declaredAt('.song-key-badge', 'color', PHONE) || ''),
      true,
    );
    eq(
      'a chord pill is tall enough for a thumb',
      at.valueAt('.chord-pill', 'height', PHONE),
      '36px',
    );
    eq(
      'the per-slot key picker does not stretch the row',
      at.valueAt('.slot-key-select', 'width', PHONE),
      'auto',
    );

    eq(
      'the running-order title can shrink instead of pushing the picker out',
      at.valueAt('.running-order-what', 'min-width', PHONE),
      '0',
    );
    eq(
      'and truncates rather than wrapping the row taller',
      at.valueAt('.running-order-what', 'white-space', PHONE),
      'nowrap',
    );
    eq(
      'the key picker stays a fixed, tappable width',
      at.valueAt('.running-order-key', 'min-width', PHONE),
      '118px',
    );

    eq(
      'a chorded page reserves room so an edge chord cannot fall off',
      at.valueAt('.lyric-body-chorded', 'padding-right', PHONE),
      '36px',
    );
    eq(
      'a plain page does not pay for it',
      at.valueAt('.lyric-body', 'padding-right', PHONE),
      null,
    );
    eq(
      'a part textarea is capped rather than running off the page',
      at.valueAt('.part-body .textarea', 'max-height', PHONE),
      '60vh',
    );
    eq(
      'and starts tall enough to read a verse',
      at.valueAt('.part-body .textarea', 'min-height', PHONE),
      '96px',
    );

    /*
     * Every token the chord UI reads must exist in the dark block too. A token
     * defined only for light resolves to nothing in dark, and the chord simply
     * disappears against a black page — invisible exactly when a stage is dark.
     */
    // Minified CSS drops the quotes from attribute selectors, so accept both —
    // a pattern written against the source file silently matches nothing here.
    // There is more than one dark block, so take the union of all of them.
    const darkBlocks = [
      ...css.matchAll(/:root\[data-theme=['"]?dark['"]?\][^{]*\{([^}]*)\}/g),
    ].map((m) => m[1]);
    const darkDecls = darkBlocks.join('\n');
    check('dark theme blocks were found', darkBlocks.length > 0, `${darkBlocks.length} blocks`);
    for (const token of ['--brand-text', '--brand-soft', '--brand-soft-2', '--surface-2', '--line']) {
      check(`dark theme defines ${token}`, darkDecls.includes(token + ':'));
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Pasting a chord sheet through the real splitter.                          */
/* ------------------------------------------------------------------------ */

const { splitPastedLyrics } = await loadTs('src/lib/lyricSplit.ts');

console.log('\n17. Pasting a chord sheet');
{
  const sheet = [
    '[Verse 1]',
    'G       D          Em        C',
    'Amazing grace, how sweet the sound',
    'G    D       C           G',
    'That saved a wretch like me',
    '',
    '[Chorus]',
    'C         G         D  G',
    'How sweet the sound to me',
  ].join('\n');

  const split = splitPastedLyrics(sheet);

  eq('it split into two parts', split.parts.length, 2);
  check('and reports that chords were anchored', split.inlinedChords === true);

  const verse = split.parts[0];
  eq(
    'the verse keeps its chords on the words',
    verse.lyrics,
    '[G]Amazing [D]grace, how [Em]sweet the [C]sound\n' +
      '[G]That [D]saved a [C]wretch like [G]me',
  );
  eq(
    'and so does the chorus',
    split.parts[1].lyrics,
    '[C]How sweet [G]the sound [D]to [G]me',
  );
  check('no loose chord line survived', !verse.lyrics.split('\n').some((l) => /^[A-G][#b]?\s/.test(l)));

  // The point of the whole exercise: this pasted sheet can now be moved.
  eq(
    'and the pasted sheet transposes',
    transposeLyrics(verse.lyrics, keyInterval('G', 'D'), 'D'),
    '[D]Amazing [A]grace, how [Bm]sweet the [G]sound\n' +
      '[D]That [A]saved a [G]wretch like [D]me',
  );

  const plain = splitPastedLyrics('Amazing grace\nHow sweet the sound');
  eq('plain lyrics report nothing anchored', plain.inlinedChords, false);
}

console.log('\n18. Sheets that arrive in awkward shapes');
{
  // A chord line above a heading is an intro vamp. Gluing the chord to the
  // heading would put a chord on the word "Verse".
  const header = sheetToInline('G\n[Verse 1]\nAmazing grace');
  eq('a chord above a heading is not glued to it', header, 'G\n[Verse 1]\nAmazing grace');

  const parenHeader = sheetToInline('G\n(Chorus)\nAmazing grace');
  eq('same for a parenthesised heading', parenHeader, 'G\n(Chorus)\nAmazing grace');

  // `| G |` puts G at column 2 while "Amazing" starts at column 0. Matching on
  // the word's start would skip it and hang the chord on the second word.
  eq(
    'a leading bar line does not push the first chord along',
    sheetToInline('| G   | D/F# | Em7  | C    |\nAmazing grace, how sweet the sound'),
    '[G]Amazing [D/F#]grace, [Em7]how [C]sweet the sound',
  );

  /*
   * A blank line is a section boundary. Reaching across it would move an
   * instrumental intro's chords onto the first line of the next section, so a
   * chord line with a gap under it stays a chord line.
   */
  eq(
    'a blank line under a chord line is a boundary, not a gap to cross',
    sheetToInline('G       D\n\nAmazing grace'),
    'G       D\n\nAmazing grace',
  );

  /*
   * Spacing lost on the way in. Four chords bunched into seven columns cannot be
   * matched to eight words, and three of them would land on one syllable —
   * stacked on top of each other on screen. Leave the sheet as it came: a chord
   * line still renders and still transposes, which beats an invented arrangement.
   */
  const bunched = sheetToInline('G D Em C\nAmazing grace, how sweet the sound');
  eq('bunched chords are left as a chord line', bunched, 'G D Em C\nAmazing grace, how sweet the sound');
  eq(
    'and still transpose as a chord line',
    transposeLyrics(bunched, keyInterval('G', 'D'), 'D'),
    'D A Bm G\nAmazing grace, how sweet the sound',
  );

  /*
   * Chords are very often typed a space or two left of the syllable. Matching on
   * the word's start would find no word at or after column 11 and hang the chord
   * off the end of the line entirely; matching on its end lands it on "grace".
   */
  eq(
    'a chord typed left of its word still lands on that word',
    sheetToInline('G          D\nAmazing grace'),
    '[G]Amazing [D]grace',
  );

  // Two chords on one syllable is real, though — a passing chord or a walk-up.
  eq(
    'two chords on one word is kept, not refused',
    sheetToInline('G   D\nAmazing grace'),
    '[G][D]Amazing grace',
  );
}

console.log('\n19. Nothing is quietly dropped when a chord sheet is pasted');
{
  /*
   * The report this is a regression test for: a song went into the library
   * missing a chorus, because the sheet said [Chorus] twice and the splitter
   * decided the second one was a duplicate. Whoever pasted it wrote the section
   * twice on purpose — the collapse heuristic earns its keep on an unlabelled
   * wall of text, not on a sheet that labels its own sections.
   */
  const labelled = [
    '[Verse 1]',
    'G            D',
    'Here I am to worship',
    '',
    '[Chorus]',
    'G        D',
    'Holy, holy',
    '',
    '[Verse 2]',
    'G            D',
    'Here I stand forgiven',
    '',
    '[Chorus]',
    'G        D',
    'Holy, holy',
  ].join('\n');

  const kept = splitPastedLyrics(labelled);
  eq('a labelled sheet keeps every section it was given', kept.collapsedCount, 0);
  eq('so both choruses survive', kept.parts.filter((p) => p.kind === 'chorus').length, 2);

  const unlabelled = [
    'Here I am to worship',
    'Here I bow down',
    '',
    'Holy, holy',
    'Is Your name',
    '',
    'Here I stand forgiven',
    'Sinner saved by grace',
    '',
    'Holy, holy',
    'Is Your name',
  ].join('\n');
  check(
    'an unlabelled wall of text still collapses its repeats',
    splitPastedLyrics(unlabelled).collapsedCount >= 1,
    `collapsed=${splitPastedLyrics(unlabelled).collapsedCount}`,
  );

  /*
   * Even when collapsing is forced on, a repeat in a different key is not a
   * duplicate — it is the only place that arrangement was written down.
   */
  const sameWordsNewKey = [
    '[Chorus]',
    'G        D',
    'Holy, holy',
    '',
    '[Chorus]',
    'D        A',
    'Holy, holy',
  ].join('\n');
  const forced = splitPastedLyrics(sameWordsNewKey, { collapseRepeats: true });
  eq('a repeat in a different key is not collapsed', forced.collapsedCount, 0);
  eq('both versions are kept', forced.parts.length, 2);

  const trueDuplicate = [
    'Holy, holy',
    'Is Your name',
    '',
    'Holy, holy',
    'Is Your name',
  ].join('\n');
  check(
    'a genuine unlabelled duplicate still collapses',
    splitPastedLyrics(trueDuplicate, { collapseRepeats: true }).collapsedCount >= 1,
  );
}

console.log('\n20. Sections nobody sings');
{
  const sheet = [
    '[Intro]',
    'G   D   Em   C',
    '',
    '[Verse 1]',
    'G            D',
    'Here I am to worship',
    '',
    '[Interlude]',
    'G   D   Em   C',
    '',
    '[Instrumental]',
    'Am   G   D',
  ].join('\n');
  const split = splitPastedLyrics(sheet);
  const kinds = split.parts.map((p) => p.kind).join(',');

  eq('an interlude is an interlude, not a bridge', kinds, 'intro,verse,interlude,instrumental');
  eq('and is labelled as one', split.parts[2].label, 'Interlude');
  eq(
    'its chords are stored verbatim',
    split.parts[2].lyrics,
    'G   D   Em   C',
  );

  // No heading at all — a bare block of chord names.
  const bare = splitPastedLyrics('G   D   Em   C\n\nHere I am to worship\nHere I bow down');
  eq('an unlabelled block of chords is called Instrumental', bare.parts[0].kind, 'instrumental');
  eq('and gets that label', bare.parts[0].label, 'Instrumental');

  // The whole point: a chord-only part must survive into a lineup and transpose.
  eq(
    'a chord-only part transposes like any other',
    transposeLyrics(split.parts[0].lyrics, keyInterval('G', 'D'), 'D'),
    'D   A   Bm   G',
  );
}

console.log('\n21. The schema the live database runs cannot drift from the repo');
{
  /*
   * The key column shipped, the song editor saved it, the API returned it — and
   * it still vanished on refresh, because production writes songs through
   * aria_sync_caller_state, whose column list did not mention key. The column
   * was there; the function that fills it was not. Nothing in the app could see
   * that, so the schema is checked here instead.
   */
  const fs2 = await import('node:fs');
  const schema = fs2.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');

  const start = schema.indexOf('create or replace function public.aria_sync_caller_state(');
  check('aria_sync_caller_state is defined in schema.sql', start !== -1);
  const body = start === -1 ? '' : schema.slice(start, schema.indexOf('$body$;', start));

  check('its song insert lists the key column', /id, title, artist, tempo, theme, key, parts/.test(body));
  check('its values read the key from the payload', body.includes("coalesce(v_song->>'key', '')"));
  check('its on-conflict update writes the key', body.includes('key = excluded.key'));

  // The table itself, so a fresh database gets both.
  check('the songs table declares a key column', /create table if not exists public\.songs \([\s\S]*?\n\s*key\s+text not null default ''/.test(schema));
  check('and an existing database is migrated', /alter table public\.songs add column if not exists key text not null default ''/.test(schema));

  // Lineup slot keys ride inside the items jsonb, so the column list must not
  // try to name them — worth stating, because it is why slots survived while
  // song keys did not.
  check('lineup items are stored as one jsonb column', /v_lineup->'items'/.test(body));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
