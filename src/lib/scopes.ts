import type { Lineup, Song, Team, Tempo } from './types';

export type LibraryScope = 'mine' | 'all' | 'team';

/** A song or lineup, as far as scoping is concerned. */
export interface Ownable {
  ownerId: string;
  teamId: string | null;
}

export interface TeamCounts {
  songs: number;
  lineups: number;
}

/**
 * Only the records you own.
 *
 * The single definition of "mine" in the app. Anything that shows a count as
 * *your* total has to go through this: `/api/state` returns everything you can
 * see, which includes your teammates' work, so `.length` on the raw array is
 * the team's total wearing your name.
 */
export function ownRecords<T extends Ownable>(records: T[], viewerId?: string | null): T[] {
  return records.filter((r) => r.ownerId === viewerId);
}

/** Everyone in one team except you. */
export function teammateIdsOf(team: Team, viewerId?: string | null): Set<string> {
  return new Set(
    (team.members || []).map((m) => m.userId).filter((id) => id !== viewerId),
  );
}

/**
 * Is this record shared with this team?
 *
 * The same predicate the server's `canView()` uses: either the record is tagged
 * with the team, or its owner is one of that team's members. A person who sits
 * in two of your teams has genuinely shared their work with both, so their
 * records answer true for each team — that is the truth about them, not a
 * duplicate to be deduped.
 */
export function sharedWithTeam<T extends Ownable>(
  record: T,
  team: Team,
  viewerId?: string | null,
): boolean {
  if (record.ownerId === viewerId) return false;
  if (record.teamId) return record.teamId === team.id;
  return teammateIdsOf(team, viewerId).has(record.ownerId);
}

export interface BuilderLibraryOptions {
  viewerId?: string | null;
  search?: string;
  tempo?: 'all' | Tempo;
}

/**
 * What the lineup builder offers to pick from: your own songs.
 *
 * That covers "songs you have copied" for free — `copySong` on the server makes
 * a brand new record owned by you, so a copy is simply one of your songs with a
 * `sourceSongId` pointing back at where it came from. There is no separate
 * "copied" state to include.
 *
 * Teammates' songs stay out of the picker. They are still one tap away on the
 * Songs tab, where Copy brings them into your library and then into this list.
 */
export function builderLibrary(
  songs: Song[],
  opts: BuilderLibraryOptions = {},
): Song[] {
  const { viewerId, search = '', tempo = 'all' } = opts;
  const q = search.trim().toLowerCase();
  return ownRecords(songs, viewerId).filter((s) => {
    if (tempo !== 'all' && s.tempo !== tempo) return false;
    if (!q) return true;
    return `${s.title} ${s.artist} ${s.theme} ${s.parts.map((p) => p.lyrics).join(' ')}`
      .toLowerCase()
      .includes(q);
  });
}

/**
 * A copy of this song that you already own, if there is one.
 *
 * Compared by lineage rather than by direct parent: `copySong` sets
 * `sourceSongId` to the *root* of the chain, so copying a song that was itself
 * a copy does not produce a record pointing at the immediate original. Matching
 * roots handles that, and cannot false-positive on an unrelated song you own —
 * two songs only share a root if one genuinely descends from the other.
 */
export function yourCopyOf(
  songs: Song[],
  song: Song,
  viewerId?: string | null,
): Song | undefined {
  const root = song.sourceSongId || song.id;
  return songs.find(
    (s) => s.ownerId === viewerId && (s.sourceSongId || s.id) === root,
  );
}

export interface ScopeOptions {
  scope: LibraryScope;
  viewerId?: string | null;
  teams: Team[];
  /** Narrow `team` to one team. `'all'` (the default) means every team you are in. */
  teamId?: string | 'all';
}

/**
 * The Mine / All / Team filter, with per-team narrowing.
 *
 * Joining a second team does not create a second library — the server returns
 * the union of everything every team can see, so without this the Team tab is
 * one undifferentiated pile and there is no way to ask "what did the Sunday
 * band share?". `teamId` is that question.
 */
export function applyScope<T extends Ownable>(records: T[], opts: ScopeOptions): T[] {
  const { scope, viewerId, teams, teamId = 'all' } = opts;
  if (scope === 'mine') return ownRecords(records, viewerId);
  if (scope === 'all') return records.slice();
  const chosen = teams.filter((t) => teamId === 'all' || t.id === teamId);
  return records.filter(
    (r) => r.ownerId !== viewerId && chosen.some((t) => sharedWithTeam(r, t, viewerId)),
  );
}

/** How much each team has shared, so a team card can point without listing. */
export function teamSharedCounts(
  teams: Team[],
  songs: Song[],
  lineups: Lineup[],
  viewerId?: string | null,
): Map<string, TeamCounts> {
  return new Map(
    teams.map((t) => [
      t.id,
      {
        songs: songs.filter((s) => sharedWithTeam(s, t, viewerId)).length,
        lineups: lineups.filter((l) => sharedWithTeam(l, t, viewerId)).length,
      },
    ]),
  );
}

/** Which of your teams a record is shared with — for the "from where" label. */
export function teamsForRecord<T extends Ownable>(
  record: T,
  teams: Team[],
  viewerId?: string | null,
): Team[] {
  return teams.filter((t) => sharedWithTeam(record, t, viewerId));
}
