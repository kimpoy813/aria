import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon } from '../components/ui';
import { orderByLRU, summarizeLineupSongs, timeAgo } from '../lib/lru';
import { useStore } from '../lib/store';
import type { Lineup } from '../lib/types';

type Scope = 'all' | 'mine' | 'team';

export function LineupsPage() {
  const { lineups, songs, teams, user } = useStore();
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');

  const themes = useMemo(() => {
    const s = new Set<string>();
    lineups.forEach((l) => {
      if (l.theme) s.add(l.theme);
    });
    return Array.from(s).sort();
  }, [lineups]);

  const scoped = useMemo(() => {
    return lineups.filter((l) => {
      if (scope === 'mine' && (l.ownerId !== user?.id || l.teamId)) return false;
      if (scope === 'team' && !l.teamId) return false;
      if (themeFilter !== 'all' && l.theme !== themeFilter) return false;
      return true;
    });
  }, [lineups, scope, themeFilter, user?.id]);

  const ordered = useMemo(() => orderByLRU(scoped), [scoped]);

  const describe = (l: Lineup) => {
    const usedSongs = summarizeLineupSongs(l, songs);
    return {
      parts: l.items.length,
      songs: usedSongs.length,
      songNames: usedSongs.map((u) => u.song.title).join(' · '),
    };
  };

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Lineups</h1>
          {lineups.length > 0 && <p>Least recently used first</p>}
        </div>
        <Button variant="primary" onClick={() => navigate('/lineups/new')}>
          <Icon name="add" size={16} /> New
        </Button>
      </div>

      {teams.length > 0 && lineups.length > 0 && (
        <div className="seg">
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

      {themes.length > 0 && (
        <div className="filter-row">
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

      {ordered.length === 0 ? (
        <Empty
          icon="lineup"
          title={lineups.length === 0 ? 'No lineups yet' : 'No matches'}
          body={
            lineups.length === 0
              ? 'Combine parts from at least two songs — mixing fast and slow tempos — into a setlist.'
              : 'Nothing matched that filter.'
          }
          action={
            lineups.length === 0 ? (
              <Button variant="primary" onClick={() => navigate('/lineups/new')}>
                <Icon name="add" size={16} /> Create lineup
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setScope('all');
                  setThemeFilter('all');
                }}
              >
                Reset
              </Button>
            )
          }
        />
      ) : (
        <div className="list-group">
          {ordered.map((l) => {
            const d = describe(l);
            return (
              <button
                key={l.id}
                type="button"
                className="list-row"
                onClick={() => navigate(`/lineups/${l.id}`)}
              >
                <div className="list-row-body">
                  <div className="list-row-title truncate">{l.name}</div>
                  {d.songNames && (
                    <div className="small truncate" style={{ fontSize: 12.5 }}>
                      {d.songNames}
                    </div>
                  )}
                  <div className="tiny truncate">
                    {d.songs} {d.songs === 1 ? 'song' : 'songs'} · {d.parts} parts ·{' '}
                    {timeAgo(l.lastUsedAt)}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {l.theme && <Chip>{l.theme}</Chip>}
                  <Icon name="chevronRight" size={16} className="muted" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
