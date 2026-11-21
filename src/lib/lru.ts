import { keyInterval, transposeLyrics } from './chords';
import type { Lineup, LineupItem, Song } from './types';

/**
 * The lyrics a slot actually performs, given the key the slot plays in.
 *
 * A song is stored once, in its own key. The set around it moves: a builder
 * drops song 1 in at G, shifts to D for song 2, then brings song 1 back in D.
 * So the key lives on the *slot*, and the stored text is moved to it here.
 */
function inSlotKey(writtenKey: string, playKey: string | undefined, lyrics: string) {
  // null means "no usable key on one side" — play it exactly as written.
  const interval = keyInterval(writtenKey, playKey) ?? 0;
  return {
    lyrics: interval === 0 ? lyrics : transposeLyrics(lyrics, interval, playKey),
    writtenKey: writtenKey || '',
    playKey: interval === 0 ? null : (playKey as string),
    interval,
  };
}

export interface SequenceEntry {
  itemId: string;
  song: Song;
  partId: string;
  partKind: string;
  partLabel: string;
  /** Lyrics moved into this slot's key — equal to the stored text when no key is set. */
  lyrics: string;
  /** Key the chords are written in. */
  writtenKey: string;
  /** Key this occurrence plays in, or null when it plays as written. */
  playKey: string | null;
  /** Semitones between the two. */
  interval: number;
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
  /** Identity for the block, not a musical key — two blocks of the same song are distinct. */
  key: string;
  songTitle: string;
  /** Key the chords are written in; empty when the song has none. */
  writtenKey?: string;
  /** Key this block is performed in; empty when it plays as written. */
  playKey?: string;
  /** Semitones the stored chords were moved. */
  interval?: number;
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
        ...inSlotKey(song.key || item.songKey || '', item.key, part.lyrics),
      });
    } else if (item.lyrics) {
      const fallbackSong: Song = song ?? {
        id: item.songId,
        title: item.songTitle || 'Untitled song',
        artist: item.artist || 'Unknown artist',
        tempo: item.tempo === 'fast' ? 'fast' : 'slow',
        theme: lineup.theme || '',
        key: item.songKey || item.key || '',
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
        ...inSlotKey(item.songKey || '', item.key, item.lyrics),
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
    /** Key this occurrence is performed in, when one was chosen. */
    playKey?: string;
    writtenKey?: string;
    interval?: number;
  }[],
): GroupedSongBlock[] {
  const blocks: (GroupedSongBlock & { seenLyrics: Set<string> })[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const title = it.songTitle.trim() || 'Untitled song';
    // A song sung twice in different keys is two moments, not one block: the
    // band has to see the new key on its own heading, not buried mid-block.
    const playKey = (it.playKey || '').trim();
    const matchKey = `${(it.songKey || title).trim().toLowerCase()}::${playKey.toLowerCase()}`;
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
        writtenKey: it.writtenKey || '',
        playKey,
        interval: it.interval || 0,
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

export interface FullLyricSource {
  id?: string;
  title: string;
  artist?: string;
  /** Key the chords are written in. */
  key?: string;
  /** Key this whole song is performed in, when the lineup moved it. */
  playKey?: string;
  parts: { label?: string; lyrics: string }[];
}

/**
 * Every part of every song, in the order given, as renderable blocks.
 *
 * A lineup only stores the parts that were picked, but whoever is holding the
 * page is singing the whole song. So a preview and a printout carry the song's
 * complete lyrics in the song's own order — not just the sections that made it
 * into the lineup.
 */
export function fullLyricBlocks(songs: FullLyricSource[]): GroupedSongBlock[] {
  const seen = new Set<string>();
  const blocks: GroupedSongBlock[] = [];

  for (const song of songs) {
    const id = (song.id || song.title || '').trim().toLowerCase();
    if (!id) continue;
    const key = `${id}::${(song.playKey || '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    const parts = (song.parts || []).filter((p) => (p.lyrics || '').trim());
    if (parts.length === 0) continue;
    seen.add(key);
    const writtenKey = song.key || '';
    const interval = keyInterval(writtenKey, song.playKey) ?? 0;
    blocks.push({
      key: `${key}_${blocks.length}`,
      songTitle: (song.title || 'Untitled song').trim(),
      writtenKey,
      playKey: interval === 0 ? '' : String(song.playKey),
      interval,
      sections: parts.map((p, i) => ({
        key: `${key}_${i}`,
        partLabel: (p.label || '').trim() || 'Part',
        lyrics: interval === 0 ? p.lyrics : transposeLyrics(p.lyrics, interval, song.playKey),
        isRepeat: false,
      })),
    });
  }

  return blocks;
}

/**
 * The complete lyrics of every song a lineup uses, in lineup order.
 *
 * Falls back to the lyric snapshot stored on the item when the song itself is
 * gone — a deleted song must not silently drop a whole block off the page.
 */
export function lineupFullLyricBlocks(lineup: Lineup, songs: Song[]): GroupedSongBlock[] {
  const ordered: FullLyricSource[] = [];
  const snapshots = new Map<string, FullLyricSource>();

  for (const item of lineup.items) {
    const song = songs.find((s) => s.id === item.songId);
    // A song played twice in two keys is two pages, not one: whoever is reading
    // this at 9am on a Sunday has to see which key the copy in front of them is in.
    const id = song ? song.id : item.songId || item.songTitle || item.id;
    const playKey = (item.key || '').trim();
    const cacheKey = `${id}::${playKey.toLowerCase()}`;
    const existing = snapshots.get(cacheKey);

    if (song) {
      if (!existing) {
        snapshots.set(cacheKey, {
          id,
          title: song.title,
          artist: song.artist,
          key: song.key || item.songKey || '',
          playKey,
          parts: song.parts,
        });
        ordered.push(snapshots.get(cacheKey)!);
      }
      continue;
    }

    if (existing) {
      existing.parts.push({ label: item.partLabel || 'Part', lyrics: item.lyrics || '' });
    } else {
      const entry: FullLyricSource = {
        id,
        title: item.songTitle || 'Untitled song',
        artist: item.artist || 'Unknown artist',
        key: item.songKey || '',
        playKey,
        parts: [{ label: item.partLabel || 'Part', lyrics: item.lyrics || '' }],
      };
      snapshots.set(cacheKey, entry);
      ordered.push(entry);
    }
  }

  return fullLyricBlocks(ordered);
}

/**
 * Re-points lineup slots from a shared song to the copy you now own.
 *
 * A copy gets brand-new part ids, so the slot's `partId` stops existing the
 * moment the copy is made — silently, which is how a lineup ends up rendering
 * nothing. The copy preserves part order and count, so map by index and fall
 * back to the label.
 *
 * A slot that cannot be mapped is returned untouched rather than dropped:
 * losing one part quietly is worse than leaving it pointing where it was.
 */
export function repointSlotsToCopy<T extends LineupItem>(
  items: T[],
  source: Song,
  copy: Song,
): T[] {
  const partMap = new Map<string, string>();
  source.parts.forEach((part, i) => {
    const target = copy.parts[i] ?? copy.parts.find((p) => p.label === part.label);
    if (target) partMap.set(part.id, target.id);
  });

  return items.map((item) => {
    if (item.songId !== source.id) return item;
    const nextPartId = partMap.get(item.partId);
    if (!nextPartId) return item;
    return { ...item, songId: copy.id, partId: nextPartId };
  });
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
