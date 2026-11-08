import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Chip, Empty, Icon, IconButton, Toast } from '../components/ui';
import { Wordmark } from '../components/Logo';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { SharedLineup } from '../lib/types';

export function SharedPage() {
  const { token } = useParams();
  const { theme, toggleTheme } = useStore();
  const [lineup, setLineup] = useState<SharedLineup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

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

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast('Link copied');
      setTimeout(() => setToast(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand-home" style={{ textDecoration: 'none' }}>
            <Wordmark size={28} subtitle="Shared Program" />
          </Link>
          <div className="push" />
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
        </div>
      </header>

      <main className="app-main no-nav">
        {loading ? (
          <div className="overlay-center" style={{ minHeight: '50vh' }}>
            <span className="small">Loading shared program…</span>
          </div>
        ) : error || !lineup ? (
          <Empty
            icon="link"
            title="This share link isn’t active"
            body={error ?? 'Ask the sender for an updated lineup link.'}
            action={
              <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                Open Aria Studio
              </Link>
            }
          />
        ) : (
          <div className="stack">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="share-hero stack-xs">
                <span className="eyebrow" style={{ justifyContent: 'center' }}>
                  Shared Lineup
                </span>
                <h1>{lineup.name}</h1>
                <div
                  className="row"
                  style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}
                >
                  {lineup.theme && <Chip tone="brand">{lineup.theme}</Chip>}
                  <Chip>{lineup.items.length} parts</Chip>
                  <Chip>Curated by {lineup.ownerName}</Chip>
                </div>
              </div>

              {lineup.items.map((item, i) => {
                const lines = item.lyrics.split(/\r?\n/);
                return (
                  <div key={i} className="share-part">
                    <div className="row-between" style={{ gap: 8 }}>
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        <span className="part-index">{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15 }} className="truncate">
                            {item.songTitle}
                          </div>
                          <div className="tiny">
                            {item.partLabel}
                            {item.artist ? ` · ${item.artist}` : ''}
                          </div>
                        </div>
                      </div>
                      <Chip tone={item.tempo}>
                        <Icon name={item.tempo} size={12} />
                        {item.tempo === 'fast' ? 'Fast' : 'Slow'}
                      </Chip>
                    </div>
                    <div className="lyrics-lines">
                      {lines.map((l, li) => (
                        <div key={li} className="lyric-line">
                          {l || '\u00A0'}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Made with Aria</div>
                <div className="tiny">Read-only lyric program · edits stay with the creator</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={copyUrl}>
                  <Icon name="copy" size={14} /> Copy link
                </Button>
                <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                  Open Aria
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
      <Toast message={toast} />
    </div>
  );
}
