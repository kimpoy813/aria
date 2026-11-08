import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, Icon, type ToastTone } from '../components/ui';
import { api } from '../lib/api';
import {
  orderByLRU,
  summarizeLineupSongs,
  summarizeSongsUsed,
  timeAgo,
} from '../lib/lru';
import { useStore } from '../lib/store';

export function HomePage() {
  const { lineups, songs, user, refresh, notify } = useStore();
  const navigate = useNavigate();
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [sharing, setSharing] = useState(false);

  const showToast = (msg: string, tone: ToastTone = 'success') => {
    notify(msg, tone);
  };

  const themes = useMemo(() => {
    const s = new Set<string>();
    lineups.forEach((l) => {
      if (l.theme) s.add(l.theme);
    });
    return Array.from(s).sort();
  }, [lineups]);

  const filtered = useMemo(() => {
    if (themeFilter === 'all') return lineups;
    return lineups.filter((l) => l.theme === themeFilter);
  }, [lineups, themeFilter]);

  const ordered = useMemo(() => orderByLRU(filtered), [filtered]);
  const featured = ordered[0] ?? null;
  const upNext = ordered.slice(1, 4);

  const featuredSongs = useMemo(
    () => (featured ? summarizeLineupSongs(featured, songs) : []),
    [featured, songs],
  );

  const allSongStats = useMemo(
    () => summarizeSongsUsed(songs, filtered),
    [songs, filtered],
  );
  const songsInLineups = useMemo(
    () => allSongStats.filter((s) => s.inLineupsCount > 0),
    [allSongStats],
  );
  const displayedSongStats =
    songsInLineups.length > 0 ? songsInLineups : allSongStats;

  const hasFast = songs.some((s) => s.tempo === 'fast');
  const hasSlow = songs.some((s) => s.tempo === 'slow');
  const canBuildLineup = songs.length >= 2 && hasFast && hasSlow;

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';

  const quickShareFeatured = async () => {
    if (!featured) return;
    setSharing(true);
    const shareUrl = `${window.location.origin}/s/${featured.shareToken}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: featured.name, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        /* ignore */
      }
    }
    try {
      await api.shareLineup(featured.id, 'link');
      await refresh();
      showToast('Shared · queue rotated');
    } catch {
      showToast('Link copied');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Home</h1>
          {lineups.length === 0 && <p>Hi {firstName}</p>}
        </div>
        <Button
          variant="primary"
          onClick={() => navigate(canBuildLineup ? '/lineups/new' : '/songs/new')}
        >
          <Icon name="add" size={16} /> {canBuildLineup ? 'Lineup' : 'Song'}
        </Button>
      </div>

      {themes.length > 1 && (
        <div className="filter-row" aria-label="Filter rotation by theme">
          <button
            type="button"
            className={`filter-pill ${themeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setThemeFilter('all')}
          >
            All
          </button>
          {themes.map((t) => (
            <button
              key={t}
              type="button"
              className={`filter-pill ${themeFilter === t ? 'active' : ''}`}
              onClick={() => setThemeFilter(themeFilter === t ? 'all' : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Minimal LRU Lineup Spotlight */}
      {featured ? (
        <section className="lru-card" aria-label="Least recently used lineup">
          <div className="row-between" style={{ gap: 8 }}>
            <span className="eyebrow">Least recently used</span>
            <span className="tiny">
              {featured.lastUsedAt ? timeAgo(featured.lastUsedAt) : 'Unused'}
            </span>
          </div>

          <div className="stack-xs">
            <h2 className="lru-card-title">{featured.name}</h2>
            {featured.theme && <span className="tiny">{featured.theme}</span>}
          </div>

          {featuredSongs.length > 0 && (
            <div className="lru-seq">
              {featuredSongs.map(({ song }, idx) => (
                <div key={`${song.id}_${idx}`} className="lru-seq-row">
                  <span className="lru-seq-num">{idx + 1}</span>
                  <span className="lru-seq-song truncate">{song.title}</span>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 8 }}>
            <Button
              variant="primary"
              style={{ flex: 2 }}
              onClick={() =>
                navigate(`/lineups/${featured.id}`, { state: { from: 'home' } })
              }
            >
              Open
            </Button>
            <Button
              style={{ flex: 1 }}
              disabled={sharing}
              onClick={quickShareFeatured}
            >
              <Icon name="share" size={14} /> {sharing ? '…' : 'Share'}
            </Button>
          </div>
        </section>
      ) : (
        <Empty
          icon="lineup"
          title="No lineups yet"
          body={canBuildLineup ? 'Create your first lineup.' : 'Add songs first.'}
          action={
            canBuildLineup ? (
              <Button variant="primary" onClick={() => navigate('/lineups/new')}>
                <Icon name="add" size={16} /> Create lineup
              </Button>
            ) : (
              <Button variant="primary" onClick={() => navigate('/songs/new')}>
                <Icon name="add" size={16} /> Add song
              </Button>
            )
          }
        />
      )}

      {/* Minimal Up Next Queue */}
      {upNext.length > 0 && (
        <div className="stack-sm">
          <div className="row-between">
            <span className="label">Up next</span>
            {ordered.length > upNext.length + 1 && (
              <button
                type="button"
                className="link-button tiny"
                onClick={() => navigate('/lineups')}
              >
                All ({ordered.length})
              </button>
            )}
          </div>

          <div className="list-group">
            {upNext.map((l) => {
              const songNames = summarizeLineupSongs(l, songs)
                .map((u) => u.song.title)
                .join(', ');
              return (
                <button
                  key={l.id}
                  type="button"
                  className="list-row"
                  onClick={() => navigate(`/lineups/${l.id}`, { state: { from: 'home' } })}
                >
                  <div className="list-row-body">
                    <div className="list-row-title truncate">{l.name}</div>
                    {songNames && <div className="tiny truncate">{songNames}</div>}
                  </div>
                  <span className="tiny" style={{ flexShrink: 0 }}>
                    {l.lastUsedAt ? timeAgo(l.lastUsedAt) : 'Unused'}
                  </span>
                  <Icon name="chevronRight" size={16} className="muted" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Minimal Songs Used List */}
      {displayedSongStats.length > 0 && (
        <div className="stack-sm">
          <div className="row-between">
            <span className="label">
              {songsInLineups.length > 0 ? 'Songs used' : 'Songs'}
            </span>
            <button
              type="button"
              className="link-button tiny"
              onClick={() => navigate('/songs')}
            >
              See all
            </button>
          </div>

          <div className="list-group">
            {displayedSongStats.slice(0, 6).map((stat) => (
              <button
                key={stat.song.id}
                type="button"
                className="list-row"
                onClick={() => navigate(`/songs/${stat.song.id}`)}
              >
                <div className="list-row-body">
                  <div className="list-row-title truncate">{stat.song.title}</div>
                </div>
                <span className="tiny" style={{ flexShrink: 0 }}>
                  {stat.lastUsedAt ? timeAgo(stat.lastUsedAt) : 'Unused'}
                </span>
                <Icon name="chevronRight" size={16} className="muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
