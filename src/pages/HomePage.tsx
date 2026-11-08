import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon, type ToastTone } from '../components/ui';
import { api } from '../lib/api';
import {
  orderByLRU,
  reasonLabel,
  resolveSequence,
  summarizeLineupSongs,
  summarizeSongsUsed,
  timeAgo,
} from '../lib/lru';
import { useStore } from '../lib/store';

export function HomePage() {
  const { lineups, songs, teams, user, refresh, notify } = useStore();
  const navigate = useNavigate();
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [songScope, setSongScope] = useState<'used' | 'all'>('used');
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

  const featuredEntries = useMemo(
    () => (featured ? resolveSequence(featured, songs) : []),
    [featured, songs],
  );
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
    songScope === 'used' && songsInLineups.length > 0 ? songsInLineups : allSongStats;

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
              ? 'Least recently used lineup & songs'
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
              {featured.theme && <Chip>{featured.theme}</Chip>}
              <Chip>
                {featuredSongs.length} {featuredSongs.length === 1 ? 'song' : 'songs'} ·{' '}
                {featuredEntries.length} parts
              </Chip>
              {teamName(featured.teamId) && <Chip>{teamName(featured.teamId)}</Chip>}
            </div>
          </div>

          {featuredSongs.length > 0 && (
            <div className="lru-seq">
              <div className="lru-seq-head">
                <span className="tiny" style={{ fontWeight: 600 }}>
                  Songs used ({featuredSongs.length})
                </span>
              </div>
              {featuredSongs.map(({ song, parts }, idx) => {
                return (
                  <div key={`${song.id}_${idx}`} className="lru-song-item">
                    <span className="lru-seq-num">{idx + 1}</span>
                    <div className="lru-song-body">
                      <div className="row-between" style={{ gap: 6 }}>
                        <span className="lru-seq-song truncate">{song.title}</span>
                        <span className="tiny">
                          {song.tempo === 'fast' ? 'Fast' : 'Slow'}
                        </span>
                      </div>
                      <div className="tiny truncate">{parts.join(' · ')}</div>
                    </div>
                  </div>
                );
              })}
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
              ? 'Create your first lineup and Aria will keep your least recently used set and songs right here.'
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
            {upNext.map((l, i) => {
              const usedSongs = summarizeLineupSongs(l, songs);
              const songNames = usedSongs.map((u) => u.song.title).join(' · ');
              return (
                <button
                  key={l.id}
                  type="button"
                  className="list-row"
                  onClick={() => navigate(`/lineups/${l.id}`, { state: { from: 'home' } })}
                >
                  <span className="part-index">{i + 2}</span>
                  <div className="list-row-body">
                    <div className="list-row-title truncate">{l.name}</div>
                    {songNames && (
                      <div className="small truncate" style={{ fontSize: 12.5 }}>
                        {songNames}
                      </div>
                    )}
                    <div className="tiny truncate">
                      {usedSongs.length} {usedSongs.length === 1 ? 'song' : 'songs'} ·{' '}
                      {l.items.length} parts · {timeAgo(l.lastUsedAt)}
                    </div>
                  </div>
                  {l.theme && <Chip>{l.theme}</Chip>}
                  <Icon name="chevronRight" size={16} className="muted" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Songs Used (LRU Song Rotation) */}
      {songs.length > 0 && (
        <div className="stack-sm">
          <div className="row-between">
            <span className="label">
              {songsInLineups.length > 0 && songScope === 'used'
                ? `Songs used in lineups (${songsInLineups.length})`
                : `Song rotation (${allSongStats.length})`}
            </span>
            <div className="row" style={{ gap: 10 }}>
              {songsInLineups.length > 0 && songsInLineups.length < allSongStats.length && (
                <button
                  type="button"
                  className="link-button tiny"
                  onClick={() =>
                    setSongScope((prev) => (prev === 'used' ? 'all' : 'used'))
                  }
                >
                  {songScope === 'used' ? 'Show all songs' : 'Used only'}
                </button>
              )}
              <button
                type="button"
                className="link-button tiny"
                onClick={() => navigate('/songs')}
              >
                Library
              </button>
            </div>
          </div>

          <div className="list-group">
            {displayedSongStats.slice(0, 8).map((stat) => {
              const statusText = stat.lastUsedAt
                ? `Last used ${timeAgo(stat.lastUsedAt)}${
                    stat.lastLineupName ? ` · ${stat.lastLineupName}` : ''
                  }`
                : stat.inLineupsCount > 0
                  ? `In ${stat.inLineupsCount} ${
                      stat.inLineupsCount === 1 ? 'lineup' : 'lineups'
                    } (${stat.lineupNames.slice(0, 2).join(', ')}) · never shared`
                  : 'Not in a lineup yet';
              return (
                <button
                  key={stat.song.id}
                  type="button"
                  className="list-row"
                  onClick={() => navigate(`/songs/${stat.song.id}`)}
                >
                  <div className="list-row-body">
                    <div className="list-row-title truncate">{stat.song.title}</div>
                    <div className="tiny truncate">{statusText}</div>
                  </div>
                  <Chip>{stat.song.tempo === 'fast' ? 'Fast' : 'Slow'}</Chip>
                  <Icon name="chevronRight" size={16} className="muted" />
                </button>
              );
            })}
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
    </div>
  );
}
