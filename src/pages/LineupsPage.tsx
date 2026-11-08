import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon } from '../components/ui';
import { orderByLRU, timeAgo } from '../lib/lru';
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
  const nextUp = ordered[0] ?? null;

  const describe = (l: Lineup) => {
    const songIds = new Set<string>();
    for (const it of l.items) {
      const s = songs.find((x) => x.id === it.songId);
      if (s) songIds.add(s.id);
    }
    return { parts: l.items.length, songs: songIds.size };
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

      {nextUp && ordered.length > 1 && (
        <button
          type="button"
          className="lru-banner"
          onClick={() => navigate(`/lineups/${nextUp.id}`)}
        >
          <div className="row-between">
            <span className="eyebrow">Suggested next</span>
            <span className="tiny">{timeAgo(nextUp.lastUsedAt)}</span>
          </div>
          <div className="row-between" style={{ gap: 8 }}>
            <span className="lru-title truncate">{nextUp.name}</span>
            <Icon name="chevronRight" size={16} className="muted" />
          </div>
        </button>
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
                  <div className="tiny truncate">
                    {d.parts} parts · {d.songs} songs · {timeAgo(l.lastUsedAt)}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {l.theme && <Chip tone="brand">{l.theme}</Chip>}
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
