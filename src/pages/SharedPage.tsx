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
            <Wordmark size={24} />
          </Link>
          <div className="push" />
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
                <Chip>{lineup.items.length} parts</Chip>
                <span className="tiny">by {lineup.ownerName}</span>
              </div>
            </div>

            <div className="stack-sm">
              {lineup.items.map((item, i) => {
                const lines = item.lyrics.split(/\r?\n/);
                return (
                  <div key={i} className="part-block">
                    <div className="part-head">
                      <span className="part-index">{i + 1}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="part-title truncate">{item.songTitle}</div>
                        <div className="tiny">{item.partLabel}</div>
                      </div>
                      <Chip tone={item.tempo}>
                        {item.tempo === 'fast' ? 'Fast' : 'Slow'}
                      </Chip>
                    </div>
                    <div className="part-body">
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

            <div className="row-between" style={{ paddingTop: 6 }}>
              <span className="tiny">Shared via Aria</span>
              <Button onClick={copyUrl}>
                <Icon name="copy" size={14} /> Copy link
              </Button>
            </div>
          </div>
        )}
      </main>
      <Toast message={toast} />
    </div>
  );
}
