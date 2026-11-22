import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackBar, Button, Chip, Icon, IconButton, Sheet, type ToastTone } from '../components/ui';
import { api } from '../lib/api';
import {
  MAJOR_KEYS,
  MINOR_KEYS,
  STARTER_CHORDS,
  diatonicChords,
  extraChords,
  hasChords,
  inlineChords,
  moveChord,
  parseChord,
  removeChordAt,
} from '../lib/chords';
import { LyricView } from '../components/LyricView';
import {
  defaultPartLabel,
  shouldAutoSplitPaste,
  splitPastedLyrics,
} from '../lib/lyricSplit';
import {
  PART_KINDS,
  THEME_LIST,
  analyzeLyrics,
  applyClassificationOverride,
  defaultMessageForTheme,
} from '../lib/nlp';
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
  const { songs, refresh, user, notify } = useStore();
  const navigate = useNavigate();

  const existing = id ? songs.find((s) => s.id === id) : undefined;
  const editing = Boolean(existing);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [artist, setArtist] = useState(existing?.artist ?? '');
  const [tempo, setTempo] = useState<Tempo>(existing?.tempo ?? 'slow');
  const [tempoTouched, setTempoTouched] = useState(Boolean(existing));
  const [theme, setTheme] = useState(existing?.theme ?? '');
  const [themeTouched, setThemeTouched] = useState(Boolean(existing?.theme));
  const [messageDraft, setMessageDraft] = useState(existing?.analysis?.message ?? '');
  const [messageTouched, setMessageTouched] = useState(
    Boolean(existing?.analysis?.manualOverride),
  );
  // The key the chords are written in. Empty until a leader sets one — a song
  // with no key simply has no chords to move, and nothing else has to care.
  const [key, setKey] = useState(existing?.key ?? '');
  const [chordsOpen, setChordsOpen] = useState(() =>
    Boolean(existing?.key) || (existing?.parts || []).some((p) => hasChords(p.lyrics)),
  );
  const [chordDraft, setChordDraft] = useState('');
  const [chordError, setChordError] = useState('');
  // Which part the leader is typing in, so a chord lands where the cursor is.
  // Kept as a ref for the caret and as state for the panel: the palette has to
  // say which part it is writing into, and a ref cannot re-render anything.
  const partAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const activePartId = useRef<string | null>(null);
  const [activePart, setActivePart] = useState<string | null>(null);

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
      if (!messageTouched) setMessageDraft('');
      return;
    }
    const timer = window.setTimeout(() => {
      const result = analyzeLyrics(filled, title);
      setAnalysis(result);
      const activeTheme = themeTouched && theme.trim() ? theme.trim() : result.theme;
      if (!themeTouched) {
        setTheme(result.theme);
      }
      if (!messageTouched) {
        setMessageDraft(
          activeTheme.toLowerCase() === result.theme.toLowerCase()
            ? result.message
            : defaultMessageForTheme(activeTheme).message,
        );
      }
      if (!tempoTouched && result.suggestedTempo) {
        setTempo(result.suggestedTempo);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [parts, title, theme, themeTouched, messageTouched, tempoTouched]);

  const runAutoClassifyImmediate = (nextParts: SongPart[], nextTitle = title) => {
    const filled = nextParts.filter((p) => p.lyrics.trim().length > 0);
    if (filled.length === 0) return null;
    const result = analyzeLyrics(filled, nextTitle);
    setAnalysis(result);
    const activeTheme = themeTouched && theme.trim() ? theme.trim() : result.theme;
    if (!themeTouched) {
      setTheme(result.theme);
    }
    if (!messageTouched) {
      setMessageDraft(
        activeTheme.toLowerCase() === result.theme.toLowerCase()
          ? result.message
          : defaultMessageForTheme(activeTheme).message,
      );
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

  /**
   * Grows a part's textarea to fit what is in it, up to a cap.
   *
   * A verse is four lines and a chorded bridge is twelve; a fixed box makes the
   * leader scroll inside a box they are trying to read, or drag a handle on a
   * phone. It stops at 60% of the viewport so one long part cannot push the rest
   * of the form off the screen.
   */
  const autosizeArea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const cap = Math.round(window.innerHeight * 0.6);
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
  };

  // Re-measure whenever the words change, and when the viewport does.
  useEffect(() => {
    for (const el of Object.values(partAreaRefs.current)) autosizeArea(el);
  }, [parts]);

  useEffect(() => {
    const onResize = () => {
      for (const el of Object.values(partAreaRefs.current)) autosizeArea(el);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * Drops a chord marker in at the caret.
   *
   * The leader is already standing in the words at exactly the syllable the
   * chord falls on, so that is where it goes — no counting characters, no
   * second pass to line things up. If nothing is focused yet, say so rather
   * than quietly appending to the end of some part.
   */
  const insertChord = (chord: string) => {
    const id = activePartId.current;
    const area = id ? partAreaRefs.current[id] : null;
    const index = parts.findIndex((p) => p.id === id);
    if (!area || index === -1) {
      setChordError('Tap the lyrics where the chord goes first.');
      return;
    }
    const start = area.selectionStart ?? 0;
    const end = area.selectionEnd ?? start;
    const value = parts[index].lyrics;
    const marker = `[${chord}]`;
    updatePart(index, { lyrics: `${value.slice(0, start)}${marker}${value.slice(end)}` });
    setChordError('');
    setChordDraft('');
    // Caret goes just past the marker, so the next tap keeps flowing.
    const pos = start + marker.length;
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(pos, pos);
    });
  };

  /*
   * What the palette offers, and to whom.
   *
   * A song almost never has a key when the words first go in — two of the
   * thirty-eight songs in the live database do — so a palette that waits for
   * one is a palette nobody ever sees. With no key the first row falls back to
   * the chords a guitar player reaches for most, and the panel keeps asking for
   * the key next to them instead of instead of the chords.
   */
  const palette = key ? diatonicChords(key) : STARTER_CHORDS;
  const extras = extraChords(key);
  const activeIndex = parts.findIndex((p) => p.id === activePart);
  const activeSong = activeIndex === -1 ? null : parts[activeIndex];
  const activeChords = activeSong ? inlineChords(activeSong.lyrics) : [];

  const removeChord = (index: number) => {
    if (!activeSong) return;
    setChordError('');
    updatePart(activeIndex, { lyrics: removeChordAt(activeSong.lyrics, index) });
  };

  const nudgeChord = (index: number, dir: -1 | 1) => {
    if (!activeSong) return;
    const next = moveChord(activeSong.lyrics, index, dir);
    if (next === activeSong.lyrics) {
      setChordError('That chord is at the end of its line — there is no next word to move it to.');
      return;
    }
    setChordError('');
    updatePart(activeIndex, { lyrics: next });
  };

  const submitChordDraft = () => {
    const typed = chordDraft.trim();
    if (!typed) return;
    if (parseChord(typed) === null) {
      setChordError(`“${typed}” is not a chord. Try G, Bm, F#m7 or D/F#.`);
      return;
    }
    insertChord(typed);
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

    // No toggle is offered on this path, so leave repeats alone rather than
    // deleting a section the leader has no way to get back.
    const split = splitPastedLyrics(pasted, { songTitle: title });
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
      const split = splitPastedLyrics(nextLyrics, { songTitle: title });
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

    /*
     * Say so when a chord sheet was re-anchored. The leader pasted chords
     * floating above the words and gets back chords sitting on them — right,
     * but not what they pasted, and a silent rewrite of someone's sheet is the
     * sort of thing that costs trust.
     */
    if (split.inlinedChords) {
      setChordsOpen(true);
      showToast(`Split into ${split.parts.length} parts · chords attached to the words`, 'success');
    } else {
      showToast(`Split into ${split.parts.length} parts`, 'success');
    }
  };

  const resetToAutoClassification = () => {
    setError(null);
    if (!hasLyrics) {
      setThemeTouched(false);
      setMessageTouched(false);
      setTheme('');
      setMessageDraft('');
      return;
    }
    const filled = parts.filter((p) => p.lyrics.trim().length > 0);
    const result = analyzeLyrics(filled, title);
    setAnalysis(result);
    setTheme(result.theme);
    setThemeTouched(false);
    setMessageDraft(result.message);
    setMessageTouched(false);
    if (!tempoTouched && result.suggestedTempo) {
      setTempo(result.suggestedTempo);
    }
    showToast(`Auto-classified: ${result.theme}`, 'success');
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

    const autoAnalysis = analyzeLyrics(filled, title.trim());
    const finalTheme =
      themeTouched && theme.trim() ? theme.trim() : autoAnalysis.theme;
    const finalMessage =
      messageTouched && messageDraft.trim()
        ? messageDraft.trim()
        : finalTheme.toLowerCase() !== autoAnalysis.theme.toLowerCase()
          ? defaultMessageForTheme(finalTheme).message
          : autoAnalysis.message;

    const isManual =
      (themeTouched && finalTheme !== autoAnalysis.theme) ||
      (messageTouched && finalMessage !== autoAnalysis.message);

    const finalAnalysis = applyClassificationOverride(autoAnalysis, {
      theme: finalTheme,
      message: finalMessage,
      manualOverride: isManual,
    });
    setAnalysis(finalAnalysis);
    const finalTempo = tempoTouched ? tempo : autoAnalysis.suggestedTempo || tempo;

    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        artist: artist.trim() || 'Unknown artist',
        tempo: finalTempo,
        theme: finalTheme,
        key: key.trim(),
        teamId: existing?.teamId ?? null,
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

        <div className="field">
          <label htmlFor="song-key">Key</label>
          <select
            id="song-key"
            className="select"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (e.target.value) setChordsOpen(true);
            }}
          >
            <option value="">Not set</option>
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
          </select>
          <span className="hint">
            The key the chords are written in. A lineup can still play it anywhere else.
          </span>
        </div>
      </div>

      <div className="card chord-panel">
        <button
          type="button"
          className="row-between chord-panel-head"
          onClick={() => setChordsOpen((v) => !v)}
          aria-expanded={chordsOpen}
        >
          <span className="label">Chords</span>
          <span className="tiny">
            {chordsOpen ? 'Hide' : hasChords(parts.map((p) => p.lyrics).join('\n')) ? 'Edit' : 'Add'}
          </span>
        </button>

        {chordsOpen && (
          <div className="chord-entry">
            <p className="hint">
              Tap the words where a chord lands, then tap the chord. It sits on the
              syllable, so it stays put when the key changes.
            </p>

            {/*
              The palette says which part it is writing into. "Tap the lyrics
              where the chord goes first" is an error message that arrives
              *after* a tap; naming the part up front means the tap that lands
              in the wrong verse is the one that never happens.
            */}
            <p className="chord-target" role="status">
              {activeSong ? (
                <>
                  Adding to <strong>{activeSong.label || 'this part'}</strong>
                  {activeChords.length > 0 ? ` · ${activeChords.length} chords so far` : ''}
                </>
              ) : (
                'Tap a part’s lyrics first — the chord goes where your cursor is.'
              )}
            </p>

            <div className="chord-palette">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chord-pill"
                  onClick={() => insertChord(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            {extras.length > 0 && (
              <div className="chord-palette chord-palette-extra">
                {extras.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="chord-pill chord-pill-extra"
                    onClick={() => insertChord(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {!key && (
              <div className="key-quick">
                <span className="tiny">
                  Set a key and these become the chords that fit it:
                </span>
                <div className="filter-row">
                  {[...MAJOR_KEYS.slice(0, 5), ...MINOR_KEYS.slice(0, 3)].map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="filter-pill"
                      onClick={() => setKey(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="chord-custom">
              <input
                className="input"
                value={chordDraft}
                onChange={(e) => {
                  setChordDraft(e.target.value);
                  if (chordError) setChordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitChordDraft();
                  }
                }}
                placeholder="Any other chord — Bm7, F#m, D/F#"
                aria-label="Chord name"
              />
              <Button type="button" variant="quiet" onClick={submitChordDraft}>
                Insert
              </Button>
            </div>

            {chordError && (
              <p className="chord-entry-error" role="alert">
                {chordError}
              </p>
            )}

            {/*
              Every chord already in the part, with the word it is standing on.
              Until now the only way to see whether a chord had landed on the
              right syllable was to save the song and open it; the only way to
              fix one was to find the bracket in the text by hand.
            */}
            {activeChords.length > 0 && (
              <div className="chord-list">
                <span className="label">
                  Chords in {activeSong?.label || 'this part'}
                </span>
                {activeChords.map((c) => (
                  <div className="chord-row" key={`${c.index}-${c.chord}`}>
                    <span className="chord-row-name">{c.chord}</span>
                    <span className="chord-row-word tiny">
                      {c.word ? `on “${c.word}”` : 'at the end of the line'}
                    </span>
                    <span className="chord-row-actions">
                      <IconButton
                        label={`Move ${c.chord} one word earlier`}
                        onClick={() => nudgeChord(c.index, -1)}
                      >
                        <Icon name="arrowUp" size={14} />
                      </IconButton>
                      <IconButton
                        label={`Move ${c.chord} one word later`}
                        onClick={() => nudgeChord(c.index, 1)}
                      >
                        <Icon name="arrowDown" size={14} />
                      </IconButton>
                      <IconButton
                        label={`Remove ${c.chord}`}
                        className="danger"
                        onClick={() => removeChord(c.index)}
                      >
                        <Icon name="trash" size={14} />
                      </IconButton>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/*
              The part as it will print, under the words being edited. A chord
              two syllables late reads perfectly in a textarea and sounds wrong
              the moment anyone sings it.
            */}
            {activeSong && activeSong.lyrics.trim().length > 0 && (
              <div className="chord-preview">
                <span className="label">How {activeSong.label || 'this part'} reads</span>
                <LyricView lyrics={activeSong.lyrics} />
              </div>
            )}
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
            Paste full lyrics
          </button>
        </div>

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
                rows={6}
                ref={(el) => {
                  partAreaRefs.current[part.id] = el;
                  autosizeArea(el);
                }}
                onFocus={() => {
                  activePartId.current = part.id;
                  setActivePart(part.id);
                }}
                onClick={() => {
                  activePartId.current = part.id;
                  setActivePart(part.id);
                }}
                onKeyUp={() => {
                  activePartId.current = part.id;
                  setActivePart(part.id);
                }}
                placeholder={
                  i === 0 && !hasLyrics
                    ? 'Paste full lyrics or type here…'
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
          <span className="label">Song Message & Theme</span>
          {(themeTouched || messageTouched) && hasLyrics ? (
            <button
              type="button"
              className="link-button tiny"
              onClick={resetToAutoClassification}
            >
              Reset to auto
            </button>
          ) : hasLyrics && analysis ? (
            <span className="tiny">
              Auto-detected ·{' '}
              {analysis.confidence <= 1
                ? Math.round(analysis.confidence * 100)
                : Math.round(analysis.confidence)}
              %
            </span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="song-class">Worship theme</label>
          <select
            id="song-class"
            className="select"
            value={theme || analysis?.theme || ''}
            onChange={(e) => {
              const nextTheme = e.target.value;
              setTheme(nextTheme);
              setThemeTouched(true);
              if (!messageTouched) {
                if (analysis && nextTheme === analysis.theme) {
                  setMessageDraft(analysis.message);
                } else if (nextTheme) {
                  setMessageDraft(defaultMessageForTheme(nextTheme).message);
                }
              }
            }}
          >
            {!hasLyrics && !theme && (
              <option value="">Auto-detect from lyrics…</option>
            )}
            {(theme && !THEME_LIST.includes(theme) ? [theme, ...THEME_LIST] : THEME_LIST).map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                  {analysis && c === analysis.theme ? ' (detected)' : ''}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="field">
          <label htmlFor="song-message">Song message</label>
          <textarea
            id="song-message"
            className="textarea"
            rows={3}
            value={messageDraft}
            onChange={(e) => {
              setMessageDraft(e.target.value);
              setMessageTouched(true);
            }}
            placeholder="Song message…"
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className={`sticky-bar${chordsOpen ? ' sticky-bar-stack' : ''}`}>
        {/*
          The palette rides along at the bottom of the screen. Entering chords
          is a two-handed job — one thumb in the words, one on a chord — and
          the panel is a scroll away from wherever the caret happens to be.
        */}
        {chordsOpen && (
          <div className="chord-dock" role="group" aria-label="Chords">
            <span className="chord-dock-target tiny">
              {activeSong ? activeSong.label || 'This part' : 'Tap the lyrics first'}
            </span>
            <div className="chord-palette">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chord-pill"
                  onClick={() => insertChord(c)}
                >
                  {c}
                </button>
              ))}
              {extras.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chord-pill chord-pill-extra"
                  onClick={() => insertChord(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="sticky-bar-actions">
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
      </div>

      <Sheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste lyrics"
      >
        <div className="stack">
          <div className="row" style={{ justifyContent: 'flex-end' }}>
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
            placeholder="Paste song lyrics…"
            value={pasteBuffer}
            onChange={(e) => setPasteBuffer(e.target.value)}
          />

          <label className="check-row">
            <input
              type="checkbox"
              checked={collapseRepeats}
              onChange={(e) => setCollapseRepeats(e.target.checked)}
            />
            <span className="small">Merge repeated choruses</span>
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
