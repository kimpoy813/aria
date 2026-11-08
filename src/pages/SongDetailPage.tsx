import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { effectiveAnalysis } from '../lib/nlp';
import { AnalysisCard } from '../components/AnalysisCard';
import { BackBar, Button, Empty, Icon, IconButton, Sheet, Toast } from '../components/ui';

export function SongDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { songs, user, teams, lineups, refresh } = useStore();
  const song = songs.find((s) => s.id === id);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const analysis = useMemo(() => (song ? effectiveAnalysis(song) : null), [song]);
  const usedIn = useMemo(
    () =>
      song
        ? lineups.filter((l) => l.items.some((i) => i.songId === song.id))
        : [],
    [lineups, song],
  );

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  if (!song || !user || !analysis) {
    return (
      <Empty
        title="Song not found"
        body="It may have been removed, or it lives in a team you have not joined."
        action={<Button onClick={() => navigate('/')}>Back to songs</Button>}
      />
    );
  }

  const isMine = song.ownerId === user.id;
  const team = teams.find((t) => t.id === song.teamId);

  const shareToTeam = async (teamId: string) => {
    setBusy(true);
    try {
      await api.shareSong(song.id, user.id, teamId);
      await refresh();
      setShareOpen(false);
      flash(teamId ? 'Shared with your team' : 'Song is private again');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not share');
    } finally {
      setBusy(false);
    }
  };

  const copyToMine = async () => {
    setBusy(true);
    try {
      const { song: copy } = await api.copySong(song.id, user.id, null);
      await refresh();
      flash('Copied to your songs');
      navigate(`/songs/${copy.id}`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not copy');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${song.title}”? It will be removed from lineups too.`)) return;
    setBusy(true);
    try {
      await api.deleteSong(song.id, user.id);
      await refresh();
      navigate('/');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate('/')}
        title="Song"
        right={
          isMine ? (
            <IconButton label="Edit song" onClick={() => navigate(`/songs/${song.id}/edit`)}>
              <Icon.Edit />
            </IconButton>
          ) : undefined
        }
      />

      <div className="stack-sm">
        <h1 className="serif" style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
          {song.title}
        </h1>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="small muted">{song.artist}</span>
          <span className="chip brand">{analysis.theme}</span>
          <span className={`chip ${song.tempo}`}>
            {song.tempo === 'fast' ? <Icon.Bolt size={12} /> : <Icon.Wave size={12} />}
            {song.tempo}
          </span>
        </div>
        <p className="tiny muted">
          {isMine ? 'Yours' : `Added by ${song.ownerName}`}
          {team ? ` · shared with ${team.name}` : ' · private'}
        </p>
      </div>

      <AnalysisCard analysis={analysis} />

      <div className="row" style={{ gap: 8 }}>
        <Button variant="soft" block onClick={() => setShareOpen(true)}>
          <Icon.Share /> Share
        </Button>
        {isMine ? (
          <Button block onClick={() => navigate('/lineups/new')}>
            <Icon.List /> Use in lineup
          </Button>
        ) : (
          <Button variant="primary" block onClick={copyToMine} disabled={busy}>
            <Icon.Copy /> Copy
          </Button>
        )}
      </div>

      <div className="section-label">
        <h2>Parts</h2>
        <span className="tiny muted">{song.parts.length}</span>
      </div>

      <div className="stack-sm">
        {song.parts.map((part, index) => {
          const signal = analysis.parts.find(
            (p) => p.kind === part.kind && p.label === part.label,
          );
          return (
            <div className="card tight stack-sm" key={part.id}>
              <div className="row-between">
                <div className="row" style={{ gap: 7 }}>
                  <span className="part-index">{index + 1}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{part.label}</span>
                  <span className="tiny muted" style={{ textTransform: 'capitalize' }}>
                    {part.kind === 'prechorus' ? 'pre-chorus' : part.kind}
                  </span>
                </div>
                {signal ? <span className="chip" style={{ fontSize: 10.5 }}>{signal.theme}</span> : null}
              </div>
              <div>
                {part.lyrics.split(/\n/).map((line, i) => (
                  <div className="lyric-line" key={i}>
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {usedIn.length > 0 ? (
        <>
          <div className="section-label">
            <h2>In lineups</h2>
          </div>
          <div className="stack-sm">
            {usedIn.map((l) => (
              <button
                key={l.id}
                type="button"
                className="song-card"
                onClick={() => navigate(`/lineups/${l.id}`)}
              >
                <div className="row-between">
                  <div className="grow truncate">
                    <h3 className="truncate" style={{ fontSize: 14 }}>
                      {l.name}
                    </h3>
                    <span className="tiny muted">
                      {l.items.filter((i) => i.songId === song.id).length} part
                      {l.items.filter((i) => i.songId === song.id).length === 1 ? '' : 's'} from this song
                    </span>
                  </div>
                  <Icon.Chevron size={15} />
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {isMine ? (
        <Button variant="danger" block onClick={remove} disabled={busy}>
          <Icon.Trash /> Delete song
        </Button>
      ) : null}

      <Sheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share this song"
        subtitle="Team members can copy it into their own library."
      >
        {!isMine ? (
          <div className="stack-sm">
            <p className="small muted">This song belongs to {song.ownerName}.</p>
            <Button variant="primary" block onClick={copyToMine} disabled={busy}>
              <Icon.Copy /> Copy to my songs
            </Button>
          </div>
        ) : teams.length === 0 ? (
          <Empty
            title="No teams yet"
            body="Create a team or join one with a code, then you can share songs here."
            action={<Button onClick={() => navigate('/teams')}>Go to Teams</Button>}
          />
        ) : (
          <div className="stack-sm">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                className="song-card"
                onClick={() => shareToTeam(t.id)}
                disabled={busy}
              >
                <div className="row-between">
                  <div>
                    <h3 style={{ fontSize: 14 }}>{t.name}</h3>
                    <span className="tiny muted">{t.members.length} member{t.members.length === 1 ? '' : 's'}</span>
                  </div>
                  {song.teamId === t.id ? <Icon.Check /> : <Icon.Share size={16} />}
                </div>
              </button>
            ))}
            {song.teamId ? (
              <Button variant="quiet" block onClick={() => shareToTeam('')} disabled={busy}>
                Make private again
              </Button>
            ) : null}
          </div>
        )}
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
