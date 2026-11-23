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
import { MAJOR_KEYS, MINOR_KEYS, hasChords, stripChords } from '../lib/chords';
import { applyReaderOffset, displayKey } from '../lib/chordView';
import {
  lineupSequenceBlocks,
  resolveSequence,
  songKeyState,
  withSlotKeys,
} from '../lib/lru';
import { useStore } from '../lib/store';
import type { LineupItem } from '../lib/types';

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
  // Per-part key overrides: reader-only nudges for one part without moving the
  // rest of the set. Stored as an absolute offset from the block's written key;
  // a part that has never been touched falls back to the global offset.
  const [sectionOffsets, setSectionOffsets] = useState<Map<string, number>>(
    new Map(),
  );
  /*
   * Collapsed by default. The key section is useful when the band is setting
   * keys, but opening a lineup to read it doesn't need a wall of key pickers
   * up front — the reader taps "Key" to open it. One tap puts it away.
   */
  const [orderOpen, setOrderOpen] = useState(false);
  // Id of the row being saved — a slot id, or a song id for a whole-song save.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const lineup = lineups.find((l) => l.id === id);

  /*
   * The set exactly as it was placed: one section per slot, in the order the
   * builder put them in. A part placed three times appears three times, and a
   * song that comes back after another one comes back where it was put.
   */
  const songBlocks = useMemo(
    () => (lineup ? lineupSequenceBlocks(lineup, songs) : []),
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
  /*
   * The badge is redundant only when the bar underneath it is really there and
   * really naming this key. With no chords on the page there is no bar, so a key
   * the band was told to play in would otherwise be written down nowhere.
   */
  const keyNamedByBar = pageHasChords ? singleKey : '';

  /**
   * The set in the order it is actually played — one row per slot.
   *
   * Deliberately above the `if (!lineup)` return: a hook below a conditional
   * return runs or does not run depending on the data, and React counts hooks.
   */
  const runningOrder = useMemo(() => {
    if (!lineup) return [];
    return resolveSequence(lineup, songs).map((entry) => {
      const item = lineup.items.find((it) => it.id === entry.itemId);
      return {
        itemId: entry.itemId,
        songId: entry.song.id,
        songTitle: entry.song.title,
        partLabel: entry.partLabel,
        writtenKey: entry.writtenKey,
        playKey: item?.key || '',
      };
    });
  }, [lineup, songs]);

  const showToast = (m: string, tone: ToastTone = 'success') => {
    notify(m, tone);
  };

  const printLineup = () => {
    if (typeof window.print === 'function') window.print();
  };

  /** The words as this reader sees them — same function the page renders with. */
  const viewLyrics = (
    block: (typeof songBlocks)[number],
    section: (typeof songBlocks)[number]['sections'][number],
    forcedShowChords?: boolean,
  ) => {
    const effective = sectionOffsets.get(section.key) ?? offset;
    const moved = applyReaderOffset(section.lyrics, builtKeyOf(block), effective);
    return (forcedShowChords ?? showChords) ? moved : stripChords(moved);
  };

  const copySectionLyrics = async (
    block: (typeof songBlocks)[number],
    sec: (typeof songBlocks)[number]['sections'][number],
  ) => {
    const text = viewLyrics(block, sec).trim();
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${sec.partLabel}`, 'success');
    } catch {
      showToast('Could not copy lyrics', 'error');
    }
  };

  const copyAllLyrics = async () => {
    if (!lineup || songBlocks.length === 0) return;
    const formatted = [
      lineup.name,
      '',
      ...songBlocks.map((block, idx) => {
        const body = block.sections
          .map((sec) => `${sec.partLabel}\n${viewLyrics(block, sec).trim()}`)
          .join('\n\n');
        const keyLabel = displayKey(builtKeyOf(block), offset);
        const heading = keyLabel
          ? `${idx + 1}. ${block.songTitle} — key of ${keyLabel}`
          : `${idx + 1}. ${block.songTitle}`;
        return `${heading}\n\n${body}`;
      }),
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(formatted);
      showToast('Lyrics copied', 'success');
    } catch {
      showToast('Could not copy lyrics', 'error');
    }
  };

  const copyAllLyricsWithChords = async () => {
    if (!lineup || songBlocks.length === 0) return;
    const formatted = [
      lineup.name,
      '',
      ...songBlocks.map((block, idx) => {
        const body = block.sections
          .map((sec) => `${sec.partLabel}\n${viewLyrics(block, sec, true)}`)
          .join('\n\n');
        const keyLabel = displayKey(builtKeyOf(block), offset);
        const heading = keyLabel
          ? `${idx + 1}. ${block.songTitle} — key of ${keyLabel}`
          : `${idx + 1}. ${block.songTitle}`;
        return `${heading}\n\n${body}`;
      }),
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(formatted);
      showToast('Lyrics with chords copied', 'success');
    } catch {
      showToast('Could not copy lyrics', 'error');
    }
  };

  const exportLineup = async () => {
    if (!lineup || songBlocks.length === 0) return;
    const formatted = [
      lineup.name,
      '',
      ...songBlocks.map((block, idx) => {
        const body = block.sections
          .map((sec) => `${sec.partLabel}\n${viewLyrics(block, sec).trim()}`)
          .join('\n\n');
        const keyLabel = displayKey(builtKeyOf(block), offset);
        const heading = keyLabel
          ? `${idx + 1}. ${block.songTitle} — key of ${keyLabel}`
          : `${idx + 1}. ${block.songTitle}`;
        return `${heading}\n\n${body}`;
      }),
    ].join('\n\n');

    const blob = new Blob([formatted], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lineup.name.replace(/[^a-z0-9]/gi, '_') || 'lineup'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Lineup exported', 'success');
  };

  /**
   * Write a key onto every slot `match` picks, and keep it.
   *
   * The −/+ bar is for the moment — it moves the page and forgets. This is for
   * the decision made in rehearsal that has to still be true on Sunday, so it
   * writes to the lineup. The server hands back fresh slot ids, so the whole
   * `items` array goes back every time; slots that are not matched keep the key
   * they already had.
   */
  const saveKeys = async (
    match: (item: LineupItem) => boolean,
    nextKey: string,
    busyId: string,
    what: string,
  ) => {
    if (!lineup) return;
    const items = withSlotKeys(lineup.items, match, nextKey);
    setSavingKey(busyId);
    try {
      await api.updateLineup(lineup.id, { items });
      await refresh();
      showToast(
        nextKey ? `Saved — ${what} in ${nextKey}` : `Saved — ${what} back to the written key`,
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save the key', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  /** One part, on its own: the same song elsewhere in the set is untouched. */
  const saveSlotKey = (itemId: string, nextKey: string, what: string) =>
    saveKeys((it) => it.id === itemId, nextKey, itemId, what);

  /** Every part of one song in this lineup, in one go. */
  const saveSongKey = (songId: string, nextKey: string, songTitle: string) =>
    saveKeys((it) => it.songId === songId, nextKey, songId, songTitle);


  /** Every key the pickers offer — the same list, three places on this page. */
  const keyOptions = (
    <>
      <optgroup label="Major">
        {MAJOR_KEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
      <optgroup label="Minor">
        {MINOR_KEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
    </>
  );

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

      {mine && runningOrder.length > 0 && (
        <div className="running-order print-hide">
          <button
            type="button"
            className="running-order-head"
            onClick={() => setOrderOpen((v) => !v)}
            aria-expanded={orderOpen}
          >
            <span>Key</span>
            <span className="tiny">{orderOpen ? 'Hide' : `${runningOrder.length} parts`}</span>
          </button>

          {orderOpen && (
            <div className="running-order-hint">
              A song&rsquo;s key moves every part of it in this lineup. A single part can
              still be moved on its own afterwards.
            </div>
          )}

          {orderOpen &&
            runningOrder.map((row, i) => {
              const startsRun = i === 0 || runningOrder[i - 1].songId !== row.songId;
              const songState = songKeyState(lineup.items, row.songId);
              return (
                <div key={row.itemId}>
                  {startsRun && (
                    <div className="running-order-row running-order-song">
                      <span className="running-order-what">
                        {row.songTitle} <span>· whole song</span>
                      </span>
                      <select
                        className="select running-order-key"
                        aria-label={`Key for every part of ${row.songTitle}`}
                        title="Sets every part of this song in this lineup"
                        value={songState.key}
                        disabled={savingKey === row.songId}
                        onChange={(e) => saveSongKey(row.songId, e.target.value, row.songTitle)}
                      >
                        <option value="">
                          {songState.mixed
                            ? 'Mixed — set all'
                            : row.writtenKey
                              ? `${row.writtenKey} (written)`
                              : 'As written'}
                        </option>
                        {keyOptions}
                      </select>
                    </div>
                  )}

                  <div className="running-order-row">
                    <span className="running-order-num">{i + 1}</span>
                    <span className="running-order-what">
                      <span>· {row.partLabel}</span>
                    </span>

                    <select
                      className="select running-order-key"
                      aria-label={`Key for ${row.songTitle} ${row.partLabel}`}
                      value={row.playKey}
                      disabled={savingKey === row.itemId}
                      onChange={(e) =>
                        saveSlotKey(row.itemId, e.target.value, `${row.songTitle} · ${row.partLabel}`)
                      }
                    >
                      <option value="">
                        {row.writtenKey ? `${row.writtenKey} (written)` : 'As written'}
                      </option>
                      {keyOptions}
                    </select>
                  </div>
                </div>
              );
            })}
        </div>
      )}

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
              {shownKey && shownKey !== keyNamedByBar && (
                <span className="song-key-badge" title={`Key of ${shownKey}`}>
                  {shownKey}
                </span>
              )}
            </div>
            <div className="song-group-sections">
              {block.sections.map((sec) => {
                const sectionEffective =
                  sectionOffsets.get(sec.key) ?? offset;
                return (
                  <div key={sec.key} className="song-section">
                    {!(
                      block.sections.length === 1 &&
                      sec.partLabel.toLowerCase() === 'part'
                    ) && (
                      <div
                        className="row-between"
                        style={{ gap: 8, flexWrap: 'wrap' }}
                      >
                        <div className="song-section-label">{sec.partLabel}</div>
                        {hasChords(sec.lyrics) && (
                          <div className="section-key-control">
                            <button
                              type="button"
                              className="section-key-step"
                              onClick={() =>
                                setSectionOffsets((prev) => {
                                  const next = new Map(prev);
                                  const cur = next.get(sec.key) ?? offset;
                                  next.set(sec.key, cur - 1);
                                  return next;
                                })
                              }
                              aria-label={`Transpose ${sec.partLabel} down`}
                            >
                              −
                            </button>
                            <span
                              className="section-key-readout"
                              title={`Key of ${displayKey(builtKey, sectionEffective)}`}
                            >
                              {displayKey(builtKey, sectionEffective) ||
                                'as written'}
                            </span>
                            <button
                              type="button"
                              className="section-key-step"
                              onClick={() =>
                                setSectionOffsets((prev) => {
                                  const next = new Map(prev);
                                  const cur = next.get(sec.key) ?? offset;
                                  next.set(sec.key, cur + 1);
                                  return next;
                                })
                              }
                              aria-label={`Transpose ${sec.partLabel} up`}
                            >
                              +
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          className="section-copy-btn"
                          onClick={() => copySectionLyrics(block, sec)}
                          aria-label={`Copy ${sec.partLabel} lyrics`}
                        >
                          <Icon name="copy" size={13} />
                        </button>
                      </div>
                    )}
                    <LyricView
                      lyrics={viewLyrics(block, sec)}
                      showChords={showChords}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      <div className="row" style={{ gap: 8, paddingTop: 4 }}>
        <Button onClick={copyAllLyrics} style={{ flex: 1 }}>
          <Icon name="lyrics" size={14} /> Copy lyrics
        </Button>
        <Button onClick={copyShareLink} style={{ flex: 1 }}>
          <Icon name="link" size={14} /> Copy link
        </Button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Button onClick={copyAllLyricsWithChords} style={{ flex: 1 }}>
          <Icon name="lyrics" size={14} /> Copy with chords
        </Button>
        <Button onClick={exportLineup} style={{ flex: 1 }}>
          <Icon name="download" size={14} /> Export as text
        </Button>
      </div>

      <Button block onClick={printLineup}>
        <Icon name="print" size={14} /> Print lineup
      </Button>

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
