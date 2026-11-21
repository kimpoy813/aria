interface ChordControlsProps {
  /** Whether the page has any chords at all — no chords, no controls. */
  hasChords: boolean;
  showChords: boolean;
  onToggleChords: () => void;
  /**
   * The key to name in the readout, when the whole page is in one key.
   *
   * A lineup of several songs can be in several keys at once, so this is
   * optional: with it the readout says "D", without it the readout says
   * "down 2" and each song names its own key beside its title.
   */
  writtenKey?: string;
  /** The reader's move, in semitones. 0 means "as written". */
  offset: number;
  onChangeOffset: (next: number) => void;
}

/** The twelve keys, in circle-of-fifths order — the order a band counts in. */
export const KEY_RING = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

/**
 * Show/hide and transpose, in one bar.
 *
 * Built for the moment it is actually used: someone on a platform, mid-set,
 * phone in one hand, who needs to drop the key a step without looking away from
 * the band. So the move is a −/+ pair with the result named in plain words
 * beside it, not a dropdown to hunt through.
 *
 * This never edits anything. It only changes what is on this page, so a reader
 * transposing for their own voice cannot move the band's sheet — and the next
 * person to open the same link still sees it as written.
 */
export function ChordControls({
  hasChords,
  showChords,
  onToggleChords,
  writtenKey = '',
  offset,
  onChangeOffset,
}: ChordControlsProps) {
  if (!hasChords) return null;

  const moved = offset !== 0;
  const shift = offset > 0 ? `up ${offset}` : `down ${-offset}`;

  return (
    <div className="chord-bar" role="group" aria-label="Chords and key">
      <button
        type="button"
        className={`chord-toggle ${showChords ? 'active' : ''}`}
        onClick={onToggleChords}
        aria-pressed={showChords}
      >
        {showChords ? 'Chords on' : 'Chords off'}
      </button>

      <div className="chord-key">
        <button
          type="button"
          className="chord-step"
          onClick={() => onChangeOffset(offset - 1)}
          aria-label="Transpose down a semitone"
        >
          −
        </button>

        <div className="chord-key-readout" aria-live="polite">
          <span className="chord-key-now">
            {writtenKey && !moved ? writtenKey : moved ? shift : 'Key'}
          </span>
          <span className="chord-key-was">
            {writtenKey && moved
              ? `from ${writtenKey}`
              : moved
                ? 'from as written'
                : writtenKey
                  ? 'as written'
                  : 'as written'}
          </span>
        </div>

        <button
          type="button"
          className="chord-step"
          onClick={() => onChangeOffset(offset + 1)}
          aria-label="Transpose up a semitone"
        >
          +
        </button>
      </div>

      {moved && (
        <button type="button" className="chord-reset" onClick={() => onChangeOffset(0)}>
          Reset
        </button>
      )}
    </div>
  );
}
