import { transposeKey, transposeLyrics, MAJOR_KEYS, MINOR_KEYS } from './chords';

/**
 * What a *reader* does to the key.
 *
 * Two moves stack on the same text and must not be confused:
 *
 *  1. The builder's move — the slot's key against the key the song was written
 *     in. That one is baked into the lineup and applies to everyone.
 *  2. The reader's move — the singer standing in front of the page nudging it up
 *     two because that is where their voice sits today. That one is local, is
 *     never saved, and must not leak into the builder's sheet.
 *
 * This module only ever handles the second one, applied on top of whatever the
 * builder already decided.
 */

/** The key the sheet should say, once both moves are applied. */
export function displayKey(builtKey: string, offset: number): string {
  if (!builtKey) return '';
  return transposeKey(builtKey, offset, builtKey) || '';
}

/**
 * Moves a lyric body by the reader's offset.
 *
 * The text coming in is already in the builder's key, so this is a single move
 * from there — re-deriving it from the song's original key would apply the
 * builder's transposition a second time.
 */
export function applyReaderOffset(text: string, builtKey: string, offset: number): string {
  if (!offset || !text) return text;
  return transposeLyrics(text, offset, displayKey(builtKey, offset));
}

/** Every key the picker offers, majors first — the ones a band actually uses. */
export const PICKER_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

/** Normalises a key for comparison: "bb" and "B♭" are the same key. */
export function sameKey(a: string, b: string): boolean {
  const norm = (v: string) => (v || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b').toLowerCase();
  return norm(a) === norm(b);
}
