import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { effectiveAnalysis, THEME_LIST } from '../lib/nlp';
import { orderByLRU, resolveSequence, timeAgo, reasonLabel } from '../lib/lru';
import type { LineupItem, Song } from '../lib/types';
import { BackBar, Button, Chip, Empty, Icon, Sheet, Toast } from '../components/ui';

const uid = (prefix = 'tmp') => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const kindLabel = (kind: string) => (kind === 'prechorus' ? 'pre-chorus' : kind);

interface DraftItem extends LineupItem {
  key: string;
}

const toDraft = (items: LineupItem[]): DraftItem[] =>
  items.map((item) => ({ ...item, key: uid('slot') }));

/* ----------------------------------------------------------- palette part */

function PartRow({
  song,
  part,
  onAdd,
}: {
  song: Song;
  part: Song['parts'][number];
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `part_${part.id}`,
    data: { type: 'part', songId: song.id, partId: part.id, label: part.label, title: song.title },
  });

  return (
    <div
      ref={setNodeRef}
      className="part-chip"
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd();
        }
      }}
      {...attributes}
      {...listeners}
    >
      <span className="kind">{kindLabel(part.kind)}</span>
      <span className="excerpt grow">{part.lyrics.split('\n')[0] || part.label}</span>
      <span className="part-add" aria-hidden>
        <Icon.Plus size={14} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- seq item */

function SequenceRow({
  item,
  song,
  partLabel,
  lyrics,
  index,
  total,
  onMove,
  onRemove,
  onDuplicate,
}: {
  item: DraftItem;
  song: Song;
  partLabel: string;
  lyrics: string;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
    data: { type: 'seq' },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`seq-item ${isDragging ? 'dragging' : ''}`}
    >
      <button
        type="button"
        className="seq-handle"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${partLabel} of ${song.title}`}
      >
        <Icon.Drag />
      </button>
      <div className="seq-body">
        <div className="seq-title">
          <span className="seq-index">{index + 1}</span>
          <span className="chip brand" style={{ fontSize: 10.5 }}>
            {partLabel}
          </span>
          <span className="truncate">{song.title}</span>
          <span className={`chip ${song.tempo}`} style={{ fontSize: 10, padding: '2px 7px' }}>
            {song.tempo === 'fast' ? <Icon.Bolt size={10} /> : <Icon.Wave size={10} />}
            {song.tempo}
          </span>
        </div>
        <div className="lyric-line" style={{ fontSize: 12.5, lineHeight: 1.85, color: 'var(--muted)' }}>
          {lyrics.split('\n')[0] || '—'}
        </div>
      </div>
      <div className="seq-toolbar">
        <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
          <Icon.Up size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Move down"
        >
          <Icon.Down size={14} />
        </button>
        <button type="button" className="icon-btn" onClick={onDuplicate} aria-label="Repeat this part">
          <Icon.Copy size={14} />
        </button>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove from lineup">
          <Icon.Close size={14} />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- page */

export function BuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { songs, lineups, teams, user, refresh } = useStore();
  const editing = lineups.find((l) => l.id === id) || null;
  const isOwner = !editing || editing.ownerId === user?.id;

  const [name, setName] = useState(editing?.name ?? '');
  const [theme, setTheme] = useState(editing?.theme ?? '');
  const [teamId, setTeamId] = useState(editing?.teamId ?? '');
  const [items, setItems] = useState<DraftItem[]>(editing ? toDraft(editing.items) : []);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState<null | 'share' | 'library'>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareTeam, setShareTeam] = useState(teams[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastDropAt = useRef(0);
  // A teammate's first save creates their own copy; later saves update that copy
  // instead of piling up duplicates.
  const createdCopy = useRef<{ id: string; name: string; shareToken: string } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 130, tolerance: 9 } }),
  );

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const { setNodeRef: setEndRef, isOver: isOverEnd } = useDroppable({ id: 'sequence-end' });

  const resolved = useMemo(
    () =>
      items.flatMap((item) => {
        const song = songs.find((s) => s.id === item.songId);
        if (!song) return [];
        const part = song.parts.find((p) => p.id === item.partId);
        if (!part) return [];
        return [{ item, song, part }];
      }),
    [items, songs],
  );

  const fastCount = resolved.filter((r) => r.song.tempo === 'fast').length;
  const slowCount = resolved.length - fastCount;
  const songCount = new Set(resolved.map((r) => r.song.id)).size;
  const ready = resolved.length >= 2 && fastCount > 0 && slowCount > 0 && songCount >= 2;

  const classes = useMemo(() => {
    const set = new Set(songs.map((s) => effectiveAnalysis(s).theme));
    return [...THEME_LIST.filter((t) => set.has(t)), ...[...set].filter((t) => !THEME_LIST.includes(t))];
  }, [songs]);

  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs
      .map((song) => ({ song, analysis: effectiveAnalysis(song) }))
      .filter(({ song, analysis }) => {
        if (classFilter && analysis.theme !== classFilter) return false;
        if (!q) return true;
        return (
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          analysis.theme.toLowerCase().includes(q) ||
          analysis.keywords.some((k) => k.includes(q)) ||
          song.parts.some((p) => p.lyrics.toLowerCase().includes(q))
        );
      })
      .sort((a, b) =>
        classFilter ? a.analysis.theme.localeCompare(b.analysis.theme) : b.song.updatedAt - a.song.updatedAt,
      );
  }, [songs, query, classFilter]);

  const ownedPool = useMemo(
    () => orderByLRU(lineups.filter((l) => l.ownerId === user?.id && l.id !== editing?.id)),
    [lineups, user?.id, editing?.id],
  );
  const suggestion = ownedPool[0] || null;

  const addPart = (song: Song, part: Song['parts'][number], atIndex?: number) => {
    const next: DraftItem = { id: uid('item'), songId: song.id, partId: part.id, key: uid('slot') };
    setItems((prev) => {
      const index = atIndex === undefined ? prev.length : atIndex;
      return [...prev.slice(0, index), next, ...prev.slice(index)];
    });
    flash(`Added ${part.label} of ${song.title}`);
  };

  const addSong = (song: Song) => {
    setItems((prev) => [
      ...prev,
      ...song.parts.map((part) => ({
        id: uid('item'),
        songId: song.id,
        partId: part.id,
        key: uid('slot'),
      })),
    ]);
    flash(`Added all ${song.parts.length} parts of ${song.title}`);
  };

  const loadSuggestion = () => {
    if (!suggestion) return;
    const sequence = resolveSequence(suggestion, songs);
    setItems(
      sequence.map((entry) => ({
        id: uid('item'),
        songId: entry.song.id,
        partId: entry.partId,
        key: uid('slot'),
      })),
    );
    if (!name) setName(`${suggestion.name} · remix`);
    if (!theme) setTheme(suggestion.theme);
    flash('Loaded the least recently used sequence');
  };

  const persist = async (options: { keepOpen?: boolean } = {}) => {
    if (!user) return null;
    if (resolved.length < 2) {
      flash('Add at least 2 parts to the sequence');
      return null;
    }
    if (fastCount === 0 || slowCount === 0) {
      flash('Include at least one fast and one slow track');
      return null;
    }
    if (songCount < 2) {
      flash('Use parts from at least 2 different songs');
      return null;
    }
    // Build from resolvable parts only, so deleted songs can never break a save.
    const payloadItems = resolved.map(({ song, part }) => ({ songId: song.id, partId: part.id }));
    const owned = editing && isOwner ? editing : createdCopy.current;
    if (owned) {
      const { lineup } = await api.updateLineup(owned.id, {
        userId: user.id,
        name: name.trim() || owned.name,
        theme,
        items: payloadItems,
        teamId: teamId || null,
      });
      await refresh();
      return lineup;
    }
    const { lineup } = await api.createLineup({
      userId: user.id,
      name:
        name.trim() ||
        (editing ? `${editing.name} (my copy)` : `Lineup ${new Date().toLocaleDateString()}`),
      theme,
      items: payloadItems,
      teamId: teamId || null,
    });
    createdCopy.current = { id: lineup.id, name: lineup.name, shareToken: lineup.shareToken };
    await refresh();
    if (!options.keepOpen) navigate(`/lineups/${lineup.id}`, { replace: true });
    return lineup;
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await persist();
      if (saved) flash('Lineup saved');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save the lineup');
    } finally {
      setBusy(false);
    }
  };

  const shareToTeam = async () => {
    if (!user || !shareTeam) return;
    setBusy(true);
    try {
      const saved = await persist({ keepOpen: true });
      const target = saved ?? editing;
      if (!target) return;
      await api.shareLineup(target.id, user.id, 'team', shareTeam);
      setTeamId(shareTeam);
      await refresh();
      setSheetOpen(null);
      flash('Shared with your team — marked as used');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not share');
    } finally {
      setBusy(false);
    }
  };

  const buildLink = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const saved = await persist({ keepOpen: true });
      const target = saved ?? editing;
      if (!target) return;
      await api.shareLineup(target.id, user.id, 'link');
      const url = `${window.location.origin}/s/${target.shareToken}`;
      setShareLink(url);
      await refresh();
      await navigator.clipboard.writeText(url).catch(() => undefined);
      if (navigator.share) {
        await navigator
          .share({ title: target.name, text: 'An Aria lineup', url })
          .catch(() => undefined);
      }
      flash('Link ready — lineup marked as used');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create a link');
    } finally {
      setBusy(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'part') setActiveLabel(`${data.label} · ${data.title}`);
    else setActiveLabel('Reorder');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLabel(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current;

    if (data?.type === 'part') {
      lastDropAt.current = Date.now();
      const song = songs.find((s) => s.id === data.songId);
      const part = song?.parts.find((p) => p.id === data.partId);
      if (!song || !part) return;
      const targetIndex =
        over.data.current?.type === 'seq'
          ? items.findIndex((i) => i.key === over.id)
          : items.length;
      addPart(song, part, targetIndex < 0 ? items.length : targetIndex);
      return;
    }

    if (active.id !== over.id) {
      setItems((prev) => {
        const from = prev.findIndex((i) => i.key === active.id);
        const to = prev.findIndex((i) => i.key === over.id);
        if (from < 0 || to < 0) return prev;
        return arrayMove(prev, from, to);
      });
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate(editing ? `/lineups/${editing.id}` : '/lineups')}
        title={editing ? 'Edit lineup' : 'New lineup'}
        right={
          <Button size="sm" variant="quiet" onClick={() => setSheetOpen('share')}>
            <Icon.Share size={14} />
          </Button>
        }
      />

      <div>
        <input
          className="input title-input"
          value={name}
          placeholder="Name this lineup…"
          aria-label="Lineup name"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="small muted" style={{ marginTop: 2 }}>
          Tap a part to add it. Hold and drag to place it, or drag the handle to reorder.
        </p>
      </div>

      <div className="chip-scroll">
        <Chip active={!theme} onClick={() => setTheme('')}>
          No class
        </Chip>
        {classes.map((t) => (
          <Chip key={t} active={theme === t} onClick={() => setTheme(theme === t ? '' : t)}>
            {t}
          </Chip>
        ))}
      </div>

      {editing ? (
        <div className="card tight">
          <div className="row-between">
            <span className="badge lru">
              <Icon.Clock size={12} /> Last used {timeAgo(editing.lastUsedAt)}
            </span>
            <span className="tiny muted">{reasonLabel(editing.lastUsedReason)}</span>
          </div>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            LRU rank {orderByLRU(lineups).findIndex((l) => l.id === editing.id) + 1} of{' '}
            {lineups.length}
            {suggestion ? ` · freshest alternative: “${suggestion.name}”` : ''}
          </p>
        </div>
      ) : suggestion ? (
        <div className="card brand stack-sm">
          <div className="row-between">
            <span className="badge lru">
              <Icon.Clock size={12} /> Least recently used
            </span>
            <span className="tiny muted">{timeAgo(suggestion.lastUsedAt)}</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{suggestion.name}</div>
            <p className="tiny muted" style={{ marginTop: 2 }}>
              Start from the set used longest ago instead of repeating a recent one.
            </p>
          </div>
          <Button size="sm" variant="soft" onClick={loadSuggestion}>
            <Icon.Refresh size={13} /> Use its sequence
          </Button>
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveLabel(null)}
      >
        <div className="section-label" style={{ marginTop: 6 }}>
          <h2>Sequence</h2>
          <span className="tiny muted">
            {resolved.length} part{resolved.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mix-row">
          <span className={`chip ${fastCount > 0 ? 'fast' : ''}`}>
            <Icon.Bolt size={12} /> {fastCount} fast
          </span>
          <span className={`chip ${slowCount > 0 ? 'slow' : ''}`}>
            <Icon.Wave size={12} /> {slowCount} slow
          </span>
          <span className={`chip ${songCount >= 2 ? 'brand' : ''}`}>
            <Icon.Note size={12} /> {songCount} song{songCount === 1 ? '' : 's'}
          </span>
          <span className={`chip ${ready ? 'brand' : 'fast'}`}>
            {ready ? 'Ready' : 'Needs fast + slow'}
          </span>
        </div>

        {resolved.length === 0 ? (
          <div ref={setEndRef} className={`dropzone ${isOverEnd ? 'active' : ''}`}>
            {isOverEnd ? 'Drop to add' : 'No parts yet — tap a part below or drag it here.'}
          </div>
        ) : (
          <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
            <div className="seq-list">
              {resolved.map(({ item, song, part }, index) => (
                <SequenceRow
                  key={item.key}
                  item={item}
                  song={song}
                  partLabel={part.label}
                  lyrics={part.lyrics}
                  index={index}
                  total={resolved.length}
                  onMove={(dir) => move(index, dir)}
                  onRemove={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                  onDuplicate={() =>
                    setItems((prev) => {
                      const at = prev.findIndex((i) => i.key === item.key);
                      const copy: DraftItem = { ...item, id: uid('item'), key: uid('slot') };
                      return [...prev.slice(0, at + 1), copy, ...prev.slice(at + 1)];
                    })
                  }
                />
              ))}
              <div ref={setEndRef} className={`dropzone ${isOverEnd ? 'active' : ''}`} style={{ padding: 10 }}>
                {isOverEnd ? 'Drop to add at the end' : 'Drop here to add at the end'}
              </div>
            </div>
          </SortableContext>
        )}

        <div className="section-label">
          <h2>Song library</h2>
          <span className="tiny muted">tap or drag</span>
        </div>

        <div className="stack-sm">
          <div className="search-wrap">
            <span className="search-icon">
              <Icon.Search />
            </span>
            <input
              className="input"
              placeholder="Search title or lyric…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search song library"
            />
          </div>
          <div className="chip-scroll">
            <Chip active={!classFilter} onClick={() => setClassFilter('')}>
              All classes
            </Chip>
            {classes.map((t) => (
              <Chip
                key={t}
                active={classFilter === t}
                onClick={() => setClassFilter(classFilter === t ? '' : t)}
              >
                {t}
              </Chip>
            ))}
          </div>
          {classFilter ? (
            <p className="tiny muted">
              {library.length} song{library.length === 1 ? '' : 's'} classed{' '}
              <strong>{classFilter}</strong> — plenty for a {classFilter.toLowerCase()}-led lineup.
            </p>
          ) : null}
        </div>

        <div className="stack-sm" style={{ marginTop: 8 }}>
          {library.length === 0 ? (
            <Empty
              title="No songs match"
              body="Clear the class filter, or add a song with different lyrics."
              action={<Button onClick={() => navigate('/songs/new')}>Add a song</Button>}
            />
          ) : (
            library.map(({ song, analysis }) => {
              const open = expanded.has(song.id);
              return (
                <div className="song-picker" key={song.id}>
                  <button
                    type="button"
                    className="song-picker-head"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(song.id)) next.delete(song.id);
                        else next.add(song.id);
                        return next;
                      })
                    }
                  >
                    <span className={`tempo-dot ${song.tempo}`} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <h3 className="truncate">{song.title}</h3>
                      <div className="tiny muted truncate">
                        {analysis.theme} · {song.parts.length} part
                        {song.parts.length === 1 ? '' : 's'}
                        {song.ownerId !== user?.id ? ` · ${song.ownerName}` : ''}
                      </div>
                    </div>
                    <span className="picker-chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
                      <Icon.ChevronDown size={16} />
                    </span>
                  </button>
                  {open ? (
                    <div className="picker-parts">
                      {song.parts.map((part) => (
                        <PartRow
                          key={part.id}
                          song={song}
                          part={part}
                          onAdd={() => {
                            // A tap that follows a drag should not double-add.
                            if (Date.now() - lastDropAt.current > 350) addPart(song, part);
                          }}
                        />
                      ))}
                      {song.parts.length > 1 ? (
                        <Button size="sm" variant="quiet" onClick={() => addSong(song)}>
                          <Icon.Plus size={13} /> Add all {song.parts.length} parts
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLabel ? (
            <div
              className="chip"
              style={{ background: 'var(--brand)', color: 'var(--brand-ink)', boxShadow: 'var(--shadow-lg)' }}
            >
              {activeLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="sticky-bar">
        <Button
          variant="quiet"
          onClick={() => setSheetOpen('library')}
          ariaLabel="How adding works"
          className="btn-icon-only"
        >
          <Icon.Note2 size={17} />
        </Button>
        {isOwner ? (
          <Button variant="primary" block onClick={save} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save lineup' : 'Save lineup'}
          </Button>
        ) : (
          <Button variant="primary" block onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save as my copy'}
          </Button>
        )}
        <Button onClick={() => setSheetOpen('share')} ariaLabel="Share lineup">
          <Icon.Share />
        </Button>
      </div>

      <Sheet
        open={sheetOpen === 'share'}
        onClose={() => setSheetOpen(null)}
        title="Share this lineup"
        subtitle="Sharing counts as use — that keeps LRU honest."
      >
        <div className="stack-sm">
          <div className="card tight stack-sm" style={{ boxShadow: 'none' }}>
            <div className="label">View-only link</div>
            <p className="hint">Anyone can open it. Shows every part with its lyrics.</p>
            <Button variant="primary" block onClick={buildLink} disabled={busy}>
              <Icon.Link /> {shareLink ? 'Copy link again' : 'Create & share link'}
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
              <p className="hint">Teammates can open it, copy it, or pass it on.</p>
              <select
                className="select"
                value={shareTeam || teams[0]?.id}
                onChange={(e) => setShareTeam(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.members.length} member{t.members.length === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
              <Button block onClick={shareToTeam} disabled={busy}>
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
        </div>
      </Sheet>

      <Sheet open={sheetOpen === 'library'} onClose={() => setSheetOpen(null)} title="How adding works">
        <div className="stack-sm">
          <p className="small muted">
            Tap any part to add it at the end of your sequence. Hold a part and drag it onto the
            sequence to drop it between two parts. Inside the sequence, drag the handle to reorder,
            or use the arrows.
          </p>
          <p className="small muted">
            Repeat a part with the copy icon — a chorus can appear as many times as you like. Each
            active song needs one fast and one slow track in the set.
          </p>
          <Button block onClick={() => setSheetOpen(null)}>
            Got it
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
