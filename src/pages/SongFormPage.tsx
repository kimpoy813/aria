import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnalysisCard } from '../components/AnalysisCard';
import { BackBar, Button, Chip, Icon, IconButton, Sheet, type ToastTone } from '../components/ui';
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
  const { songs, teams, refresh, user, notify } = useStore();
  const navigate = useNavigate();

  const existing = id ? songs.find((s) => s.id === id) : undefined;
  const editing = Boolean(existing);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [artist, setArtist] = useState(existing?.artist ?? '');
  const [tempo, setTempo] = useState<Tempo>(existing?.tempo ?? 'slow');
  const [tempoTouched, setTempoTouched] = useState(Boolean(existing));
  const [theme, setTheme] = useState(existing?.theme ?? '');
  const [themeTouched, setThemeTouched] = useState(Boolean(existing?.theme));
  const [teamId, setTeamId] = useState<string>(existing?.teamId ?? '');
  const [parts, setParts] = useState<SongPart[]>(() => {
    if (existing?.parts.length) return existing.parts.map((p) => ({ ...p }));
    const v = newPart('verse', []);
    const c = newPart('chorus', [v]);
    return [v, c];
  });
  const [analysis, setAnalysis] = useState<Analysis | null>(existing?.analysis ?? null);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState('');
  const [collapseRepeats, setCollapseRepeats] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const handledClipboardPasteRef = useRef(false);

  useEffect(() => {
    if (existing && existing.ownerId !== user?.id) {
      navigate(`/songs/${existing.id}`, { replace: true });
    }
  }, [existing, user?.id, navigate]);

  const showToast = (msg: string, tone: ToastTone = 'success') => {
    notify(msg, tone);
  };

  const hasLyrics = useMemo(
    () => parts.some((p) => p.lyrics.trim().length > 0),
    [parts],
  );

  // Automatically classify lyrics whenever song parts or title change
  useEffect(() => {
    const filled = parts.filter((p) => p.lyrics.trim().length > 0);
    if (filled.length === 0) {
      setAnalysis(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const result = analyzeLyrics(filled, title);
      setAnalysis(result);
      if (!themeTouched) {
        setTheme(result.theme);
      }
      if (!tempoTouched && result.suggestedTempo) {
        setTempo(result.suggestedTempo);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [parts, title, themeTouched, tempoTouched]);

  const runAutoClassifyImmediate = (nextParts: SongPart[], nextTitle = title) => {
    const filled = nextParts.filter((p) => p.lyrics.trim().length > 0);
    if (filled.length === 0) return null;
    const result = analyzeLyrics(filled, nextTitle);
    setAnalysis(result);
    if (!themeTouched) {
      setTheme(result.theme);
    }
    if (!tempoTouched && result.suggestedTempo) {
      setTempo(result.suggestedTempo);
    }
    return result;
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
    showToast('Duplicated part', 'info');
  };

  const updatePart = (index: number, patch: Partial<SongPart>) => {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
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
  };

  const mergeSplitPartsAt = (index: number, splitParts: SongPart[]) => {
    const otherPartsEmpty = parts.every(
      (p, idx) => idx === index || p.lyrics.trim().length === 0,
    );

    let nextParts: SongPart[];
    if (otherPartsEmpty) {
      nextParts = splitParts;
    } else {
      const before = parts.slice(0, index);
      const after = parts.slice(index + 1);
      const merged: SongPart[] = [...before];
      for (const sp of splitParts) {
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
    runAutoClassifyImmediate(nextParts);

    const summary = nextParts
      .slice(0, 3)
      .map((p) => p.label)
      .join(' · ');
    const more = nextParts.length > 3 ? ` +${nextParts.length - 3}` : '';
    showToast(`Auto-split: ${summary}${more}`, 'success');
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

    if (split.parts.length < 2 && !split.hadExplicitHeaders) {
      return;
    }

    e.preventDefault();
    handledClipboardPasteRef.current = true;
    window.setTimeout(() => {
      handledClipboardPasteRef.current = false;
    }, 80);

    mergeSplitPartsAt(index, split.parts);
  };

  /**
   * Handles both typing AND mobile keyboard clipboard-bar insertions
   * (such as Android Gboard / Samsung Keyboard chips that bypass DOM `paste`).
   */
  const handlePartChange = (index: number, nextLyrics: string) => {
    const prevLyrics = parts[index]?.lyrics ?? '';

    if (
      !handledClipboardPasteRef.current &&
      prevLyrics.trim().length === 0 &&
      nextLyrics.length >= 30 &&
      nextLyrics.includes('\n') &&
      shouldAutoSplitPaste(nextLyrics, prevLyrics, false)
    ) {
      const split = splitPastedLyrics(nextLyrics, {
        songTitle: title,
        collapseRepeats: true,
      });
      if (split.parts.length >= 2 || split.hadExplicitHeaders) {
        mergeSplitPartsAt(index, split.parts);
        return;
      }
    }

    updatePart(index, { lyrics: nextLyrics });
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        setPasteBuffer(clip);
      } else {
        showToast('Clipboard is empty', 'info');
      }
    } catch {
      showToast('Long-press the text box to paste', 'info');
    }
  };

  const applyPastedLyrics = () => {
    const split = splitPastedLyrics(pasteBuffer, {
      songTitle: title,
      collapseRepeats,
    });
    if (split.parts.length === 0) {
      showToast('Paste some lyrics first', 'error');
      return;
    }
    setParts(split.parts);
    runAutoClassifyImmediate(split.parts);
    setPasteBuffer('');
    setPasteOpen(false);
    showToast(`Split into ${split.parts.length} parts`, 'success');
  };

  const generate = () => {
    setError(null);
    if (!hasLyrics) {
      setError('Add lyrics to at least one part.');
      showToast('Add lyrics to at least one part', 'error');
      return;
    }
    const filled = parts.filter((p) => p.lyrics.trim().length > 0);
    const result = analyzeLyrics(filled, title);
    setAnalysis(result);
    setTheme(result.theme);
    setThemeTouched(false);
    if (!tempoTouched && result.suggestedTempo) {
      setTempo(result.suggestedTempo);
    }
    showToast(`Classified: ${result.theme}`, 'success');
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Enter a song title.');
      titleInputRef.current?.focus();
      return showToast('Enter a song title', 'error');
    }
    const filled = parts.filter((p) => p.lyrics.trim().length > 0);
    if (filled.length === 0) {
      setError('Add lyrics to at least one part.');
      return showToast('Paste or type lyrics into at least one part', 'error');
    }

    // Compute fresh analysis automatically so the user never has to click Classify manually first
    const finalAnalysis = analyzeLyrics(filled, title.trim());
    setAnalysis(finalAnalysis);
    const finalTheme = (themeTouched && theme.trim()) ? theme.trim() : finalAnalysis.theme;
    const finalTempo = tempoTouched ? tempo : (finalAnalysis.suggestedTempo || tempo);

    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        artist: artist.trim() || 'Unknown artist',
        tempo: finalTempo,
        theme: finalTheme,
        teamId: teamId || null,
        parts: filled,
        analysis: finalAnalysis,
      };
      if (editing && existing) {
        await api.updateSong(existing.id, payload);
        await refresh();
        showToast('Song updated', 'success');
        navigate(`/songs/${existing.id}`);
      } else {
        const res = await api.createSong(payload);
        await refresh();
        showToast(`Added “${payload.title}”`, 'success');
        navigate(`/songs/${res.song.id}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save song.';
      setError(msg);
      showToast(msg, 'error');
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
            ref={titleInputRef}
            id="song-title"
            className="input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
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
                onChange={(e) => {
                  handlePartChange(i, e.target.value);
                  if (error) setError(null);
                }}
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
          <span className="label">Worship Classification</span>
          {hasLyrics && <span className="tiny">Auto-detected</span>}
        </div>

        {analysis && hasLyrics ? (
          <>
            <AnalysisCard analysis={analysis} />
            <div className="field">
              <label htmlFor="song-class">Worship Theme</label>
              <select
                id="song-class"
                className="select"
                value={theme || analysis.theme}
                onChange={(e) => {
                  setTheme(e.target.value);
                  setThemeTouched(true);
                }}
              >
                {(theme && !THEME_LIST.includes(theme) ? [theme, ...THEME_LIST] : THEME_LIST).map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                      {c === analysis.theme ? ' (detected)' : ''}
                    </option>
                  ),
                )}
              </select>
            </div>
            <Button variant="default" block onClick={generate}>
              <Icon name="sparkle" size={14} /> Refresh analysis
            </Button>
          </>
        ) : (
          <p className="tiny">
            Paste or type your song lyrics above — Aria automatically classifies the Christian worship theme and core message.
          </p>
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
          disabled={busy}
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
    </div>
  );
}
