import { useState } from 'react';
import { Button, Chip, Empty, Icon, Sheet, Toast } from '../components/ui';
import { useStore } from '../lib/store';
import type { Team } from '../lib/types';

export function TeamsPage() {
  const { teams, createTeam, joinTeam, leaveTeam } = useStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!teamName.trim()) return setError('Give your team a name.');
    setBusy(true);
    try {
      const team = await createTeam(teamName.trim());
      setTeamName('');
      setCreateOpen(false);
      showToast(`Created ${team.name} · ${team.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create team.');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code.trim()) return setError('Enter a team invite code.');
    setBusy(true);
    try {
      const team = await joinTeam(code.trim());
      setCode('');
      setJoinOpen(false);
      showToast(`Joined ${team.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join team.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (c: string) => {
    try {
      await navigator.clipboard.writeText(c);
      showToast(`Copied ${c}`);
    } catch {
      showToast(c);
    }
  };

  const confirmLeave = async () => {
    if (!leaveTarget) return;
    setBusy(true);
    try {
      await leaveTeam(leaveTarget.id);
      showToast(`Left ${leaveTarget.name}`);
      setLeaveTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not leave team');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <span className="eyebrow">Collaboration</span>
          <h1>Teams</h1>
          <p>Share songs and lineups with bandmates while keeping personal copies yours.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Button
            onClick={() => {
              setError(null);
              setJoinOpen(true);
            }}
          >
            Join with code
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            <Icon name="add" size={16} /> Create team
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <Empty
          icon="teams"
          title="No teams yet"
          body="Create a workspace for your band, choir, or music group to share songs and setlists — or enter an invite code from a teammate."
          action={
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button
                variant="primary"
                onClick={() => {
                  setError(null);
                  setCreateOpen(true);
                }}
              >
                <Icon name="add" size={16} /> Create a team
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  setJoinOpen(true);
                }}
              >
                Enter invite code
              </Button>
            </div>
          }
        />
      ) : (
        <div className="stack">
          {teams.map((t) => (
            <div key={t.id} className="card stack">
              <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <h2 className="team-card-title">{t.name}</h2>
                    <Chip tone={t.myRole === 'owner' ? 'brand' : undefined}>
                      {t.myRole === 'owner' ? 'Owner' : 'Member'}
                    </Chip>
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    {t.members.length} {t.members.length === 1 ? 'member' : 'members'}
                  </div>
                </div>
                <button
                  type="button"
                  className="team-code-btn"
                  onClick={() => copyCode(t.code)}
                  title="Copy invite code"
                >
                  <Icon name="copy" size={12} />
                  <span>{t.code}</span>
                </button>
              </div>

              <div className="stack-xs">
                <span className="label">Members</span>
                <div className="member-grid">
                  {t.members.map((m) => (
                    <div key={m.userId} className="member-pill">
                      <span className="member-avatar">
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate" style={{ fontSize: 13.5, fontWeight: 500 }}>
                        {m.name}
                      </span>
                      {m.role === 'owner' && <span className="tiny muted">Owner</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="row-between team-foot">
                <span className="tiny">
                  Personal copies stay in your library if you leave.
                </span>
                <Button variant="quiet" onClick={() => setLeaveTarget(t)}>
                  Leave team
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a team"
        subtitle="Aria generates a unique invite code you can share with bandmates."
      >
        <form className="stack" style={{ marginTop: 8 }} onSubmit={onCreate}>
          <div className="field">
            <label htmlFor="team-name">Team name</label>
            <input
              id="team-name"
              className="input"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Sunday Collective"
            />
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Creating…' : 'Create team'}
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join with invite code"
        subtitle="Enter the code shared by your team owner."
      >
        <form className="stack" style={{ marginTop: 8 }} onSubmit={onJoin}>
          <div className="field">
            <label htmlFor="team-code">Invite code</label>
            <input
              id="team-code"
              className="input code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ARIA-000"
            />
            <span className="hint">Ask your team owner for their ARIA-000 invite code.</span>
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Joining…' : 'Join team'}
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={Boolean(leaveTarget)}
        onClose={() => setLeaveTarget(null)}
        title={leaveTarget ? `Leave ${leaveTarget.name}?` : 'Leave team?'}
        subtitle={
          leaveTarget?.myRole === 'owner' && leaveTarget.members.length === 1
            ? 'You are the only member — leaving will dissolve this team.'
            : 'Your personal song and lineup copies will stay safe in your library.'
        }
      >
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <Button onClick={() => setLeaveTarget(null)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmLeave} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Leaving…' : 'Leave team'}
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
