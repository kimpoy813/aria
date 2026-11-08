import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LyricView } from '../components/LyricView';
import { Wordmark } from '../components/Logo';
import { Button, Chip, Empty, Icon, IconButton, type ToastTone } from '../components/ui';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { SharedLineup } from '../lib/types';

export function SharedPage() {
  const { token } = useParams();
  const { theme, toggleTheme, notify } = useStore();
  const [lineup, setLineup] = useState<SharedLineup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [largeText, setLargeText] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .shared(token)
      .then((res) => {
        setLineup(res.lineup);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Invalid link'))
      .finally(() => setLoading(false));
  }, [token]);

  const showToast = (msg: string, tone: ToastTone = 'success') => {
    notify(msg, tone);
  };

  const tempoCounts = useMemo(() => {
    if (!lineup) return { fast: 0, slow: 0 };
    const fast = lineup.items.filter((i) => i.tempo === 'fast').length;
    return { fast, slow: lineup.items.length - fast };
  }, [lineup]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Link copied', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  const copyAllLyrics = async () => {
    if (!lineup) return;
    const formatted = [
      lineup.name,
      lineup.theme ? `Class: ${lineup.theme}` : '',
      '',
      ...lineup.items.map(
        (it, idx) =>
          `${idx + 1}. ${it.songTitle} — ${it.partLabel} (${it.tempo === 'fast' ? 'Fast' : 'Slow'})\n${it.lyrics.trim()}`,
      ),
    ]
      .filter((line, idx) => idx !== 1 || Boolean(line))
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(formatted);
      showToast('Lyrics copied', 'success');
    } catch {
      showToast('Could not copy lyrics', 'error');
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand-home" style={{ textDecoration: 'none' }}>
            <Wordmark size={24} />
          </Link>
          <div className="push" />
          {lineup && lineup.items.length > 0 && (
            <button
              type="button"
              className={`text-size-btn ${largeText ? 'active' : ''}`}
              aria-label={largeText ? 'Standard text size' : 'Larger lyric text'}
              aria-pressed={largeText}
              onClick={() => setLargeText((v) => !v)}
            >
              Aa
            </button>
          )}
          <IconButton
            label="Copy link"
            className="icon-btn-ghost"
            onClick={copyUrl}
          >
            <Icon name="copy" size={16} />
          </IconButton>
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="icon-btn-ghost"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
        </div>
      </header>

      <main className="app-main no-nav">
        {loading ? (
          <div className="overlay-center" style={{ minHeight: '50vh' }}>
            <span className="tiny">Loading…</span>
          </div>
        ) : error || !lineup ? (
          <Empty
            icon="link"
            title="Link unavailable"
            body={error ?? 'Ask the sender for an updated link.'}
            action={
              <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                Open Aria
              </Link>
            }
          />
        ) : (
          <div className="stack">
            <div className="stack-xs">
              <h1 className="detail-title">{lineup.name}</h1>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {lineup.theme && <Chip tone="brand">{lineup.theme}</Chip>}
                <Chip>
                  {lineup.items.length} parts · {lineup.songCount} songs
                </Chip>
                {tempoCounts.fast > 0 && <Chip tone="fast">{tempoCounts.fast} fast</Chip>}
                {tempoCounts.slow > 0 && <Chip tone="slow">{tempoCounts.slow} slow</Chip>}
              </div>
              {lineup.ownerName && (
                <span className="tiny">Shared by {lineup.ownerName}</span>
              )}
            </div>

            {lineup.items.length === 0 ? (
              <Empty
                icon="lyrics"
                title="No parts in this lineup"
                body="The sender has not added lyric sections to this lineup yet."
              />
            ) : (
              <div className="stack-sm">
                {lineup.items.map((item, i) => {
                  const showArtist =
                    Boolean(item.artist) &&
                    item.artist.toLowerCase() !== 'unknown artist';
                  return (
                    <article key={i} className="part-block">
                      <div className="part-head">
                        <span className="part-index">{i + 1}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="part-title truncate">{item.songTitle}</div>
                          <div className="tiny truncate">
                            {item.partLabel}
                            {showArtist ? ` · ${item.artist}` : ''}
                          </div>
                        </div>
                        <Chip tone={item.tempo}>
                          {item.tempo === 'fast' ? 'Fast' : 'Slow'}
                        </Chip>
                      </div>
                      <div className="part-body">
                        <LyricView lyrics={item.lyrics} large={largeText} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="row" style={{ gap: 8, paddingTop: 4 }}>
              <Button onClick={copyAllLyrics} style={{ flex: 1 }}>
                <Icon name="lyrics" size={14} /> Copy lyrics
              </Button>
              <Button onClick={copyUrl} style={{ flex: 1 }}>
                <Icon name="link" size={14} /> Copy link
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
