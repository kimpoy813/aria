import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import type { AppState, Lineup, Song, Team, User } from './types';

const USER_KEY = 'aria.userId';
const THEME_KEY = 'aria.theme';

type ThemeMode = 'light' | 'dark';

interface StoreValue {
  loading: boolean;
  error: string | null;
  user: User | null;
  teams: Team[];
  songs: Song[];
  lineups: Lineup[];
  theme: ThemeMode;
  toggleTheme: () => void;
  signIn: (name: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  joinTeam: (code: string) => Promise<Team>;
  createTeam: (name: string) => Promise<Team>;
  leaveTeam: (teamId: string) => Promise<void>;
  setUser: (user: User) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function readTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());
  const bootstrapped = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1512' : '#f6f8f4');
  }, [theme]);

  const refresh = useCallback(async () => {
    const userId = localStorage.getItem(USER_KEY);
    if (!userId) {
      setState(null);
      setLoading(false);
      return;
    }
    try {
      const next = await api.state(userId);
      setState(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Aria.';
      if (message.toLowerCase().includes('unknown user')) {
        localStorage.removeItem(USER_KEY);
        setState(null);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (name: string) => {
      setLoading(true);
      try {
        const { user } = await api.createUser(name);
        localStorage.setItem(USER_KEY, user.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create your profile.');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(USER_KEY);
    setState(null);
    setError(null);
  }, []);

  const joinTeam = useCallback(
    async (code: string) => {
      const userId = localStorage.getItem(USER_KEY);
      if (!userId) throw new Error('Sign in first.');
      const { team } = await api.joinTeam(userId, code);
      await refresh();
      return team;
    },
    [refresh],
  );

  const createTeam = useCallback(
    async (name: string) => {
      const userId = localStorage.getItem(USER_KEY);
      if (!userId) throw new Error('Sign in first.');
      const { team } = await api.createTeam(userId, name);
      await refresh();
      return team;
    },
    [refresh],
  );

  const leaveTeam = useCallback(
    async (teamId: string) => {
      const userId = localStorage.getItem(USER_KEY);
      if (!userId) throw new Error('Sign in first.');
      await api.leaveTeam(teamId, userId);
      await refresh();
    },
    [refresh],
  );

  const setUser = useCallback((user: User) => {
    setState((prev) => (prev ? { ...prev, user } : prev));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      loading,
      error,
      user: state?.user ?? null,
      teams: state?.teams ?? [],
      songs: state?.songs ?? [],
      lineups: state?.lineups ?? [],
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      signIn,
      signOut,
      refresh,
      joinTeam,
      createTeam,
      leaveTeam,
      setUser,
    }),
    [loading, error, state, theme, signIn, signOut, refresh, joinTeam, createTeam, leaveTeam, setUser],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
