import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon } from '../components/ui';
import { orderByLRU, reasonLabel, timeAgo } from '../lib/lru';
import { useStore } from '../lib/store';
import type { Lineup } from '../lib/types';

function formatLastUsed(l: Lineup) {
  if (!l.lastUsedAt) return 'Never used';
  const r = reasonLabel(l.lastUsedReason);
  return `Used ${timeAgo(l.lastUsedAt)}${r ? ` · ${r}` : ''}`;
}

type Scope = 'all' | 'mine' | 'team';

export function LineupsPage() {
  const { lineups, songs, teams, user } = useStore();
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const themes = useMemo(() => {
    const s = new Set<string>();
    lineups.forEach((l) => {
      if (l.theme) s.add(l.theme);
    });
    return Array.from(s).sort();
  }, [lineups]);

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lineups.filter((l) => {
      if (scope === 'mine' && (l.ownerId !== user?.id || l.teamId)) return false;
      if (scope === 'team' && !l.teamId) return false;
      if (themeFilter !== 'all' && l.theme !== themeFilter) return false;
      if (!q) return true;
      return `${l.name} ${l.theme}`.toLowerCase().includes(q);
    });
  }, [lineups, scope, themeFilter, query, user?.id]);

  const ordered = useMemo(() => orderByLRU(scoped), [scoped]);
  const recommendation = ordered[0] ?? null;

  const describe = (l: Lineup) => {
    const songIds = new Set<string>();
    let fast = 0;
    let slow = 0;
    const preview: string[] = [];
    for (const it of l.items) {
      const s = songs.find((x) => x.id === it.songId);
      if (!s) continue;
      songIds.add(s.id);
      if (s.tempo === 'fast') fast++;
      else slow++;
      const p = s.parts.find((pt) => pt.id === it.partId);
      if (preview.length < 3) {
        preview.push(`${s.title}${p ? ` (${p.label})` : ''}`);
      }
    }
    return { parts: l.items.length, songs: songIds.size, fast, slow, preview };
  };

  const hasFast = songs.some((s) => s.tempo === 'fast');
  const hasSlow = songs.some((s) => s.tempo === 'slow');
  const readyForLineup = songs.length >= 2 && hasFast && hasSlow;

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <span className="eyebrow">Rotation &amp; Setlists</span>
          <h1>Lineups</h1>
          <p>Ordered by least recently used so your rotation stays fresh.</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/lineups/new')}>
          <Icon name="add" size={16} /> New lineup
        </Button>
      </div>

      {lineups.length >= 3 && (
        <div className="search">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lineups…"
            aria-label="Search lineups"
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
      )}

      {teams.length > 0 && lineups.length > 0 && (
        <div className="seg">
          <button
            type="button"
            className={scope === 'all' ? 'active' : ''}
            onClick={() => setScope('all')}
          >
            All ({lineups.length})
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

      {themes.length > 0 && (
        <div className="filter-row">
          <button
            type="button"
            className={`filter-pill ${themeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setThemeFilter('all')}
          >
            All classes
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

      {recommendation && (
        <button
          type="button"
          className="lru-banner interactive"
          style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
          onClick={() => navigate(`/lineups/${recommendation.id}`)}
        >
          <div className="row-between">
            <span className="eyebrow">
              <Icon name="sparkle" size={12} /> Next up · Least recently used
            </span>
            <span className="tiny">
              <Icon
                name="clock"
                size={12}
                style={{ display: 'inline', verticalAlign: '-2px' }}
              />{' '}
              {formatLastUsed(recommendation)}
            </span>
          </div>
          <div className="row-between" style={{ gap: 10, marginTop: 2 }}>
            <h2 className="lru-title">{recommendation.name}</h2>
            <Icon name="chevronRight" size={18} />
          </div>
          {(() => {
            const d = describe(recommendation);
            return (
              <>
                {d.preview.length > 0 && (
                  <p className="small truncate" style={{ marginTop: 2 }}>
                    {d.preview.join(' → ')}
                    {d.parts > d.preview.length ? ` +${d.parts - d.preview.length} more` : ''}
                  </p>
                )}
                <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {recommendation.theme && <Chip tone="brand">{recommendation.theme}</Chip>}
                  <Chip>
                    {d.parts} parts · {d.songs} songs
                  </Chip>
                  <Chip tone="fast">
                    <Icon name="fast" size={12} /> {d.fast}
                  </Chip>
                  <Chip tone="slow">
                    <Icon name="slow" size={12} /> {d.slow}
                  </Chip>
                </div>
              </>
            );
          })()}
        </button>
      )}

      {ordered.length === 0 ? (
        <Empty
          icon="lineup"
          title={lineups.length === 0 ? 'No lineups yet' : 'No matching lineups'}
          body={
            lineups.length === 0
              ? readyForLineup
                ? 'Combine song parts across at least two songs — mixing Fast and Slow tempos — into a shareable sequence.'
                : 'To build your first lineup, add at least one Fast song and one Slow song to your library.'
              : 'Try clearing your search or class filter.'
          }
          action={
            lineups.length === 0 ? (
              readyForLineup ? (
                <Button variant="primary" onClick={() => navigate('/lineups/new')}>
                  <Icon name="add" size={16} /> Build your first lineup
                </Button>
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Button variant="primary" onClick={() => navigate('/songs/new')}>
                    <Icon name="add" size={16} /> Add a song
                  </Button>
                  <Button onClick={() => navigate('/lineups/new')}>Open builder</Button>
                </div>
              )
            ) : (
              <Button
                onClick={() => {
                  setQuery('');
                  setScope('all');
                  setThemeFilter('all');
                }}
              >
                Reset filters
              </Button>
            )
          }
        />
      ) : (
        <div className="stack-sm">
          {ordered.map((l) => {
            const d = describe(l);
            const team = l.teamId ? teams.find((t) => t.id === l.teamId) : null;
            return (
              <button
                key={l.id}
                type="button"
                className="card interactive"
                style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                onClick={() => navigate(`/lineups/${l.id}`)}
              >
                <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="song-card-title truncate">{l.name}</h3>
                    <div className="tiny" style={{ marginTop: 2 }}>
                      {formatLastUsed(l)}
                      {l.useCount > 0 ? ` · ${l.useCount}× used` : ''}
                    </div>
                  </div>
                  <Icon name="chevronRight" size={16} className="muted" />
                </div>

                {d.preview.length > 0 && (
                  <p className="song-card-excerpt truncate">
                    {d.preview.join(' → ')}
                    {d.parts > d.preview.length ? ` +${d.parts - d.preview.length}` : ''}
                  </p>
                )}

                <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {l.theme && <Chip tone="brand">{l.theme}</Chip>}
                  <Chip>
                    {d.parts} parts · {d.songs} songs
                  </Chip>
                  <Chip tone="fast">
                    <Icon name="fast" size={12} /> {d.fast}
                  </Chip>
                  <Chip tone="slow">
                    <Icon name="slow" size={12} /> {d.slow}
                  </Chip>
                  {team && (
                    <Chip>
                      <Icon name="teams" size={12} /> {team.name}
                    </Chip>
                  )}
                  {l.copiedFrom && <Chip>From {l.copiedFrom}</Chip>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
