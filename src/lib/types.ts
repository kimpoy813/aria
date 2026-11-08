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
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  tempo: Tempo;
  theme: string;
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
  createdAt: number;
}

export interface AppState {
  user: User;
  teams: Team[];
  songs: Song[];
  lineups: Lineup[];
}

export interface SharedLineupItem {
  songTitle: string;
  artist: string;
  tempo: Tempo;
  partKind: PartKind;
  partLabel: string;
  lyrics: string;
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
}
