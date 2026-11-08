import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon } from '../components/ui';
import { api } from '../lib/api';
import { orderByLRU, summarizeLineupSongs, timeAgo } from '../lib/lru';
import { useStore } from '../lib/store';
import type { Lineup } from '../lib/types';

type Scope = 'all' | 'mine' | 'team';

export function LineupsPage() {
  const { lineups, songs, teams, user, refresh, notify } = useStore();
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const copiedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const l of lineups) {
      if (l.ownerId === user?.id && l.sourceLineupId) {
        set.add(l.sourceLineupId);
      }
    }
    return set;
  }, [lineups, user?.id]);

  const themes = useMemo(() => {
    const s = new Set<string>();
    lineups.forEach((l) => {
      if (l.theme) s.add(l.theme);
    });
    return Array.from(s).sort();
  }, [lineups]);

  const scoped = useMemo(() => {
    return lineups.filter((l) => {
      if (scope === 'mine' && l.ownerId !== user?.id) return false;
      if (scope === 'team' && l.ownerId === user?.id) return false;
      if (themeFilter !== 'all' && l.theme !== themeFilter) return false;
      return true;
    });
  }, [lineups, scope, themeFilter, user?.id]);

  const ordered = useMemo(() => orderByLRU(scoped), [scoped]);

  const songSummary = (l: Lineup) => {
    const usedSongs = summarizeLineupSongs(l, songs);
    return usedSongs.map((u) => u.song.title).join(', ');
  };

  const copyLineupToAccount = async (lineup: Lineup) => {
    setCopyingId(lineup.id);
    try {
      await api.copyLineup(lineup.id);
      await refresh();
      notify(`Copied “${lineup.name}” to your account`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not copy lineup', 'error');
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Lineups</h1>
        </div>
        <Button variant="primary" onClick={() => navigate('/lineups/new')}>
          <Icon name="add" size={16} /> New
        </Button>
      </div>

      {teams.length > 0 && (
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
            Team
          </button>
        </div>
      )}

      {themes.length > 1 && (
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
          title={
            scope === 'team'
              ? 'No teammate lineups yet'
              : lineups.length === 0
                ? 'No lineups yet'
                : 'No matches'
          }
          body={
            scope === 'team'
              ? 'Lineups from your teammates appear here automatically.'
              : lineups.length === 0
                ? 'Create your first lineup.'
                : 'No matches.'
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
            const isMine = l.ownerId === user?.id;
            const alreadyCopied =
              !isMine && copiedSourceIds.has(l.sourceLineupId || l.id);
            const busyCopy = copyingId === l.id;
            const names = songSummary(l);
            const sub = [!isMine ? `by ${l.ownerName}` : null, names || null]
              .filter(Boolean)
              .join(' · ');

            return (
              <div key={l.id} className="list-row list-row-split">
                <button
                  type="button"
                  className="list-row-hit"
                  onClick={() => navigate(`/lineups/${l.id}`)}
                >
                  <div className="list-row-body">
                    <div className="list-row-title truncate">{l.name}</div>
                    {sub && <div className="tiny truncate">{sub}</div>}
                  </div>
                </button>

                {isMine ? (
                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                    <span className="tiny">
                      {l.lastUsedAt ? timeAgo(l.lastUsedAt) : 'Unused'}
                    </span>
                    <Icon name="chevronRight" size={16} className="muted" />
                  </div>
                ) : alreadyCopied ? (
                  <Chip tone="brand">Copied</Chip>
                ) : (
                  <button
                    type="button"
                    className="copy-action-btn"
                    disabled={busyCopy}
                    onClick={() => copyLineupToAccount(l)}
                  >
                    <Icon name="copy" size={12} /> {busyCopy ? '…' : 'Copy'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
