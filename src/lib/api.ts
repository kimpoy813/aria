import type {
  AdminOverview,
  AdminUserSummary,
  Analysis,
  AppState,
  Lineup,
  LineupItem,
  MaintenanceNotice,
  SharedLineup,
  Song,
  SystemStatus,
  Team,
  Tempo,
} from './types';

import { authHeaders } from './auth';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers || {}) },
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
  state: () => request<AppState>('/state'),

  deleteAccount: () => request<{ ok: true }>('/auth/account', { method: 'DELETE' }),

  createTeam: (name: string) =>
    request<{ team: Team }>('/teams', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  joinTeam: (code: string) =>
    request<{ team: Team }>('/teams/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  leaveTeam: (teamId: string) =>
    request<{ ok: true }>(`/teams/${teamId}/leave`, { method: 'POST' }),

  createSong: (payload: {
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

  deleteSong: (id: string) => request<{ ok: true }>(`/songs/${id}`, { method: 'DELETE' }),

  shareSong: (id: string, teamId: string | null) =>
    request<{ song: Song }>(`/songs/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ teamId }),
    }),

  copySong: (id: string, teamId: string | null = null) =>
    request<{ song: Song }>(`/songs/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify({ teamId }),
    }),

  createLineup: (payload: {
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

  deleteLineup: (id: string) => request<{ ok: true }>(`/lineups/${id}`, { method: 'DELETE' }),

  shareLineup: (id: string, channel: 'link' | 'team', teamId: string | null = null) =>
    request<{ lineup: Lineup; team?: Team; shareUrl?: string }>(`/lineups/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ channel, teamId }),
    }),

  copyLineup: (id: string, teamId: string | null = null) =>
    request<{ lineup: Lineup }>(`/lineups/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify({ teamId }),
    }),

  lru: (theme?: string) =>
    request<{
      suggested: Lineup | null;
      ordered: { id: string; name: string; lastUsedAt: number | null; useCount: number }[];
    }>(`/lru${theme ? `?theme=${encodeURIComponent(theme)}` : ''}`),

  shared: (token: string) =>
    request<{ lineup: SharedLineup }>(`/shared/${encodeURIComponent(token)}`),

  systemStatus: () => request<SystemStatus>('/system/status'),

  adminOverview: () => request<AdminOverview>('/admin/overview'),

  adminUpdateSettings: (payload: {
    maintenance?: Partial<MaintenanceNotice>;
    allowRegistration?: boolean;
  }) =>
    request<{ settings: SystemStatus }>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  adminCreateUser: (payload: {
    name: string;
    email: string;
    password?: string;
    role: 'user' | 'admin';
  }) =>
    request<{ user: AdminUserSummary }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminUpdateUser: (
    id: string,
    payload: { name?: string; role?: 'user' | 'admin'; suspended?: boolean },
  ) =>
    request<{ user: AdminUserSummary }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  adminDeleteUser: (id: string) =>
    request<{ ok: true }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  adminSetPassword: (password: string) =>
    request<{ ok: true; token?: string | null }>('/admin/password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  adminDeleteSong: (id: string) =>
    request<{ ok: true }>(`/admin/songs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  adminDeleteLineup: (id: string) =>
    request<{ ok: true }>(`/admin/lineups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  adminDeleteTeam: (id: string) =>
    request<{ ok: true }>(`/admin/teams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

export type { LineupItem };
