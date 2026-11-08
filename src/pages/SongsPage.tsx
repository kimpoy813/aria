import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon } from '../components/ui';
import { useStore } from '../lib/store';
import type { Tempo } from '../lib/types';

type Scope = 'all' | 'mine' | 'team';
type TempoFilter = 'all' | Tempo;

export function SongsPage() {
  const { songs, teams, user } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [tempoFilter, setTempoFilter] = useState<TempoFilter>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');

  const themes = useMemo(() => {
    const set = new Set<string>();
    songs.forEach((s) => {
      if (s.theme) set.add(s.theme);
    });
    return Array.from(set).sort();
  }, [songs]);

  const counts = useMemo(() => {
    let fast = 0;
    let slow = 0;
    for (const s of songs) {
      if (s.tempo === 'fast') fast++;
      else slow++;
    }
    return { fast, slow };
  }, [songs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs
      .filter((s) => {
        if (scope === 'mine' && (s.ownerId !== user?.id || s.teamId)) return false;
        if (scope === 'team' && !s.teamId) return false;
        if (tempoFilter !== 'all' && s.tempo !== tempoFilter) return false;
        if (themeFilter !== 'all' && s.theme !== themeFilter) return false;
        if (!q) return true;
        const hay = [
          s.title,
          s.artist,
          s.theme,
          s.analysis?.message ?? '',
          ...s.parts.map((p) => `${p.label} ${p.lyrics}`),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [songs, scope, tempoFilter, themeFilter, query, user?.id]);

  const teamName = (teamId: string | null) =>
    teamId ? teams.find((t) => t.id === teamId)?.name ?? 'Team' : null;

  const hasActiveFilters =
    Boolean(query.trim()) || scope !== 'all' || tempoFilter !== 'all' || themeFilter !== 'all';

  if (songs.length === 0) {
    return (
      <div className="stack">
        <div className="page-head-row">
          <div className="page-head">
            <span className="eyebrow">Song Library</span>
            <h1>Songs</h1>
            <p>Your lyric-structured repertoire lives here.</p>
          </div>
          <Button variant="primary" onClick={() => navigate('/songs/new')}>
            <Icon name="add" size={16} /> New song
          </Button>
        </div>

        <div className="welcome-panel">
          <div className="welcome-badge">
            <Icon name="sparkle" size={16} /> Clean Studio Workspace
          </div>
          <h2>Start building your repertoire</h2>
          <p className="small">
            Add songs section by section — or paste full lyrics at once — to classify their message
            and arrange balanced Fast &amp; Slow lineups.
          </p>

          <div className="welcome-steps">
            <div className="welcome-step">
              <span className="welcome-num">1</span>
              <div>
                <strong>Add song parts</strong>
                <span className="small">Verses, choruses, bridges &amp; outros</span>
              </div>
            </div>
            <div className="welcome-step">
              <span className="welcome-num">2</span>
              <div>
                <strong>Classify lyrics</strong>
                <span className="small">Auto-detect theme &amp; emotional message</span>
              </div>
            </div>
            <div className="welcome-step">
              <span className="welcome-num">3</span>
              <div>
                <strong>Build setlists</strong>
                <span className="small">Mix parts into balanced, shareable lineups</span>
              </div>
            </div>
          </div>

          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <Button variant="primary" onClick={() => navigate('/songs/new')}>
              <Icon name="add" size={16} /> Add your first song
            </Button>
            <Button onClick={() => navigate('/teams')}>
              <Icon name="teams" size={16} /> Join or create a team
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <span className="eyebrow">
            {songs.length} {songs.length === 1 ? 'song' : 'songs'} · {counts.fast} fast ·{' '}
            {counts.slow} slow
          </span>
          <h1>Songs</h1>
        </div>
        <Button variant="primary" onClick={() => navigate('/songs/new')}>
          <Icon name="add" size={16} /> New song
        </Button>
      </div>

      <div className="search">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, artists, lyrics, or messages…"
          aria-label="Search songs"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {teams.length > 0 && (
        <div className="seg" role="tablist" aria-label="Library scope">
          <button
            type="button"
            className={scope === 'all' ? 'active' : ''}
            onClick={() => setScope('all')}
          >
            All ({songs.length})
          </button>
          <button
            type="button"
            className={scope === 'mine' ? 'active' : ''}
            onClick={() => setScope('mine')}
          >
            Personal
          </button>
          <button
            type="button"
            className={scope === 'team' ? 'active' : ''}
            onClick={() => setScope('team')}
          >
            From teams
          </button>
        </div>
      )}

      <div className="filter-row" aria-label="Filter by tempo and class">
        <button
          type="button"
          className={`filter-pill ${tempoFilter === 'all' && themeFilter === 'all' ? 'active' : ''}`}
          onClick={() => {
            setTempoFilter('all');
            setThemeFilter('all');
          }}
        >
          All
        </button>
        <button
          type="button"
          className={`filter-pill ${tempoFilter === 'fast' ? 'active' : ''}`}
          onClick={() => setTempoFilter(tempoFilter === 'fast' ? 'all' : 'fast')}
        >
          <Icon name="fast" size={12} /> Fast
        </button>
        <button
          type="button"
          className={`filter-pill ${tempoFilter === 'slow' ? 'active' : ''}`}
          onClick={() => setTempoFilter(tempoFilter === 'slow' ? 'all' : 'slow')}
        >
          <Icon name="slow" size={12} /> Slow
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

      {filtered.length === 0 ? (
        <Empty
          icon="search"
          title="No matching songs"
          body="Try broadening your search or clearing the active tempo and class filters."
          action={
            hasActiveFilters ? (
              <Button
                onClick={() => {
                  setQuery('');
                  setScope('all');
                  setTempoFilter('all');
                  setThemeFilter('all');
                }}
              >
                Reset filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="stack-sm">
          {filtered.map((song) => {
            const tName = teamName(song.teamId);
            const firstExcerpt =
              song.analysis?.message ||
              song.parts
                .flatMap((p) => p.lyrics.split(/\r?\n/))
                .map((l) => l.trim())
                .find(Boolean) ||
              '';
            return (
              <button
                key={song.id}
                type="button"
                className="card interactive song-card"
                onClick={() => navigate(`/songs/${song.id}`)}
              >
                <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="song-card-title truncate">{song.title}</h3>
                    <div className="small truncate">{song.artist || 'Unknown artist'}</div>
                  </div>
                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                    <Chip tone={song.tempo}>
                      <Icon name={song.tempo} size={12} />
                      {song.tempo === 'fast' ? 'Fast' : 'Slow'}
                    </Chip>
                    <Icon name="chevronRight" size={16} className="muted" />
                  </div>
                </div>

                {firstExcerpt && <p className="song-card-excerpt truncate">{firstExcerpt}</p>}

                <div className="song-card-foot">
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {song.theme && <Chip tone="brand">{song.theme}</Chip>}
                    <Chip>
                      {song.parts.length} {song.parts.length === 1 ? 'part' : 'parts'}
                    </Chip>
                    {tName && (
                      <Chip>
                        <Icon name="teams" size={12} /> {tName}
                      </Chip>
                    )}
                    {song.copiedFrom && <Chip>From {song.copiedFrom}</Chip>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
