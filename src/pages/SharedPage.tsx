import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { SharedLineup } from '../lib/types';
import { Button, Icon, IconButton } from '../components/ui';
import { Wordmark } from '../components/Logo';

export function SharedPage() {
  const { token } = useParams();
  const { theme, toggleTheme } = useStore();
  const [lineup, setLineup] = useState<SharedLineup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showParts, setShowParts] = useState(true);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    api
      .shared(token)
      .then((res) => {
        if (alive) setLineup(res.lineup);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not open this lineup.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="overlay-center">
        <div className="stack-sm" style={{ alignItems: 'center' }}>
          <Icon.Music size={22} />
          <p className="small">Opening lineup…</p>
        </div>
      </div>
    );
  }

  if (error || !lineup) {
    return (
      <div className="overlay-center">
        <div className="stack-sm" style={{ alignItems: 'center', maxWidth: 320 }}>
          <div className="serif" style={{ fontSize: 24, color: 'var(--ink)' }}>
            Lineup not found
          </div>
          <p className="small">{error || 'This link may have expired or been removed.'}</p>
          <Link to="/">
            <Button variant="primary">Open Aria</Button>
          </Link>
        </div>
      </div>
    );
  }

  const grouped = new Map<string, typeof lineup.items>();
  for (const item of lineup.items) {
    const key = `${item.songTitle}||${item.partLabel}||${item.lyrics}`;
    const list = grouped.get(key) || [];
    list.push(item);
    grouped.set(key, list);
  }
  const blocks = [...grouped.entries()].map(([key, items]) => ({
    key,
    item: items[0],
    repeats: items.length,
  }));

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" style={{ color: 'inherit' }}>
            <Wordmark />
          </Link>
          <div className="push" />
          <span className="badge">View only</span>
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
          </IconButton>
        </div>
      </header>

      <main className="app-main no-nav">
        <div className="share-hero">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {lineup.theme || 'Lineup'}
          </div>
          <h1>{lineup.name}</h1>
          <p className="small muted" style={{ marginTop: 6 }}>
            by {lineup.ownerName}
          </p>
        </div>

        <div className="row" style={{ gap: 8, padding: '0 4px 12px' }}>
          <button
            type="button"
            className="chip chip-button"
            onClick={() => setShowParts(!showParts)}
            aria-pressed={showParts}
          >
            <Icon.Note2 size={13} /> {showParts ? 'Hide lyrics' : 'Show lyrics'}
          </button>
          <button
            type="button"
            className="chip chip-button"
            onClick={() => {
              const text = blocks
                .map(({ item, repeats }) => {
                  const header = `${item.songTitle} — ${item.partLabel}${repeats > 1 ? ` (×${repeats})` : ''}`;
                  return `${header}\n${item.lyrics}`;
                })
                .join('\n\n');
              const body = `${lineup.name} — a lineup on Aria\n\n${text}`;
              navigator.clipboard.writeText(body).catch(() => {
                if (navigator.share) void navigator.share({ title: lineup.name, text: body });
              });
            }}
          >
            <Icon.Share size={13} /> Copy
          </button>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          {blocks.map(({ key, item, repeats }) => (
            <article className="card flush" key={key}>
              <div className="share-part" style={{ borderTop: 'none' }}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="eyebrow" style={{ marginBottom: 3 }}>
                      {item.partKind === 'prechorus' ? 'Pre-chorus' : item.partKind}
                      {repeats > 1 ? ` · repeated ×${repeats}` : ''}
                    </div>
                    <h2 className="serif" style={{ fontSize: 18, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                      {item.songTitle}
                    </h2>
                    <div className="tiny muted">{item.artist}</div>
                  </div>
                  <span className={`chip ${item.tempo}`} style={{ fontSize: 11, flexShrink: 0 }}>
                    {item.tempo === 'fast' ? <Icon.Bolt size={11} /> : <Icon.Wave size={11} />}
                    {item.tempo}
                  </span>
                </div>

                {showParts ? (
                  <div className="lyrics-lines">
                    {item.lyrics.split(/\n/).map((line, i) => (
                      <div className="lyric-line" key={i}>
                        {line || '\u00A0'}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    {item.partLabel}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="card tight" style={{ marginTop: 14, textAlign: 'center' }}>
          <p className="tiny muted">
            Shared from Aria · opening this link marks the lineup as used
          </p>
          <Link to="/">
            <Button size="sm" variant="soft" style={{ marginTop: 8 }}>
              <Icon.Note size={14} /> Build your own lineup
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
