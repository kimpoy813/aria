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
import { ToastStack, type ToastItem, type ToastTone } from '../components/ui';
import type { AppState, Lineup, Song, SystemStatus, Team, User } from './types';
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

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';
type PopupStatus = 'idle' | 'completed' | 'error';

const DEFAULT_SYSTEM_STATUS: SystemStatus = {
  maintenance: {
    enabled: false,
    mode: 'info',
    title: 'Scheduled Maintenance',
    message: '',
    eta: '',
    updatedAt: null,
    updatedBy: null,
  },
  allowRegistration: true,
};

interface StoreValue {
  loading: boolean;
  error: string | null;
  popupStatus: PopupStatus;
  user: User | null;
  teams: Team[];
  songs: Song[];
  lineups: Lineup[];
  systemStatus: SystemStatus;
  theme: ThemeMode;
  themePreference: ThemePreference;
  config: AuthConfig;
  onboarded: boolean;
  notify: (message: string, tone?: ToastTone) => void;
  clearError: () => void;
  toggleTheme: () => void;
  setThemePreference: (pref: ThemePreference) => void;
  completeOnboarding: () => void;
  replayOnboarding: () => void;
  signInWithAccount: (account: Account) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshSystemStatus: () => Promise<void>;
  joinTeam: (code: string) => Promise<Team>;
  createTeam: (name: string) => Promise<Team>;
  leaveTeam: (teamId: string) => Promise<void>;
  setUser: (user: User) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function readThemePreference(): ThemePreference {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'light';
}

function resolveSystemTheme(): ThemeMode {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(DEFAULT_SYSTEM_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popupStatus, setPopupStatus] = useState<PopupStatus>('idle');
  const [themePreference, setThemePrefState] = useState<ThemePreference>(() =>
    readThemePreference(),
  );
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(() => resolveSystemTheme());
  const theme: ThemeMode = themePreference === 'system' ? systemTheme : themePreference;
  const [config, setConfig] = useState<AuthConfig>({
    driver: 'demo',
    supabaseUrl: null,
    supabaseAnonKey: null,
    resetMinutes: 30,
  });
  const bootstrapped = useRef(false);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDING_KEY) === '1');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev.filter((t) => t.message !== trimmed).slice(-1), { id, message: trimmed, tone }]);
    const duration = tone === 'error' ? 3400 : 2500;
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setSystemTheme(mq.matches ? 'dark' : 'light');
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener?.(onChange);
    return () => mq.removeListener?.(onChange);
  }, []);

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'only light';
    if (document.body) {
      document.body.dataset.theme = theme;
      document.body.style.backgroundColor = isDark ? '#0b0c10' : '#ffffff';
    }
    localStorage.setItem(THEME_KEY, themePreference);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0b0c10' : '#ffffff');
    const cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', isDark ? 'dark' : 'only light');
  }, [theme, themePreference]);

  const setThemePreference = useCallback(
    (pref: ThemePreference) => {
      setThemePrefState(pref);
      const label =
        pref === 'system'
          ? 'Appearance: Auto'
          : pref === 'dark'
            ? 'Dark mode enabled'
            : 'Light mode enabled';
      notify(label, 'info');
    },
    [notify],
  );

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemePrefState(next);
    notify(next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled', 'info');
  }, [theme, notify]);

  const refreshSystemStatus = useCallback(async () => {
    try {
      const status = await api.systemStatus();
      setSystemStatus(status);
    } catch {
      /* ignore status fetch errors */
    }
  }, []);

  /** Load the signed-in account's library. No account -> empty state. */
  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      setState(next);
      if (next.system) setSystemStatus(next.system);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Aria.';
      if (message.toLowerCase().includes('sign in')) {
        storeToken(null);
        setState(null);
      } else if (message.toLowerCase().includes('suspended')) {
        await authLogout().catch(() => undefined);
        setState(null);
        setError(message);
        notify(message, 'error');
      } else {
        setError(message);
      }
    }
  }, [notify]);

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
        const firstName = account.user?.name?.trim().split(/\s+/)[0];
        notify(firstName ? `Welcome, ${firstName}!` : 'Signed in', 'success');
      } finally {
        setLoading(false);
      }
    },
    [adoptAccount, notify],
  );

  const signOut = useCallback(async () => {
    await authLogout();
    setState(null);
    setError(null);
    notify('Signed out', 'info');
  }, [notify]);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    await authLogout();
    setState(null);
    setError(null);
    notify('Your account has been permanently deleted', 'info');
  }, [notify]);

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
        void refreshSystemStatus();
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
      systemStatus,
      theme,
      themePreference,
      config,
      onboarded: onboarded || Boolean(state?.user?.isAdmin),
      notify,
      clearError,
      toggleTheme,
      setThemePreference,
      completeOnboarding,
      replayOnboarding,
      signInWithAccount,
      signOut,
      deleteAccount,
      refresh,
      refreshSystemStatus,
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
      systemStatus,
      theme,
      themePreference,
      config,
      onboarded,
      notify,
      clearError,
      toggleTheme,
      setThemePreference,
      completeOnboarding,
      replayOnboarding,
      signInWithAccount,
      signOut,
      deleteAccount,
      refresh,
      refreshSystemStatus,
      joinTeam,
      createTeam,
      leaveTeam,
      setUser,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      <ToastStack items={toasts} onDismiss={dismissToast} />
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
