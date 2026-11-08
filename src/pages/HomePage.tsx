import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon, Toast } from '../components/ui';
import { api } from '../lib/api';
import {
  lineupTempoMix,
  orderByLRU,
  reasonLabel,
  resolveSequence,
  timeAgo,
} from '../lib/lru';
import { useStore } from '../lib/store';

export function HomePage() {
  const { lineups, songs, teams, user, refresh } = useStore();
  const navigate = useNavigate();
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
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

  const featuredEntries = useMemo(
    () => (featured ? resolveSequence(featured, songs) : []),
    [featured, songs],
  );
  const featuredMix = useMemo(
    () => (featured ? lineupTempoMix(featured, songs) : { fast: 0, slow: 0, total: 0 }),
    [featured, songs],
  );
  const featuredSongCount = useMemo(
    () => new Set(featuredEntries.map((e) => e.song.id)).size,
    [featuredEntries],
  );

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

  const teamName = (teamId: string | null) =>
    teamId ? teams.find((t) => t.id === teamId)?.name ?? null : null;

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Home</h1>
          <p>
            {lineups.length > 0
              ? 'Least recently used lineup'
              : `Hi ${firstName} — build your rotation`}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => navigate(canBuildLineup ? '/lineups/new' : '/songs/new')}
        >
          <Icon name="add" size={16} /> {canBuildLineup ? 'Lineup' : 'Song'}
        </Button>
      </div>

      {themes.length > 1 && (
        <div className="filter-row" aria-label="Filter rotation by class">
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

      {/* LRU Lineup Spotlight */}
      {featured ? (
        <section className="lru-card" aria-label="Least recently used lineup">
          <div className="row-between" style={{ gap: 8 }}>
            <span className="eyebrow">Least recently used</span>
            <span className="tiny">
              {featured.lastUsedAt
                ? `${timeAgo(featured.lastUsedAt)} · ${reasonLabel(featured.lastUsedReason)}`
                : 'Never used'}
            </span>
          </div>

          <div className="stack-xs">
            <h2 className="lru-card-title">{featured.name}</h2>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {featured.theme && <Chip tone="brand">{featured.theme}</Chip>}
              <Chip>
                {featuredEntries.length} parts · {featuredSongCount} songs
              </Chip>
              <Chip tone="fast">{featuredMix.fast} fast</Chip>
              <Chip tone="slow">{featuredMix.slow} slow</Chip>
              {teamName(featured.teamId) && <Chip>{teamName(featured.teamId)}</Chip>}
            </div>
          </div>

          {featuredEntries.length > 0 && (
            <div className="lru-seq">
              {featuredEntries.slice(0, 5).map((entry, idx) => (
                <div key={entry.itemId} className="lru-seq-row">
                  <span className="lru-seq-num">{idx + 1}</span>
                  <span className={`tempo-dot ${entry.song.tempo}`} />
                  <span className="lru-seq-song truncate">{entry.song.title}</span>
                  <span className="tiny">{entry.partLabel}</span>
                </div>
              ))}
              {featuredEntries.length > 5 && (
                <div className="tiny" style={{ paddingLeft: 24 }}>
                  +{featuredEntries.length - 5} more parts
                </div>
              )}
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
              Open lineup
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
          title="No LRU lineup yet"
          body={
            canBuildLineup
              ? 'Create your first lineup and Aria will keep your least recently used set right here.'
              : 'Add at least one fast song and one slow song, then build a lineup to start your LRU rotation.'
          }
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

      {/* Upcoming LRU Queue */}
      {upNext.length > 0 && (
        <div className="stack-sm">
          <div className="row-between">
            <span className="label">Up next in rotation</span>
            <button
              type="button"
              className="link-button tiny"
              onClick={() => navigate('/lineups')}
            >
              See all ({ordered.length})
            </button>
          </div>

          <div className="list-group">
            {upNext.map((l, i) => (
              <button
                key={l.id}
                type="button"
                className="list-row"
                onClick={() => navigate(`/lineups/${l.id}`, { state: { from: 'home' } })}
              >
                <span className="part-index">{i + 2}</span>
                <div className="list-row-body">
                  <div className="list-row-title truncate">{l.name}</div>
                  <div className="tiny truncate">
                    {l.items.length} parts · {timeAgo(l.lastUsedAt)}
                  </div>
                </div>
                {l.theme && <Chip tone="brand">{l.theme}</Chip>}
                <Icon name="chevronRight" size={16} className="muted" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Minimalist Quick Navigation Tiles */}
      <div className="home-stats">
        <button type="button" className="home-stat" onClick={() => navigate('/songs')}>
          <strong>{songs.length}</strong>
          <span>Songs</span>
        </button>
        <button type="button" className="home-stat" onClick={() => navigate('/lineups')}>
          <strong>{lineups.length}</strong>
          <span>Lineups</span>
        </button>
        <button type="button" className="home-stat" onClick={() => navigate('/teams')}>
          <strong>{teams.length}</strong>
          <span>Teams</span>
        </button>
      </div>

      <Toast message={toast} />
    </div>
  );
}
