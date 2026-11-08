import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LyricView } from '../components/LyricView';
import { Wordmark } from '../components/Logo';
import { Button, Empty, Icon, IconButton, type ToastTone } from '../components/ui';
import { api } from '../lib/api';
import { groupLineupSongBlocks } from '../lib/lru';
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

  const songBlocks = useMemo(() => {
    if (!lineup) return [];
    return groupLineupSongBlocks(lineup.items);
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
    if (!lineup || songBlocks.length === 0) return;
    const formatted = [
      lineup.name,
      '',
      ...songBlocks.map((block, idx) => {
        const body = block.sections
          .map((sec) =>
            sec.isRepeat
              ? `↻ ${sec.partLabel}`
              : `${sec.partLabel}\n${sec.lyrics.trim()}`,
          )
          .join('\n\n');
        return `${idx + 1}. ${block.songTitle}\n\n${body}`;
      }),
    ].join('\n\n');

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
              <span className="tiny">
                {songBlocks.length} {songBlocks.length === 1 ? 'song' : 'songs'}
              </span>
            </div>

            {songBlocks.length === 0 ? (
              <Empty
                icon="lyrics"
                title="No songs in this lineup"
                body="The sender has not added lyric sections to this lineup yet."
              />
            ) : (
              <div className="stack">
                {songBlocks.map((block, i) => (
                  <article key={block.key} className="song-group-block">
                    <div className="song-group-head">
                      <span className="part-index">{i + 1}</span>
                      <h2 className="song-group-title truncate">{block.songTitle}</h2>
                    </div>

                    <div className="song-group-sections">
                      {block.sections.map((sec) =>
                        sec.isRepeat ? (
                          <div key={sec.key} className="song-section-repeat">
                            ↻ {sec.partLabel}
                          </div>
                        ) : (
                          <div key={sec.key} className="song-section">
                            {!(
                              block.sections.length === 1 &&
                              sec.partLabel.toLowerCase() === 'part'
                            ) && (
                              <div className="song-section-label">{sec.partLabel}</div>
                            )}
                            <LyricView lyrics={sec.lyrics} large={largeText} />
                          </div>
                        ),
                      )}
                    </div>
                  </article>
                ))}
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
