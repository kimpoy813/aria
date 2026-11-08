import { PART_KINDS } from './nlp';
import type { PartKind, SongPart } from './types';

export interface SplitOptions {
  /** Optional song title — helps identify the chorus when lyrics have no headers. */
  songTitle?: string;
  /** Collapse near-identical repeated sections (e.g. identical Chorus repeated 3x). Default: true. */
  collapseRepeats?: boolean;
}

export interface SplitResult {
  parts: SongPart[];
  hadExplicitHeaders: boolean;
  collapsedCount: number;
}

const NOISE_LINE_RE =
  /^(you might also like|\d*\s*embed|see .+ live|get tickets as low as \$[\d,.]+|lyrics from .+)$/i;

const REPEAT_MARKER_RE =
  /^[\[(]?\s*repeat\s+(chorus|refrain|bridge|pre[-\s]?chorus|verse(?:\s+\d+)?|tag|intro|outro)(?:\s*[x×]\s*\d+|\s+\d+\s*times?)?\s*[\])]?\.?$/i;

const CHORD_TOKEN_RE =
  /^[A-G][#b♯♭]?(?:m|maj|min|dim|aug|sus|add|no)?\d*(?:[#b+-]\d+)?(?:\/[A-G][#b♯♭]?)?$/;

/** Returns true if a line looks like guitar/piano chords above lyrics (e.g. "G   D/F#   Em7   C"). */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed.replace(/[|()[\]·•-]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // Single token like "Am" or "G7" on a line with lots of leading spaces, or multiple chord tokens
  const chordMatches = tokens.filter((t) => CHORD_TOKEN_RE.test(t)).length;
  if (tokens.length === 1) {
    // Avoid confusing "Intro" / "Verse" (not chords anyway) — single chord line like "G" or "Am7"
    return CHORD_TOKEN_RE.test(tokens[0]);
  }
  return chordMatches / tokens.length >= 0.75;
}

export function defaultPartLabel(kind: PartKind, existing: Pick<SongPart, 'kind' | 'label'>[]): string {
  const base = PART_KINDS.find((k) => k.kind === kind)?.label ?? 'Part';
  if (kind === 'verse') {
    const count = existing.filter((p) => p.kind === 'verse').length;
    return `Verse ${count + 1}`;
  }
  const sameKind = existing.filter((p) => p.kind === kind).length;
  return sameKind > 0 ? `${base} ${sameKind + 1}` : base;
}

function makeId(): string {
  return `local_${Math.random().toString(36).slice(2, 9)}`;
}

function tidyHeaderLabel(kind: PartKind, rawLabel: string): string | undefined {
  // Strip artist annotations like "[Verse 1: Singer Name]" -> "Verse 1"
  // and repeat suffixes like "Chorus (x2)" -> "Chorus"
  const withoutColonMeta = rawLabel.split(/\s*:\s*/)[0].trim();
  const withoutRepeat = withoutColonMeta
    .replace(/\s*[\[(]?\s*(?:[x×]\s*\d+|\d+\s*[x×]|repeat)\s*[\])]?\s*$/i, '')
    .trim();

  const numMatch = withoutRepeat.match(/\b(\d+|one|two|three|four|i|ii|iii|iv)\s*$/i);
  const wordToNum: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    i: '1',
    ii: '2',
    iii: '3',
    iv: '4',
  };
  const num = numMatch
    ? wordToNum[numMatch[1].toLowerCase()] ?? numMatch[1]
    : null;

  const base = PART_KINDS.find((k) => k.kind === kind)?.label ?? 'Part';
  if (num) return `${base} ${num}`;
  return undefined;
}

/**
 * Recognises standalone section headings such as:
 *   [Verse 1], [Chorus: All], (Pre-Chorus), CHORUS:, Verse 2 -, V1, C1, Bridge (x2)
 */
export function detectSectionHeading(
  rawLine: string,
): { kind: PartKind; label?: string; inlineLyric?: string } | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.length > 72) return null;
  if (isChordLine(trimmed)) return null;

  // Check inline heading with lyrics on the same line: "Verse 1: Amazing grace..."
  const inlineMatch = trimmed.match(
    /^(?:\[|\()?\s*(pre[-\s]?chorus(?:\s+\d+)?|chorus(?:\s+\d+)?|refrain(?:\s+\d+)?|hook(?:\s+\d+)?|verse(?:\s+\d+)?|stanza(?:\s+\d+)?|bridge(?:\s+\d+)?|intro(?:duction)?|outro|ending|tag|coda)\s*(?:\]|\))?\s*[:\-–—]\s+(.+)$/i,
  );
  if (inlineMatch && inlineMatch[2].trim().length > 0) {
    const headPart = inlineMatch[1].trim();
    const rest = inlineMatch[2].trim();
    // Make sure `rest` isn't just a singer credit inside brackets like "[Verse 1: John]"
    if (!trimmed.startsWith('[') && !trimmed.startsWith('(')) {
      const detected = matchHeadingKeyword(headPart);
      if (detected) {
        return {
          kind: detected,
          label: tidyHeaderLabel(detected, headPart),
          inlineLyric: rest,
        };
      }
    }
  }

  const isWrapped =
    (/^\[.+\]$/.test(trimmed) || /^\(.+\)$/.test(trimmed)) && trimmed.length <= 56;
  const hasTrailingColon = /^[A-Za-z0-9\s\-–—#().]{2,36}:$/.test(trimmed);

  const core = trimmed
    .replace(/^\[|\]$/g, '')
    .replace(/^\(|\)$/g, '')
    .replace(/[:\-–—]+$/, '')
    .trim();

  if (!core || core.length > 44) return null;

  if (isWrapped || hasTrailingColon) {
    const kind = matchHeadingKeyword(core);
    if (kind) return { kind, label: tidyHeaderLabel(kind, core) };
  }

  // Bare standalone heading line (e.g. "Verse 1", "CHORUS", "Pre-Chorus", "Bridge 2", "V1", "C1")
  const bareMatch =
    /^(?:(?:pre[-\s]?chorus|chorus|refrain|hook|verse|stanza|bridge|intro(?:duction)?|outro|ending|tag|coda|vamp|interlude)(?:\s*(?:#?\d+|one|two|three|four|i|ii|iii|iv))?(?:\s*[\[(]?(?:[x×]\d+|\d+[x×])[\])]?)?|v\d+|c\d+|pc\d*|br\d*)$/i.test(
      core,
    );
  if (bareMatch) {
    const kind = matchHeadingKeyword(core);
    if (kind) return { kind, label: tidyHeaderLabel(kind, core) };
  }

  return null;
}

function matchHeadingKeyword(core: string): PartKind | null {
  const lower = core.toLowerCase().trim();
  if (/^(?:pre[-\s]?chorus|prechorus|pc\d*)\b/.test(lower)) return 'prechorus';
  if (/^(?:refrain)\b/.test(lower)) return 'refrain';
  if (/^(?:chorus|hook|c\d+)\b/.test(lower)) return 'chorus';
  if (/^(?:verse|stanza|v\d+)\b/.test(lower)) return 'verse';
  if (/^(?:bridge|vamp|interlude|br\d*)\b/.test(lower)) return 'bridge';
  if (/^(?:intro|introduction)\b/.test(lower)) return 'intro';
  if (/^(?:outro|ending|tag|coda)\b/.test(lower)) return 'outro';
  return null;
}

/* ------------------------------------------------ similarity & heuristics */

function normalizeLineForCompare(line: string): string {
  return line
    .toLowerCase()
    .replace(/[\[(]?(?:[x×]\s*\d+|\d+\s*[x×])[\])]?\s*$/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lyricLinesOnly(lines: string[]): string[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isChordLine(l));
}

function stanzaSimilarity(aLines: string[], bLines: string[]): number {
  const aNorm = lyricLinesOnly(aLines).map(normalizeLineForCompare).filter(Boolean);
  const bNorm = lyricLinesOnly(bLines).map(normalizeLineForCompare).filter(Boolean);
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  if (aNorm.join('\n') === bNorm.join('\n')) return 1;

  // Line-level overlap
  const bSet = new Set(bNorm);
  const aSet = new Set(aNorm);
  let sharedLines = 0;
  for (const l of aSet) {
    if (bSet.has(l)) sharedLines++;
  }
  const lineDice = (2 * sharedLines) / (aSet.size + bSet.size);

  // Word-level Jaccard
  const aWords = new Set(aNorm.join(' ').split(' ').filter((w) => w.length > 1));
  const bWords = new Set(bNorm.join(' ').split(' ').filter((w) => w.length > 1));
  if (aWords.size === 0 || bWords.size === 0) return lineDice;
  let sharedWords = 0;
  for (const w of aWords) {
    if (bWords.has(w)) sharedWords++;
  }
  const wordJaccard = sharedWords / (aWords.size + bWords.size - sharedWords);

  return Math.max(lineDice, wordJaccard * 0.95);
}

function internalRepetitionScore(lines: string[], songTitle?: string): number {
  const norm = lyricLinesOnly(lines).map(normalizeLineForCompare).filter(Boolean);
  if (norm.length === 0) return 0;

  let score = 0;

  // Exact repeated lines inside the stanza
  const counts = new Map<string, number>();
  for (const l of norm) counts.set(l, (counts.get(l) ?? 0) + 1);
  for (const c of counts.values()) {
    if (c >= 2) score += 2.2 * (c - 1);
  }

  // Repeated opening 3-word hooks across lines
  const prefixes = new Map<string, number>();
  for (const l of norm) {
    const words = l.split(' ');
    if (words.length >= 3) {
      const prefix = words.slice(0, 3).join(' ');
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
    }
  }
  for (const c of prefixes.values()) {
    if (c >= 2) score += 1.4 * (c - 1);
  }

  // Song title presence
  const normTitle = songTitle ? normalizeLineForCompare(songTitle) : '';
  if (normTitle && normTitle.length >= 3) {
    let titleHits = 0;
    for (const l of norm) {
      if (l.includes(normTitle)) titleHits++;
    }
    if (titleHits >= 1) score += 2.5 + Math.min(2, (titleHits - 1) * 1.2);
  }

  return score;
}

/**
 * If user pasted one unbroken wall of lines (no blank lines & no headers),
 * split by repeated multi-line hook blocks or into 4-line stanzas.
 */
function splitUnbrokenBlock(lines: string[]): string[][] {
  const clean = lines.map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (clean.length < 6) return [clean];

  const norm = clean.map(normalizeLineForCompare);

  // Look for a repeating 3- or 4-line chorus block inside the unbroken lines
  for (const win of [4, 3, 2]) {
    if (clean.length < win * 2 + 2) continue;
    for (let i = 0; i <= clean.length - win * 2; i++) {
      if (!norm[i] || norm[i].length < 4) continue;
      const matches: number[] = [i];
      for (let j = i + win; j <= clean.length - win; j++) {
        let same = true;
        for (let k = 0; k < win; k++) {
          if (norm[i + k] !== norm[j + k]) {
            same = false;
            break;
          }
        }
        if (same) {
          matches.push(j);
          j += win - 1;
        }
      }
      if (matches.length >= 2 && (win >= 3 || matches[0] >= 2)) {
        const blocks: string[][] = [];
        let cursor = 0;
        for (const start of matches) {
          if (start > cursor) {
            blocks.push(clean.slice(cursor, start));
          }
          blocks.push(clean.slice(start, start + win));
          cursor = start + win;
        }
        if (cursor < clean.length) {
          blocks.push(clean.slice(cursor));
        }
        return blocks.filter((b) => b.length > 0);
      }
    }
  }

  // Fallback for long unbroken lyrics (8+ lyric lines): chunk into 4-line stanzas
  const lyricCount = lyricLinesOnly(clean).length;
  if (lyricCount >= 8) {
    const chunks: string[][] = [];
    let buf: string[] = [];
    let count = 0;
    for (const line of clean) {
      buf.push(line);
      if (!isChordLine(line)) count++;
      if (count === 4) {
        chunks.push(buf);
        buf = [];
        count = 0;
      }
    }
    if (buf.length > 0) {
      if (chunks.length > 0 && lyricLinesOnly(buf).length === 1) {
        chunks[chunks.length - 1].push(...buf);
      } else {
        chunks.push(buf);
      }
    }
    return chunks;
  }

  return [clean];
}

/**
 * Classifies unlabelled stanzas into Verse, Pre-Chorus, Chorus, Bridge, Intro, Outro.
 */
function classifyUnlabelledStanzas(
  stanzas: string[][],
  songTitle?: string,
): { kind: PartKind; lines: string[] }[] {
  const n = stanzas.length;
  if (n === 0) return [];
  if (n === 1) return [{ kind: 'verse', lines: stanzas[0] }];

  // Strip leading numbered prefixes like "1. Amazing grace" -> "Amazing grace"
  let hadNumberedVerses = false;
  const numberedIndices = new Set<number>();
  const cleanedStanzas = stanzas.map((lines, idx) => {
    const first = lines[0]?.trim() ?? '';
    const numPrefix = first.match(/^(\d+)[.)]\s+(.+)$/);
    if (numPrefix) {
      hadNumberedVerses = true;
      numberedIndices.add(idx);
      return [numPrefix[2], ...lines.slice(1)];
    }
    return lines;
  });

  // Group stanzas by similarity (>= 0.68)
  const clusterOf = new Array<number>(n).fill(-1);
  const clusters: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (clusterOf[i] !== -1) continue;
    const cid = clusters.length;
    clusterOf[i] = cid;
    const members = [i];
    for (let j = i + 1; j < n; j++) {
      if (clusterOf[j] !== -1) continue;
      if (stanzaSimilarity(cleanedStanzas[i], cleanedStanzas[j]) >= 0.68) {
        clusterOf[j] = cid;
        members.push(j);
      }
    }
    clusters.push(members);
  }

  const kinds = new Array<PartKind | null>(n).fill(null);

  // Numbered stanzas are explicitly verses
  if (hadNumberedVerses) {
    for (const idx of numberedIndices) {
      kinds[idx] = 'verse';
    }
  }

  // Repeating clusters -> Chorus (and optional Pre-Chorus if two clusters repeat in pairs)
  const repeatingClusters = clusters
    .map((members, cid) => ({ cid, members }))
    .filter((c) => c.members.length >= 2);

  if (repeatingClusters.length > 0) {
    // Pick main chorus cluster: most occurrences, tie-break by internal repetition + line count
    repeatingClusters.sort((a, b) => {
      if (b.members.length !== a.members.length) return b.members.length - a.members.length;
      const aScore =
        internalRepetitionScore(cleanedStanzas[a.members[0]], songTitle) +
        lyricLinesOnly(cleanedStanzas[a.members[0]]).length * 0.3;
      const bScore =
        internalRepetitionScore(cleanedStanzas[b.members[0]], songTitle) +
        lyricLinesOnly(cleanedStanzas[b.members[0]]).length * 0.3;
      return bScore - aScore;
    });

    const mainChorus = repeatingClusters[0];
    for (const idx of mainChorus.members) {
      kinds[idx] = 'chorus';
    }

    // Check if another repeating cluster consistently sits right before the chorus -> Pre-Chorus!
    for (const other of repeatingClusters.slice(1)) {
      const precedesChorus = other.members.every((idx) => kinds[idx + 1] === 'chorus');
      for (const idx of other.members) {
        kinds[idx] = precedesChorus ? 'prechorus' : 'refrain';
      }
    }
  } else {
    // No verbatim repeat across stanzas: score each stanza for Chorus likelihood
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < n; i++) {
      if (kinds[i] === 'verse') continue;
      const lineCount = lyricLinesOnly(cleanedStanzas[i]).length;
      let score = internalRepetitionScore(cleanedStanzas[i], songTitle);
      if (i === 1) score += 2.2;
      else if (i === 2 && lyricLinesOnly(cleanedStanzas[1]).length <= 3) score += 2.0;
      else if (i === 0) score -= 0.8;
      if (lineCount >= 2 && lineCount <= 6) score += 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1 && bestScore >= 1.2) {
      kinds[bestIdx] = 'chorus';
      // Check short Pre-Chorus right before Chorus
      if (
        bestIdx === 2 &&
        kinds[0] === null &&
        kinds[1] === null &&
        lyricLinesOnly(cleanedStanzas[0]).length >= 3 &&
        lyricLinesOnly(cleanedStanzas[1]).length <= 3
      ) {
        kinds[1] = 'prechorus';
      }
    }
  }

  // Structural roles for remaining unassigned stanzas
  const chorusIndices = kinds
    .map((k, idx) => (k === 'chorus' ? idx : -1))
    .filter((idx) => idx !== -1);
  const firstChorus = chorusIndices[0] ?? -1;
  const lastChorus = chorusIndices[chorusIndices.length - 1] ?? -1;

  // Short 1-2 line opener before Verse 1 -> Intro
  if (
    n >= 3 &&
    kinds[0] === null &&
    firstChorus !== 1 &&
    lyricLinesOnly(cleanedStanzas[0]).length <= 2 &&
    lyricLinesOnly(cleanedStanzas[1]).length >= 4
  ) {
    kinds[0] = 'intro';
  }

  // Short ending tag after Chorus -> Outro
  if (
    n >= 3 &&
    kinds[n - 1] === null &&
    lastChorus !== -1 &&
    lastChorus < n - 1 &&
    (lyricLinesOnly(cleanedStanzas[n - 1]).length <= 3 ||
      internalRepetitionScore(cleanedStanzas[n - 1], songTitle) >= 2.0)
  ) {
    kinds[n - 1] = 'outro';
  }

  // Distinct stanza sandwiched before the final Chorus (after >= 1 Chorus) -> Bridge
  if (n >= 4 && chorusIndices.length >= 2) {
    for (let i = chorusIndices[0] + 1; i < lastChorus; i++) {
      if (kinds[i] === null && i >= 3 && kinds[i + 1] === 'chorus') {
        kinds[i] = 'bridge';
      }
    }
  } else if (n >= 4 && chorusIndices.length === 1 && firstChorus === 1) {
    // e.g. Verse 1, Chorus, Verse 2, Bridge (when 4th stanza differs near end)
    if (kinds[3] === null && n === 4 && internalRepetitionScore(cleanedStanzas[3]) >= 1.4) {
      kinds[3] = 'bridge';
    }
  }

  // Any remaining unassigned stanzas are Verses
  return cleanedStanzas.map((lines, i) => ({
    kind: kinds[i] ?? 'verse',
    lines,
  }));
}

/**
 * Automatically identifies and splits raw pasted lyrics into structured SongParts
 * (Verse, Pre-Chorus, Chorus, Bridge, Intro, Outro, Refrain) — with or without headers.
 */
export function splitPastedLyrics(raw: string, options: SplitOptions = {}): SplitResult {
  const { songTitle, collapseRepeats = true } = options;
  const normalized = raw.replace(/\r\n?/g, '\n');
  const rawLines = normalized
    .split('\n')
    .filter((line) => !NOISE_LINE_RE.test(line.trim()));

  interface RawSection {
    kind: PartKind;
    customLabel?: string;
    lines: string[];
    isRepeatMarker?: boolean;
  }

  const explicitSections: RawSection[] = [];
  const preHeaderLines: string[] = [];
  let current: RawSection | null = null;
  let sawExplicitHeader = false;

  const flushPreHeaderLines = () => {
    if (!preHeaderLines.some((l) => l.trim())) return;
    let buf: string[] = [];
    for (const pl of preHeaderLines) {
      if (pl.trim() === '') {
        if (buf.some((l) => l.trim())) {
          explicitSections.push({ kind: 'verse', lines: buf });
          buf = [];
        }
      } else {
        buf.push(pl);
      }
    }
    if (buf.some((l) => l.trim())) {
      explicitSections.push({ kind: 'verse', lines: buf });
    }
    preHeaderLines.length = 0;
  };

  let explicitHadVerseHeader = false;

  for (const line of rawLines) {
    const trimmed = line.trim();

    // Standalone "(Repeat Chorus)" marker
    const repeatMatch = trimmed.match(REPEAT_MARKER_RE);
    if (repeatMatch) {
      if (!sawExplicitHeader) flushPreHeaderLines();
      sawExplicitHeader = true;
      if (current && current.lines.some((l) => l.trim())) {
        explicitSections.push(current);
      }
      const repKind = matchHeadingKeyword(repeatMatch[1]) ?? 'chorus';
      explicitSections.push({ kind: repKind, lines: [], isRepeatMarker: true });
      current = null;
      continue;
    }

    const heading = detectSectionHeading(trimmed);
    if (heading) {
      if (!sawExplicitHeader) flushPreHeaderLines();
      sawExplicitHeader = true;
      if (heading.kind === 'verse') explicitHadVerseHeader = true;
      if (current) {
        if (current.lines.some((l) => l.trim())) {
          explicitSections.push(current);
        } else {
          // Empty explicit header like "[Chorus]" with no body = repeat reference
          explicitSections.push({ ...current, isRepeatMarker: true });
        }
      }
      current = {
        kind: heading.kind,
        customLabel: heading.label,
        lines: heading.inlineLyric ? [heading.inlineLyric] : [],
      };
      continue;
    }

    if (sawExplicitHeader) {
      // Hymn-style sheets often label only "Chorus:" and separate subsequent verses with blank lines
      if (
        trimmed === '' &&
        !explicitHadVerseHeader &&
        current &&
        current.kind !== 'verse' &&
        current.lines.some((l) => l.trim())
      ) {
        explicitSections.push(current);
        current = null;
        continue;
      }
      if (
        trimmed === '' &&
        !explicitHadVerseHeader &&
        current &&
        current.kind === 'verse' &&
        current.lines.some((l) => l.trim())
      ) {
        explicitSections.push(current);
        current = null;
        continue;
      }
      if (!current) {
        if (!trimmed) continue;
        current = { kind: 'verse', lines: [] };
      }
      current.lines.push(line);
    } else {
      preHeaderLines.push(line);
    }
  }

  if (sawExplicitHeader && current) {
    if (current.lines.some((l) => l.trim())) {
      explicitSections.push(current);
    } else {
      explicitSections.push({ ...current, isRepeatMarker: true });
    }
  }

  let candidateSections: { kind: PartKind; customLabel?: string; lines: string[] }[] = [];

  if (sawExplicitHeader) {
    // Resolve empty repeat markers against earlier sections of the same kind
    const firstByKind = new Map<PartKind, string[]>();
    for (const sec of explicitSections) {
      if (sec.lines.some((l) => l.trim()) && !firstByKind.has(sec.kind)) {
        firstByKind.set(sec.kind, sec.lines);
      }
    }
    for (const sec of explicitSections) {
      if (sec.isRepeatMarker || !sec.lines.some((l) => l.trim())) {
        if (!collapseRepeats) {
          const fallbackLines = firstByKind.get(sec.kind);
          if (fallbackLines) {
            candidateSections.push({
              kind: sec.kind,
              customLabel: sec.customLabel,
              lines: [...fallbackLines],
            });
          }
        }
        continue;
      }
      candidateSections.push({
        kind: sec.kind,
        customLabel: sec.customLabel,
        lines: sec.lines,
      });
    }
  } else {
    // Split on blank lines into stanzas
    const stanzas: string[][] = [];
    let buf: string[] = [];
    for (const line of rawLines) {
      if (line.trim() === '') {
        if (buf.some((l) => l.trim())) {
          stanzas.push(buf);
          buf = [];
        }
      } else {
        buf.push(line);
      }
    }
    if (buf.some((l) => l.trim())) {
      stanzas.push(buf);
    }

    const finalStanzas =
      stanzas.length === 1 ? splitUnbrokenBlock(stanzas[0]) : stanzas;

    candidateSections = classifyUnlabelledStanzas(finalStanzas, songTitle);
  }

  // Build final SongParts, optionally collapsing near-identical repeated non-verse sections
  const built: SongPart[] = [];
  let collapsedCount = 0;

  for (const sec of candidateSections) {
    // Trim leading/trailing blank lines inside each part while preserving internal line breaks
    const text = sec.lines
      .join('\n')
      .replace(/^\n+|\n+$/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();
    if (!text.trim()) continue;

    if (collapseRepeats && sec.kind !== 'verse') {
      const secLines = text.split('\n');
      const duplicate = built.find(
        (existing) =>
          existing.kind === sec.kind &&
          stanzaSimilarity(existing.lyrics.split('\n'), secLines) >= 0.88,
      );
      if (duplicate) {
        collapsedCount++;
        continue;
      }
    }

    // Ensure customLabel doesn't collide with an already-used label
    let label = sec.customLabel;
    if (!label || built.some((p) => p.label.toLowerCase() === label!.toLowerCase())) {
      label = defaultPartLabel(sec.kind, built);
    }

    built.push({
      id: makeId(),
      kind: sec.kind,
      label,
      lyrics: text,
    });
  }

  return {
    parts: built,
    hadExplicitHeaders: sawExplicitHeader,
    collapsedCount,
  };
}

/**
 * Determines whether text pasted directly into a part textarea should trigger
 * automatic multi-section splitting instead of plain single-box paste.
 */
export function shouldAutoSplitPaste(
  pastedText: string,
  targetCurrentLyrics: string,
  isReplacingAllInTarget: boolean,
): boolean {
  const trimmed = pastedText.trim();
  if (!trimmed || !trimmed.includes('\n')) return false;

  const result = splitPastedLyrics(trimmed);
  if (result.hadExplicitHeaders && result.parts.length >= 1) {
    return targetCurrentLyrics.trim() === '' || isReplacingAllInTarget || result.parts.length >= 2;
  }

  if (result.parts.length >= 2 && (targetCurrentLyrics.trim() === '' || isReplacingAllInTarget)) {
    return true;
  }

  return false;
}
