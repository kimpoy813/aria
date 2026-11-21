import { summarizeSongsUsed, type SongUsageStat } from './lru';
import { ownRecords } from './scopes';
import type { Lineup, Song } from './types';

export interface HomeFeed {
  /** Your lineups only, in library order. */
  lineups: Lineup[];
  /** Your songs only. */
  songs: Song[];
  /**
   * Usage stats for your songs only, already in LRU order.
   *
   * Computed against the whole song list and filtered afterwards, deliberately:
   * `summarizeSongsUsed` resolves lineup items through the songs it is given,
   * and a lineup of yours can legitimately contain a teammate's song. Passing
   * only your songs would blank that song's lyrics in the spotlight; passing
   * the full list and filtering the *result* keeps the lineup whole while the
   * list stays yours.
   */
  songStats: SongUsageStat[];
  /** True when the library holds teammates' lineups that Home is not showing. */
  hasTeamLineups: boolean;
}

/**
 * What the Home page is allowed to show: your own work.
 *
 * Teammates' lineups and songs are still one tap away on the Lineups and Songs
 * tabs, which keep their All / Mine / Team scopes. Home is the one screen that
 * reads as "your library", so it does not mix in anyone else's.
 */
export function buildHomeFeed(
  lineups: Lineup[],
  songs: Song[],
  userId?: string | null,
): HomeFeed {
  const mine = ownRecords(lineups, userId);
  const mySongs = ownRecords(songs, userId);
  return {
    lineups: mine,
    songs: mySongs,
    songStats: summarizeSongsUsed(songs, mine).filter(
      (stat) => stat.song.ownerId === userId,
    ),
    hasTeamLineups: lineups.length > mine.length,
  };
}
