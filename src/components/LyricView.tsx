import { isChordLine } from '../lib/lyricSplit';

interface LyricViewProps {
  lyrics: string;
  large?: boolean;
}

export function LyricView({ lyrics, large = false }: LyricViewProps) {
  const normalized = (lyrics ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '');

  if (!normalized.trim()) {
    return <div className="tiny">No lyrics available for this part.</div>;
  }

  const stanzas = normalized
    .split(/\n\s*\n+/)
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((l) => l.trim().length > 0));

  return (
    <div className={`lyric-body ${large ? 'lyric-body-lg' : ''}`}>
      {stanzas.map((lines, si) => (
        <div key={si} className="lyric-stanza">
          {lines.map((line, li) => {
            const chord = isChordLine(line);
            return (
              <div
                key={li}
                className={chord ? 'lyric-line lyric-chord' : 'lyric-line'}
              >
                {line}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
