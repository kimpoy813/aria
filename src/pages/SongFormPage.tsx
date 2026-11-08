import { useEffect, useMemo, useState, type ClipboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnalysisCard } from '../components/AnalysisCard';
import { BackBar, Button, Chip, Icon, IconButton, Sheet, Toast } from '../components/ui';
import { api } from '../lib/api';
import {
  defaultPartLabel,
  shouldAutoSplitPaste,
  splitPastedLyrics,
} from '../lib/lyricSplit';
import { PART_KINDS, THEME_LIST, analyzeLyrics } from '../lib/nlp';
import { useStore } from '../lib/store';
import type { Analysis, PartKind, SongPart, Tempo } from '../lib/types';

function newPart(kind: PartKind, existing: SongPart[]): SongPart {
  return {
    id: `local_${Math.random().toString(36).slice(2, 9)}`,
    kind,
    label: defaultPartLabel(kind, existing),
    lyrics: '',
  };
}

export function SongFormPage() {
  const { id } = useParams();
  const { songs, teams, refresh, user } = useStore();
  const navigate = useNavigate();

  const existing = id ? songs.find((s) => s.id === id) : undefined;
  const editing = Boolean(existing);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [artist, setArtist] = useState(existing?.artist ?? '');
  const [tempo, setTempo] = useState<Tempo>(existing?.tempo ?? 'slow');
  const [tempoTouched, setTempoTouched] = useState(Boolean(existing));
  const [theme, setTheme] = useState(existing?.theme ?? '');
  const [teamId, setTeamId] = useState<string>(existing?.teamId ?? '');
  const [parts, setParts] = useState<SongPart[]>(() => {
    if (existing?.parts.length) return existing.parts.map((p) => ({ ...p }));
    const v = newPart('verse', []);
    const c = newPart('chorus', [v]);
    return [v, c];
  });
  const [analysis, setAnalysis] = useState<Analysis | null>(existing?.analysis ?? null);
  const [dirtyLyrics, setDirtyLyrics] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState('');
  const [collapseRepeats, setCollapseRepeats] = useState(true);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing && existing.ownerId !== user?.id) {
      navigate(`/songs/${existing.id}`, { replace: true });
    }
  }, [existing, user?.id, navigate]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const runAutoClassify = (nextParts: SongPart[]) => {
    if (!nextParts.some((p) => p.lyrics.trim().length > 0)) return;
    const result = analyzeLyrics(nextParts);
    setAnalysis(result);
    setTheme((prev) => prev || result.theme);
    if (!tempoTouched && result.suggestedTempo) {
      setTempo(result.suggestedTempo);
    }
    setDirtyLyrics(false);
  };

  const pastePreview = useMemo(() => {
    if (!pasteBuffer.trim()) return null;
    return splitPastedLyrics(pasteBuffer, {
      songTitle: title,
      collapseRepeats,
    });
  }, [pasteBuffer, title, collapseRepeats]);

  const addPart = (kind: PartKind) => {
    setParts((prev) => [...prev, newPart(kind, prev)]);
    setDirtyLyrics(true);
  };

  const duplicatePart = (index: number) => {
    setParts((prev) => {
      const src = prev[index];
      if (!src) return prev;
      const copy: SongPart = {
        id: `local_${Math.random().toString(36).slice(2, 9)}`,
        kind: src.kind,
        label: defaultPartLabel(src.kind, prev),
        lyrics: src.lyrics,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setDirtyLyrics(true);
    showToast('Duplicated');
  };

  const updatePart = (index: number, patch: Partial<SongPart>) => {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    if ('lyrics' in patch || 'kind' in patch) setDirtyLyrics(true);
  };

  const movePart = (index: number, delta: -1 | 1) => {
    setParts((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removePart = (index: number) => {
    setParts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    setDirtyLyrics(true);
  };

  /**
   * Intercepts multi-section lyrics pasted straight into any part textarea
   * and automatically splits them into Verse, Chorus, Bridge, etc.
   */
  const handlePartPaste = (index: number, e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData?.getData('text/plain') ?? '';
    if (!pasted) return;

    const target = parts[index];
    if (!target) return;

    const el = e.currentTarget;
    const selectionCoversAll =
      target.lyrics.length > 0 &&
      el.selectionStart === 0 &&
      el.selectionEnd >= target.lyrics.length;

    if (!shouldAutoSplitPaste(pasted, target.lyrics, selectionCoversAll)) {
      return;
    }

    const split = splitPastedLyrics(pasted, {
      songTitle: title,
      collapseRepeats: true,
    });
    if (split.parts.length === 0) return;

    // Only intercept if we actually split into >= 2 parts OR stripped an explicit header
    if (split.parts.length < 2 && !split.hadExplicitHeaders) {
      return;
    }

    e.preventDefault();

    const otherPartsEmpty = parts.every(
      (p, idx) => idx === index || p.lyrics.trim().length === 0,
    );

    let nextParts: SongPart[];
    if (otherPartsEmpty) {
      nextParts = split.parts;
    } else {
      const before = parts.slice(0, index);
      const after = parts.slice(index + 1);
      const merged: SongPart[] = [...before];
      for (const sp of split.parts) {
        const collision = merged.some(
          (m) => m.label.toLowerCase() === sp.label.toLowerCase(),
        );
        merged.push({
          ...sp,
          label: collision ? defaultPartLabel(sp.kind, merged) : sp.label,
        });
      }
      for (const ap of after) {
        const collision = merged.some(
          (m) => m.label.toLowerCase() === ap.label.toLowerCase(),
        );
        merged.push({
          ...ap,
          label: collision ? defaultPartLabel(ap.kind, merged) : ap.label,
        });
      }
      nextParts = merged;
    }

    setParts(nextParts);
    runAutoClassify(nextParts);

    const summary = nextParts
      .slice(0, 3)
      .map((p) => p.label)
      .join(' · ');
    const more = nextParts.length > 3 ? ` +${nextParts.length - 3}` : '';
    showToast(`Auto-split: ${summary}${more}`);
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        setPasteBuffer(clip);
      } else {
        showToast('Clipboard is empty');
      }
    } catch {
      showToast('Long-press the text box to paste');
    }
  };

  const applyPastedLyrics = () => {
    const split = splitPastedLyrics(pasteBuffer, {
      songTitle: title,
      collapseRepeats,
    });
    if (split.parts.length === 0) {
      showToast('Paste some lyrics first');
      return;
    }
    setParts(split.parts);
    runAutoClassify(split.parts);
    setPasteBuffer('');
    setPasteOpen(false);
    showToast(`Split into ${split.parts.length} parts`);
  };

  const hasLyrics = parts.some((p) => p.lyrics.trim().length > 0);
  const canSave = Boolean(title.trim()) && hasLyrics && Boolean(analysis) && !dirtyLyrics;

  const generate = () => {
    setError(null);
    if (!hasLyrics) {
      setError('Add lyrics to at least one part.');
      return;
    }
    const result = analyzeLyrics(parts);
    setAnalysis(result);
    setTheme(result.theme);
    if (!tempoTouched && result.suggestedTempo) {
      setTempo(result.suggestedTempo);
    }
    setDirtyLyrics(false);
    showToast(result.theme);
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError('Enter a song title.');
    const filled = parts.filter((p) => p.lyrics.trim().length > 0);
    if (filled.length === 0) return setError('Add lyrics to at least one part.');
    if (!analysis || dirtyLyrics) {
      return setError('Classify the lyrics before saving.');
    }

    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        artist: artist.trim() || 'Unknown artist',
        tempo,
        theme: theme.trim() || analysis.theme,
        teamId: teamId || null,
        parts: filled,
        analysis,
      };
      if (editing && existing) {
        await api.updateSong(existing.id, payload);
        await refresh();
        navigate(`/songs/${existing.id}`);
      } else {
        const res = await api.createSong(payload);
        await refresh();
        navigate(`/songs/${res.song.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save song.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate(editing && existing ? `/songs/${existing.id}` : '/songs')}
        label={editing ? 'Song' : 'Songs'}
        right={
          <Button onClick={() => setPasteOpen(true)}>
            <Icon name="paste" size={14} /> Paste lyrics
          </Button>
        }
      />

      <div className="page-head">
        <h1>{editing ? 'Edit song' : 'New song'}</h1>
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor="song-title">Title</label>
          <input
            id="song-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song title"
          />
        </div>

        <div className="field">
          <label htmlFor="song-artist">Artist</label>
          <input
            id="song-artist"
            className="input"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="field">
          <span className="label">Tempo</span>
          <div className="seg" role="radiogroup" aria-label="Song tempo">
            <button
              type="button"
              role="radio"
              aria-checked={tempo === 'slow'}
              className={tempo === 'slow' ? 'active' : ''}
              onClick={() => {
                setTempo('slow');
                setTempoTouched(true);
              }}
            >
              Slow
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={tempo === 'fast'}
              className={tempo === 'fast' ? 'active' : ''}
              onClick={() => {
                setTempo('fast');
                setTempoTouched(true);
              }}
            >
              Fast
            </button>
          </div>
        </div>

        {teams.length > 0 && (
          <div className="field">
            <label htmlFor="song-team">Visibility</label>
            <select
              id="song-team"
              className="select"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Personal</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="stack-sm">
        <div className="row-between">
          <span className="label">Parts ({parts.length})</span>
          <button
            type="button"
            className="link-button tiny"
            onClick={() => setPasteOpen(true)}
          >
            Auto-split full lyrics
          </button>
        </div>

        {!hasLyrics && (
          <div className="tiny">
            Paste full song lyrics into any box below — Aria automatically splits Verses, Chorus, and Bridge.
          </div>
        )}

        {parts.map((part, i) => (
          <div key={part.id} className="part-block">
            <div className="part-head">
              <select
                aria-label="Part type"
                className="select part-select"
                value={part.kind}
                onChange={(e) => {
                  const kind = e.target.value as PartKind;
                  const others = parts.filter((_, idx) => idx !== i);
                  updatePart(i, { kind, label: defaultPartLabel(kind, others) });
                }}
              >
                {PART_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Part label"
                className="input part-label-input"
                value={part.label}
                onChange={(e) => updatePart(i, { label: e.target.value })}
              />
              <div className="seq-toolbar">
                <IconButton label="Duplicate" onClick={() => duplicatePart(i)}>
                  <Icon name="copy" size={14} />
                </IconButton>
                <IconButton label="Move up" onClick={() => movePart(i, -1)} disabled={i === 0}>
                  <Icon name="arrowUp" size={14} />
                </IconButton>
                <IconButton
                  label="Move down"
                  onClick={() => movePart(i, 1)}
                  disabled={i === parts.length - 1}
                >
                  <Icon name="arrowDown" size={14} />
                </IconButton>
                <IconButton
                  label="Remove"
                  onClick={() => removePart(i)}
                  disabled={parts.length <= 1}
                >
                  <Icon name="trash" size={14} />
                </IconButton>
              </div>
            </div>
            <div className="part-body">
              <textarea
                className="textarea"
                rows={4}
                placeholder={
                  i === 0 && !hasLyrics
                    ? 'Paste full song lyrics here (auto-splits Verse, Chorus, Bridge…) or type Verse 1…'
                    : `${part.label} lyrics…`
                }
                value={part.lyrics}
                onPaste={(e) => handlePartPaste(i, e)}
                onChange={(e) => updatePart(i, { lyrics: e.target.value })}
              />
            </div>
          </div>
        ))}

        <div className="filter-row">
          {PART_KINDS.slice(0, 6).map((k) => (
            <button
              key={k.kind}
              type="button"
              className="filter-pill"
              onClick={() => addPart(k.kind)}
            >
              <Icon name="add" size={12} /> {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <div className="row-between">
          <span className="label">Classification</span>
          {dirtyLyrics && analysis && <span className="tiny">Outdated</span>}
        </div>

        <Button
          variant={analysis && !dirtyLyrics ? 'default' : 'primary'}
          block
          disabled={!hasLyrics}
          onClick={generate}
        >
          <Icon name="sparkle" size={14} />
          {analysis ? (dirtyLyrics ? 'Re-classify lyrics' : 'Refresh analysis') : 'Classify lyrics'}
        </Button>

        {analysis && (
          <>
            <AnalysisCard analysis={analysis} />
            <div className="field">
              <label htmlFor="song-class">Class</label>
              <select
                id="song-class"
                className="select"
                value={theme || analysis.theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                {THEME_LIST.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {c === analysis.theme ? ' (detected)' : ''}
                  </option>
                ))}
              </select>
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
          onClick={() => navigate(editing && existing ? `/songs/${existing.id}` : '/songs')}
          style={{ flex: 1 }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={busy || !canSave}
          style={{ flex: 2 }}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <Sheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste full lyrics"
        subtitle="No manual formatting needed — Aria detects Verses, Chorus, Bridge, and more."
      >
        <div className="stack">
          <div className="row-between">
            <span className="tiny">Supports raw lyrics or [Verse] / [Chorus] tags</span>
            <button
              type="button"
              className="link-button tiny"
              onClick={pasteFromClipboard}
            >
              Paste clipboard
            </button>
          </div>

          <textarea
            className="textarea"
            rows={8}
            placeholder={`Paste entire song lyrics here…\n\nStanzas separated by blank lines or [Verse] / [Chorus] headers are split automatically.`}
            value={pasteBuffer}
            onChange={(e) => setPasteBuffer(e.target.value)}
          />

          <label className="check-row">
            <input
              type="checkbox"
              checked={collapseRepeats}
              onChange={(e) => setCollapseRepeats(e.target.checked)}
            />
            <span className="small">Merge identical repeated choruses</span>
          </label>

          {pastePreview && pastePreview.parts.length > 0 && (
            <div className="paste-preview">
              <div className="row-between">
                <span className="tiny">
                  Detected {pastePreview.parts.length}{' '}
                  {pastePreview.parts.length === 1 ? 'section' : 'sections'}
                </span>
                {pastePreview.collapsedCount > 0 && (
                  <span className="tiny">
                    {pastePreview.collapsedCount} repeat
                    {pastePreview.collapsedCount > 1 ? 's' : ''} merged
                  </span>
                )}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
                {pastePreview.parts.map((p) => (
                  <Chip key={p.id} tone={p.kind === 'chorus' ? 'brand' : undefined}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="primary"
            block
            disabled={!pastePreview || pastePreview.parts.length === 0}
            onClick={applyPastedLyrics}
          >
            {pastePreview && pastePreview.parts.length > 0
              ? `Split into ${pastePreview.parts.length} parts`
              : 'Split into parts'}
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
