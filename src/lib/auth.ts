import type { User } from './types';

/**
 * One auth interface, two backends.
 *
 * - Supabase: sign up / sign in / Google / password reset are handled by
 *   Supabase, and the API verifies the access token it receives.
 * - Demo (local dev, no Supabase project): the Aria API issues the tokens.
 *
 * The rest of the app only ever calls `register`, `login`, `loginWithGoogle`,
 * `logout`, `forgotPassword`, `resetPassword`, `currentToken` and `onChange`.
 */

export type AuthDriver = 'supabase' | 'demo';

export interface AuthConfig {
  driver: AuthDriver;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  resetMinutes: number;
}

export interface Account {
  user: User;
  token: string;
}

export class OAuthCancelledError extends Error {
  cancelled = true;
  constructor() {
    super('Google sign-in was cancelled.');
  }
}

export const FALLBACK_SUPABASE_URL = 'https://ilnahwdfbyzlcxnojxdb.supabase.co';
export const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_eidHjQkRdAIhPOea4MsYpg_C9t-Ul_p';

const TOKEN_KEY = 'aria.token';
const DEMO_PENDING_RESET = 'aria.pendingResetToken';
const POPUP_RELAY_KEY = 'aria.oauthRelay';
const POPUP_WINDOW_KEY = 'aria.oauthPopupWindow';
const PENDING_RELAY_OPENER_KEY = 'aria.pendingRelayOpener';
const RELAY_OPENER_TTL_MS = 10 * 60 * 1000;

let config: AuthConfig = {
  driver: 'supabase',
  supabaseUrl: FALLBACK_SUPABASE_URL,
  supabaseAnonKey: FALLBACK_SUPABASE_ANON_KEY,
  resetMinutes: 30,
};
let configLoadedFromServer = false;

type SupabaseClient = {
  auth: {
    signInWithPassword: (args: { email: string; password: string }) => Promise<any>;
    signUp: (args: any) => Promise<any>;
    signInWithOAuth: (args: any) => Promise<any>;
    resetPasswordForEmail: (email: string, options?: any) => Promise<any>;
    updateUser: (args: any) => Promise<any>;
    getSession: () => Promise<any>;
    refreshSession: () => Promise<any>;
    setSession: (args: { access_token: string; refresh_token: string }) => Promise<any>;
    getUser: (jwt?: string) => Promise<any>;
    signOut: () => Promise<any>;
    onAuthStateChange: (cb: (event: string, session: any) => void) => any;
  };
};

interface CapturedHashSession {
  accessToken: string;
  refreshToken: string;
}

let supabaseClient: SupabaseClient | null = null;
let supabaseClientUrl: string | null = null;
let supabaseInitPromise: Promise<SupabaseClient> | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let authListenerBound = false;
let pendingOAuthError: string | null = null;
let capturedHashTokens: CapturedHashSession | null = null;
let capturedRelayNonce: string | null = null;
let returnedFromOAuth = false;
const listeners = new Set<(account: Account | null) => void>();

function notify(account: Account | null) {
  for (const listener of listeners) listener(account);
}

export function onChange(listener: (account: Account | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConfig() {
  return config;
}

export function didReturnFromOAuth(): boolean {
  return returnedFromOAuth;
}

export function clearReturnedFromOAuth(): void {
  returnedFromOAuth = false;
}

function isValidRelayNonce(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

/**
 * Synchronously captures OAuth errors, `?relay=` nonces, and `#access_token`
 * hash parameters BEFORE any async network call or router transition can
 * mutate `window.location` or `sessionStorage`.
 */
export function extractOAuthErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);

    let searchChanged = false;
    let hashChanged = false;

    const relayParam = searchParams.get('relay') || hashParams.get('relay');
    if (isValidRelayNonce(relayParam)) {
      capturedRelayNonce = relayParam;
      returnedFromOAuth = true;
      if (searchParams.has('relay')) {
        searchParams.delete('relay');
        searchChanged = true;
      }
      if (hashParams.has('relay')) {
        hashParams.delete('relay');
        hashChanged = true;
      }
    }

    const accessToken = hashParams.get('access_token');
    if (accessToken && !capturedHashTokens) {
      capturedHashTokens = {
        accessToken,
        refreshToken: hashParams.get('refresh_token') || '',
      };
      returnedFromOAuth = true;
    }
    if (searchParams.has('code')) {
      returnedFromOAuth = true;
    }

    const rawDesc =
      hashParams.get('error_description') ||
      searchParams.get('error_description') ||
      hashParams.get('error') ||
      searchParams.get('error');

    if (rawDesc) {
      for (const key of ['error', 'error_code', 'error_description']) {
        if (searchParams.has(key)) {
          searchParams.delete(key);
          searchChanged = true;
        }
        if (hashParams.has(key)) {
          hashParams.delete(key);
          hashChanged = true;
        }
      }
      const message = rawDesc.replace(/\+/g, ' ').trim();
      pendingOAuthError = message || 'Google sign-in failed.';
    }

    // Strip `?relay=` and any error params immediately while keeping `#access_token`
    // intact so @supabase/supabase-js can also detect the session normally.
    if (searchChanged || (rawDesc && hashChanged)) {
      const nextSearch = searchParams.toString();
      const nextHash = rawDesc ? hashParams.toString() : rawHash;
      const nextUrl =
        window.location.pathname +
        (nextSearch ? `?${nextSearch}` : '') +
        (nextHash ? `#${nextHash}` : '');
      window.history.replaceState(window.history.state, '', nextUrl);
    }

    return pendingOAuthError;
  } catch {
    return null;
  }
}

// Run once immediately at module evaluation time so mobile hash/query tokens are never lost.
extractOAuthErrorFromUrl();

export function consumeOAuthError(): string | null {
  const err = pendingOAuthError;
  pendingOAuthError = null;
  return err;
}

export async function loadConfig(force = false): Promise<AuthConfig> {
  extractOAuthErrorFromUrl();
  if (configLoadedFromServer && !force) {
    if (config.driver === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
      await ensureSupabase();
    }
    return config;
  }

  let loaded: AuthConfig | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch('/api/auth/config', { cache: 'no-store' });
      if (res.ok) {
        loaded = (await res.json()) as AuthConfig;
        configLoadedFromServer = true;
        break;
      }
      if (res.status < 500) break;
    } catch {
      /* retry once on transient wake-up / network hiccup */
    }
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 450));
    }
  }

  if (loaded) {
    config = loaded;
  } else if (!configLoadedFromServer) {
    // Server is waking up (e.g. Render cold start): keep public Supabase OAuth active.
    config = {
      driver: 'supabase',
      supabaseUrl: FALLBACK_SUPABASE_URL,
      supabaseAnonKey: FALLBACK_SUPABASE_ANON_KEY,
      resetMinutes: 30,
    };
  }

  if (config.driver === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    await ensureSupabase();
  }
  return config;
}

async function ensureSupabase(): Promise<SupabaseClient> {
  if (supabaseClient && supabaseClientUrl === config.supabaseUrl) return supabaseClient;
  if (supabaseInitPromise) return supabaseInitPromise;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      'Supabase client keys are missing on the server (set SUPABASE_URL and SUPABASE_ANON_KEY).',
    );
  }
  const url = config.supabaseUrl;
  const anonKey = config.supabaseAnonKey;
  supabaseInitPromise = (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    supabaseClient = client as unknown as SupabaseClient;
    supabaseClientUrl = url;

    if (!authListenerBound) {
      authListenerBound = true;
      client.auth.onAuthStateChange((event: string, session: any) => {
        const existing = localStorage.getItem(TOKEN_KEY);
        if (existing && existing.startsWith('adm.')) {
          return;
        }
        if (session?.access_token) {
          localStorage.setItem(TOKEN_KEY, session.access_token);
          notify({ token: session.access_token, user: toUser(session.user) });
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem(TOKEN_KEY);
          notify(null);
        }
      });
    }
    return supabaseClient;
  })();

  try {
    return await supabaseInitPromise;
  } catch (err) {
    supabaseInitPromise = null;
    throw err;
  }
}

function toUser(raw: any): User {
  const meta = raw?.user_metadata || {};
  const email = raw?.email || '';
  return {
    id: `sb_${raw?.id}`,
    name: (
      meta.full_name ||
      meta.name ||
      meta.preferred_username ||
      email.split('@')[0] ||
      'Listener'
    ).slice(0, 40),
    email,
    createdAt: raw?.created_at ? new Date(raw.created_at).getTime() : Date.now(),
  };
}

function isInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** True when running as an installed standalone PWA / home-screen app. */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window.navigator as any)?.standalone === true) return true;
    return Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
  } catch {
    return false;
  }
}

/**
 * True inside embedded in-app social/chat WebViews (Messenger, Facebook,
 * Instagram, Line, Viber, TikTok, generic Android `; wv)`) where Google
 * blocks OAuth with `Error 403: disallowed_useragent`.
 * Does NOT match normal mobile browsers (Samsung Browser, Chrome, Safari, Firefox).
 */
export function isDisallowedGoogleWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (!ua) return false;
  return /\b(FBAN|FBAV|Messenger|Instagram|Line\/|MicroMessenger|Viber|BytedanceWebview|TikTok|Snapchat)\b|;\s*wv\)/i.test(
    ua,
  );
}

/**
 * Attempts to break out of an Android/iOS embedded social WebView into the
 * device's real default browser (Chrome / Samsung Internet / Safari).
 */
export function openInSystemBrowser(targetPath = '/login'): boolean {
  if (typeof window === 'undefined') return false;
  const cleanUrl = `${window.location.origin}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    const withoutScheme = cleanUrl.replace(/^https?:\/\//i, '');
    const scheme = cleanUrl.startsWith('http://') ? 'http' : 'https';
    window.location.href = `intent://${withoutScheme}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`;
    return true;
  }
  const opened = window.open(cleanUrl, '_blank', 'noopener,noreferrer');
  return Boolean(opened);
}

function makeRelayNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

/* ---------------------------------------------------------- popup relay */

export function rememberPopupRelay(nonce: string) {
  try {
    sessionStorage.setItem(POPUP_RELAY_KEY, nonce);
    sessionStorage.setItem(POPUP_WINDOW_KEY, '1');
  } catch {
    /* ignore storage failures */
  }
}

export function isAuxiliaryPopupWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.name === 'aria-google-auth') return true;
    if (sessionStorage.getItem(POPUP_WINDOW_KEY) === '1') return true;
    if (window.opener && window.opener !== window) return true;
  } catch {
    return true;
  }
  return false;
}

export function clearPopupWindowMarkers(): void {
  capturedRelayNonce = null;
  try {
    sessionStorage.removeItem(POPUP_RELAY_KEY);
    sessionStorage.removeItem(POPUP_WINDOW_KEY);
  } catch {
    /* ignore */
  }
}

export function getPendingPopupRelay(): string | null {
  if (capturedRelayNonce) return capturedRelayNonce;
  if (typeof window !== 'undefined') {
    try {
      const sp = new URLSearchParams(window.location.search);
      const fromUrl = sp.get('relay');
      if (isValidRelayNonce(fromUrl)) {
        capturedRelayNonce = fromUrl;
        return fromUrl;
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const saved = sessionStorage.getItem(POPUP_RELAY_KEY);
    return isValidRelayNonce(saved) ? saved : null;
  } catch {
    return null;
  }
}

function savePendingRelayOpener(nonce: string | null) {
  try {
    if (!nonce) {
      localStorage.removeItem(PENDING_RELAY_OPENER_KEY);
      return;
    }
    localStorage.setItem(
      PENDING_RELAY_OPENER_KEY,
      JSON.stringify({ nonce, expiresAt: Date.now() + RELAY_OPENER_TTL_MS }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * If an installed standalone PWA opened a Custom Tab for Google Sign-In and
 * the OS suspended/reloaded the PWA while in the background, redeem the relay
 * nonce when the user returns to the app.
 */
export async function redeemPendingRelayOpener(): Promise<Account | null> {
  let nonce: string | null = null;
  try {
    const raw = localStorage.getItem(PENDING_RELAY_OPENER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(PENDING_RELAY_OPENER_KEY);
      return null;
    }
    if (isValidRelayNonce(parsed.nonce)) {
      nonce = parsed.nonce;
    }
  } catch {
    return null;
  }
  if (!nonce) return null;

  try {
    const res = await fetch(`/api/auth/relay/${encodeURIComponent(nonce)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.pending !== false) return null;
    savePendingRelayOpener(null);
    if (data.error) {
      pendingOAuthError = data.error;
      return null;
    }
    if (data.accessToken) {
      return await adoptSupabaseTokens(data.accessToken, data.refreshToken);
    }
  } catch {
    /* will retry on next visibility focus */
  }
  return null;
}

export async function completePopupRelay(
  nonce: string,
  payload: { accessToken?: string; refreshToken?: string; error?: string },
  options: { closeWindow?: boolean } = {},
): Promise<void> {
  capturedRelayNonce = null;
  try {
    sessionStorage.removeItem(POPUP_RELAY_KEY);
  } catch {
    /* ignore */
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'aria:oauth', nonce, ...payload }, window.location.origin);
    }
  } catch {
    /* opener may be isolated by COOP; server relay below handles it */
  }

  try {
    await fetch('/api/auth/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce, ...payload }),
    });
  } catch {
    /* ignore */
  }

  if (options.closeWindow !== false) {
    try {
      window.close();
    } catch {
      /* ignore */
    }
  }
}

export async function getSupabaseSessionTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
  user: User;
} | null> {
  const client = await ensureSupabase();
  const { data } = await client.auth.getSession();
  const session = data?.session;
  if (session?.access_token) {
    capturedHashTokens = null;
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token || '',
      user: toUser(session.user),
    };
  }

  if (capturedHashTokens?.accessToken) {
    const fallback = capturedHashTokens;
    capturedHashTokens = null;
    const adopted = await adoptSupabaseTokens(fallback.accessToken, fallback.refreshToken);
    return {
      accessToken: adopted.token,
      refreshToken: fallback.refreshToken || '',
      user: adopted.user,
    };
  }

  return null;
}

export async function adoptSupabaseTokens(
  accessToken: string,
  refreshToken?: string | null,
): Promise<Account> {
  const client = await ensureSupabase();
  if (refreshToken) {
    try {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error && data?.session?.access_token) {
        storeToken(data.session.access_token);
        return { token: data.session.access_token, user: toUser(data.session.user) };
      }
    } catch {
      /* fall through to direct token verification */
    }
  }

  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (!error && data?.user) {
      storeToken(accessToken);
      const account = { token: accessToken, user: toUser(data.user) };
      notify(account);
      return account;
    }
  } catch {
    /* fall through to server session verification */
  }

  // Final fallback: verify via our own backend /api/auth/session
  const serverRes = await fetch('/api/auth/session', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (serverRes.ok) {
    const body = await serverRes.json().catch(() => null);
    if (body?.user) {
      storeToken(accessToken);
      const account = { token: accessToken, user: body.user as User };
      notify(account);
      return account;
    }
  }

  throw new Error('Could not verify Google session. Please try again.');
}

export async function startGoogleRedirect(relayNonce?: string | null): Promise<void> {
  const client = await ensureSupabase();
  const redirectTo = isValidRelayNonce(relayNonce)
    ? `${window.location.origin}/?relay=${encodeURIComponent(relayNonce)}`
    : `${window.location.origin}/`;

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw new Error(error.message);
}

function loginWithGooglePopup(allowRedirectFallback = false): Promise<Account | null> {
  // Open the popup/Custom Tab synchronously inside the click gesture so browsers never block it.
  const nonce = makeRelayNonce();
  savePendingRelayOpener(nonce);
  const width = 500;
  const height = 640;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const features = isStandaloneApp()
    ? undefined
    : `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
  const popup = window.open(
    `/auth/google?relay=${encodeURIComponent(nonce)}`,
    'aria-google-auth',
    features,
  );

  if (!popup) {
    if (allowRedirectFallback) {
      return startGoogleRedirect(nonce).then(() => null);
    }
    savePendingRelayOpener(null);
    return Promise.reject(
      new Error(
        'Your browser blocked the Google sign-in popup. Allow popups for this site or open Aria in a new tab.',
      ),
    );
  }

  return new Promise<Account | null>((resolve, reject) => {
    let settled = false;
    let closedAt: number | null = null;
    const standaloneMode = isStandaloneApp();

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', onWindowReturn);
      window.removeEventListener('pageshow', onWindowReturn);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
    };

    const finishWithPayload = async (payload: {
      accessToken?: string | null;
      refreshToken?: string | null;
      error?: string | null;
    }) => {
      if (settled) return;
      settled = true;
      cleanup();
      savePendingRelayOpener(null);
      if (payload.error) {
        reject(new Error(payload.error));
        return;
      }
      if (!payload.accessToken) {
        reject(new Error('Google sign-in did not return a session.'));
        return;
      }
      try {
        const account = await adoptSupabaseTokens(payload.accessToken, payload.refreshToken);
        resolve(account);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Google sign-in failed.'));
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'aria:oauth' || data.nonce !== nonce) return;
      void finishWithPayload(data);
    };

    const pollRelay = async () => {
      if (settled) return;
      try {
        const res = await fetch(`/api/auth/relay/${encodeURIComponent(nonce)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.pending === false) {
            await finishWithPayload(data);
            return;
          }
        }
      } catch {
        /* retry next tick */
      }

      // In standalone mobile PWAs, Android Custom Tabs often report `popup.closed === true`
      // immediately because of cross-browsing-context isolation while the user is still
      // signing in inside the Custom Tab. Keep polling until focus returns or timeout.
      if (!standaloneMode) {
        let isClosed = false;
        try {
          isClosed = popup.closed;
        } catch {
          isClosed = false;
        }
        if (isClosed) {
          if (closedAt === null) {
            closedAt = Date.now();
          } else if (Date.now() - closedAt > 2500 && !settled) {
            settled = true;
            cleanup();
            savePendingRelayOpener(null);
            reject(new OAuthCancelledError());
          }
        }
      }
    };

    const onWindowReturn = () => {
      void pollRelay();
      // In standalone mode, if the user returned to the app without completing sign-in,
      // release the busy state cleanly after checking the relay twice.
      if (standaloneMode && !settled) {
        window.setTimeout(() => {
          void pollRelay().then(() => {
            if (!settled && document.visibilityState === 'visible') {
              settled = true;
              cleanup();
              reject(new OAuthCancelledError());
            }
          });
        }, 1400);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onWindowReturn();
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('focus', onWindowReturn);
    window.addEventListener('pageshow', onWindowReturn);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = window.setInterval(() => {
      void pollRelay();
    }, 800);
  });
}

/* --------------------------------------------------------------- tokens */

export function currentToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function isJwtExpiringSoon(token: string | null, bufferSeconds = 90): boolean {
  if (!token || token.startsWith('adm.')) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (typeof payload?.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + bufferSeconds * 1000;
  } catch {
    return false;
  }
}

/**
 * Refreshes an expired or near-expiry Supabase access token using the stored
 * refresh token so API calls do not fail with 401 after 1 hour.
 */
export async function refreshSupabaseAccessToken(force = false): Promise<string | null> {
  const existing = currentToken();
  if (existing && existing.startsWith('adm.')) return existing;
  if (config.driver !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) {
    return existing;
  }
  if (!force && existing && !isJwtExpiringSoon(existing)) {
    return existing;
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const client = await ensureSupabase();
      const { data: sessionData } = await client.auth.getSession();
      const sessionToken = sessionData?.session?.access_token || null;
      if (!force && sessionToken && !isJwtExpiringSoon(sessionToken, 30)) {
        storeToken(sessionToken);
        return sessionToken;
      }
      const { data, error } = await client.auth.refreshSession();
      const refreshed = data?.session?.access_token || null;
      if (!error && refreshed) {
        storeToken(refreshed);
        return refreshed;
      }
      return sessionToken || existing;
    } catch {
      return existing;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Headers the API needs to identify the caller. */
export function authHeaders(): Record<string, string> {
  const token = currentToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ---------------------------------------------------------------- actions */

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ account: Account | null; needsEmailConfirm?: boolean }> {
  if (config.driver === 'supabase') {
    const client = await ensureSupabase();
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.name },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw new Error(error.message);
    if (!data?.session) {
      // Supabase has "Confirm email" switched on.
      return { account: null, needsEmailConfirm: true };
    }
    const token = data.session.access_token;
    storeToken(token);
    return { account: { token, user: toUser(data.user) } };
  }

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Could not create the account.');
  storeToken(data.token);
  return { account: { token: data.token, user: data.user } };
}

export async function login(email: string, password: string): Promise<Account> {
  // Check built-in system administrator credentials first (works in both Supabase & Demo modes)
  const adminRes = await fetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const adminData = await adminRes.json().catch(() => null);
  if (adminRes.status === 401) {
    throw new Error(adminData?.error || 'Email or password is incorrect.');
  }
  if (adminRes.ok && adminData?.matched && adminData?.token) {
    storeToken(adminData.token);
    if (supabaseClient) {
      await supabaseClient.auth.signOut().catch(() => undefined);
      storeToken(adminData.token);
    }
    return { token: adminData.token, user: adminData.user };
  }

  // Clear any previous built-in admin token before starting a regular user session
  const prevToken = currentToken();
  if (prevToken && prevToken.startsWith('adm.')) {
    storeToken(null);
  }

  if (config.driver === 'supabase') {
    const client = await ensureSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const token = data.session?.access_token;
    if (!token) throw new Error('Could not start a session.');
    storeToken(token);
    return { token, user: toUser(data.user) };
  }

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Email or password is incorrect.');
  storeToken(data.token);
  return { token: data.token, user: data.user };
}

export async function loginWithGoogle(): Promise<Account | null> {
  const prevToken = currentToken();
  if (prevToken && prevToken.startsWith('adm.')) {
    storeToken(null);
  }
  if (config.driver !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) {
    await loadConfig(true);
  }
  if (config.driver !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Google sign-in needs Supabase. See DEPLOY.md to connect a project.');
  }
  if (isInIframe()) {
    return loginWithGooglePopup(false);
  }
  if (isStandaloneApp()) {
    return loginWithGooglePopup(true);
  }
  await startGoogleRedirect();
  // Top-level window navigates away; onAuthStateChange / resumeSession picks up the session on return.
  return null;
}

export async function logout(): Promise<void> {
  savePendingRelayOpener(null);
  clearPopupWindowMarkers();
  capturedHashTokens = null;
  const saved = currentToken();
  if (saved && saved.startsWith('adm.')) {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { ...authHeaders() },
    }).catch(() => undefined);
  } else if (config.driver === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    await ensureSupabase()
      .then((client) => client.auth.signOut())
      .catch(() => undefined);
  } else {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { ...authHeaders() },
    }).catch(() => undefined);
  }
  storeToken(null);
  notify(null);
}

export async function forgotPassword(email: string): Promise<{ resetPath?: string }> {
  if (config.driver === 'supabase') {
    const client = await ensureSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    if (error) throw new Error(error.message);
    return {};
  }
  const res = await fetch('/api/auth/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Could not send the reset link.');
  return { resetPath: data.resetPath };
}

export async function resetPassword(
  password: string,
  tokenFromUrl?: string | null,
): Promise<Account | null> {
  if (config.driver === 'supabase') {
    const client = await ensureSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      storeToken(token);
      return { token, user: toUser(data.session.user) };
    }
    return null;
  }

  const token = tokenFromUrl || sessionStorage.getItem(DEMO_PENDING_RESET) || '';
  const res = await fetch('/api/auth/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Could not reset the password.');
  storeToken(data.token);
  sessionStorage.removeItem(DEMO_PENDING_RESET);
  return { token: data.token, user: data.user };
}

export function rememberResetToken(token: string | null) {
  if (token) sessionStorage.setItem(DEMO_PENDING_RESET, token);
  else sessionStorage.removeItem(DEMO_PENDING_RESET);
}

/** Used after a Supabase redirect or normal boot back into the app. */
export async function resumeSession(): Promise<Account | null> {
  const existingToken = currentToken();
  if (existingToken && existingToken.startsWith('adm.')) {
    const res = await fetch('/api/auth/session', {
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) {
      storeToken(null);
      return null;
    }
    const data = await res.json();
    return data?.user ? { token: existingToken, user: data.user } : null;
  }

  if (config.driver !== 'supabase') {
    if (!existingToken) return null;
    const res = await fetch('/api/auth/session', {
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) {
      storeToken(null);
      return null;
    }
    const data = await res.json();
    return data?.user ? { token: existingToken, user: data.user } : null;
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;

  const client = await ensureSupabase();
  const { data } = await client.auth.getSession();
  let session = data?.session;

  if (session?.access_token && isJwtExpiringSoon(session.access_token, 30)) {
    const refreshed = await client.auth.refreshSession().catch(() => null);
    if (refreshed?.data?.session?.access_token) {
      session = refreshed.data.session;
    }
  }

  if (session?.access_token) {
    capturedHashTokens = null;
    storeToken(session.access_token);
    return { token: session.access_token, user: toUser(session.user) };
  }

  // Fallback: if URL carried `#access_token=...` on arrival and GoTrueClient missed/raced it
  if (capturedHashTokens?.accessToken) {
    const fallback = capturedHashTokens;
    capturedHashTokens = null;
    try {
      return await adoptSupabaseTokens(fallback.accessToken, fallback.refreshToken);
    } catch (err) {
      pendingOAuthError =
        err instanceof Error ? err.message : 'Google sign-in could not be verified.';
      return null;
    }
  }

  // Fallback: if this standalone app had a pending Custom Tab relay waiting
  const relayed = await redeemPendingRelayOpener();
  if (relayed) return relayed;

  return null;
}
