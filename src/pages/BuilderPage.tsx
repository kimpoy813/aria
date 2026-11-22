import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { MAJOR_KEYS, MINOR_KEYS } from '../lib/chords';
import { THEME_LIST, analyzeLyrics } from '../lib/nlp';
import { repointSlotsToCopy } from '../lib/lru';
import {
  builderLibrary,
  isTheOriginal,
  ownRecords,
  yourVersionOf,
} from '../lib/scopes';
import { useStore } from '../lib/store';
import type { LineupItem, Song, SongPart, Tempo } from '../lib/types';

function makeSlot(songId: string, partId: string): LineupItem {
  return {
    id: `slot_${Math.random().toString(36).slice(2, 9)}`,
    songId,
    partId,
  };
}

interface TouchDragState {
  index: number;
  label: string;
  x: number;
  y: number;
}

export function BuilderPage() {
  const { id } = useParams();
  const { lineups, songs, user, refresh, notify } = useStore();
  const navigate = useNavigate();

  const existing = id ? lineups.find((l) => l.id === id) : undefined;
  const editing = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? '');
  const [theme, setTheme] = useState(existing?.theme ?? '');
  const [items, setItems] = useState<LineupItem[]>(() =>
    existing ? existing.items.map((x) => ({ ...x })) : [],
  );

  // Keep ALL songs expanded by default so parts never collapse unless explicitly tucked away
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [libTempo, setLibTempo] = useState<'all' | Tempo>('all');

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const [touchDrag, setTouchDrag] = useState<TouchDragState | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);

  const [previewSlot, setPreviewSlot] = useState<{ song: Song; part: SongPart } | null>(null);
  const [titleMissing, setTitleMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyingSongId, setCopyingSongId] = useState<string | null>(null);
  // Which row's sheet is open, by position in the sequence.
  const [keyIndex, setKeyIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // Set by "insert after this": the next part tapped goes here, not at the end.
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  // Whether the key sheet writes to one part or to every part of that song.
  const [keyScope, setKeyScope] = useState<'part' | 'song'>('part');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing && existing.ownerId !== user?.id) {
      navigate(`/lineups/${existing.id}`, { replace: true });
    }
  }, [existing, user?.id, navigate]);

  const showToast = (m: string, tone: ToastTone = 'success') => {
    notify(m, tone);
  };

  /**
   * Brings a shared song into your library and re-points every slot at it.
   *
   * If you already own a copy, that copy is used instead of making a second
   * one. Either way the sequence keeps its parts: a copy has new part ids, so
   * the slots have to be remapped or they would resolve to nothing.
   */
  const useOwnVersionOf = async (song: Song) => {
    setCopyingSongId(song.id);
    try {
      const already = yourVersionOf(songs, song, user?.id);
      const copy = already ?? (await api.copySong(song.id)).song;
      if (!already) await refresh();
      setItems((prev) => repointSlotsToCopy(prev, song, copy));
      showToast(
        already
          ? `Switched to your copy of “${copy.title}”`
          : `Copied “${copy.title}” to your library`,
        'success',
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not copy song', 'error');
    } finally {
      setCopyingSongId(null);
    }
  };

  const resolved = useMemo(() => {
    return items
      .map((it) => {
        const song = songs.find((s) => s.id === it.songId);
        const part =
          song?.parts.find((p) => p.id === it.partId) ??
          (it.partLabel
            ? song?.parts.find((p) => p.label.toLowerCase() === it.partLabel!.toLowerCase())
            : undefined) ??
          (it.partKind ? song?.parts.find((p) => p.kind === it.partKind) : undefined);
        return song && part ? { item: { ...it, partId: part.id }, song, part } : null;
      })
      .filter((x): x is { item: LineupItem; song: Song; part: SongPart } => Boolean(x));
  }, [items, songs]);

  const partUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of resolved) {
      const key = `${r.song.id}:${r.part.id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [resolved]);

  const suggestedTheme = useMemo(() => {
    if (resolved.length === 0) return '';
    return analyzeLyrics(resolved.map((r) => r.part)).theme;
  }, [resolved]);

  const fastCount = useMemo(
    () => resolved.filter((r) => r.song.tempo === 'fast').length,
    [resolved],
  );
  const slowCount = useMemo(
    () => resolved.filter((r) => r.song.tempo === 'slow').length,
    [resolved],
  );
  const songCount = useMemo(
    () => new Set(resolved.map((r) => r.song.id)).size,
    [resolved],
  );

  const checks = {
    parts: resolved.length >= 2,
    songs: songCount >= 2,
    fast: fastCount >= 1,
    slow: slowCount >= 1,
  };

  /*
   * The guardrail names the rule it is checking, in the words the rule uses.
   * "no slow song yet" is actionable; "1/2 parts" is not — it tells you a
   * number is short without saying which number or what to do about it.
   */
  const missing = [
    checks.parts ? '' : `at least two parts (you have ${resolved.length})`,
    checks.songs ? '' : `parts from at least two songs (you have ${songCount})`,
    checks.fast ? '' : 'a fast song',
    checks.slow ? '' : 'a slow song',
  ].filter(Boolean);
  // The same list, shortened for the sticky bar so the bar and the sentence
  // above it can never disagree about what is still missing.
  const missingShort = [
    checks.parts ? '' : '2 parts',
    checks.songs ? '' : '2 songs',
    checks.fast ? '' : 'a fast song',
    checks.slow ? '' : 'a slow song',
  ].filter(Boolean);

  const insertPart = (songId: string, partId: string, at?: number) => {
    const slot = makeSlot(songId, partId);
    // An explicit drop point wins; otherwise honour "insert after this", and
    // failing both, append. Appending is what made the middle of a set
    // unreachable without dragging.
    const target = at !== undefined ? at : insertAfter !== null ? insertAfter + 1 : undefined;
    setItems((prev) => {
      if (target === undefined || target < 0 || target > prev.length) return [...prev, slot];
      const copy = [...prev];
      copy.splice(target, 0, slot);
      return copy;
    });
    const song = songs.find((s) => s.id === songId);
    const part = song?.parts.find((p) => p.id === partId);
    if (song && part) {
      showToast(
        target !== undefined && target < items.length
          ? `Added ${part.label} at position ${target + 1}`
          : `Added ${song.title} · ${part.label}`,
      );
    }
    if (at === undefined && insertAfter !== null) setInsertAfter(null);
  };

  const insertAllSongParts = (song: Song) => {
    const filled = song.parts.filter((p) => p.lyrics.trim().length > 0);
    const source = filled.length > 0 ? filled : song.parts;
    if (source.length === 0) return;
    const newSlots = source.map((p) => makeSlot(song.id, p.id));
    setItems((prev) => [...prev, ...newSlots]);
    showToast(`Added ${newSlots.length} parts from ${song.title}`);
  };

  const moveSlot = (from: number, to: number) => {
    if (from === to) return;
    setItems((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      const [m] = copy.splice(from, 1);
      copy.splice(to, 0, m);
      return copy;
    });
  };

  const duplicateSlot = (index: number) => {
    setItems((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const copy = [...prev];
      const clone = makeSlot(target.songId, target.partId);
      clone.key = target.key || '';
      clone.songKey = target.songKey || '';
      copy.splice(index + 1, 0, clone);
      return copy;
    });
    showToast('Duplicated slot', 'info');
  };

  const removeSlot = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * The key this one occurrence plays in.
   *
   * Deliberately per slot and not per song: a set moves. Song 1 opens in G, the
   * band shifts to D for song 2, and when song 1 comes back at the end it is in
   * D as well — same song, same stored chords, two keys in one lineup.
   */
  const setSlotKey = (slotId: string, nextKey: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === slotId ? { ...it, key: nextKey } : it)),
    );
  };

  /** One move for every part of a song in this lineup — the usual case. */
  const setSongKey = (songId: string, nextKey: string) => {
    setItems((prev) =>
      prev.map((it) => (it.songId === songId ? { ...it, key: nextKey } : it)),
    );
  };

  const onSlotDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-aria-slot', String(index));
  };

  const onPartDragStart = (e: React.DragEvent, songId: string, partId: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-aria-part', JSON.stringify({ songId, partId }));
  };

  const onSlotDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (overIndex !== index) setOverIndex(index);
  };

  const onSlotDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const slotRaw = e.dataTransfer.getData('application/x-aria-slot');
    const partRaw = e.dataTransfer.getData('application/x-aria-part');
    if (slotRaw !== '') {
      moveSlot(Number(slotRaw), index);
    } else if (partRaw) {
      try {
        const { songId, partId } = JSON.parse(partRaw);
        insertPart(songId, partId, index);
      } catch {
        /* ignore */
      }
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const onZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const partRaw = e.dataTransfer.getData('application/x-aria-part');
    const slotRaw = e.dataTransfer.getData('application/x-aria-slot');
    if (partRaw) {
      try {
        const { songId, partId } = JSON.parse(partRaw);
        insertPart(songId, partId);
      } catch {
        /* ignore */
      }
    } else if (slotRaw !== '') {
      moveSlot(Number(slotRaw), items.length - 1);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const hitTestIndex = (clientY: number): number | 'zone' | null => {
    for (let i = 0; i < slotRefs.current.length; i++) {
      const el = slotRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) return i;
    }
    const z = dropzoneRef.current?.getBoundingClientRect();
    if (z && clientY >= z.top && clientY <= z.bottom) return 'zone';
    return null;
  };

  useEffect(() => {
    if (!touchDrag) return;
    const onMove = (e: PointerEvent) => {
      setTouchDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
      const hit = hitTestIndex(e.clientY);
      if (typeof hit === 'number') {
        setOverIndex(hit);
        setDropActive(false);
      } else if (hit === 'zone') {
        setOverIndex(null);
        setDropActive(true);
      } else {
        setOverIndex(null);
        setDropActive(false);
      }
    };
    const onUp = (e: PointerEvent) => {
      const hit = hitTestIndex(e.clientY);
      if (typeof hit === 'number') moveSlot(touchDrag.index, hit);
      else if (hit === 'zone') moveSlot(touchDrag.index, items.length - 1);
      setTouchDrag(null);
      setOverIndex(null);
      setDropActive(false);
      setDragIndex(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchDrag]);

  const startTouchSlot = (e: React.PointerEvent, index: number, label: string) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    setDragIndex(index);
    setTouchDrag({ index, label, x: e.clientX, y: e.clientY });
  };

  /*
   * The picker offers your own library — which is also where copied songs live,
   * since a copy is a new song you own. Teammates' songs stay on the Songs tab,
   * where Copy brings them here.
   */
  const librarySongs = useMemo(
    () => builderLibrary(songs, { viewerId: user?.id, search, tempo: libTempo }),
    [songs, user?.id, search, libTempo],
  );
  const mySongs = useMemo(() => ownRecords(songs, user?.id), [songs, user?.id]);

  const hasCollapsedSongs = useMemo(
    () => librarySongs.some((s) => Boolean(collapsed[s.id])),
    [librarySongs, collapsed],
  );

  const keyRow = keyIndex !== null ? resolved[keyIndex] : null;
  const menuRow = menuIndex !== null ? resolved[menuIndex] : null;
  /** How many parts of that song are in the set — decides whether "whole song" is offered. */
  const partsOfSongInSet = (songId: string) => resolved.filter((r) => r.song.id === songId).length;

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setTitleMissing(true);
      setError('Enter a title for this lineup.');
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameInputRef.current?.focus();
      return showToast('Enter a lineup title', 'error');
    }
    if (resolved.length < 2) {
      setError('Add at least two parts.');
      return showToast('Add at least two parts', 'error');
    }
    if (songCount < 2) {
      setError('Include parts from at least two songs.');
      return showToast('Include parts from at least two songs', 'error');
    }
    if (fastCount === 0 || slowCount === 0) {
      setError('Include both a fast song and a slow song.');
      return showToast('Include both a fast song and a slow song', 'error');
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        theme: theme || suggestedTheme || '',
        teamId: existing?.teamId ?? null,
        items: resolved.map((r) => r.item),
      };
      if (editing && existing) {
        const res = await api.updateLineup(existing.id, payload);
        await refresh();
        showToast('Lineup saved', 'success');
        navigate(`/lineups/${res.lineup.id}`);
      } else {
        const res = await api.createLineup(payload);
        await refresh();
        showToast(`Created “${payload.name}”`, 'success');
        navigate(`/lineups/${res.lineup.id}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save lineup.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate(editing && existing ? `/lineups/${existing.id}` : '/lineups')}
        label={editing ? 'Lineup' : 'Lineups'}
      />

      <div className="page-head">
        <h1>{editing ? 'Edit lineup' : 'New lineup'}</h1>
      </div>

      <div
        className={`card stack lineup-title-card ${
          titleMissing ? 'lineup-title-card-error' : ''
        }`}
      >
        <div className="field">
          <label htmlFor="lineup-title" className="lineup-title-label">
            Lineup title
          </label>
          <input
            ref={nameInputRef}
            id="lineup-title"
            aria-label="Lineup title"
            className={`input lineup-title-input ${titleMissing ? 'input-error' : ''}`}
            placeholder="e.g. Sunday Morning Worship"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (titleMissing) setTitleMissing(false);
              if (error) setError(null);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="lineup-theme">Worship theme</label>
          <select
            id="lineup-theme"
            aria-label="Lineup class"
            className="select"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="">
              {suggestedTheme ? `Auto (${suggestedTheme})` : 'Auto-detect'}
            </option>
            {THEME_LIST.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/*
          One sentence saying what is missing, not four counters that only make
          sense once you already know the rule.
        */}
        <p
          className={`guardrail${missing.length === 0 ? ' ok' : ''}`}
          role="status"
        >
          {missing.length === 0
            ? `Ready — ${resolved.length} parts from ${songCount} songs · ${fastCount} fast, ${slowCount} slow`
            : `A set needs ${missing.join(' and ')} — you have ${resolved.length} parts from ${songCount} songs, ${fastCount} fast and ${slowCount} slow.`}
        </p>
      </div>

      <div className="stack-sm">
        <div className="row-between">
          <span className="label">Sequence ({resolved.length})</span>
          {resolved.length > 0 && (
            <button
              type="button"
              className="link-button tiny"
              onClick={() => setConfirmClear(true)}
            >
              Clear
            </button>
          )}
        </div>

        {insertAfter !== null && resolved[insertAfter] && (
          <div className="insert-banner">
            <span className="truncate">
              Adding after {resolved[insertAfter].song.title} ·{' '}
              {resolved[insertAfter].part.label}
            </span>
            <button type="button" className="link-button tiny" onClick={() => setInsertAfter(null)}>
              Cancel
            </button>
          </div>
        )}

        {resolved.length > 0 && (
          <div className="seq-list">
            {resolved.map(({ item, song, part }, i) => {
              const firstLine =
                part.lyrics
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .find(Boolean) ?? '';
              /*
               * Consecutive parts of one song share a heading. A four-part song
               * was four rows repeating its title; now it is one heading and
               * four short rows, and the set fits on a screen.
               */
              const startsRun = i === 0 || resolved[i - 1].song.id !== song.id;
              let runLength = 1;
              while (
                i + runLength < resolved.length &&
                resolved[i + runLength].song.id === song.id
              ) {
                runLength += 1;
              }
              return (
                <div key={item.id} className="seq-slot">
                  {startsRun && (
                    <div className="seq-run-head">
                      <span className={`tempo-dot ${song.tempo}`} />
                      <span className="truncate seq-run-title">{song.title}</span>
                      <span className="tiny">
                        {runLength} {runLength === 1 ? 'part' : 'parts'}
                      </span>
                    </div>
                  )}

                  <div
                    ref={(el) => {
                      slotRefs.current[i] = el;
                    }}
                    className={[
                      'seq-item',
                      dragIndex === i ? 'dragging' : '',
                      overIndex === i && dragIndex !== i ? 'over' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    draggable
                    onDragStart={(e) => onSlotDragStart(e, i)}
                    onDragOver={(e) => onSlotDragOver(e, i)}
                    onDrop={(e) => onSlotDrop(e, i)}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                  >
                    <button
                      type="button"
                      className="seq-handle"
                      aria-label="Drag to reorder"
                      onPointerDown={(e) =>
                        startTouchSlot(e, i, `${song.title} · ${part.label}`)
                      }
                    >
                      <Icon name="drag" size={16} />
                    </button>

                    <div className="seq-body">
                      <div className="seq-title">
                        <Chip tone={song.tempo}>{part.label}</Chip>
                      </div>
                      {firstLine && <div className="lyric-line muted">{firstLine}</div>}
                    {(() => {
                      if (song.ownerId === user?.id) return null;
                      const myVersion = yourVersionOf(songs, song, user?.id);
                      return (
                      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <span className="tiny">Shared by {song.ownerName}</span>
                      <button
                      type="button"
                      className="copy-action-btn"
                      disabled={copyingSongId === song.id}
                      onClick={() => useOwnVersionOf(song)}
                      >
                      <Icon name="copy" size={12} />{' '}
                      {copyingSongId === song.id
                      ? '…'
                      : myVersion
                      ? isTheOriginal(myVersion, song)
                      ? 'Use original'
                      : 'Use my copy'
                      : 'Copy song'}
                      </button>
                      </div>
                      );
                      })()}
                    </div>

                    {/*
                      The key as a chip, not a dropdown on every row: it is read
                      far more often than it is changed, and five controls on one
                      row is what made a twelve-part set a wall of dropdowns.
                    */}
                    <button
                      type="button"
                      className={`key-chip${item.key ? ' moved' : ''}`}
                      aria-label={`Key for ${song.title} ${part.label}`}
                      title={
                        item.key
                          ? `Moved to ${item.key}${song.key ? ` from ${song.key}` : ''}`
                          : song.key
                            ? `As written in ${song.key}`
                            : 'Set the key this part plays in'
                      }
                      onClick={() => {
                        setKeyScope('part');
                        setKeyIndex(i);
                      }}
                    >
                      {item.key ? `→ ${item.key}` : song.key || 'Key'}
                    </button>

                    <IconButton
                      label={`Options for ${song.title} ${part.label}`}
                      onClick={() => setMenuIndex(i)}
                    >
                      <Icon name="more" size={16} />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(resolved.length === 0 || dropActive || dragIndex !== null || touchDrag !== null) && (
          <div
            ref={dropzoneRef}
            className={`dropzone ${dropActive ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={onZoneDrop}
          >
            {resolved.length === 0 ? 'Tap song parts below' : 'Drop here'}
          </div>
        )}
      </div>

      <div className="stack-sm">
        <div className="row-between">
          <span className="label">Songs</span>
          {hasCollapsedSongs && (
            <button
              type="button"
              className="link-button tiny"
              onClick={() => setCollapsed({})}
            >
              Expand all
            </button>
          )}
        </div>

        {mySongs.length === 0 ? (
          <Empty
            icon="songs"
            title={songs.length === 0 ? 'No songs yet' : 'No songs of yours yet'}
            body={
              songs.length === 0
                ? 'Add songs first.'
                : 'A lineup is built from your own library. Copy a shared song from the Songs tab, or add your own.'
            }
            action={
              songs.length === 0 ? (
                <Button variant="primary" onClick={() => navigate('/songs/new')}>
                  <Icon name="add" size={16} /> Add song
                </Button>
              ) : (
                <Button variant="primary" onClick={() => navigate('/songs')}>
                  <Icon name="songs" size={16} /> Browse songs
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="search">
              <Icon name="search" size={16} />
              <input
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  setSearch(next);
                  // Typing a filter opens everything up — but only by resetting
                  // the state, so the chevron still works while the filter is on.
                  if (next.trim() && !search.trim()) setCollapsed({});
                }}
                placeholder="Filter songs…"
                aria-label="Filter songs"
              />
              {search && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear"
                  onClick={() => setSearch('')}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            <div className="filter-row">
              {(['all', 'fast', 'slow'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`filter-pill ${libTempo === t ? 'active' : ''}`}
                  onClick={() => setLibTempo(t)}
                >
                  {t === 'all' ? 'All' : t === 'fast' ? 'Fast' : 'Slow'}
                </button>
              ))}
            </div>

            <div className="stack-xs">
              {librarySongs.map((song) => {
                /*
                 * The collapse state is the only authority here.
                 *
                 * It used to be `search.trim() || !collapsed[id]`, which meant
                 * that while a search was typed the chevron did nothing at all:
                 * the click stored "collapsed", the render still forced it open,
                 * and the next click stored "collapsed" again. Searching is a
                 * reason to *start* expanded, not a reason to ignore the button.
                 */
                const isOpen = !collapsed[song.id];
                return (
                  <div key={song.id} className="song-picker">
                    <div className="song-picker-head">
                      <span className={`tempo-dot ${song.tempo}`} />
                      <span className="truncate" style={{ flex: 1, fontWeight: 600 }}>
                        {song.title}
                      </span>
                      <Chip tone={song.tempo}>
                        {song.tempo === 'fast' ? 'Fast' : 'Slow'}
                      </Chip>
                      <button
                        type="button"
                        className="song-add-all-btn"
                        onClick={() => insertAllSongParts(song)}
                        title={`Add all parts of ${song.title}`}
                      >
                        <Icon name="add" size={12} /> All
                      </button>
                      <button
                        type="button"
                        className="song-collapse-btn"
                        aria-label={isOpen ? `Collapse ${song.title}` : `Expand ${song.title}`}
                        aria-expanded={isOpen}
                        onClick={() =>
                          setCollapsed((prev) => ({
                            ...prev,
                            [song.id]: isOpen,
                          }))
                        }
                      >
                        <span
                          className="picker-chevron"
                          style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                        >
                          <Icon name="chevronDown" size={16} />
                        </span>
                      </button>
                    </div>

                    {isOpen && (
                      <div className="picker-parts">
                        {song.parts.map((part) => {
                          const first =
                            part.lyrics
                              .split(/\r?\n/)
                              .map((l) => l.trim())
                              .find(Boolean) ?? '';
                          const count = partUsageCount.get(`${song.id}:${part.id}`) || 0;
                          return (
                            <button
                              key={part.id}
                              type="button"
                              className={`part-chip ${count > 0 ? 'part-chip-used' : ''}`}
                              draggable
                              onDragStart={(e) => onPartDragStart(e, song.id, part.id)}
                              onClick={() => insertPart(song.id, part.id)}
                            >
                              <span className="kind">{part.label}</span>
                              <span className="excerpt">{first || 'Empty'}</span>
                              <span className="push" />
                              {count > 0 && (
                                <span className="part-count-badge">×{count}</span>
                              )}
                              <Icon name="add" size={14} className="muted" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="sticky-bar sticky-bar-stack">
        {/*
          The set is built above and the library is below, so the only place a
          leader can see what they have assembled is here.
        */}
        <div className="sticky-bar-summary" aria-live="polite">
          <span>
            {resolved.length} {resolved.length === 1 ? 'part' : 'parts'} · {songCount}{' '}
            {songCount === 1 ? 'song' : 'songs'}
          </span>
          {missingShort.length === 0 ? (
            <span className="sticky-bar-ready">Ready to save</span>
          ) : (
            <span className="sticky-bar-todo">needs {missingShort.join(' and ')}</span>
          )}
        </div>
        <div className="sticky-bar-actions">
          <Button
            onClick={() => navigate(editing && existing ? `/lineups/${existing.id}` : '/lineups')}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>
            {busy ? 'Saving…' : 'Save lineup'}
          </Button>
        </div>
      </div>

      {touchDrag && (
        <div
          style={{
            position: 'fixed',
            left: touchDrag.x,
            top: touchDrag.y,
            transform: 'translate(-50%, -120%)',
            zIndex: 300,
            pointerEvents: 'none',
            background: 'var(--brand)',
            color: 'var(--brand-ink)',
            padding: '6px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {touchDrag.label}
        </div>
      )}

      <Sheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear the sequence?"
        subtitle={`All ${resolved.length} parts will be removed. The songs themselves are untouched.`}
      >
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={() => setConfirmClear(false)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            variant="danger"
            style={{ flex: 1 }}
            onClick={() => {
              setItems([]);
              setInsertAfter(null);
              setConfirmClear(false);
              showToast('Sequence cleared', 'info');
            }}
          >
            Clear
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(menuRow)}
        onClose={() => setMenuIndex(null)}
        title={menuRow ? menuRow.song.title : ''}
        subtitle={menuRow ? menuRow.part.label : ''}
      >
        {menuRow && menuIndex !== null && (
          <div className="stack-xs">
            {/*
              Reordering without dragging. Drag stays for people who like it,
              but on a touch list it is the least reliable gesture there is and
              it was the only one.
            */}
            <Button
              block
              variant="quiet"
              disabled={menuIndex === 0}
              onClick={() => {
                moveSlot(menuIndex, menuIndex - 1);
                setMenuIndex(menuIndex - 1);
              }}
            >
              <Icon name="arrowUp" size={14} /> Move up
            </Button>
            <Button
              block
              variant="quiet"
              disabled={menuIndex === resolved.length - 1}
              onClick={() => {
                moveSlot(menuIndex, menuIndex + 1);
                setMenuIndex(menuIndex + 1);
              }}
            >
              <Icon name="arrowDown" size={14} /> Move down
            </Button>
            <Button
              block
              variant="quiet"
              onClick={() => {
                setInsertAfter(menuIndex);
                setMenuIndex(null);
                showToast('Now tap the part to add after this one', 'info');
              }}
            >
              <Icon name="add" size={14} /> Insert a part after this
            </Button>
            <Button
              block
              variant="quiet"
              onClick={() => {
                duplicateSlot(menuIndex);
                setMenuIndex(null);
              }}
            >
              <Icon name="copy" size={14} /> Duplicate
            </Button>
            <Button
              block
              variant="quiet"
              onClick={() => {
                setPreviewSlot({ song: menuRow.song, part: menuRow.part });
                setMenuIndex(null);
              }}
            >
              <Icon name="view" size={14} /> Preview
            </Button>
            <Button
              block
              variant="danger"
              onClick={() => {
                removeSlot(menuIndex);
                setMenuIndex(null);
                if (insertAfter !== null && insertAfter > menuIndex) setInsertAfter(insertAfter - 1);
              }}
            >
              <Icon name="trash" size={14} /> Remove from the set
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(keyRow)}
        onClose={() => setKeyIndex(null)}
        title={keyRow ? keyRow.song.title : ''}
        subtitle={keyRow ? keyRow.part.label : ''}
      >
        {keyRow && (
          <div className="stack">
            {partsOfSongInSet(keyRow.song.id) > 1 && (
              <div className="filter-row">
                {(['part', 'song'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    className={`filter-pill ${keyScope === scope ? 'active' : ''}`}
                    onClick={() => setKeyScope(scope)}
                  >
                    {scope === 'part' ? 'This part' : 'Whole song'}
                  </button>
                ))}
              </div>
            )}
            <p className="hint">
              {keyScope === 'song'
                ? `Every part of ${keyRow.song.title} in this set will play in the key you pick.`
                : 'Only this part moves. The rest of the song keeps its key.'}
            </p>
            <div className="key-grid">
              <button
                type="button"
                className={`key-option ${
                  (keyScope === 'song'
                    ? resolved
                        .filter((r) => r.song.id === keyRow.song.id)
                        .every((r) => !r.item.key)
                    : !keyRow.item.key)
                    ? 'active'
                    : ''
                }`}
                onClick={() => {
                  if (keyScope === 'song') setSongKey(keyRow.song.id, '');
                  else setSlotKey(keyRow.item.id, '');
                  setKeyIndex(null);
                  showToast(
                    keyScope === 'song'
                      ? `${keyRow.song.title} back to the written key`
                      : 'Back to the written key',
                  );
                }}
              >
                {keyRow.song.key ? `As written (${keyRow.song.key})` : 'As written'}
              </button>
              {[...MAJOR_KEYS, ...MINOR_KEYS].map((k) => {
                const on =
                  keyScope === 'song'
                    ? resolved
                        .filter((r) => r.song.id === keyRow.song.id)
                        .every((r) => r.item.key === k)
                    : keyRow.item.key === k;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`key-option ${on ? 'active' : ''}`}
                    onClick={() => {
                      if (keyScope === 'song') setSongKey(keyRow.song.id, k);
                      else setSlotKey(keyRow.item.id, k);
                      setKeyIndex(null);
                      showToast(
                        keyScope === 'song'
                          ? `${keyRow.song.title} in ${k}`
                          : `${keyRow.part.label} in ${k}`,
                      );
                    }}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(previewSlot)}
        onClose={() => setPreviewSlot(null)}
        title={previewSlot ? previewSlot.song.title : ''}
        subtitle={previewSlot ? previewSlot.part.label : ''}
      >
        {previewSlot && (
          <div className="part-block">
            <div className="part-body">
              {previewSlot.part.lyrics.split(/\r?\n/).map((line, i) => (
                <div key={i} className="lyric-line">
                  {line || '\u00A0'}
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
