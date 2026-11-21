/**
 * Chords, keys and transposition.
 *
 * The model, and why it is this way:
 *
 * Chords live *inside* the lyric text as `[G]` markers, sitting immediately
 * before the syllable they fall on:
 *
 *     [G]Amazing [D]grace, how [Em]sweet the [C]sound
 *
 * rather than on a chord line of their own above the words. A separate chord
 * line has to keep its chords aligned by whitespace, and transposition changes
 * chord *widths* — "Em" becomes "F#m" — so every alignment silently drifts the
 * moment anyone changes key. Inline markers have nothing to align: each chord
 * is anchored to its own word, so a transposed sheet is exactly as correct as
 * the original.
 *
 * Standalone chord lines are still understood (pasted chord sheets are common,
 * and older songs use them). They render and transpose too; they just keep the
 * old spacing behaviour.
 *
 * A song stores its chords in its own key. A lineup slot stores the key that
 * occurrence is *played* in, and the difference drives the transposition — so
 * the same song can appear twice in one lineup, once in G and once in D, from
 * one set of stored lyrics.
 */

const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_SPELLING = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_SPELLING = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Key signatures that read better in flats. */
const FLAT_SIGNATURES = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db

/** Keys offered by the pickers: the ones a worship band actually plays in. */
export const MAJOR_KEYS = ['G', 'D', 'A', 'E', 'B', 'F#', 'C', 'F', 'Bb', 'Eb', 'Ab'];
export const MINOR_KEYS = ['Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Am', 'Dm', 'Gm', 'Cm', 'Fm'];

export interface ParsedKey {
  /** Pitch class 0–11, C = 0. */
  pc: number;
  minor: boolean;
  /** Canonical spelling, e.g. "Bb" or "F#m". */
  name: string;
}

export interface ParsedChord {
  rootPc: number;
  /** Everything after the root, kept verbatim: "m7", "sus4", "maj7", "m7b5", "". */
  quality: string;
  bassPc: number | null;
}

/** Matches a chord marker inside lyric text. Deliberately requires A–G so that
 *  section headers like `[Bridge]` or `[Verse 1]` are never touched. */
const INLINE_CHORD_G = /\[([A-G][^\]\n]{0,11})\]/g;

/** A chord token as it appears in a standalone chord line. */
const CHORD_TOKEN_G =
  /[A-G][#b♯♭]?(?:maj|min|m|dim|aug|sus[24]?|add\d{0,2}|no\d)?\d{0,2}(?:[#b+-]\d{1,2})?(?:\/[A-G][#b♯♭]?)?/g;

const QUALITY_RE =
  /^(?:maj|min|m|dim|aug|sus[24]?|add\d{0,2}|no\d)?\d{0,2}(?:[#b+-]\d{1,2})?$/;

const normalizeAccidentals = (v: string) => v.replace(/♯/g, '#').replace(/♭/g, 'b');

export function parseKey(input: string | null | undefined): ParsedKey | null {
  const raw = normalizeAccidentals((input ?? '').trim());
  const m = raw.match(/^([A-G])([#b]?)(m|min)?$/i);
  if (!m) return null;
  const base = NATURAL[m[1].toUpperCase()];
  if (base === undefined) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const minor = Boolean(m[3]);
  const pc = (((base + acc) % 12) + 12) % 12;
  const spelled = m[2] === 'b' ? FLAT_SPELLING[pc] : SHARP_SPELLING[pc];
  return { pc, minor, name: `${spelled}${minor ? 'm' : ''}` };
}

export function parseChord(token: string | null | undefined): ParsedChord | null {
  const raw = normalizeAccidentals((token ?? '').trim());
  if (!raw) return null;
  const slash = raw.indexOf('/');
  const body = slash === -1 ? raw : raw.slice(0, slash);
  const bass = slash === -1 ? '' : raw.slice(slash + 1);

  const m = body.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return null;
  const base = NATURAL[m[1].toUpperCase()];
  if (base === undefined) return null;
  const quality = m[3] ?? '';
  if (!QUALITY_RE.test(quality)) return null;

  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const rootPc = (((base + acc) % 12) + 12) % 12;

  let bassPc: number | null = null;
  if (bass) {
    const bm = bass.match(/^([A-G])([#b]?)$/);
    if (!bm) return null;
    const bBase = NATURAL[bm[1].toUpperCase()];
    if (bBase === undefined) return null;
    const bAcc = bm[2] === '#' ? 1 : bm[2] === 'b' ? -1 : 0;
    bassPc = (((bBase + bAcc) % 12) + 12) % 12;
  }

  return { rootPc, quality, bassPc };
}

/** True when a key's signature is normally written with flats. */
export function prefersFlats(key: string | null | undefined): boolean {
  const parsed = parseKey(key);
  if (!parsed) return false;
  // A minor key shares its signature with the major a minor third above.
  const signature = parsed.minor ? (parsed.pc + 3) % 12 : parsed.pc;
  return FLAT_SIGNATURES.has(signature);
}

/** Semitones from one key up to another, always in 0–11. */
export function keyInterval(
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
): number | null {
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  if (!from || !to) return null;
  return (((to.pc - from.pc) % 12) + 12) % 12;
}

/**
 * Spelling for a transposition target.
 *
 * Accepts either the answer (`true` = flats) or the key the music lands in, so
 * a call site passes the key it already has instead of looking up its signature
 * first. G moving seven becomes D and spells D; F moving five becomes Bb.
 */
export type Spelling = boolean | string | null | undefined;
const spellingOf = (spelling: Spelling): boolean =>
  typeof spelling === 'boolean' ? spelling : prefersFlats(spelling);

/** The key a song lands in when its stored chords move by `semitones`. */
export function transposeKey(
  key: string | null | undefined,
  semitones: number,
  target: Spelling = null,
): string {
  const parsed = parseKey(key);
  if (!parsed) return '';
  const pc = (((parsed.pc + semitones) % 12) + 12) % 12;
  // An explicit target wins; otherwise the destination key picks its own
  // signature, which is what keeps Bb from arriving as A#.
  const useFlats =
    typeof target === 'boolean'
      ? target
      : typeof target === 'string' && target.trim() !== ''
        ? prefersFlats(target)
        : prefersFlats(spellingTable(pc, parsed.minor));
  const spelling = useFlats ? FLAT_SPELLING : SHARP_SPELLING;
  return `${spelling[pc]}${parsed.minor ? 'm' : ''}`;
}

/** The plain name of a pitch class, used only to pick a signature. */
function spellingTable(pc: number, minor: boolean): string {
  return `${SHARP_SPELLING[pc]}${minor ? 'm' : ''}`;
}

function spellPitch(pc: number, flat: boolean): string {
  const idx = (((pc % 12) + 12) % 12);
  return (flat ? FLAT_SPELLING : SHARP_SPELLING)[idx];
}

/** One chord, moved. Anything that is not a chord comes back unchanged. */
export function transposeChord(token: string, semitones: number, flat: boolean): string {
  const parsed = parseChord(token);
  if (!parsed) return token;
  const root = spellPitch(parsed.rootPc + semitones, flat);
  const bass = parsed.bassPc === null ? '' : `/${spellPitch(parsed.bassPc + semitones, flat)}`;
  return `${root}${parsed.quality}${bass}`;
}

/** A whole chord line, spacing and bar marks preserved. */
export function transposeChordLine(line: string, semitones: number, flat: boolean): string {
  return line.replace(CHORD_TOKEN_G, (token) => transposeChord(token, semitones, flat));
}

/** True if a line is chords rather than words — "G   D/F#   Em7   C". */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed.replace(/[|()[\]·•-]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chords = tokens.filter((t) => parseChord(t) !== null).length;
  if (tokens.length === 1) return parseChord(tokens[0]) !== null;
  return chords / tokens.length >= 0.75;
}

/**
 * Every chord in a block of lyrics, moved by the same interval.
 *
 * Handles both storage styles. Markers that are not chords — `[Bridge]`,
 * `[Verse 1]` — are left exactly alone, which is the whole reason the marker
 * syntax requires an A–G first character.
 */
/**
 * Moves every chord in a lyric body.
 *
 * Handles both shapes the app holds chords in: inline `[G]` markers riding on
 * the words, and standalone chord lines from a pasted sheet.
 */
export function transposeLyrics(text: string, semitones: number, target: Spelling): string {
  if (!text) return text;
  const step = (((semitones % 12) + 12) % 12);
  if (step === 0) return text;

  const flat = spellingOf(target);
  const marked = text.replace(INLINE_CHORD_G, (whole, inner: string) => {
    if (parseChord(inner) === null) return whole;
    return `[${transposeChord(inner, step, flat)}]`;
  });

  // A line carrying inline markers has already been handled above; running it
  // through the chord-line pass as well would move its chords twice.
  return marked
    .split('\n')
    .map((line) => {
      if (hasInlineChord(line)) return line;
      return isChordLine(line) ? transposeChordLine(line, step, flat) : line;
    })
    .join('\n');
}

/**
 * Lyrics with every chord removed — what "hide chords" shows.
 *
 * Each bracket is tested against `parseChord` before removal rather than
 * deleted on the regex alone: section headers are in brackets too, and `[Chorus]`
 * and `[Bridge]` both start with a letter from A–G. Stripping those would take
 * the map off the page along with the chords.
 */
export function stripChords(text: string): string {
  if (!text) return text;
  return text
    .replace(INLINE_CHORD_G, (whole, inner: string) =>
      parseChord(inner) === null ? whole : '',
    )
    .split('\n')
    .filter((line) => !isChordLine(line))
    .join('\n');
}

/**
 * True when the text carries at least one inline `[G]`-style chord marker.
 *
 * Every bracket is tested, not just the first: a line commonly opens with a
 * section header ("[Bridge] hold on") and carries real chords after it, and
 * looking only at the first bracket would read that as chordless.
 */
export function hasInlineChord(text: string): boolean {
  if (!text) return false;
  for (const match of text.matchAll(INLINE_CHORD_G)) {
    if (parseChord(match[1]) !== null) return true;
  }
  return false;
}

export function hasChords(text: string): boolean {
  if (!text) return false;
  if (hasInlineChord(text)) return true;
  return text.split('\n').some((line) => isChordLine(line));
}

/** One chord-and-word run, as the renderer needs it. */
export interface ChordSegment {
  chord: string | null;
  text: string;
}

/**
 * Splits one lyric line into runs of "chord, then the words it covers".
 *
 * A marker with no words after it keeps its chord with an empty run, so nothing
 * is dropped; a bracket that is not a chord stays in the text.
 */
export function splitChordSegments(line: string): ChordSegment[] {
  const pieces = line.split(/(\[[^\]\n]{0,12}\])/g);
  const segments: ChordSegment[] = [];
  let current: ChordSegment = { chord: null, text: '' };

  for (const piece of pieces) {
    if (!piece) continue;
    const marker = piece.match(/^\[([^\]\n]{0,12})\]$/);
    const inner = marker?.[1];
    if (marker && inner && parseChord(inner) !== null) {
      if (current.chord !== null || current.text !== '') segments.push(current);
      current = { chord: inner, text: '' };
    } else {
      current.text += piece;
    }
  }
  if (current.chord !== null || current.text !== '') segments.push(current);
  return segments;
}

/** One chord and the column it sat at on the original chord line. */
interface PlacedChord {
  chord: string;
  col: number;
}

/**
 * A section heading, not a line of words.
 *
 * A chord line above `[Verse 1]` is an intro vamp belonging to whatever comes
 * next — converting it would glue a chord onto the heading itself. Kept local
 * rather than imported from lyricSplit, which imports this module.
 */
function isLikelyHeader(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[[\(].*[\])]$/.test(t)) return true; // [Verse 1], (Chorus)
  if (/^[A-Za-z][A-Za-z0-9 \-\u2013\u2014]{0,30}:$/.test(t)) return true; // Verse 1:
  return false;
}

/**
 * Turns a chord sheet into inline markers.
 *
 * A pasted sheet stacks a line of chords above a line of words and relies on
 * the eye to line them up. That works until someone transposes: "Em" becomes
 * "F#m", the chord line shifts, and every chord after it drifts off its word.
 * So on the way in, each chord is anchored to the word underneath it and stored
 * inline — after which the alignment cannot move, because there is none.
 *
 * A chord belongs to the word it is standing on: the first word that has not
 * ended by the time the chord's column arrives. Testing the word's *end* rather
 * than its start is what makes a sheet with leading bar lines line up — `| G |`
 * puts G at column 2, and "Amazing" starts at 0, so a start-based test would
 * skip it and hang the chord on the second word.
 *
 * When that test cannot be trusted — chords bunched so tightly that three or
 * more land on one word — the sheet has lost its alignment somewhere between
 * the source and the clipboard, and guessing would produce something worse than
 * what was pasted. Those pairs are left as a chord line, which still renders and
 * still transposes, just without the anchoring.
 */
export function sheetToInline(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isChordLine(line)) {
      out.push(line);
      continue;
    }

    /*
     * The words this chord line belongs to: the line directly underneath, and
     * only that line.
     *
     * Reaching past a blank line looks helpful and is not. A blank line is where
     * one section ends and the next begins, so an instrumental intro sitting
     * above a gap would have its chords pulled down onto the first line of the
     * verse — the intro loses its chords and the verse gains ones that were never
     * meant for it. Better to leave the chord line alone.
     */
    const j = i + 1;
    const next = lines[j];

    if (
      next === undefined ||
      !next.trim() ||
      isChordLine(next) ||
      isLikelyHeader(next)
    ) {
      // Nothing to anchor to — an outro vamp, a heading, the end of the part.
      out.push(line);
      continue;
    }

    const placed: PlacedChord[] = [];
    const tokenRe = /[^\s|]+/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(line)) !== null) {
      if (parseChord(m[0]) !== null) placed.push({ chord: m[0], col: m.index });
    }
    if (placed.length === 0) {
      out.push(line);
      continue;
    }

    const words: { start: number; end: number }[] = [];
    const wordRe = /\S+/g;
    while ((m = wordRe.exec(next)) !== null) {
      words.push({ start: m.index, end: m.index + m[0].length });
    }
    if (words.length === 0) {
      out.push(line);
      continue;
    }

    // Which word each chord lands on; words.length means "past the last word".
    const targetOf = new Map<number, string[]>();
    let deepest = 0;
    for (const { chord, col } of placed) {
      const idx = words.findIndex((w) => w.end > col);
      const at = idx === -1 ? words.length : idx;
      if (!targetOf.has(at)) targetOf.set(at, []);
      targetOf.get(at)!.push(chord);
      deepest = Math.max(deepest, targetOf.get(at)!.length);
    }

    // Three or more chords on one word: the spacing did not survive the paste.
    // Leave the sheet alone rather than inventing an arrangement.
    if (deepest >= 3) {
      out.push(line);
      continue;
    }

    let rebuilt = '';
    let cursor = 0;
    const marksAt = (at: number) => (targetOf.get(at) || []).map((c) => `[${c}]`).join('');
    words.forEach((w, at) => {
      rebuilt += next.slice(cursor, w.start) + marksAt(at) + next.slice(w.start, w.end);
      cursor = w.end;
    });
    rebuilt += marksAt(words.length) + next.slice(cursor);

    // Any blank line that sat between the chords and the words is kept; the
    // chord line itself is gone, replaced by the rebuilt lyric line.
    out.push(...lines.slice(i + 1, j), rebuilt);
    i = j; // the lyric line has been consumed
  }

  return out.join('\n');
}

const MAJOR_DEGREES: [number, string][] = [
  [0, ''],
  [2, 'm'],
  [4, 'm'],
  [5, ''],
  [7, ''],
  [9, 'm'],
];

// Natural minor, with a major V — the dominant a worship band actually reaches
// for in a minor key (E in Am), not the natural minor's minor v.
const MINOR_DEGREES: [number, string][] = [
  [0, 'm'],
  [3, ''],
  [5, 'm'],
  [7, ''],
  [8, ''],
  [10, ''],
];

/**
 * The chords that fit a key — the palette offered while entering chords, so a
 * leader is choosing from the six that work instead of typing from memory.
 */
export function diatonicChords(key: string | null | undefined): string[] {
  const parsed = parseKey(key);
  if (!parsed) return [];
  const flat = prefersFlats(key);
  const degrees = parsed.minor ? MINOR_DEGREES : MAJOR_DEGREES;
  return degrees.map(([offset, quality]) => `${spellPitch(parsed.pc + offset, flat)}${quality}`);
}
