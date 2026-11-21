export type Tempo = 'fast' | 'slow';

export type PartKind =
  | 'intro'
  | 'verse'
  | 'prechorus'
  | 'chorus'
  | 'bridge'
  | 'outro'
  | 'refrain'
  | 'other';

export interface SongPart {
  id: string;
  kind: PartKind;
  label: string;
  lyrics: string;
}

export interface ThemeScore {
  theme: string;
  score: number;
}

export interface PartSignal {
  label: string;
  kind: PartKind;
  theme: string;
  confidence: number;
}

export interface Analysis {
  theme: string;
  confidence: number;
  tone: string;
  toneLabel: string;
  valence: number;
  energy: number;
  suggestedTempo: Tempo;
  keywords: string[];
  message: string;
  about: string;
  evidence: string[];
  wordCount: number;
  lineCount: number;
  signals: ThemeScore[];
  parts: PartSignal[];
  generatedAt: number;
  manualOverride?: boolean;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  tempo: Tempo;
  theme: string;
  /**
   * The key the chords are written in, e.g. "G" or "F#m". Empty when nobody has
   * set one. Chords are always stored in this key; every other key is derived.
   */
  key: string;
  parts: SongPart[];
  analysis: Analysis | null;
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  sourceSongId: string | null;
  copiedFrom?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LineupItem {
  id: string;
  songId: string;
  partId: string;
  songTitle?: string;
  artist?: string;
  tempo?: Tempo;
  partKind?: PartKind | string;
  partLabel?: string;
  lyrics?: string;
  /**
   * The key this *occurrence* is played in, e.g. "D". Empty means play the song
   * as written.
   *
   * Per slot rather than per song, because a set moves: song 1 opens in G, the
   * band shifts to D for song 2, and when song 1 comes back it is in D too. Same
   * song, same stored chords, two keys.
   */
  key?: string;
  /** The key the song's chords are written in, when this item was saved. */
  songKey?: string;
}

export interface Lineup {
  id: string;
  name: string;
  theme: string;
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  items: LineupItem[];
  shareToken: string;
  sourceLineupId: string | null;
  copiedFrom?: string | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  useCount: number;
  lastUsedReason: string | null;
}

export interface Member {
  userId: string;
  name: string;
  role: 'owner' | 'member';
  joinedAt: number;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  createdAt: number;
  members: Member[];
  myRole: 'owner' | 'member' | null;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  role?: 'admin' | 'user';
  isAdmin?: boolean;
  suspended?: boolean;
  createdAt: number;
}

export interface MaintenanceNotice {
  enabled: boolean;
  mode: 'info' | 'maintenance';
  title: string;
  message: string;
  eta: string;
  updatedAt: number | null;
  updatedBy: string | null;
}

export interface SystemStatus {
  maintenance: MaintenanceNotice;
  allowRegistration: boolean;
}

export interface AppState {
  user: User;
  teams: Team[];
  songs: Song[];
  lineups: Lineup[];
  system?: SystemStatus;
}

export interface AdminUserSummary extends User {
  isBuiltInAdmin: boolean;
  songsCount: number;
  lineupsCount: number;
  teamsCount: number;
}

export interface AdminOverview {
  stats: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    adminUsers: number;
    totalSongs: number;
    fastSongs: number;
    slowSongs: number;
    sharedSongs: number;
    topThemes: { theme: string; count: number }[];
    totalLineups: number;
    sharedLineups: number;
    usedLineups: number;
    totalLineupUses: number;
    totalTeams: number;
    totalTeamMemberships: number;
    storageDriver: string;
    authDriver: string;
  };
  settings: SystemStatus;
  adminEmail: string;
  users: AdminUserSummary[];
  songs: {
    id: string;
    title: string;
    artist: string;
    tempo: Tempo;
    theme: string;
    ownerId: string;
    ownerName: string;
    teamId: string | null;
    partsCount: number;
    createdAt: number;
  }[];
  lineups: {
    id: string;
    name: string;
    theme: string;
    ownerId: string;
    ownerName: string;
    teamId: string | null;
    partsCount: number;
    useCount: number;
    lastUsedAt: number | null;
    shareToken: string;
    createdAt: number;
  }[];
  teams: {
    id: string;
    name: string;
    code: string;
    ownerId: string;
    membersCount: number;
    members: Member[];
    createdAt: number;
  }[];
}

export interface SharedLineupItem {
  songTitle: string;
  artist: string;
  tempo: Tempo;
  partKind: PartKind;
  partLabel: string;
  lyrics: string;
  /** Key the chords are written in, so a viewer can transpose from it. */
  songKey?: string;
  /** Key this occurrence is played in, if the builder set one. */
  playKey?: string;
}

export interface SharedLineupSongPart {
  kind: string;
  label: string;
  lyrics: string;
}

/** A whole song as the shared page needs it: every part, not just the picks. */
export interface SharedLineupSong {
  id: string;
  title: string;
  artist: string;
  tempo: Tempo;
  /** Key the chords are written in. */
  key: string;
  /** Key this occurrence is played in, when the builder moved it. */
  playKey?: string;
  parts: SharedLineupSongPart[];
}

export interface SharedLineup {
  name: string;
  theme: string;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  useCount: number;
  songCount: number;
  items: SharedLineupItem[];
  /**
   * Complete lyrics per song, in lineup order. Absent on payloads from an older
   * server, so the page falls back to grouping `items`.
   */
  songs?: SharedLineupSong[];
}
