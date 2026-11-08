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
import { THEME_LIST, analyzeLyrics } from '../lib/nlp';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing && existing.ownerId !== user?.id) {
      navigate(`/lineups/${existing.id}`, { replace: true });
    }
  }, [existing, user?.id, navigate]);

  const showToast = (m: string, tone: ToastTone = 'success') => {
    notify(m, tone);
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

  const insertPart = (songId: string, partId: string, at?: number) => {
    const slot = makeSlot(songId, partId);
    setItems((prev) => {
      if (at === undefined || at < 0 || at >= prev.length) return [...prev, slot];
      const copy = [...prev];
      copy.splice(at, 0, slot);
      return copy;
    });
    const song = songs.find((s) => s.id === songId);
    const part = song?.parts.find((p) => p.id === partId);
    if (song && part) showToast(`Added ${song.title} · ${part.label}`);
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
      copy.splice(index + 1, 0, makeSlot(target.songId, target.partId));
      return copy;
    });
    showToast('Duplicated slot', 'info');
  };

  const removeSlot = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
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

  const librarySongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return songs.filter((s) => {
      if (libTempo !== 'all' && s.tempo !== libTempo) return false;
      if (!q) return true;
      return `${s.title} ${s.artist} ${s.theme} ${s.parts.map((p) => p.lyrics).join(' ')}`
        .toLowerCase()
        .includes(q);
    });
  }, [songs, search, libTempo]);

  const hasCollapsedSongs = useMemo(
    () => librarySongs.some((s) => Boolean(collapsed[s.id])),
    [librarySongs, collapsed],
  );

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

        <div className="guardrail-bar" aria-label="Requirements">
          <span className={`guardrail-pill ${checks.parts ? 'ok' : ''}`}>
            {resolved.length}/2 parts
          </span>
          <span className={`guardrail-pill ${checks.songs ? 'ok' : ''}`}>
            {songCount}/2 songs
          </span>
          <span className={`guardrail-pill ${checks.fast ? 'ok' : ''}`}>
            {fastCount} fast
          </span>
          <span className={`guardrail-pill ${checks.slow ? 'ok' : ''}`}>
            {slowCount} slow
          </span>
        </div>
      </div>

      <div className="stack-sm">
        <div className="row-between">
          <span className="label">Sequence ({resolved.length})</span>
          {resolved.length > 0 && (
            <button type="button" className="link-button tiny" onClick={() => setItems([])}>
              Clear
            </button>
          )}
        </div>

        {resolved.length > 0 && (
          <div className="seq-list">
            {resolved.map(({ item, song, part }, i) => {
              const firstLine =
                part.lyrics
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .find(Boolean) ?? '';
              return (
                <div
                  key={item.id}
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

                  <span className={`tempo-dot ${song.tempo}`} />

                  <div className="seq-body">
                    <div className="seq-title">
                      <span className="truncate">{song.title}</span>
                      <Chip tone={song.tempo}>{part.label}</Chip>
                    </div>
                    {firstLine && <div className="lyric-line muted">{firstLine}</div>}
                  </div>

                  <div className="seq-toolbar">
                    <IconButton
                      label="Preview"
                      onClick={() => setPreviewSlot({ song, part })}
                    >
                      <Icon name="view" size={14} />
                    </IconButton>
                    <IconButton label="Duplicate" onClick={() => duplicateSlot(i)}>
                      <Icon name="copy" size={14} />
                    </IconButton>
                    <IconButton label="Remove" onClick={() => removeSlot(i)}>
                      <Icon name="trash" size={14} />
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

        {songs.length === 0 ? (
          <Empty
            icon="songs"
            title="No songs yet"
            body="Add songs first."
            action={
              <Button variant="primary" onClick={() => navigate('/songs/new')}>
                <Icon name="add" size={16} /> Add song
              </Button>
            }
          />
        ) : (
          <>
            <div className="search">
              <Icon name="search" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
                const isOpen = Boolean(search.trim()) || !collapsed[song.id];
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

      <div className="sticky-bar">
        <Button
          onClick={() => navigate(editing && existing ? `/lineups/${existing.id}` : '/lineups')}
          style={{ flex: 1 }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={busy}
          style={{ flex: 2 }}
        >
          {busy ? 'Saving…' : 'Save lineup'}
        </Button>
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
