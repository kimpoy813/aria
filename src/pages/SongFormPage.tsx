import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnalysisCard } from '../components/AnalysisCard';
import { BackBar, Button, Icon, IconButton, Sheet, Toast } from '../components/ui';
import { api } from '../lib/api';
import { PART_KINDS, THEME_LIST, analyzeLyrics } from '../lib/nlp';
import { useStore } from '../lib/store';
import type { Analysis, PartKind, SongPart, Tempo } from '../lib/types';

function defaultPartLabel(kind: PartKind, existing: SongPart[]): string {
  const base = PART_KINDS.find((k) => k.kind === kind)?.label ?? 'Part';
  if (kind === 'verse') {
    const count = existing.filter((p) => p.kind === 'verse').length;
    return `Verse ${count + 1}`;
  }
  const sameKind = existing.filter((p) => p.kind === kind).length;
  return sameKind > 0 ? `${base} ${sameKind + 1}` : base;
}

function newPart(kind: PartKind, existing: SongPart[]): SongPart {
  return {
    id: `local_${Math.random().toString(36).slice(2, 9)}`,
    kind,
    label: defaultPartLabel(kind, existing),
    lyrics: '',
  };
}

function detectKindFromHeading(raw: string): { kind: PartKind; label?: string } | null {
  const cleaned = raw
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/:$/, '')
    .trim();
  if (!cleaned || cleaned.length > 36) return null;
  const lower = cleaned.toLowerCase();
  if (/^pre[-\s]?chorus\b/.test(lower)) return { kind: 'prechorus', label: cleaned };
  if (/^refrain\b/.test(lower)) return { kind: 'refrain', label: cleaned };
  if (/^chorus\b|^hook\b/.test(lower)) return { kind: 'chorus', label: cleaned };
  if (/^verse\b|^stanza\b/.test(lower)) return { kind: 'verse', label: cleaned };
  if (/^bridge\b/.test(lower)) return { kind: 'bridge', label: cleaned };
  if (/^intro\b/.test(lower)) return { kind: 'intro', label: cleaned };
  if (/^outro\b|^ending\b|^tag\b|^coda\b/.test(lower)) return { kind: 'outro', label: cleaned };
  return null;
}

function parseFullLyrics(raw: string): SongPart[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const sections: { kind: PartKind; customLabel?: string; lines: string[] }[] = [];
  let current: { kind: PartKind; customLabel?: string; lines: string[] } | null = null;
  let sawExplicitHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isBracketed =
      /^\[.+\]$/.test(trimmed) || /^[A-Za-z][A-Za-z0-9\s-]{1,24}:$/.test(trimmed);
    const detected = isBracketed
      ? detectKindFromHeading(trimmed)
      : /^(verse|chorus|pre-?chorus|refrain|bridge|intro|outro)(\s+\d+)?$/i.test(trimmed)
        ? detectKindFromHeading(trimmed)
        : null;

    if (detected) {
      sawExplicitHeader = true;
      if (current && current.lines.some((l) => l.trim())) {
        sections.push(current);
      }
      current = { kind: detected.kind, customLabel: detected.label, lines: [] };
      continue;
    }

    if (!sawExplicitHeader && trimmed === '') {
      if (current && current.lines.some((l) => l.trim())) {
        sections.push(current);
        current = null;
      }
      continue;
    }

    if (!current) {
      current = {
        kind: sections.length === 1 ? 'chorus' : 'verse',
        lines: [],
      };
    }
    current.lines.push(line);
  }

  if (current && current.lines.some((l) => l.trim())) {
    sections.push(current);
  }

  const built: SongPart[] = [];
  for (const sec of sections) {
    const text = sec.lines.join('\n').trim();
    if (!text) continue;
    built.push({
      id: `local_${Math.random().toString(36).slice(2, 9)}`,
      kind: sec.kind,
      label: sec.customLabel || defaultPartLabel(sec.kind, built),
      lyrics: text,
    });
  }
  return built;
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
    setTimeout(() => setToast(null), 2000);
  };

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

  const applyPastedLyrics = () => {
    const parsed = parseFullLyrics(pasteBuffer);
    if (parsed.length === 0) {
      showToast('Paste some lyrics first');
      return;
    }
    setParts(parsed);
    setDirtyLyrics(true);
    setPasteBuffer('');
    setPasteOpen(false);
    showToast(`Split into ${parsed.length} parts`);
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
        onBack={() => navigate(editing && existing ? `/songs/${existing.id}` : '/')}
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
        <span className="label">Parts ({parts.length})</span>

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
                placeholder={`${part.label} lyrics…`}
                value={part.lyrics}
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
          onClick={() => navigate(editing && existing ? `/songs/${existing.id}` : '/')}
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
        title="Paste lyrics"
        subtitle="Use [Verse] / [Chorus] headers or blank lines between sections."
      >
        <div className="stack">
          <textarea
            className="textarea"
            rows={9}
            placeholder={`[Verse 1]\nOpening lines…\n\n[Chorus]\nChorus lines…`}
            value={pasteBuffer}
            onChange={(e) => setPasteBuffer(e.target.value)}
          />
          <Button variant="primary" block onClick={applyPastedLyrics}>
            Split into parts
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
