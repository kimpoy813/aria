import { isChordLine } from '../lib/lyricSplit';
import { splitChordSegments, stripChords } from '../lib/chords';

interface LyricViewProps {
  lyrics: string;
  large?: boolean;
  /**
   * Show the chords. Off means the words alone — what a singer who is not
   * playing anything wants, and what a projector slide usually wants.
   * Default: on.
   */
  showChords?: boolean;
}

/**
 * Renders lyrics, with chords sitting above the word each one falls on.
 *
 * The text handed in is already in whatever key is being displayed — moving keys
 * is the caller's job, because only the caller knows whether it is looking at a
 * song's own key or a lineup slot's. This component only has to lay out what it
 * is given, which keeps a transposed sheet and an original one pixel-identical
 * apart from the chord names.
 */
export function LyricView({ lyrics, large = false, showChords = true }: LyricViewProps) {
  // Hiding chords is done once, up front, so nothing downstream has to think
  // about whether a marker is still a marker.
  const source = showChords ? (lyrics ?? '') : stripChords(lyrics ?? '');
  const normalized = source.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');

  if (!normalized.trim()) {
    return <div className="tiny">No lyrics available for this part.</div>;
  }

  const stanzas = normalized
    .split(/\n\s*\n+/)
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((l) => l.trim().length > 0));

  return (
    <div className={`lyric-body ${showChords ? 'lyric-body-chorded' : ''} ${large ? 'lyric-body-lg' : ''}`}>
      {stanzas.map((lines, si) => (
        <div key={si} className="lyric-stanza">
          {lines.map((line, li) => {
            // A whole line of chords, as pasted sheets have them.
            if (isChordLine(line)) {
              return (
                <div key={li} className="lyric-line lyric-chord">
                  {line}
                </div>
              );
            }

            const segments = splitChordSegments(line);
            if (segments.length === 1 && segments[0].chord === null) {
              return (
                <div key={li} className="lyric-line">
                  {line}
                </div>
              );
            }

            return (
              <div key={li} className="lyric-line lyric-line-chorded">
                {segments.map((segment, gi) =>
                  segment.chord === null ? (
                    <span key={gi}>{segment.text}</span>
                  ) : (
                    <span
                      key={gi}
                      className={
                        segment.text.trim() === '' ? 'chord-run chord-run-bare' : 'chord-run'
                      }
                    >
                      <span className="chord-note">{segment.chord}</span>
                      {segment.text}
                    </span>
                  ),
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
