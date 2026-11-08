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

  const hasActiveFilters =
    Boolean(query.trim()) || scope !== 'all' || tempoFilter !== 'all' || themeFilter !== 'all';

  if (songs.length === 0) {
    return (
      <div className="stack">
        <div className="page-head-row">
          <div className="page-head">
            <h1>Songs</h1>
          </div>
          <Button variant="primary" onClick={() => navigate('/songs/new')}>
            <Icon name="add" size={16} /> Add
          </Button>
        </div>

        <Empty
          icon="songs"
          title="No songs yet"
          body="Add your first song to classify its lyrics and build balanced lineups."
          action={
            <Button variant="primary" onClick={() => navigate('/songs/new')}>
              <Icon name="add" size={16} /> Add song
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Songs</h1>
          <p>{songs.length} in library</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/songs/new')}>
          <Icon name="add" size={16} /> Add
        </Button>
      </div>

      <div className="search">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs or lyrics…"
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
            All
          </button>
          <button
            type="button"
            className={scope === 'mine' ? 'active' : ''}
            onClick={() => setScope('mine')}
          >
            Mine
          </button>
          <button
            type="button"
            className={scope === 'team' ? 'active' : ''}
            onClick={() => setScope('team')}
          >
            Shared
          </button>
        </div>
      )}

      <div className="filter-row" aria-label="Filters">
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
          Fast
        </button>
        <button
          type="button"
          className={`filter-pill ${tempoFilter === 'slow' ? 'active' : ''}`}
          onClick={() => setTempoFilter(tempoFilter === 'slow' ? 'all' : 'slow')}
        >
          Slow
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
          title="No matches"
          body="Nothing matched your current search or filter."
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
                Reset
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="list-group">
          {filtered.map((song) => (
            <button
              key={song.id}
              type="button"
              className="list-row"
              onClick={() => navigate(`/songs/${song.id}`)}
            >
              <span className={`tempo-dot ${song.tempo}`} aria-hidden="true" />
              <div className="list-row-body">
                <div className="list-row-title truncate">{song.title}</div>
                <div className="tiny truncate">
                  {song.artist || 'Unknown artist'} · {song.parts.length}{' '}
                  {song.parts.length === 1 ? 'part' : 'parts'}
                </div>
              </div>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                {song.theme && <Chip tone="brand">{song.theme}</Chip>}
                <Chip tone={song.tempo}>{song.tempo === 'fast' ? 'Fast' : 'Slow'}</Chip>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
