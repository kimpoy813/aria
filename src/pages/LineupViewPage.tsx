import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { lineupTempoMix, orderByLRU, resolveSequence, timeAgo } from '../lib/lru';
import { BackBar, Button, Empty, Icon, Sheet, Toast } from '../components/ui';

const kindLabel = (kind: string) => (kind === 'prechorus' ? 'pre-chorus' : kind);

/** Read-only viewer for a lineup: the sequence, every part, and its lyrics. */
export function LineupViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lineups, songs, user, teams, refresh } = useStore();
  const lineup = lineups.find((l) => l.id === id);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareTeam, setShareTeam] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entries = useMemo(
    () => (lineup ? resolveSequence(lineup, songs) : []),
    [lineup, songs],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { entry: typeof entries[number]; repeats: number }>();
    for (const entry of entries) {
      const key = `${entry.song.id}||${entry.partId}`;
      const existing = map.get(key);
      if (existing) existing.repeats += 1;
      else map.set(key, { entry, repeats: 1 });
    }
    return [...map.values()];
  }, [entries]);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  };

  if (!lineup || !user) {
    return (
      <Empty
        title="Lineup not found"
        body="It may have been removed, or it belongs to a team you are not in."
        action={<Button onClick={() => navigate('/lineups')}>Back to lineups</Button>}
      />
    );
  }

  const isMine = lineup.ownerId === user.id;
  const canEdit = isMine;
  const mix = lineupTempoMix(lineup, songs);
  const lruRank = orderByLRU(lineups).findIndex((l) => l.id === lineup.id) + 1;

  const copyLineup = async () => {
    setBusy(true);
    try {
      const { lineup: copy } = await api.copyLineup(lineup.id, user.id, lineup.teamId);
      await refresh();
      flash('Copied to your lineups');
      navigate(`/lineups/${copy.id}/edit`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not copy');
    } finally {
      setBusy(false);
    }
  };

  const makeLink = async () => {
    setBusy(true);
    try {
      await api.shareLineup(lineup.id, user.id, 'link');
      const url = `${window.location.origin}/s/${lineup.shareToken}`;
      setShareLink(url);
      await refresh();
      await navigator.clipboard.writeText(url).catch(() => undefined);
      flash('Link copied — lineup marked as used');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create a link');
    } finally {
      setBusy(false);
    }
  };

  const sendToTeam = async () => {
    if (!shareTeam) return;
    setBusy(true);
    try {
      await api.shareLineup(lineup.id, user.id, 'team', shareTeam);
      await refresh();
      flash('Shared with your team — marked as used');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not share');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    const body = grouped
      .map(({ entry, repeats }) => {
        const header = `${entry.song.title} — ${entry.partLabel}${repeats > 1 ? ` (×${repeats})` : ''}`;
        return `${header}\n${entry.lyrics}`;
      })
      .join('\n\n');
    await navigator.clipboard.writeText(`${lineup.name}\n\n${body}`).catch(() => undefined);
    setCopied(true);
    flash('Lineup copied as text');
    setTimeout(() => setCopied(false), 2000);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteLineup(lineup.id, user.id);
      await refresh();
      navigate('/lineups');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate('/lineups')}
        title={isMine ? 'Your lineup' : 'Shared lineup'}
        right={
          canEdit ? (
            <Button size="sm" variant="soft" onClick={() => navigate(`/lineups/${lineup.id}/edit`)}>
              <Icon.Edit size={13} /> Edit
            </Button>
          ) : undefined
        }
      />

      <div className="stack-sm">
        <h1 className="serif" style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
          {lineup.name}
        </h1>
        <div className="row wrap" style={{ gap: 6 }}>
          {lineup.theme ? <span className="chip brand">{lineup.theme}</span> : null}
          <span className="chip slow">
            <Icon.Wave size={12} /> {mix.slow} slow
          </span>
          <span className="chip fast">
            <Icon.Bolt size={12} /> {mix.fast} fast
          </span>
          <span className="chip">{entries.length} parts</span>
        </div>
        <p className="tiny muted">
          {isMine ? 'Yours' : `By ${lineup.ownerName}`} · last used {timeAgo(lineup.lastUsedAt)} ·
          used {lineup.useCount}× · LRU rank {lruRank}
          {lineup.copiedFrom ? ` · copied from ${lineup.copiedFrom}` : ''}
        </p>
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <Button variant="primary" block onClick={() => setShareOpen(true)}>
          <Icon.Share /> Share
        </Button>
        <Button block onClick={copyText}>
          {copied ? <Icon.Check /> : <Icon.Copy />} Copy
        </Button>
        {!isMine ? (
          <Button variant="soft" block onClick={copyLineup} disabled={busy}>
            <Icon.Copy /> Copy lineup
          </Button>
        ) : null}
      </div>

      <div className="section-label">
        <h2>Sequence</h2>
        <span className="tiny muted">{entries.length} parts · {mix.slow} slow / {mix.fast} fast</span>
      </div>

      {entries.length === 0 ? (
        <Empty
          title="Nothing here yet"
          body="This lineup has no parts. Open the builder and drag some in."
          action={canEdit ? <Button onClick={() => navigate(`/lineups/${lineup.id}/edit`)}>Open builder</Button> : undefined}
        />
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {entries.map((entry) => (
            <article className="card flush" key={entry.itemId}>
              <div className="share-part" style={{ borderTop: 'none' }}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="eyebrow" style={{ marginBottom: 3 }}>
                      {kindLabel(entry.partKind)}
                    </div>
                    <h2 className="serif" style={{ fontSize: 18, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                      {entry.song.title}
                    </h2>
                    <div className="tiny muted">{entry.partLabel}</div>
                  </div>
                  <div className="stack-sm" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <span className={`chip ${entry.song.tempo}`} style={{ fontSize: 11 }}>
                      {entry.song.tempo === 'fast' ? <Icon.Bolt size={11} /> : <Icon.Wave size={11} />}
                      {entry.song.tempo}
                    </span>
                  </div>
                </div>
                <div className="lyrics-lines">
                  {entry.lyrics.split(/\n/).map((line, i) => (
                    <div className="lyric-line" key={i}>
                      {line || '\u00A0'}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {canEdit ? (
        <Button variant="danger" size="sm" block onClick={() => setConfirmDelete(true)} style={{ marginTop: 8 }}>
          <Icon.Trash /> Delete lineup
        </Button>
      ) : null}

      <Sheet
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          setShareLink(null);
        }}
        title="Share this lineup"
        subtitle="Sharing counts as using the lineup — that is how LRU stays honest."
      >
        <div className="stack-sm">
          <div className="card tight stack-sm" style={{ boxShadow: 'none' }}>
            <div className="label">View-only link</div>
            <p className="hint">Anyone can open it. Shows every part with its full lyrics.</p>
            <Button variant="primary" block onClick={makeLink} disabled={busy}>
              <Icon.Link /> {shareLink ? 'Copy link again' : 'Create & copy link'}
            </Button>
            {shareLink ? (
              <>
                <input className="input" readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} />
                <Button size="sm" block onClick={() => window.open(shareLink, '_blank')}>
                  <Icon.Eye size={14} /> Open preview
                </Button>
              </>
            ) : null}
          </div>

          {teams.length > 0 ? (
            <div className="card tight stack-sm" style={{ boxShadow: 'none' }}>
              <div className="label">Share with a team</div>
              <p className="hint">Teammates can open, copy and pass it on.</p>
              <select
                className="select"
                value={shareTeam || lineup.teamId || teams[0]?.id}
                onChange={(e) => setShareTeam(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.members.length} member{t.members.length === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
              <Button block onClick={sendToTeam} disabled={busy}>
                <Icon.Users size={15} /> Send to team
              </Button>
            </div>
          ) : (
            <div className="card tight">
              <div className="label">No teams yet</div>
              <p className="hint" style={{ marginTop: 3 }}>
                Create or join a team to share lineups with people.
              </p>
              <Button size="sm" style={{ marginTop: 8 }} onClick={() => navigate('/teams')}>
                Go to Teams
              </Button>
            </div>
          )}

          <div className="card tight">
            <div className="label">Order of use</div>
            <p className="hint" style={{ marginTop: 3 }}>
              The oldest-used lineup is always suggested first. This one was used{' '}
              <strong>{timeAgo(lineup.lastUsedAt)}</strong>.
            </p>
          </div>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this lineup?">
        <p className="small muted" style={{ marginBottom: 12 }}>
          “{lineup.name}” will be removed for good. Songs stay in your library.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <Button block onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button variant="danger" block onClick={remove} disabled={busy}>
            Delete
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
