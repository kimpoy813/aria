import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LyricView } from '../components/LyricView';
import {
  BackBar,
  Button,
  Chip,
  Empty,
  Icon,
  IconButton,
  Sheet,
  type ToastTone,
} from '../components/ui';
import { api } from '../lib/api';
import { resolveSequence, timeAgo } from '../lib/lru';
import { useStore } from '../lib/store';

export function LineupViewPage() {
  const { id } = useParams();
  const { lineups, songs, teams, user, refresh, notify } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = (location.state as { from?: string } | null)?.from === 'home';
  const backTo = fromHome ? '/' : '/lineups';
  const backLabel = fromHome ? 'Home' : 'Lineups';

  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const lineup = lineups.find((l) => l.id === id);

  const resolved = useMemo(
    () => (lineup ? resolveSequence(lineup, songs) : []),
    [lineup, songs],
  );

  const showToast = (m: string, tone: ToastTone = 'success') => {
    notify(m, tone);
  };

  if (!lineup) {
    return (
      <div className="stack">
        <BackBar onBack={() => navigate(backTo)} label={backLabel} />
        <Empty icon="lineup" title="Lineup not found" body="It may have been removed." />
      </div>
    );
  }

  const mine = lineup.ownerId === user?.id;
  const team = lineup.teamId ? teams.find((t) => t.id === lineup.teamId) : null;
  const shareUrl = `${window.location.origin}/s/${lineup.shareToken}`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* ignore */
    }
    try {
      await api.shareLineup(lineup.id, 'link');
      await refresh();
    } catch {
      /* ignore */
    }
    showToast('Link copied');
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: lineup.name, url: shareUrl });
        await api.shareLineup(lineup.id, 'link');
        await refresh();
        return;
      } catch {
        /* cancelled */
      }
    }
    await copyShareLink();
  };

  const copyToMine = async () => {
    setBusy(true);
    try {
      const res = await api.copyLineup(lineup.id);
      await refresh();
      showToast('Copied to your lineups', 'success');
      navigate(`/lineups/${res.lineup.id}/edit`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not copy', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteLineup(lineup.id);
      await refresh();
      showToast(`Deleted “${lineup.name}”`, 'info');
      navigate(backTo);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate(backTo)}
        label={backLabel}
        right={
          <div className="row" style={{ gap: 6 }}>
            <Button variant="primary" onClick={() => setShareOpen(true)}>
              <Icon name="share" size={14} /> Share
            </Button>
            {mine ? (
              <>
                <IconButton
                  label="Edit"
                  onClick={() => navigate(`/lineups/${lineup.id}/edit`)}
                >
                  <Icon name="edit" size={16} />
                </IconButton>
                <IconButton label="Delete" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={16} />
                </IconButton>
              </>
            ) : (
              <Button onClick={copyToMine} disabled={busy}>
                <Icon name="copy" size={14} /> Copy
              </Button>
            )}
          </div>
        }
      />

      <div className="stack-xs">
        <h1 className="detail-title">{lineup.name}</h1>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {lineup.theme && <Chip tone="brand">{lineup.theme}</Chip>}
          <Chip>{resolved.length} parts</Chip>
          {team && <Chip>{team.name}</Chip>}
          <span className="tiny">{timeAgo(lineup.lastUsedAt)}</span>
        </div>
      </div>

      <div className="stack-sm">
        {resolved.map((r, i) => (
          <div key={r.itemId} className="part-block">
            <div className="part-head">
              <span className="part-index">{i + 1}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="part-title truncate">{r.song.title}</div>
                <div className="tiny">{r.partLabel}</div>
              </div>
              <Chip tone={r.song.tempo}>
                {r.song.tempo === 'fast' ? 'Fast' : 'Slow'}
              </Chip>
            </div>
            <div className="part-body">
              <LyricView lyrics={r.lyrics} />
            </div>
          </div>
        ))}
      </div>

      <Sheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share lineup"
        subtitle="Anyone with the link can view the full lyrics."
      >
        <div className="stack">
          <div className="share-link-box">
            <span className="truncate" style={{ flex: 1 }}>
              {shareUrl}
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button onClick={copyShareLink} style={{ flex: 1 }}>
              Copy link
            </Button>
            <Button variant="primary" onClick={nativeShare} style={{ flex: 1 }}>
              Share
            </Button>
          </div>
          <Button
            variant="quiet"
            block
            onClick={() => {
              setShareOpen(false);
              navigate(`/s/${lineup.shareToken}`);
            }}
          >
            Preview shared page
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete lineup?"
        subtitle={`“${lineup.name}” will be removed permanently.`}
      >
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={() => setConfirmDelete(false)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
