import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { effectiveAnalysis } from '../lib/nlp';
import { orderByLRU, timeAgo } from '../lib/lru';
import { Button, Chip, Empty, Icon, Sheet, Toast } from '../components/ui';
import type { Team } from '../lib/types';

export function TeamsPage() {
  const { teams, songs, lineups, user, joinTeam, createTeam, leaveTeam, refresh } = useStore();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(teams[0]?.id ?? null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const activeTeam: Team | null =
    teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const teamSongs = useMemo(
    () => (activeTeam ? songs.filter((s) => s.teamId === activeTeam.id) : []),
    [songs, activeTeam],
  );
  const teamLineups = useMemo(
    () => (activeTeam ? orderByLRU(lineups.filter((l) => l.teamId === activeTeam.id)) : []),
    [lineups, activeTeam],
  );

  const toastResult = (err: unknown, fallback: string) =>
    flash(err instanceof Error ? err.message : fallback);

  const doJoin = async () => {
    if (!code.trim()) {
      flash('Enter a team code');
      return;
    }
    setBusy(true);
    try {
      const team = await joinTeam(code.trim().toUpperCase());
      setActiveTeamId(team.id);
      setJoinOpen(false);
      setCode('');
      flash(`Joined ${team.name}`);
    } catch (err) {
      toastResult(err, 'Could not join that team');
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    if (!teamName.trim()) {
      flash('Name your team first');
      return;
    }
    setBusy(true);
    try {
      const team = await createTeam(teamName.trim());
      setActiveTeamId(team.id);
      setCreateOpen(false);
      setTeamName('');
      flash(`Created ${team.name} · code ${team.code}`);
    } catch (err) {
      toastResult(err, 'Could not create the team');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (value: string) => {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    flash('Code copied');
  };

  const copySong = async (songId: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await api.copySong(songId, user.id, activeTeam?.id ?? null);
      await refresh();
      flash('Song copied to your library');
    } catch (err) {
      toastResult(err, 'Could not copy the song');
    } finally {
      setBusy(false);
    }
  };

  const copyLineup = async (lineupId: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const { lineup } = await api.copyLineup(lineupId, user.id, activeTeam?.id ?? null);
      await refresh();
      flash('Lineup copied — including the songs it needs');
      navigate(`/lineups/${lineup.id}`);
    } catch (err) {
      toastResult(err, 'Could not copy the lineup');
    } finally {
      setBusy(false);
    }
  };

  const doLeave = async (team: Team) => {
    if (!window.confirm(`Leave ${team.name}? You will lose access to its songs and lineups.`)) return;
    setBusy(true);
    try {
      await leaveTeam(team.id);
      setActiveTeamId(null);
      flash('Left the team');
    } catch (err) {
      toastResult(err, 'Could not leave the team');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Teams</h1>
        <p>Join with a code, then share and copy songs and lineups with everyone in the room.</p>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <Button variant="primary" block onClick={() => setJoinOpen(true)}>
          <Icon.Link /> Join with code
        </Button>
        <Button block onClick={() => setCreateOpen(true)}>
          <Icon.Plus /> Create team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Empty
          title="You are not in a team yet"
          body="Join the demo team with code ARIA-123 to see shared songs and lineups right away, or create your own."
          action={
            <Button
              variant="soft"
              onClick={() => {
                setCode('ARIA-123');
                setJoinOpen(true);
              }}
            >
              Use demo code ARIA-123
            </Button>
          }
        />
      ) : (
        <>
          <div className="chip-scroll">
            {teams.map((team) => (
              <Chip
                key={team.id}
                active={activeTeam?.id === team.id}
                onClick={() => setActiveTeamId(team.id)}
              >
                {team.name}
              </Chip>
            ))}
          </div>

          {activeTeam ? (
            <>
              <div className="card brand stack-sm">
                <div className="row-between">
                  <div>
                    <div className="eyebrow">Team code</div>
                    <div className="serif" style={{ fontSize: 24, letterSpacing: '0.02em' }}>
                      {activeTeam.code}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => copyCode(activeTeam.code)}>
                    <Icon.Copy size={14} /> Copy
                  </Button>
                </div>
                <p className="tiny muted">
                  {activeTeam.members.length} member{activeTeam.members.length === 1 ? '' : 's'} · you
                  are {activeTeam.myRole === 'owner' ? 'the owner' : 'a member'}
                </p>
                <div className="row wrap" style={{ gap: 5 }}>
                  {activeTeam.members.map((member) => (
                    <span className="chip" key={member.userId} style={{ fontSize: 11 }}>
                      {member.name}
                      {member.role === 'owner' ? ' · owner' : ''}
                      {member.userId === user?.id ? ' (you)' : ''}
                    </span>
                  ))}
                </div>
              </div>

              <div className="section-label">
                <h2>Shared songs</h2>
                <span className="tiny muted">{teamSongs.length}</span>
              </div>

              {teamSongs.length === 0 ? (
                <Empty
                  title="No songs shared yet"
                  body="Open one of your songs and use Share to post it here."
                  action={<Button onClick={() => navigate('/')}>Go to songs</Button>}
                />
              ) : (
                <div className="stack-sm">
                  {teamSongs
                    .sort((a, b) => (a.ownerId === user?.id ? 1 : 0) - (b.ownerId === user?.id ? 1 : 0))
                    .map((song) => {
                      const analysis = effectiveAnalysis(song);
                      const isMine = song.ownerId === user?.id;
                      return (
                        <div className="card tight stack-sm" key={song.id}>
                          <div className="row-between" style={{ alignItems: 'flex-start' }}>
                            <div className="grow" style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 600 }} className="truncate">
                                {song.title}
                              </div>
                              <div className="tiny muted truncate">
                                {song.artist} · {song.ownerName}
                              </div>
                            </div>
                            <span className="chip brand" style={{ flexShrink: 0 }}>
                              {analysis.theme}
                            </span>
                          </div>
                          <div className="row wrap" style={{ gap: 6 }}>
                            <span className={`chip ${song.tempo}`} style={{ fontSize: 11 }}>
                              {song.tempo}
                            </span>
                            <span className="tiny muted">
                              {song.parts.length} part{song.parts.length === 1 ? '' : 's'}
                            </span>
                            {song.copiedFrom ? (
                              <span className="tiny muted truncate">· copied</span>
                            ) : null}
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <Button size="sm" onClick={() => navigate(`/songs/${song.id}`)}>
                              <Icon.Eye size={13} /> View
                            </Button>
                            {isMine ? (
                              <Button size="sm" variant="quiet" onClick={() => navigate(`/songs/${song.id}/edit`)}>
                                <Icon.Edit size={13} /> Edit
                              </Button>
                            ) : (
                              <Button size="sm" variant="soft" onClick={() => copySong(song.id)} disabled={busy}>
                                <Icon.Copy size={13} /> Copy
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="section-label">
                <h2>Shared lineups</h2>
                <span className="tiny muted">LRU order</span>
              </div>

              {teamLineups.length === 0 ? (
                <Empty
                  title="No lineups shared yet"
                  body="Build a lineup, then use Share → Send to team."
                  action={<Button onClick={() => navigate('/lineups/new')}>Build a lineup</Button>}
                />
              ) : (
                <div className="stack-sm">
                  {teamLineups.map((lineup) => {
                    const isMine = lineup.ownerId === user?.id;
                    return (
                      <div className="card tight stack-sm" key={lineup.id}>
                        <div className="row-between" style={{ alignItems: 'flex-start' }}>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 600 }} className="truncate">
                              {lineup.name}
                            </div>
                            <div className="tiny muted truncate">
                              {lineup.ownerName} · {lineup.items.length} parts · used{' '}
                              {timeAgo(lineup.lastUsedAt)}
                            </div>
                          </div>
                          {lineup.theme ? <span className="chip brand">{lineup.theme}</span> : null}
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <Button size="sm" onClick={() => navigate(`/lineups/${lineup.id}`)}>
                            <Icon.Eye size={13} /> View
                          </Button>
                          {isMine ? (
                            <Button size="sm" variant="quiet" onClick={() => navigate(`/lineups/${lineup.id}/edit`)}>
                              <Icon.Edit size={13} /> Edit
                            </Button>
                          ) : (
                            <Button size="sm" variant="soft" onClick={() => copyLineup(lineup.id)} disabled={busy}>
                              <Icon.Copy size={13} /> Copy
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button variant="quiet" size="sm" onClick={() => doLeave(activeTeam)} disabled={busy}>
                Leave {activeTeam.name}
              </Button>
            </>
          ) : null}
        </>
      )}

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} title="Join a team" subtitle="Ask for the six-character code.">
        <div className="stack-sm">
          <div className="field">
            <label htmlFor="code">Team code</label>
            <input
              id="code"
              className="input"
              placeholder="ARIA-123"
              value={code}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doJoin();
              }}
            />
            <span className="hint">Demo team: ARIA-123</span>
          </div>
          <Button variant="primary" block onClick={doJoin} disabled={busy || !code.trim()}>
            {busy ? 'Joining…' : 'Join team'}
          </Button>
        </div>
      </Sheet>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Create a team" subtitle="You will get a code to pass around.">
        <div className="stack-sm">
          <div className="field">
            <label htmlFor="teamName">Team name</label>
            <input
              id="teamName"
              className="input"
              placeholder="e.g. Sunday Set"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doCreate();
              }}
            />
          </div>
          <Button variant="primary" block onClick={doCreate} disabled={busy || !teamName.trim()}>
            {busy ? 'Creating…' : 'Create team'}
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
