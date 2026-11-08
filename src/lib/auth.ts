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

const TOKEN_KEY = 'aria.token';
const DEMO_PENDING_RESET = 'aria.pendingResetToken';
const POPUP_RELAY_KEY = 'aria.oauthRelay';

let config: AuthConfig = {
  driver: 'demo',
  supabaseUrl: null,
  supabaseAnonKey: null,
  resetMinutes: 30,
};

type SupabaseClient = {
  auth: {
    signInWithPassword: (args: { email: string; password: string }) => Promise<any>;
    signUp: (args: any) => Promise<any>;
    signInWithOAuth: (args: any) => Promise<any>;
    resetPasswordForEmail: (email: string, options?: any) => Promise<any>;
    updateUser: (args: any) => Promise<any>;
    getSession: () => Promise<any>;
    setSession: (args: { access_token: string; refresh_token: string }) => Promise<any>;
    getUser: (jwt?: string) => Promise<any>;
    signOut: () => Promise<any>;
    onAuthStateChange: (cb: (event: string, session: any) => void) => any;
  };
};

let supabaseClient: SupabaseClient | null = null;
let supabaseInitPromise: Promise<SupabaseClient> | null = null;
let authListenerBound = false;
let pendingOAuthError: string | null = null;
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

/**
 * Inspects URL query/hash for an OAuth error returned by Google or Supabase
 * BEFORE GoTrueClient initializes and clears/ignores it.
 */
export function extractOAuthErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);

    const rawDesc =
      hashParams.get('error_description') ||
      searchParams.get('error_description') ||
      hashParams.get('error') ||
      searchParams.get('error');

    if (!rawDesc) return null;

    let changed = false;
    for (const key of ['error', 'error_code', 'error_description']) {
      if (searchParams.has(key)) {
        searchParams.delete(key);
        changed = true;
      }
      if (hashParams.has(key)) {
        hashParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      const nextSearch = searchParams.toString();
      const nextHash = hashParams.toString();
      const nextUrl =
        window.location.pathname +
        (nextSearch ? `?${nextSearch}` : '') +
        (nextHash ? `#${nextHash}` : '');
      window.history.replaceState(null, '', nextUrl);
    }

    const message = rawDesc.replace(/\+/g, ' ').trim();
    pendingOAuthError = message || 'Google sign-in failed.';
    return pendingOAuthError;
  } catch {
    return null;
  }
}

export function consumeOAuthError(): string | null {
  const err = pendingOAuthError;
  pendingOAuthError = null;
  return err;
}

export async function loadConfig(): Promise<AuthConfig> {
  extractOAuthErrorFromUrl();
  const res = await fetch('/api/auth/config');
  if (!res.ok) throw new Error('Could not reach the server.');
  config = (await res.json()) as AuthConfig;
  if (config.driver === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    await ensureSupabase();
  }
  return config;
}

async function ensureSupabase(): Promise<SupabaseClient> {
  if (supabaseClient) return supabaseClient;
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
    const client = createClient(url, anonKey);
    supabaseClient = client as unknown as SupabaseClient;

    if (!authListenerBound) {
      authListenerBound = true;
      client.auth.onAuthStateChange((_event: string, session: any) => {
        if (session?.access_token) {
          localStorage.setItem(TOKEN_KEY, session.access_token);
          notify({ token: session.access_token, user: toUser(session.user) });
        } else {
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
  } catch {
    /* ignore storage failures */
  }
}

export function getPendingPopupRelay(): string | null {
  try {
    return sessionStorage.getItem(POPUP_RELAY_KEY);
  } catch {
    return null;
  }
}

export async function completePopupRelay(
  nonce: string,
  payload: { accessToken?: string; refreshToken?: string; error?: string },
): Promise<void> {
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

  try {
    window.close();
  } catch {
    /* ignore */
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
  if (!session?.access_token) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token || '',
    user: toUser(session.user),
  };
}

export async function adoptSupabaseTokens(
  accessToken: string,
  refreshToken?: string | null,
): Promise<Account> {
  const client = await ensureSupabase();
  if (refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error && data?.session?.access_token) {
      storeToken(data.session.access_token);
      return { token: data.session.access_token, user: toUser(data.session.user) };
    }
  }
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error(error?.message || 'Could not verify Google session.');
  }
  storeToken(accessToken);
  const account = { token: accessToken, user: toUser(data.user) };
  notify(account);
  return account;
}

export async function startGoogleRedirect(): Promise<void> {
  const client = await ensureSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw new Error(error.message);
}

function loginWithGooglePopup(): Promise<Account> {
  // Open the popup synchronously inside the click gesture so browsers never block it.
  const nonce = makeRelayNonce();
  const width = 500;
  const height = 640;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
  const popup = window.open(
    `/auth/google?relay=${encodeURIComponent(nonce)}`,
    'aria-google-auth',
    features,
  );

  if (!popup) {
    return Promise.reject(
      new Error(
        'Your browser blocked the Google sign-in popup. Allow popups for this site or open Aria in a new tab.',
      ),
    );
  }

  return new Promise<Account>((resolve, reject) => {
    let settled = false;
    let closedAt: number | null = null;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
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
        const res = await fetch(`/api/auth/relay/${encodeURIComponent(nonce)}`);
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

      let isClosed = false;
      try {
        isClosed = popup.closed;
      } catch {
        isClosed = false;
      }
      if (isClosed) {
        if (closedAt === null) {
          closedAt = Date.now();
        } else if (Date.now() - closedAt > 2000 && !settled) {
          settled = true;
          cleanup();
          reject(new OAuthCancelledError());
        }
      }
    };

    window.addEventListener('message', onMessage);
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
  if (config.driver !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Google sign-in needs Supabase. See DEPLOY.md to connect a project.');
  }
  if (isInIframe()) {
    return loginWithGooglePopup();
  }
  await startGoogleRedirect();
  // Top-level window navigates away; onAuthStateChange / resumeSession picks up the session on return.
  return null;
}

export async function logout(): Promise<void> {
  if (config.driver === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
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
    // Supabase puts the recovery token in the URL hash and establishes a
    // session; updateUser then sets the new password.
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

/** Used after a Supabase redirect back into the app. */
export async function resumeSession(): Promise<Account | null> {
  if (config.driver !== 'supabase') {
    const token = currentToken();
    if (!token) return null;
    const res = await fetch('/api/auth/session', { headers: authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user ? { token, user: data.user } : null;
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const client = await ensureSupabase();
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  storeToken(token);
  return { token, user: toUser(data.session.user) };
}
