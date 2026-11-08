import type { Lineup, Song } from './types';

export interface SequenceEntry {
  itemId: string;
  song: Song;
  partId: string;
  partKind: string;
  partLabel: string;
  lyrics: string;
}

export interface LineupSongSummary {
  song: Song;
  parts: string[];
}

export interface SongUsageStat {
  song: Song;
  inLineupsCount: number;
  lineupNames: string[];
  useCount: number;
  lastUsedAt: number | null;
  lastLineupName: string | null;
}

export interface GroupedSongSection {
  key: string;
  partLabel: string;
  lyrics: string;
  isRepeat: boolean;
}

export interface GroupedSongBlock {
  key: string;
  songTitle: string;
  sections: GroupedSongSection[];
}

export const tempoOf = (song: Song | undefined) => song?.tempo ?? 'slow';

/** Moment a lineup was last used — a share link being sent or opened. */
export function lastUsed(lineup: Lineup): number {
  return lineup.lastUsedAt || 0;
}

/** Least Recently Used first: never-used, then oldest, then oldest created. */
export function orderByLRU(lineups: Lineup[]): Lineup[] {
  return [...lineups].sort((a, b) => {
    const au = lastUsed(a);
    const bu = lastUsed(b);
    if (au !== bu) return au - bu;
    return a.createdAt - b.createdAt;
  });
}

export function resolveSequence(lineup: Lineup, songs: Song[]): SequenceEntry[] {
  const entries: SequenceEntry[] = [];
  for (const item of lineup.items) {
    const song = songs.find((s) => s.id === item.songId);
    const part =
      song?.parts.find((p) => p.id === item.partId) ??
      (item.partLabel
        ? song?.parts.find((p) => p.label.toLowerCase() === item.partLabel!.toLowerCase())
        : undefined) ??
      (item.partKind ? song?.parts.find((p) => p.kind === item.partKind) : undefined);

    if (song && part) {
      entries.push({
        itemId: item.id,
        song,
        partId: part.id,
        partKind: part.kind,
        partLabel: part.label,
        lyrics: part.lyrics,
      });
    } else if (item.lyrics) {
      const fallbackSong: Song = song ?? {
        id: item.songId,
        title: item.songTitle || 'Untitled song',
        artist: item.artist || 'Unknown artist',
        tempo: item.tempo === 'fast' ? 'fast' : 'slow',
        theme: lineup.theme || '',
        parts: [],
        analysis: null,
        ownerId: lineup.ownerId,
        ownerName: lineup.ownerName,
        teamId: lineup.teamId,
        sourceSongId: null,
        createdAt: lineup.createdAt,
        updatedAt: lineup.updatedAt,
      };
      entries.push({
        itemId: item.id,
        song: fallbackSong,
        partId: item.partId,
        partKind: String(item.partKind || 'verse'),
        partLabel: item.partLabel || 'Part',
        lyrics: item.lyrics,
      });
    }
  }
  return entries;
}

export function lineupTempoMix(lineup: Lineup, songs: Song[]) {
  const entries = resolveSequence(lineup, songs);
  const fast = entries.filter((e) => e.song.tempo === 'fast').length;
  const slow = entries.length - fast;
  return { fast, slow, total: entries.length };
}

/**
 * Returns the unique songs used in a lineup in exact order of first appearance,
 * together with the ordered list of part labels sung from each song.
 */
export function summarizeLineupSongs(
  lineup: Lineup,
  songs: Song[],
): LineupSongSummary[] {
  const entries = resolveSequence(lineup, songs);
  const bySongId = new Map<string, LineupSongSummary>();

  for (const entry of entries) {
    const key = entry.song.id || entry.song.title.toLowerCase();
    const existing = bySongId.get(key);
    if (existing) {
      existing.parts.push(entry.partLabel);
    } else {
      bySongId.set(key, {
        song: entry.song,
        parts: [entry.partLabel],
      });
    }
  }

  return Array.from(bySongId.values());
}

/**
 * Computes usage & LRU rotation metadata for songs across all lineups.
 * Songs used in lineups are ordered Least Recently Used first (never-shared
 * lineup songs first, then oldest `lastUsedAt`, then oldest `createdAt`).
 */
export function summarizeSongsUsed(
  songs: Song[],
  lineups: Lineup[],
): SongUsageStat[] {
  const stats = new Map<string, SongUsageStat>();

  for (const song of songs) {
    stats.set(song.id, {
      song,
      inLineupsCount: 0,
      lineupNames: [],
      useCount: 0,
      lastUsedAt: null,
      lastLineupName: null,
    });
  }

  for (const lineup of lineups) {
    const usedInLineup = summarizeLineupSongs(lineup, songs);
    for (const { song } of usedInLineup) {
      let stat = stats.get(song.id);
      if (!stat) {
        stat = {
          song,
          inLineupsCount: 0,
          lineupNames: [],
          useCount: 0,
          lastUsedAt: null,
          lastLineupName: null,
        };
        stats.set(song.id, stat);
      }
      stat.inLineupsCount += 1;
      if (!stat.lineupNames.includes(lineup.name)) {
        stat.lineupNames.push(lineup.name);
      }
      stat.useCount += lineup.useCount || 0;
      const usedTs = lineup.lastUsedAt || 0;
      if (usedTs > 0 && (stat.lastUsedAt === null || usedTs > stat.lastUsedAt)) {
        stat.lastUsedAt = usedTs;
        stat.lastLineupName = lineup.name;
      } else if (stat.lastLineupName === null) {
        stat.lastLineupName = lineup.name;
      }
    }
  }

  return Array.from(stats.values()).sort((a, b) => {
    const au = a.lastUsedAt || 0;
    const bu = b.lastUsedAt || 0;
    if (au !== bu) return au - bu;
    if (a.inLineupsCount !== b.inLineupsCount) return b.inLineupsCount - a.inLineupsCount;
    return a.song.createdAt - b.song.createdAt;
  });
}

/**
 * Groups consecutive lineup items belonging to the same song into a single
 * clean block so the song title is shown once instead of repeated per part,
 * and marks duplicate sections within the same song block as compact repeats.
 */
export function groupLineupSongBlocks(
  items: {
    songKey?: string;
    songTitle: string;
    partLabel: string;
    lyrics: string;
  }[],
): GroupedSongBlock[] {
  const blocks: (GroupedSongBlock & { seenLyrics: Set<string> })[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const title = it.songTitle.trim() || 'Untitled song';
    const matchKey = (it.songKey || title).trim().toLowerCase();
    const prev = blocks[blocks.length - 1];

    const normLyrics = (it.lyrics || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const sig = `${(it.partLabel || '').trim().toLowerCase()}::${normLyrics}`;

    if (prev && prev.key === matchKey) {
      const isRepeat = normLyrics.length > 0 && prev.seenLyrics.has(sig);
      if (!isRepeat && normLyrics.length > 0) {
        prev.seenLyrics.add(sig);
      }
      prev.sections.push({
        key: String(i),
        partLabel: it.partLabel || 'Part',
        lyrics: it.lyrics || '',
        isRepeat,
      });
    } else {
      const seenLyrics = new Set<string>();
      if (normLyrics.length > 0) seenLyrics.add(sig);
      blocks.push({
        key: matchKey,
        songTitle: title,
        seenLyrics,
        sections: [
          {
            key: String(i),
            partLabel: it.partLabel || 'Part',
            lyrics: it.lyrics || '',
            isRepeat: false,
          },
        ],
      });
    }
  }

  return blocks.map(({ seenLyrics: _seen, ...rest }, idx) => ({
    ...rest,
    key: `${rest.key}_${idx}`,
  }));
}

export function timeAgo(ts: number | null): string {
  if (!ts) return 'never used';
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function reasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case 'link_shared':
      return 'link shared';
    case 'shared_to_team':
      return 'shared to team';
    case 'link_opened':
      return 'link opened';
    default:
      return 'not used yet';
  }
}
