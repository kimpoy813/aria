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
  const wanted = (playKey || '').trim();
  // null when either side is not a key: there is nothing to move, but the key the
  // slot names is still the key the band plays it in, and the page has to say so.
  // A song with no chords written down is not a song with no key.
  const interval = keyInterval(writtenKey, wanted);
  const moved = interval ?? 0;
  // A slot key that *is* the written key is not a second opinion about it, so it
  // is not reported — otherwise one run of a song splits in two for no reason.
  const namesWrittenKey = interval === 0;
  return {
    lyrics: moved === 0 ? lyrics : transposeLyrics(lyrics, moved, wanted),
    writtenKey: writtenKey || '',
    playKey: wanted && !namesWrittenKey ? wanted : null,
    interval: moved,
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
  /** React identity for the row — never a musical key. */
  key: string;
  partLabel: string;
  lyrics: string;
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

/** A slot, ready to be laid out — lyrics still in the key they are written in. */
interface RunItem {
  /** Identity of the song this slot came from; the title when there is no id. */
  songKey?: string;
  songTitle: string;
  partLabel: string;
  lyrics: string;
  /** Key this occurrence is performed in, when one was chosen. */
  playKey?: string;
  writtenKey?: string;
  interval?: number;
}

/**
 * One block per run of consecutive slots from the same song in the same key.
 *
 * The grouping is cosmetic: it saves printing the song's name above every one
 * of its parts. It never reorders, merges or drops anything — blocks come out
 * in the order the slots went in, and every slot becomes a section carrying its
 * own words. A song that comes back later in the set gets its own block there,
 * because that is the moment the band plays it again.
 */
function groupRuns(items: RunItem[]): GroupedSongBlock[] {
  const blocks: GroupedSongBlock[] = [];

  items.forEach((it, i) => {
    const title = (it.songTitle || '').trim() || 'Untitled song';
    const playKey = (it.playKey || '').trim();
    // A song sung twice in two keys is two moments, not one block: the band has
    // to see the new key on its own heading, not buried mid-block.
    const runKey = `${(it.songKey || title).trim().toLowerCase()}::${playKey.toLowerCase()}`;
    const section = { key: String(i), partLabel: it.partLabel || 'Part', lyrics: it.lyrics || '' };
    const prev = blocks[blocks.length - 1];

    if (prev && prev.key === runKey) {
      prev.sections.push(section);
      return;
    }
    blocks.push({
      key: runKey,
      songTitle: title,
      writtenKey: it.writtenKey || '',
      playKey,
      interval: it.interval || 0,
      sections: [section],
    });
  });

  // Two runs of one song in one key are still two blocks, so the ids have to
  // differ or React reuses the first run's DOM for the second.
  return blocks.map((block, idx) => ({ ...block, key: `${block.key}_${idx}` }));
}

/**
 * The lineup exactly as it was placed.
 *
 * One section per slot, in the order the builder put them in — including a part
 * that appears three times, and a song that comes back after another one. The
 * page somebody reads from is the set they built, not the songs it drew on.
 */
export function lineupSequenceBlocks(lineup: Lineup, songs: Song[]): GroupedSongBlock[] {
  return groupRuns(
    resolveSequence(lineup, songs).map((entry) => ({
      songKey: entry.song.id,
      songTitle: entry.song.title,
      partLabel: entry.partLabel,
      lyrics: entry.lyrics,
      writtenKey: entry.writtenKey,
      playKey: entry.playKey || '',
      interval: entry.interval,
    })),
  );
}

/** One slot as the shared payload carries it: written lyrics plus both keys. */
export interface SharedSequenceItem {
  songTitle: string;
  partLabel: string;
  lyrics: string;
  /** Key the chords are written in. */
  songKey?: string;
  /** Key this occurrence is played in, when the builder set one. */
  playKey?: string;
}

/**
 * The shared page's copy of the same sequence.
 *
 * The payload ships each slot as it is stored, with the written key and the
 * played key beside it, so the move happens here — the same move the owner's
 * preview makes. Two implementations of it would eventually disagree.
 */
export function sharedSequenceBlocks(items: SharedSequenceItem[]): GroupedSongBlock[] {
  return groupRuns(
    (items || []).map((item) => {
      const moved = inSlotKey(item.songKey || '', item.playKey, item.lyrics || '');
      return {
        // The payload has no song id, so the title is the only identity it has.
        songKey: item.songTitle,
        songTitle: item.songTitle,
        partLabel: item.partLabel,
        lyrics: moved.lyrics,
        writtenKey: moved.writtenKey,
        playKey: moved.playKey || '',
        interval: moved.interval,
      };
    }),
  );
}

/** What the whole-song key picker should show for one song. */
export interface SongKeyState {
  /** True when the song's parts are not all in the same key. */
  mixed: boolean;
  /** The key to select; empty when every part plays as written. */
  key: string;
}

/**
 * What the whole-song picker should show for one song in this lineup.
 *
 * Every part already in one key shows that key. Parts that disagree show the
 * mixed option instead, because pre-selecting one of the two would be a guess
 * about which of them the band meant — and picking anything else would then
 * look like no change at all.
 */
export function songKeyState(
  items: { songId: string; key?: string }[],
  songId: string,
): SongKeyState {
  const keys = new Set(
    (items || [])
      .filter((item) => item.songId === songId)
      .map((item) => (item.key || '').trim()),
  );
  if (keys.size > 1) return { mixed: true, key: '' };
  return { mixed: false, key: keys.size === 1 ? [...keys][0] : '' };
}

/**
 * The `items` payload that writes `key` onto every slot `match` picks.
 *
 * The server re-snapshots the whole set on every save, so the array always goes
 * back complete: slots that are not matched carry the key they already had,
 * which is what keeps moving one song from disturbing another.
 */
export function withSlotKeys(
  items: LineupItem[],
  match: (item: LineupItem) => boolean,
  key: string,
): { songId: string; partId: string; key: string }[] {
  return (items || []).map((item) => ({
    songId: item.songId,
    partId: item.partId,
    key: match(item) ? key : item.key || '',
  }));
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
