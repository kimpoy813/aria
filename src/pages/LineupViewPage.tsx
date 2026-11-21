import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChordControls } from '../components/ChordControls';
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
import { hasChords } from '../lib/chords';
import { applyReaderOffset, displayKey } from '../lib/chordView';
import { lineupFullLyricBlocks } from '../lib/lru';
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
  // The reader's own view: chords on or off, and how far they have moved the
  // key for their voice. Neither is saved — the band's sheet is untouched.
  const [showChords, setShowChords] = useState(true);
  const [offset, setOffset] = useState(0);

  const lineup = lineups.find((l) => l.id === id);

  /*
   * The whole song, not just the parts that were picked into the lineup. The
   * builder selects a verse and a chorus; the person reading or printing this
   * page is singing everything.
   */
  const songBlocks = useMemo(
    () => (lineup ? lineupFullLyricBlocks(lineup, songs) : []),
    [lineup, songs],
  );

  /** The key a block was built in — the slot's key, or the song's if unset. */
  const builtKeyOf = (block: (typeof songBlocks)[number]) => block.playKey || block.writtenKey || '';

  const pageHasChords = useMemo(
    () => songBlocks.some((b) => b.sections.some((sec) => hasChords(sec.lyrics))),
    [songBlocks],
  );

  /*
   * Every song in one key means the bar can name that key. Two songs in two
   * keys means it cannot, so the bar speaks in moves and each song names its
   * own key beside its title.
   */
  const builtKeys = useMemo(
    () => [...new Set(songBlocks.map(builtKeyOf).filter(Boolean))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songBlocks],
  );
  const singleKey = builtKeys.length === 1 ? builtKeys[0] : '';

  const showToast = (m: string, tone: ToastTone = 'success') => {
    notify(m, tone);
  };

  const printLineup = () => {
    if (typeof window.print === 'function') window.print();
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
            <IconButton label="Print lineup" onClick={printLineup}>
              <Icon name="print" size={16} />
            </IconButton>
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

      {pageHasChords && (
        <div className="print-hide">
          <ChordControls
            hasChords={pageHasChords}
            showChords={showChords}
            onToggleChords={() => setShowChords((v) => !v)}
            writtenKey={singleKey}
            offset={offset}
            onChangeOffset={setOffset}
          />
        </div>
      )}

      <div className="stack">
        {songBlocks.map((block, i) => {
          const builtKey = builtKeyOf(block);
          const shownKey = displayKey(builtKey, offset);
          return (
          <div key={block.key} className="song-group-block">
            <div className="song-group-head">
              <span className="part-index">{i + 1}</span>
              <h2 className="song-group-title truncate">{block.songTitle}</h2>
              {/*
                Named per song, and only when it differs from what the bar
                already says — otherwise it is the same word twice.
              */}
              {shownKey && shownKey !== singleKey && (
                <span className="song-key-badge" title={`Key of ${shownKey}`}>
                  {shownKey}
                </span>
              )}
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
                    <LyricView
                      lyrics={applyReaderOffset(sec.lyrics, builtKey, offset)}
                      showChords={showChords}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
          );
        })}
      </div>

      <footer className="print-only print-foot">
        <span>{lineup.name}</span>
        <span>
          {songBlocks.length} {songBlocks.length === 1 ? 'song' : 'songs'} · printed{' '}
          {new Date().toLocaleDateString()}
        </span>
      </footer>

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
          <Button variant="quiet" block onClick={printLineup}>
            <Icon name="print" size={14} /> Print lineup
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
