import { useState } from 'react';
import { Button, Chip, Empty, Icon, Sheet, type ToastTone } from '../components/ui';
import { useStore } from '../lib/store';
import type { Team } from '../lib/types';

export function TeamsPage() {
  const { teams, createTeam, joinTeam, leaveTeam, notify } = useStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showToast = (m: string, tone: ToastTone = 'success') => {
    notify(m, tone);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!teamName.trim()) return setError('Enter a team name.');
    setBusy(true);
    try {
      const team = await createTeam(teamName.trim());
      setTeamName('');
      setCreateOpen(false);
      showToast(`Created ${team.name} · ${team.code}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create team.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code.trim()) return setError('Enter an invite code.');
    setBusy(true);
    try {
      const team = await joinTeam(code.trim());
      setCode('');
      setJoinOpen(false);
      showToast(`Joined ${team.name}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join team.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (c: string) => {
    try {
      await navigator.clipboard.writeText(c);
      showToast(`Copied invite code ${c}`, 'success');
    } catch {
      showToast(c, 'info');
    }
  };

  const confirmLeave = async () => {
    if (!leaveTarget) return;
    setBusy(true);
    try {
      await leaveTeam(leaveTarget.id);
      showToast(`Left ${leaveTarget.name}`, 'info');
      setLeaveTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not leave', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Teams</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Button
            onClick={() => {
              setError(null);
              setJoinOpen(true);
            }}
          >
            Join
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            <Icon name="add" size={16} /> New
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <Empty
          icon="teams"
          title="No teams yet"
          body="Create a team to share songs and lineups, or join with an invite code."
          action={
            <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <Button
                variant="primary"
                onClick={() => {
                  setError(null);
                  setCreateOpen(true);
                }}
              >
                Create team
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  setJoinOpen(true);
                }}
              >
                Join with code
              </Button>
            </div>
          }
        />
      ) : (
        <div className="stack-sm">
          {teams.map((t) => (
            <div key={t.id} className="card stack">
              <div className="row-between" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <strong className="truncate" style={{ fontSize: 16 }}>
                      {t.name}
                    </strong>
                    {t.myRole === 'owner' && <Chip tone="brand">Owner</Chip>}
                  </div>
                  <div className="tiny">
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

              <div className="member-grid">
                {t.members.map((m) => (
                  <div key={m.userId} className="member-pill">
                    <span className="member-avatar">{m.name.slice(0, 1).toUpperCase()}</span>
                    <span className="truncate" style={{ fontSize: 13 }}>
                      {m.name}
                    </span>
                  </div>
                ))}
              </div>

              <div className="row-between team-foot">
                <span className="tiny">Personal copies stay yours</span>
                <button
                  type="button"
                  className="link-button tiny"
                  onClick={() => setLeaveTarget(t)}
                >
                  Leave
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create team"
        subtitle="Generates an invite code to share with bandmates."
      >
        <form className="stack" onSubmit={onCreate}>
          <div className="field">
            <label htmlFor="team-name">Team name</label>
            <input
              id="team-name"
              className="input"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Sunday Band"
            />
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join team"
        subtitle="Enter the code shared by your team owner."
      >
        <form className="stack" onSubmit={onJoin}>
          <div className="field">
            <label htmlFor="team-code">Invite code</label>
            <input
              id="team-code"
              className="input code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ARIA-000"
            />
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={Boolean(leaveTarget)}
        onClose={() => setLeaveTarget(null)}
        title={leaveTarget ? `Leave ${leaveTarget.name}?` : 'Leave team?'}
        subtitle="Your personal copies remain in your library."
      >
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={() => setLeaveTarget(null)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmLeave} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Leaving…' : 'Leave'}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
