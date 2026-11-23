import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChordControls } from '../components/ChordControls';
import { LyricView } from '../components/LyricView';
import { Wordmark } from '../components/Logo';
import { Button, Empty, Icon, IconButton, type ToastTone } from '../components/ui';
import { api } from '../lib/api';
import { hasChords, stripChords } from '../lib/chords';
import { applyReaderOffset, displayKey } from '../lib/chordView';
import { sharedSequenceBlocks } from '../lib/lru';
import { useStore } from '../lib/store';
import type { SharedLineup } from '../lib/types';

export function SharedPage() {
  const { token } = useParams();
  const { theme, toggleTheme, notify } = useStore();
  const [lineup, setLineup] = useState<SharedLineup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [largeText, setLargeText] = useState(false);
  // Everything below is this reader's view only. Nothing here is written back:
  // a visitor transposing for their own voice must not move the band's sheet,
  // and the next person to open the same link sees it as it was sent.
  // Chords start hidden when a lineup link is opened; the reader turns them on
  // with the ChordControls bar if they want to see them.
  const [showChords, setShowChords] = useState(false);
  const [offset, setOffset] = useState(0);
  // Per-part key overrides: a reader can nudge one part without moving the rest
  // of the set. Stored as an absolute offset from the block's written key; a
  // part that has never been touched falls back to the global offset.
  const [sectionOffsets, setSectionOffsets] = useState<Map<string, number>>(
    new Map(),
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .shared(token)
      .then((res) => {
        setLineup(res.lineup);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Invalid link'))
      .finally(() => setLoading(false));
  }, [token]);

  const showToast = (msg: string, tone: ToastTone = 'success') => {
    notify(msg, tone);
  };

  const printLineup = () => {
    if (typeof window.print === 'function') window.print();
  };

  /*
   * The set exactly as the owner placed it — the same order, the same parts,
   * and a part they put in three times appearing three times. This page is what
   * the band reads from, so it has to be the sheet the owner saw in the preview
   * and not a rearrangement of it.
   */
  const songBlocks = useMemo(
    () => (lineup ? sharedSequenceBlocks(lineup.items) : []),
    [lineup],
  );

  /** The key a block was sent in — the slot's key, or the song's if unset. */
  const builtKeyOf = (block: (typeof songBlocks)[number]) =>
    block.playKey || block.writtenKey || '';

  const pageHasChords = useMemo(
    () => songBlocks.some((b) => b.sections.some((sec) => hasChords(sec.lyrics))),
    [songBlocks],
  );

  /*
   * One key across the page and the bar can name it. Two songs in two keys and
   * it cannot, so the bar speaks in moves and each song names its own key.
   */
  const builtKeys = useMemo(
    () => [...new Set(songBlocks.map(builtKeyOf).filter(Boolean))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songBlocks],
  );
  const singleKey = builtKeys.length === 1 ? builtKeys[0] : '';
  // Redundant only when the bar is on the page and naming this key. A song with
  // no chords has no bar, and its key still has to be written down somewhere.
  const keyNamedByBar = pageHasChords ? singleKey : '';

  /** The words as this reader sees them — same function the page renders with. */
  const viewLyrics = (
    block: (typeof songBlocks)[number],
    section: (typeof songBlocks)[number]['sections'][number],
    text: string,
    forcedShowChords?: boolean,
  ) => {
    const effective = sectionOffsets.get(section.key) ?? offset;
    const moved = applyReaderOffset(text, builtKeyOf(block), effective);
    return (forcedShowChords ?? showChords) ? moved : stripChords(moved);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Link copied', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  const copyAllLyrics = async () => {
    if (!lineup || songBlocks.length === 0) return;
    const formatted = [
      lineup.name,
      '',
      ...songBlocks.map((block, idx) => {
        const body = block.sections
          .map((sec) => `${sec.partLabel}\n${viewLyrics(block, sec, sec.lyrics).trim()}`)
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

  const copySectionLyrics = async (
    block: (typeof songBlocks)[number],
    sec: (typeof songBlocks)[number]['sections'][number],
  ) => {
    const text = viewLyrics(block, sec, sec.lyrics).trim();
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${sec.partLabel}`, 'success');
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
          .map((sec) => `${sec.partLabel}\n${viewLyrics(block, sec, sec.lyrics, true).trim()}`)
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
          .map((sec) => `${sec.partLabel}\n${viewLyrics(block, sec, sec.lyrics).trim()}`)
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

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand-home" style={{ textDecoration: 'none' }}>
            <Wordmark size={24} />
          </Link>
          <div className="push" />
          {lineup && lineup.items.length > 0 && (
            <button
              type="button"
              className={`text-size-btn ${largeText ? 'active' : ''}`}
              aria-label={largeText ? 'Standard text size' : 'Larger lyric text'}
              aria-pressed={largeText}
              onClick={() => setLargeText((v) => !v)}
            >
              Aa
            </button>
          )}
          {songBlocks.length > 0 && (
            <IconButton
              label="Print lineup"
              className="icon-btn-ghost"
              onClick={printLineup}
            >
              <Icon name="print" size={16} />
            </IconButton>
          )}
          <IconButton
            label="Copy link"
            className="icon-btn-ghost"
            onClick={copyUrl}
          >
            <Icon name="copy" size={16} />
          </IconButton>
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="icon-btn-ghost"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
        </div>
      </header>

      <main className="app-main no-nav">
        {loading ? (
          <div className="overlay-center" style={{ minHeight: '50vh' }}>
            <span className="tiny">Loading…</span>
          </div>
        ) : error || !lineup ? (
          <Empty
            icon="link"
            title="Link unavailable"
            body={error ?? 'Ask the sender for an updated link.'}
            action={
              <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                Open Aria
              </Link>
            }
          />
        ) : (
          <div className="stack">
            <div className="stack-xs">
              <h1 className="detail-title">{lineup.name}</h1>
              <span className="tiny">
                {songBlocks.length} {songBlocks.length === 1 ? 'song' : 'songs'}
                {singleKey ? ` · key of ${displayKey(singleKey, offset)}` : ''}
              </span>
            </div>

            {pageHasChords && (
              <ChordControls
                hasChords={pageHasChords}
                showChords={showChords}
                onToggleChords={() => setShowChords((v) => !v)}
                writtenKey={singleKey}
                offset={offset}
                onChangeOffset={setOffset}
              />
            )}

            {songBlocks.length === 0 ? (
              <Empty
                icon="lyrics"
                title="No songs in this lineup"
                body="The sender has not added lyric sections to this lineup yet."
              />
            ) : (
              <div className="stack song-group-grid">
                {songBlocks.map((block, i) => {
                  const builtKey = builtKeyOf(block);
                  const shownKey = displayKey(builtKey, offset);
                  return (
                  <article key={block.key} className="song-group-block">
                    <div className="song-group-head">
                      <span className="part-index">{i + 1}</span>
                      <h2 className="song-group-title truncate">{block.songTitle}</h2>
                      {/* Named per song only when the bar is not already saying it. */}
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
                                <div className="song-section-label">
                                  {sec.partLabel}
                                </div>
                                {hasChords(sec.lyrics) && (
                                  <div className="section-key-control">
                                    <button
                                      type="button"
                                      className="section-key-step"
                                      onClick={() =>
                                        setSectionOffsets((prev) => {
                                          const next = new Map(prev);
                                          const cur =
                                            next.get(sec.key) ?? offset;
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
                                      title={`Key of ${displayKey(
                                        builtKey,
                                        sectionEffective,
                                      )}`}
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
                                          const cur =
                                            next.get(sec.key) ?? offset;
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
                              lyrics={applyReaderOffset(
                                sec.lyrics,
                                builtKey,
                                sectionEffective,
                              )}
                              large={largeText}
                              showChords={showChords}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </article>
                  );
                })}
              </div>
            )}

            <div className="row" style={{ gap: 8, paddingTop: 4 }}>
              <Button onClick={copyAllLyrics} style={{ flex: 1 }}>
                <Icon name="lyrics" size={14} /> Copy lyrics
              </Button>
              <Button onClick={copyUrl} style={{ flex: 1 }}>
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
          </div>
        )}
      </main>
    </div>
  );
}
