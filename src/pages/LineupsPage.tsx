import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { orderByLRU, resolveSequence, timeAgo, reasonLabel, lineupTempoMix } from '../lib/lru';
import { THEME_LIST } from '../lib/nlp';
import { Button, Chip, Empty, Icon } from '../components/ui';

export function LineupsPage() {
  const { lineups, songs, user } = useStore();
  const navigate = useNavigate();
  const [theme, setTheme] = useState('');

  const visible = useMemo(() => {
    const mine = lineups.filter((l) => l.ownerId === user?.id || l.teamId);
    const filtered = theme
      ? mine.filter((l) => l.theme.toLowerCase() === theme.toLowerCase())
      : mine;
    return orderByLRU(filtered);
  }, [lineups, theme, user?.id]);

  const suggestion = visible[0] || null;

  const themes = useMemo(() => {
    const set = new Set(lineups.map((l) => l.theme).filter(Boolean));
    return THEME_LIST.filter((t) => set.has(t)).concat([...set].filter((t) => !THEME_LIST.includes(t)));
  }, [lineups]);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Lineups</h1>
        <p>
          A lineup is counted as used when its link is shared. Aria always surfaces the one used
          longest ago.
        </p>
      </div>

      <div className="chip-scroll">
        <Chip active={!theme} onClick={() => setTheme('')}>
          All classes
        </Chip>
        {themes.map((t) => (
          <Chip key={t} active={theme === t} onClick={() => setTheme(theme === t ? '' : t)}>
            {t}
          </Chip>
        ))}
      </div>

      {suggestion ? (
        <div className="card brand stack-sm" style={{ padding: 15 }}>
          <div className="row-between">
            <span className="badge lru">
              <Icon.Clock size={12} /> Least recently used
            </span>
            <span className="tiny muted">{reasonLabel(suggestion.lastUsedReason)}</span>
          </div>
          <div>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1.15 }}>
              {suggestion.name}
            </div>
            <p className="small muted" style={{ marginTop: 3 }}>
              {suggestion.lastUsedAt ? (
                <>
                  Suggested because it was last used{' '}
                  <strong>{timeAgo(suggestion.lastUsedAt)}</strong>
                </>
              ) : (
                <>Suggested because it has never been used</>
              )}
              {suggestion.theme ? ` · ${suggestion.theme}` : ''}
            </p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {(() => {
              const mix = lineupTempoMix(suggestion, songs);
              return (
                <>
                  <span className="chip slow">
                    <Icon.Wave size={12} /> {mix.slow} slow
                  </span>
                  <span className="chip fast">
                    <Icon.Bolt size={12} /> {mix.fast} fast
                  </span>
                  <span className="chip">{suggestion.useCount}× used</span>
                </>
              );
            })()}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="primary" block onClick={() => navigate(`/lineups/${suggestion.id}`)}>
              Open lineup
            </Button>
            <Button onClick={() => navigate('/lineups/new')} ariaLabel="Build a new lineup">
              <Icon.Plus />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
        <Button variant="soft" block onClick={() => navigate('/lineups/new')}>
          <Icon.Plus /> Build a lineup
        </Button>
      </div>

      {visible.length === 0 ? (
        <Empty
          title="No lineups yet"
          body="Drag parts of a song into a sequence — pick a chorus here, a bridge there. You need at least one fast and one slow track."
          action={
            <Button variant="primary" onClick={() => navigate('/lineups/new')}>
              <Icon.Plus /> Build a lineup
            </Button>
          }
        />
      ) : (
        <>
          <div className="section-label">
            <h2>Order of use</h2>
            <span className="tiny muted">least used first</span>
          </div>
          <div className="stack-sm">
            {visible.map((lineup, index) => {
              const entries = resolveSequence(lineup, songs);
              const mix = lineupTempoMix(lineup, songs);
              const isMine = lineup.ownerId === user?.id;
              return (
                <button
                  key={lineup.id}
                  type="button"
                  className="song-card"
                  onClick={() => navigate(`/lineups/${lineup.id}`)}
                >
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div className="row" style={{ gap: 6 }}>
                        <span className="tiny muted" style={{ minWidth: 16 }}>
                          {index + 1}
                        </span>
                        <h3 className="truncate">{lineup.name}</h3>
                      </div>
                      <div className="tiny muted truncate" style={{ marginTop: 3, marginLeft: 22 }}>
                        {entries.length} part{entries.length === 1 ? '' : 's'} ·{' '}
                        {entries.map((e) => e.partLabel).join(' → ') || 'empty'}
                      </div>
                    </div>
                    {index === 0 ? <span className="badge lru">LRU</span> : null}
                  </div>
                  <div className="meta">
                    {lineup.theme ? <span className="chip brand">{lineup.theme}</span> : null}
                    <span className="chip slow">
                      <Icon.Wave size={12} /> {mix.slow}
                    </span>
                    <span className="chip fast">
                      <Icon.Bolt size={12} /> {mix.fast}
                    </span>
                    <span className="tiny muted">
                      <Icon.Clock size={11} /> {timeAgo(lineup.lastUsedAt)}
                    </span>
                    {!isMine ? <span className="tiny muted">· {lineup.ownerName}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
