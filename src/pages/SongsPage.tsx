import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Chip, Empty, Icon } from '../components/ui';
import { api } from '../lib/api';
import { applyScope, type LibraryScope } from '../lib/scopes';
import { useStore } from '../lib/store';
import type { Song, Tempo } from '../lib/types';

type TempoFilter = 'all' | Tempo;

export function SongsPage() {
  const { songs, teams, user, refresh, notify } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  // A team card can deep-link here, already narrowed to that team.
  const preset = location.state as { scope?: LibraryScope; teamId?: string } | null;
  const [query, setQuery] = useState('');
  // Your own songs first: a team library is something you opt into, not the
  // thing that greets you.
  const [scope, setScope] = useState<LibraryScope>(preset?.scope ?? 'mine');
  const [teamId, setTeamId] = useState<string>(preset?.teamId ?? 'all');
  const [tempoFilter, setTempoFilter] = useState<TempoFilter>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const copiedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of songs) {
      if (s.ownerId === user?.id && s.sourceSongId) {
        set.add(s.sourceSongId);
      }
    }
    return set;
  }, [songs, user?.id]);

  const themes = useMemo(() => {
    const set = new Set<string>();
    songs.forEach((s) => {
      if (s.theme) set.add(s.theme);
    });
    return Array.from(set).sort();
  }, [songs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applyScope(songs, { scope, viewerId: user?.id, teams, teamId })
      .filter((s) => {
        if (tempoFilter !== 'all' && s.tempo !== tempoFilter) return false;
        if (themeFilter !== 'all' && s.theme !== themeFilter) return false;
        if (!q) return true;
        const hay = [
          s.title,
          s.artist,
          s.theme,
          s.ownerName,
          s.analysis?.message ?? '',
          ...s.parts.map((p) => `${p.label} ${p.lyrics}`),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [songs, scope, teams, teamId, tempoFilter, themeFilter, query, user?.id]);

  const hasActiveFilters =
    Boolean(query.trim()) ||
    scope !== 'mine' ||
    teamId !== 'all' ||
    tempoFilter !== 'all' ||
    themeFilter !== 'all';

  const copySongToAccount = async (song: Song) => {
    setCopyingId(song.id);
    try {
      await api.copySong(song.id);
      await refresh();
      notify(`Copied “${song.title}” to your account`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not copy song', 'error');
    } finally {
      setCopyingId(null);
    }
  };

  if (songs.length === 0 && teams.length === 0) {
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
          body="Add your first song."
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
        </div>
        <Button variant="primary" onClick={() => navigate('/songs/new')}>
          <Icon name="add" size={16} /> Add
        </Button>
      </div>

      {songs.length > 0 && (
        <div className="search">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs…"
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
      )}

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
            Team
          </button>
        </div>
      )}

      {scope === 'team' && teams.length > 1 && (
        <div className="filter-row" aria-label="Filter by team">
          <button
            type="button"
            className={`filter-pill ${teamId === 'all' ? 'active' : ''}`}
            onClick={() => setTeamId('all')}
          >
            All teams
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`filter-pill ${teamId === t.id ? 'active' : ''}`}
              onClick={() => setTeamId(teamId === t.id ? 'all' : t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {songs.length > 0 && (
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
      )}

      {filtered.length === 0 ? (
        <Empty
          icon={songs.length === 0 ? 'songs' : 'search'}
          title={
            scope === 'team'
              ? teamId !== 'all'
                ? 'Nothing shared with that team'
                : 'No teammate songs yet'
              : scope === 'mine' && songs.length > 0
                ? 'No songs of yours yet'
                : 'No matches'
          }
          body={
            scope === 'team'
              ? 'Songs your teammates share appear here automatically.'
              : scope === 'mine' && songs.length > 0
                ? 'Songs from your teams are on the Team tab.'
                : 'No matches.'
          }
          action={
            hasActiveFilters ? (
              <Button
                onClick={() => {
                  setQuery('');
                  setScope('mine');
                  setTeamId('all');
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
          {filtered.map((song) => {
            const isMine = song.ownerId === user?.id;
            const alreadyCopied =
              !isMine && copiedSourceIds.has(song.sourceSongId || song.id);
            const busyCopy = copyingId === song.id;

            return (
              <div key={song.id} className="list-row list-row-split">
                <button
                  type="button"
                  className="list-row-hit"
                  onClick={() => navigate(`/songs/${song.id}`)}
                >
                  <div className="list-row-body">
                    <div className="list-row-title truncate">{song.title}</div>
                    <div className="tiny truncate">
                      {[
                        !isMine ? `by ${song.ownerName}` : null,
                        isMine && song.artist && song.artist !== 'Unknown artist'
                          ? song.artist
                          : null,
                        song.theme || null,
                      ]
                        .filter(Boolean)
                        .join(' · ') ||
                        (song.tempo === 'fast' ? 'Fast' : 'Slow')}
                    </div>
                  </div>
                </button>

                {isMine ? (
                  <Chip>{song.tempo === 'fast' ? 'Fast' : 'Slow'}</Chip>
                ) : alreadyCopied ? (
                  <Chip tone="brand">Copied</Chip>
                ) : (
                  <button
                    type="button"
                    className="copy-action-btn"
                    disabled={busyCopy}
                    onClick={() => copySongToAccount(song)}
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
