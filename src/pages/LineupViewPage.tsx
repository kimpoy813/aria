import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BackBar,
  Button,
  Chip,
  Empty,
  Icon,
  IconButton,
  Sheet,
  Toast,
} from '../components/ui';
import { api } from '../lib/api';
import { reasonLabel, timeAgo } from '../lib/lru';
import { useStore } from '../lib/store';
import type { Lineup } from '../lib/types';

function formatLastUsed(l: Lineup) {
  if (!l.lastUsedAt) return 'Never used';
  return `Used ${timeAgo(l.lastUsedAt)} · ${reasonLabel(l.lastUsedReason)}`;
}

export function LineupViewPage() {
  const { id } = useParams();
  const { lineups, songs, teams, user, refresh } = useStore();
  const navigate = useNavigate();

  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lineup = lineups.find((l) => l.id === id);

  const resolved = useMemo(() => {
    if (!lineup) return [];
    return lineup.items
      .map((it) => {
        const song = songs.find((s) => s.id === it.songId);
        const part = song?.parts.find((p) => p.id === it.partId);
        return song && part ? { id: it.id, song, part } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [lineup, songs]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  if (!lineup) {
    return (
      <div className="stack">
        <BackBar onBack={() => navigate('/lineups')} label="Lineups" />
        <Empty icon="lineup" title="Lineup not found" body="It may have been removed." />
      </div>
    );
  }

  const mine = lineup.ownerId === user?.id;
  const team = lineup.teamId ? teams.find((t) => t.id === lineup.teamId) : null;
  const shareUrl = `${window.location.origin}/s/${lineup.shareToken}`;

  const fastCount = resolved.filter((r) => r.song.tempo === 'fast').length;
  const slowCount = resolved.filter((r) => r.song.tempo === 'slow').length;
  const songCount = new Set(resolved.map((r) => r.song.id)).size;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard may be blocked in insecure contexts */
    }
    try {
      await api.shareLineup(lineup.id, 'link');
      await refresh();
    } catch {
      /* non-fatal */
    }
    showToast('Share link copied · marked as used');
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: lineup.name, url: shareUrl });
        await api.shareLineup(lineup.id, 'link');
        await refresh();
        return;
      } catch {
        /* user cancelled */
      }
    }
    await copyShareLink();
  };

  const copyToMine = async () => {
    setBusy(true);
    try {
      const res = await api.copyLineup(lineup.id);
      await refresh();
      showToast('Copied to your personal lineups');
      navigate(`/lineups/${res.lineup.id}/edit`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not copy');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteLineup(lineup.id);
      await refresh();
      navigate('/lineups');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete');
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate('/lineups')}
        label="Lineups"
        right={
          <div className="row" style={{ gap: 6 }}>
            <Button variant="primary" onClick={() => setShareOpen(true)}>
              <Icon name="share" size={14} /> Share
            </Button>
            {mine ? (
              <>
                <IconButton
                  label="Edit lineup"
                  onClick={() => navigate(`/lineups/${lineup.id}/edit`)}
                >
                  <Icon name="edit" size={16} />
                </IconButton>
                <IconButton label="Delete lineup" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={16} />
                </IconButton>
              </>
            ) : (
              <Button onClick={copyToMine} disabled={busy}>
                <Icon name="copy" size={14} /> Copy &amp; edit
              </Button>
            )}
          </div>
        }
      />

      <div className="card song-hero">
        <div className="stack-xs">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {lineup.theme && <Chip tone="brand">{lineup.theme}</Chip>}
            <Chip>
              {resolved.length} parts · {songCount} songs
            </Chip>
            <Chip tone="fast">
              <Icon name="fast" size={12} /> {fastCount} fast
            </Chip>
            <Chip tone="slow">
              <Icon name="slow" size={12} /> {slowCount} slow
            </Chip>
            {team && (
              <Chip>
                <Icon name="teams" size={12} /> {team.name}
              </Chip>
            )}
          </div>

          <h1 className="song-hero-title">{lineup.name}</h1>

          <div className="tiny">
            <Icon name="clock" size={12} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
            {formatLastUsed(lineup)}
            {lineup.useCount > 0 ? ` · used ${lineup.useCount}×` : ''}
            {!mine ? ` · shared by ${lineup.ownerName}` : ''}
            {lineup.copiedFrom ? ` · copied from ${lineup.copiedFrom}` : ''}
          </div>
        </div>
      </div>

      <div className="stack-sm">
        <div className="row-between">
          <span className="label">Performance sequence ({resolved.length})</span>
          <span className="tiny">Swipe long lyric lines horizontally</span>
        </div>

        {resolved.map((r, i) => {
          const lines = r.part.lyrics.split(/\r?\n/);
          return (
            <div key={r.id} className="part-block">
              <div className="part-head">
                <span className="part-index">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
                    {r.song.title}
                  </div>
                  <div className="tiny">{r.part.label}</div>
                </div>
                <span className="push" />
                <Chip tone={r.song.tempo}>
                  <Icon name={r.song.tempo} size={12} />
                  {r.song.tempo === 'fast' ? 'Fast' : 'Slow'}
                </Chip>
              </div>
              <div className="part-body">
                {lines.map((line, li) => (
                  <div key={li} className="lyric-line">
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share lineup"
        subtitle="Anyone with this link can view the full sequence and lyrics — no sign-in needed. Sharing also marks this lineup as used."
      >
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="share-link-box">
            <Icon name="link" size={16} />
            <span className="truncate" style={{ flex: 1 }}>
              {shareUrl}
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button onClick={copyShareLink} style={{ flex: 1 }}>
              <Icon name="copy" size={14} /> Copy link
            </Button>
            <Button variant="primary" onClick={nativeShare} style={{ flex: 1 }}>
              <Icon name="share" size={14} /> Share
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
            <Icon name="view" size={14} /> Preview public lyric sheet
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete lineup?"
        subtitle={`“${lineup.name}” and its share link will stop working permanently.`}
      >
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <Button onClick={() => setConfirmDelete(false)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy} style={{ flex: 1 }}>
            <Icon name="trash" size={16} /> {busy ? 'Deleting…' : 'Delete lineup'}
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
