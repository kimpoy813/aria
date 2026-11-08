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

const TOKEN_KEY = 'aria.token';
const DEMO_PENDING_RESET = 'aria.pendingResetToken';

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
    signOut: () => Promise<any>;
  };
};

let supabaseClient: SupabaseClient | null = null;
let authListenerBound = false;
const listeners = new Set<(account: Account | null) => void>();

function notify(account: Account | null) {
  for (const listener of listeners) listener(account);
}

export function onChange(listener: (account: Account | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConfig() {
  return config;
}

export async function loadConfig(): Promise<AuthConfig> {
  const res = await fetch('/api/auth/config');
  if (!res.ok) throw new Error('Could not reach the server.');
  config = (await res.json()) as AuthConfig;
  if (config.driver === 'supabase') await ensureSupabase();
  return config;
}

async function ensureSupabase(): Promise<SupabaseClient> {
  if (supabaseClient) return supabaseClient;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase client keys are missing on the server.');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
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
}

function toUser(raw: any): User {
  const meta = raw?.user_metadata || {};
  const email = raw?.email || '';
  return {
    id: `sb_${raw?.id}`,
    name: (meta.full_name || meta.name || email.split('@')[0] || 'Listener').slice(0, 40),
    email,
    createdAt: raw?.created_at ? new Date(raw.created_at).getTime() : Date.now(),
  };
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

export async function loginWithGoogle(): Promise<void> {
  if (config.driver !== 'supabase') {
    throw new Error('Google sign-in needs Supabase. See DEPLOY.md to connect a project.');
  }
  const client = await ensureSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw new Error(error.message);
  // The browser navigates away; onAuthStateChange picks the session up on return.
}

export async function logout(): Promise<void> {
  if (config.driver === 'supabase') {
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

export async function resetPassword(password: string, tokenFromUrl?: string | null): Promise<Account | null> {
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
  const client = await ensureSupabase();
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  storeToken(token);
  return { token, user: toUser(data.session.user) };
}
