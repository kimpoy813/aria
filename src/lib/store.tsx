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
import {
  completePopupRelay,
  consumeOAuthError,
  getPendingPopupRelay,
  getSupabaseSessionTokens,
  loadConfig,
  logout as authLogout,
  onChange as onAuthChange,
  resumeSession,
  storeToken,
  type Account,
  type AuthConfig,
} from './auth';

const THEME_KEY = 'aria.theme';
const ONBOARDING_KEY = 'aria.onboarded';

type ThemeMode = 'light' | 'dark';
type PopupStatus = 'idle' | 'completed' | 'error';

interface StoreValue {
  loading: boolean;
  error: string | null;
  popupStatus: PopupStatus;
  user: User | null;
  teams: Team[];
  songs: Song[];
  lineups: Lineup[];
  theme: ThemeMode;
  config: AuthConfig;
  onboarded: boolean;
  clearError: () => void;
  toggleTheme: () => void;
  completeOnboarding: () => void;
  replayOnboarding: () => void;
  signInWithAccount: (account: Account) => Promise<void>;
  signOut: () => Promise<void>;
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
  const [popupStatus, setPopupStatus] = useState<PopupStatus>('idle');
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());
  const [config, setConfig] = useState<AuthConfig>({
    driver: 'demo',
    supabaseUrl: null,
    supabaseAnonKey: null,
    resetMinutes: 30,
  });
  const bootstrapped = useRef(false);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDING_KEY) === '1');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#071410' : '#ffffff');
  }, [theme]);

  /** Load the signed-in account's library. No account -> empty state. */
  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      setState(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Aria.';
      if (message.toLowerCase().includes('sign in')) {
        storeToken(null);
        setState(null);
      } else {
        setError(message);
      }
    }
  }, []);

  const adoptAccount = useCallback(
    async (account: Account | null) => {
      if (!account) {
        setState(null);
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const signInWithAccount = useCallback(
    async (account: Account) => {
      setLoading(true);
      try {
        await adoptAccount(account);
      } finally {
        setLoading(false);
      }
    },
    [adoptAccount],
  );

  const signOut = useCallback(async () => {
    await authLogout();
    setState(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Keep auth state listener active across StrictMode unmount/remount cycles.
  useEffect(() => {
    return onAuthChange((account) => {
      if (window.location.pathname === '/auth/google' || getPendingPopupRelay()) return;
      void adoptAccount(account);
    });
  }, [adoptAccount]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        const loaded = await loadConfig();
        setConfig(loaded);
        const oauthErr = consumeOAuthError();

        // Popup starter route handles its own redirect immediately.
        if (window.location.pathname === '/auth/google') {
          if (oauthErr) setError(oauthErr);
          return;
        }

        // Returning OAuth popup: relay credentials back to the opener/iframe and close.
        const relayNonce = getPendingPopupRelay();
        if (relayNonce) {
          if (oauthErr) {
            setError(oauthErr);
            setPopupStatus('error');
            await completePopupRelay(relayNonce, { error: oauthErr });
            return;
          }
          const tokens = await getSupabaseSessionTokens();
          if (tokens) {
            setPopupStatus('completed');
            await completePopupRelay(relayNonce, {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            });
          } else {
            const msg = 'Google sign-in did not return a session.';
            setError(msg);
            setPopupStatus('error');
            await completePopupRelay(relayNonce, { error: msg });
          }
          return;
        }

        if (oauthErr) {
          setError(oauthErr);
        }

        const account = await resumeSession();
        // Clear any Supabase auth callback tokens or empty hash from the URL.
        if (
          window.location.hash.includes('access_token') ||
          window.location.href.endsWith('#')
        ) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        await adoptAccount(account);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not sign in.');
      } finally {
        setLoading(false);
      }
    })();
  }, [adoptAccount]);

  const joinTeam = useCallback(
    async (code: string) => {
      const { team } = await api.joinTeam(code);
      await refresh();
      return team;
    },
    [refresh],
  );

  const createTeam = useCallback(
    async (name: string) => {
      const { team } = await api.createTeam(name);
      await refresh();
      return team;
    },
    [refresh],
  );

  const leaveTeam = useCallback(
    async (teamId: string) => {
      await api.leaveTeam(teamId);
      await refresh();
    },
    [refresh],
  );

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setOnboarded(true);
  }, []);

  const replayOnboarding = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    setOnboarded(false);
  }, []);

  const setUser = useCallback((user: User) => {
    setState((prev) => (prev ? { ...prev, user } : prev));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      loading,
      error,
      popupStatus,
      user: state?.user ?? null,
      teams: state?.teams ?? [],
      songs: state?.songs ?? [],
      lineups: state?.lineups ?? [],
      theme,
      config,
      onboarded,
      clearError,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      completeOnboarding,
      replayOnboarding,
      signInWithAccount,
      signOut,
      refresh,
      joinTeam,
      createTeam,
      leaveTeam,
      setUser,
    }),
    [
      loading,
      error,
      popupStatus,
      state,
      theme,
      config,
      onboarded,
      clearError,
      completeOnboarding,
      replayOnboarding,
      signInWithAccount,
      signOut,
      refresh,
      joinTeam,
      createTeam,
      leaveTeam,
      setUser,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
