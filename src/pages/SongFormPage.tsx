import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { analyzeLyrics, PART_KINDS } from '../lib/nlp';
import type { Analysis, PartKind, SongPart, Tempo } from '../lib/types';
import { AnalysisCard } from '../components/AnalysisCard';
import { BackBar, Button, Chip, Icon } from '../components/ui';

const PART_LABELS: Record<PartKind, string> = {
  intro: 'Intro',
  verse: 'Verse',
  prechorus: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  refrain: 'Refrain',
  outro: 'Outro',
  other: 'Part',
};

type DraftPart = { key: string; kind: PartKind; label: string; lyrics: string };

let counter = 0;
const newKey = () => `draft_${++counter}`;

function nextLabel(parts: DraftPart[], kind: PartKind) {
  const count = parts.filter((p) => p.kind === kind).length;
  if (kind === 'chorus' || kind === 'bridge' || kind === 'intro' || kind === 'outro') {
    return PART_LABELS[kind];
  }
  return `${PART_LABELS[kind]} ${count + 1}`;
}

export function SongFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { songs, user, teams, refresh } = useStore();
  const editing = songs.find((s) => s.id === id);

  const [title, setTitle] = useState(editing?.title ?? '');
  const [artist, setArtist] = useState(editing?.artist ?? '');
  const [tempo, setTempo] = useState<Tempo>(editing?.tempo ?? 'slow');
  const [teamId, setTeamId] = useState<string>(editing?.teamId ?? '');
  const [parts, setParts] = useState<DraftPart[]>(() =>
    editing && editing.parts.length > 0
      ? editing.parts.map((p) => ({ key: newKey(), kind: p.kind, label: p.label, lyrics: p.lyrics }))
      : [{ key: newKey(), kind: 'verse', label: 'Verse 1', lyrics: '' }],
  );
  const [analysis, setAnalysis] = useState<Analysis | null>(editing?.analysis ?? null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledParts = useMemo(
    () =>
      parts
        .filter((p) => p.lyrics.trim().length > 0)
        .map<DraftPart>((p) => ({ ...p, label: p.label || PART_LABELS[p.kind] })),
    [parts],
  );

  const update = (key: string, patch: Partial<DraftPart>) => {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    if (patch.lyrics !== undefined) setStale(true);
  };

  const addPart = (kind: PartKind) => {
    setParts((prev) => [
      ...prev,
      { key: newKey(), kind, label: nextLabel(prev, kind), lyrics: '' },
    ]);
    setTimeout(() => {
      const el = document.getElementById('parts-anchor');
      el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 60);
  };

  const movePart = (index: number, dir: -1 | 1) => {
    setParts((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setStale(true);
  };

  const removePart = (key: string) => {
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.key !== key) : prev));
    setStale(true);
  };

  const runAnalysis = () => {
    if (filledParts.length === 0) {
      setError('Add some lyrics first — Aria reads them to name the class.');
      return;
    }
    setError(null);
    const songParts: SongPart[] = filledParts.map((p) => ({
      id: p.key,
      kind: p.kind,
      label: p.label,
      lyrics: p.lyrics,
    }));
    const next = analyzeLyrics(songParts);
    setAnalysis(next);
    setStale(false);
    setTempo(next.suggestedTempo);
    setTimeout(() => {
      document.getElementById('analysis-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const save = async () => {
    if (!user) return;
    if (!title.trim()) {
      setError('Give the song a title.');
      return;
    }
    if (filledParts.length === 0) {
      setError('Add at least one part with lyrics.');
      return;
    }
    setBusy(true);
    setError(null);
    const payloadParts = filledParts.map((p) => ({
      kind: p.kind,
      label: p.label,
      lyrics: p.lyrics,
    }));
    const finalAnalysis =
      analysis && !stale
        ? analysis
        : analyzeLyrics(
            filledParts.map((p) => ({ id: p.key, kind: p.kind, label: p.label, lyrics: p.lyrics })),
          );
    try {
      if (editing) {
        await api.updateSong(editing.id, {
          title: title.trim(),
          artist: artist.trim(),
          tempo,
          theme: finalAnalysis.theme,
          parts: editing.parts.length === filledParts.length
            ? filledParts.map((p, index) => ({
                id: editing.parts[index]?.id,
                kind: p.kind,
                label: p.label,
                lyrics: p.lyrics,
              }))
            : payloadParts,
          analysis: finalAnalysis,
          teamId: teamId || null,
        });
      } else {
        await api.createSong({
          title: title.trim(),
          artist: artist.trim() || 'Unknown artist',
          tempo,
          theme: finalAnalysis.theme,
          parts: payloadParts,
          analysis: finalAnalysis,
          teamId: teamId || null,
        });
      }
      await refresh();
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the song.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar onBack={() => navigate(-1)} title={editing ? 'Edit song' : 'New song'} />

      <div className="page-head" style={{ paddingTop: 0 }}>
        <h1>{editing ? 'Edit song' : 'Add a song'}</h1>
        <p>Add the lyrics one part at a time. Each part can be used on its own later.</p>
      </div>

      <div className="card stack-sm">
        <div className="field">
          <label htmlFor="title">Song title</label>
          <input
            id="title"
            className="input"
            value={title}
            placeholder="e.g. Harbor Light"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="artist">Artist</label>
          <input
            id="artist"
            className="input"
            value={artist}
            placeholder="Optional"
            onChange={(e) => setArtist(e.target.value)}
          />
        </div>
        {teams.length > 0 ? (
          <div className="field">
            <label htmlFor="team">Who can see it</label>
            <select id="team" className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Just me (private)</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  Share with {team.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="section-label">
        <h2>Lyrics by part</h2>
        <span className="tiny muted">{filledParts.length} part{filledParts.length === 1 ? '' : 's'} filled</span>
      </div>

      <div id="parts-anchor" className="stack-sm">
        {parts.map((part, index) => (
          <div className="part-editor" key={part.key}>
            <div className="part-editor-head">
              <span className="part-index">{index + 1}</span>
              <select
                className="select"
                style={{ minHeight: 34, padding: '5px 30px 5px 10px', fontSize: 13, width: 'auto' }}
                value={part.kind}
                aria-label={`Type of part ${index + 1}`}
                onChange={(e) => {
                  const kind = e.target.value as PartKind;
                  update(part.key, { kind, label: nextLabel(parts, kind) });
                }}
              >
                {PART_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ minHeight: 34, padding: '5px 10px', fontSize: 13 }}
                value={part.label}
                aria-label={`Label of part ${index + 1}`}
                placeholder="Label"
                onChange={(e) => update(part.key, { label: e.target.value })}
              />
              <div className="row" style={{ gap: 0 }}>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 30, height: 30, borderColor: 'transparent' }}
                  onClick={() => movePart(index, -1)}
                  aria-label="Move part up"
                  disabled={index === 0}
                >
                  <Icon.Up />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 30, height: 30, borderColor: 'transparent' }}
                  onClick={() => movePart(index, 1)}
                  aria-label="Move part down"
                  disabled={index === parts.length - 1}
                >
                  <Icon.Down />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 30, height: 30, borderColor: 'transparent', color: 'var(--muted)' }}
                  onClick={() => removePart(part.key)}
                  aria-label="Remove part"
                  disabled={parts.length === 1}
                >
                  <Icon.Trash size={14} />
                </button>
              </div>
            </div>
            <textarea
              className="textarea lyrics"
              value={part.lyrics}
              placeholder={
                part.kind === 'chorus'
                  ? 'Write the chorus…'
                  : part.kind === 'bridge'
                    ? 'Write the bridge…'
                    : 'Write the lyrics of this part, one line at a time…'
              }
              aria-label={`Lyrics for ${part.label}`}
              onChange={(e) => update(part.key, { lyrics: e.target.value })}
            />
            <div className="tiny muted" style={{ marginTop: 5, textAlign: 'right' }}>
              {part.lyrics.trim() ? `${part.lyrics.trim().split(/\s+/).length} words` : 'empty'}
            </div>
          </div>
        ))}
      </div>

      <div className="card stack-sm">
        <div className="label">Add another part</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {(['verse', 'chorus', 'bridge', 'intro', 'prechorus', 'outro'] as PartKind[]).map((kind) => (
            <button key={kind} type="button" className="chip chip-button" onClick={() => addPart(kind)}>
              <Icon.Plus size={12} /> {PART_LABELS[kind]}
            </button>
          ))}
        </div>
        <p className="hint">
          Duplicate a part when the same chorus repeats — each one becomes its own draggable piece.
        </p>
      </div>

      <div id="analysis-anchor" className="stack-sm">
        {analysis ? (
          <>
            <div className="section-label" style={{ marginTop: 6 }}>
              <h2>{stale ? 'Re-run to refresh' : 'Result'}</h2>
              {stale ? <span className="badge warn">Lyrics changed</span> : null}
            </div>
            <AnalysisCard analysis={analysis} />
          </>
        ) : null}
      </div>

      <Button variant="soft" block onClick={runAnalysis} disabled={filledParts.length === 0}>
        <Icon.Sparkle /> {analysis ? 'Re-run class & message' : 'Generate class & message'}
      </Button>

      {analysis && !stale ? (
        <div className="card stack-sm">
          <div className="label">Tempo for this song</div>
          <p className="hint">Aria guessed “{analysis.suggestedTempo}”. Keep it or set it yourself.</p>
          <div className="row" style={{ gap: 8 }}>
            <Chip active={tempo === 'fast'} onClick={() => setTempo('fast')}>
              <Icon.Bolt size={13} /> Fast
            </Chip>
            <Chip active={tempo === 'slow'} onClick={() => setTempo('slow')}>
              <Icon.Wave size={13} /> Slow
            </Chip>
          </div>
        </div>
      ) : null}

      {error ? <p className="small" style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <div className="sticky-bar">
        <Button variant="primary" block onClick={save} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Save song'}
        </Button>
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}
