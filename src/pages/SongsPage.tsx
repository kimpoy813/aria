import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { effectiveAnalysis, THEME_LIST } from '../lib/nlp';
import { Button, Chip, Empty, Icon } from '../components/ui';
import type { Song } from '../lib/types';

const partSummary = (song: Song) => {
  const counts = new Map<string, number>();
  for (const part of song.parts) {
    const label = part.kind === 'prechorus' ? 'pre-chorus' : part.kind;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([kind, n]) => (n > 1 ? `${kind} ×${n}` : kind)).join(' · ');
};

export function SongsPage() {
  const { songs, user, lineups, teams } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('');
  const [scope, setScope] = useState<'all' | 'mine' | 'team'>('all');

  const allWithAnalysis = useMemo(
    () => songs.map((song) => ({ song, analysis: effectiveAnalysis(song) })),
    [songs],
  );

  const themesInUse = useMemo(() => {
    const set = new Set(allWithAnalysis.map((s) => s.analysis.theme));
    return THEME_LIST.filter((t) => set.has(t)).concat(
      [...set].filter((t) => !THEME_LIST.includes(t)),
    );
  }, [allWithAnalysis]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allWithAnalysis
      .filter(({ song, analysis }) => {
        if (scope === 'mine' && song.ownerId !== user?.id) return false;
        if (scope === 'team' && (song.ownerId === user?.id || !song.teamId)) return false;
        if (theme && analysis.theme !== theme) return false;
        if (!q) return true;
        const haystack = [
          song.title,
          song.artist,
          analysis.theme,
          analysis.toneLabel,
          ...analysis.keywords,
          ...song.parts.map((p) => p.lyrics),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => b.song.updatedAt - a.song.updatedAt);
  }, [allWithAnalysis, query, theme, scope, user?.id]);

  const mySongs = songs.filter((s) => s.ownerId === user?.id).length;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Your songs</h1>
        <p>
          {songs.length} song{songs.length === 1 ? '' : 's'} in reach · {mySongs} yours ·{' '}
          {lineups.length} lineup{lineups.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="row">
        <div className="search-wrap grow">
          <span className="search-icon">
            <Icon.Search />
          </span>
          <input
            className="input"
            placeholder="Search title, lyric, class…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search songs"
          />
        </div>
        <Button variant="primary" className="btn-icon-only" ariaLabel="Add a song" onClick={() => navigate('/songs/new')}>
          <Icon.Plus />
        </Button>
      </div>

      <div className="chip-scroll">
        <Chip active={!theme} onClick={() => setTheme('')}>
          All classes
        </Chip>
        {themesInUse.map((t) => (
          <Chip key={t} active={theme === t} onClick={() => setTheme(theme === t ? '' : t)}>
            {t}
          </Chip>
        ))}
      </div>

      {teams.length > 0 ? (
        <div className="chip-scroll">
          <Chip active={scope === 'all'} onClick={() => setScope('all')}>
            Everyone
          </Chip>
          <Chip active={scope === 'mine'} onClick={() => setScope('mine')}>
            Mine
          </Chip>
          <Chip active={scope === 'team'} onClick={() => setScope('team')}>
            From teams
          </Chip>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Empty
          title={songs.length === 0 ? 'No songs yet' : 'Nothing matches'}
          body={
            songs.length === 0
              ? 'Add a song part by part — Aria reads the lyrics and names the message.'
              : 'Try a different class or clear the search.'
          }
          action={
            <Button variant="primary" onClick={() => navigate('/songs/new')}>
              <Icon.Plus /> Add a song
            </Button>
          }
        />
      ) : (
        <div className="stack-sm" style={{ marginTop: 2 }}>
          {filtered.map(({ song, analysis }) => (
            <button
              key={song.id}
              type="button"
              className="song-card"
              onClick={() => navigate(`/songs/${song.id}`)}
            >
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <h3 className="truncate">{song.title}</h3>
                  <div className="tiny muted truncate" style={{ marginTop: 1 }}>
                    {song.artist}
                  </div>
                </div>
                <span className="chip brand" style={{ flexShrink: 0 }}>
                  {analysis.theme}
                </span>
              </div>
              <div className="meta">
                <span className={`chip ${song.tempo}`}>
                  {song.tempo === 'fast' ? <Icon.Bolt size={12} /> : <Icon.Wave size={12} />}
                  {song.tempo}
                </span>
                <span className="tiny muted truncate">{partSummary(song)}</span>
                {song.ownerId !== user?.id ? (
                  <span className="tiny muted">· {song.ownerName}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
