import type {
  Analysis,
  AppState,
  Lineup,
  LineupItem,
  SharedLineup,
  Song,
  Team,
  Tempo,
  User,
} from './types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || 'Something went wrong. Try again.');
  }
  return data as T;
}

export const api = {
  createUser: (name: string) =>
    request<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renameUser: (id: string, name: string) =>
    request<{ user: User }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  state: (userId: string) => request<AppState>(`/state?userId=${encodeURIComponent(userId)}`),

  createTeam: (userId: string, name: string) =>
    request<{ team: Team }>('/teams', {
      method: 'POST',
      body: JSON.stringify({ userId, name }),
    }),

  joinTeam: (userId: string, code: string) =>
    request<{ team: Team }>('/teams/join', {
      method: 'POST',
      body: JSON.stringify({ userId, code }),
    }),

  leaveTeam: (teamId: string, userId: string) =>
    request<{ ok: true }>(`/teams/${teamId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  createSong: (payload: {
    userId: string;
    title: string;
    artist: string;
    tempo: Tempo;
    theme: string;
    parts: { kind: string; label: string; lyrics: string }[];
    analysis: Analysis | null;
    teamId: string | null;
  }) =>
    request<{ song: Song }>('/songs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSong: (
    id: string,
    payload: {
      userId: string;
      title?: string;
      artist?: string;
      tempo?: Tempo;
      theme?: string;
      parts?: { id?: string; kind: string; label: string; lyrics: string }[];
      analysis?: Analysis | null;
      teamId?: string | null;
    },
  ) =>
    request<{ song: Song }>(`/songs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteSong: (id: string, userId: string) =>
    request<{ ok: true }>(`/songs/${id}?userId=${userId}`, { method: 'DELETE' }),

  shareSong: (id: string, userId: string, teamId: string | null) =>
    request<{ song: Song }>(`/songs/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ userId, teamId }),
    }),

  copySong: (id: string, userId: string, teamId: string | null = null) =>
    request<{ song: Song }>(`/songs/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify({ userId, teamId }),
    }),

  createLineup: (payload: {
    userId: string;
    name: string;
    theme: string;
    items: { songId: string; partId: string }[];
    teamId: string | null;
  }) =>
    request<{ lineup: Lineup }>('/lineups', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateLineup: (
    id: string,
    payload: {
      userId: string;
      name?: string;
      theme?: string;
      items?: { songId: string; partId: string }[];
      teamId?: string | null;
    },
  ) =>
    request<{ lineup: Lineup }>(`/lineups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteLineup: (id: string, userId: string) =>
    request<{ ok: true }>(`/lineups/${id}?userId=${userId}`, { method: 'DELETE' }),

  shareLineup: (
    id: string,
    userId: string,
    channel: 'link' | 'team',
    teamId: string | null = null,
  ) =>
    request<{ lineup: Lineup; team?: Team; shareUrl?: string }>(`/lineups/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ userId, channel, teamId }),
    }),

  copyLineup: (id: string, userId: string, teamId: string | null = null) =>
    request<{ lineup: Lineup }>(`/lineups/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify({ userId, teamId }),
    }),

  lru: (userId: string, theme?: string) =>
    request<{
      suggested: Lineup | null;
      ordered: { id: string; name: string; lastUsedAt: number | null; useCount: number }[];
    }>(`/lru?userId=${encodeURIComponent(userId)}${theme ? `&theme=${encodeURIComponent(theme)}` : ''}`),

  shared: (token: string) => request<{ lineup: SharedLineup }>(`/shared/${token}`),
};

export type { LineupItem };
