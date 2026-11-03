import type { Lineup, Song } from './types';

export interface SequenceEntry {
  itemId: string;
  song: Song;
  partId: string;
  partKind: string;
  partLabel: string;
  lyrics: string;
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
    if (!song) continue;
    const part = song.parts.find((p) => p.id === item.partId);
    if (!part) continue;
    entries.push({
      itemId: item.id,
      song,
      partId: part.id,
      partKind: part.kind,
      partLabel: part.label,
      lyrics: part.lyrics,
    });
  }
  return entries;
}

export function lineupTempoMix(lineup: Lineup, songs: Song[]) {
  const entries = resolveSequence(lineup, songs);
  const fast = entries.filter((e) => e.song.tempo === 'fast').length;
  const slow = entries.length - fast;
  return { fast, slow, total: entries.length };
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
