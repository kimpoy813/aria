import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LyricView } from '../components/LyricView';
import {
  BackBar,
  Button,
  Empty,
  Icon,
  IconButton,
  Sheet,
  type ToastTone,
} from '../components/ui';
import { api } from '../lib/api';
import { groupLineupSongBlocks, resolveSequence } from '../lib/lru';
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

  const songBlocks = useMemo(
    () =>
      groupLineupSongBlocks(
        resolved.map((r) => ({
          songKey: r.song.id,
          songTitle: r.song.title,
          partLabel: r.partLabel,
          lyrics: r.lyrics,
        })),
      ),
    [resolved],
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
      showToast(`Copied “${lineup.name}” to your account`, 'success');
      navigate(`/lineups/${res.lineup.id}`);
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

  const metaParts = [
    !mine ? `by ${lineup.ownerName}` : null,
    lineup.theme || null,
    team?.name || null,
  ].filter(Boolean);

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate(backTo)}
        label={backLabel}
        right={
          <div className="row" style={{ gap: 6 }}>
            {mine ? (
              <>
                <Button variant="primary" onClick={() => setShareOpen(true)}>
                  <Icon name="share" size={14} /> Share
                </Button>
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
              <>
                <IconButton label="Share" onClick={() => setShareOpen(true)}>
                  <Icon name="share" size={16} />
                </IconButton>
                <Button variant="primary" onClick={copyToMine} disabled={busy}>
                  <Icon name="copy" size={14} /> {busy ? 'Copying…' : 'Copy lineup'}
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="stack-xs">
        <h1 className="detail-title">{lineup.name}</h1>
        {metaParts.length > 0 && <div className="tiny">{metaParts.join(' · ')}</div>}
      </div>

      <div className="stack">
        {songBlocks.map((block, i) => (
          <div key={block.key} className="song-group-block">
            <div className="song-group-head">
              <span className="part-index">{i + 1}</span>
              <h2 className="song-group-title truncate">{block.songTitle}</h2>
            </div>
            <div className="song-group-sections">
              {block.sections.map((sec) =>
                sec.isRepeat ? (
                  <div key={sec.key} className="song-section-repeat">
                    ↻ {sec.partLabel}
                  </div>
                ) : (
                  <div key={sec.key} className="song-section">
                    {!(
                      block.sections.length === 1 &&
                      sec.partLabel.toLowerCase() === 'part'
                    ) && <div className="song-section-label">{sec.partLabel}</div>}
                    <LyricView lyrics={sec.lyrics} />
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <Sheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share lineup"
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
