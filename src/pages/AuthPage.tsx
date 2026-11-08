import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Logo, LogoHero, Wordmark } from '../components/Logo';
import { Button, Icon, IconButton } from '../components/ui';
import { useStore } from '../lib/store';
import {
  forgotPassword,
  getConfig,
  login,
  loginWithGoogle,
  register,
  rememberResetToken,
  resetPassword,
} from '../lib/auth';

type Mode = 'welcome' | 'login' | 'register' | 'forgot' | 'reset-sent';

const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

function Shell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useStore();
  return (
    <div className="app">
      <div className="landing">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <LogoHero />
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const config = getConfig();
  const [busy, setBusy] = useState(false);
  const enabled = config.driver === 'supabase' && config.supabaseAnonKey;

  return (
    <div className="stack-sm">
      <button
        type="button"
        className="btn btn-google"
        disabled={busy || !enabled}
        onClick={async () => {
          setBusy(true);
          try {
            await loginWithGoogle();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'Google sign-in failed.');
            setBusy(false);
          }
        }}
      >
        <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
          <path
            fill="#4285F4"
            d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.9h12c-.2 2-1.5 5-4.4 7l6.7 5.2c4-3.7 6.8-9.1 6.8-16.1Z"
          />
          <path
            fill="#34A853"
            d="M24 46c5.9 0 10.9-2 14.5-5.4l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.4 46 24 46Z"
          />
          <path
            fill="#FBBC05"
            d="M11.5 28.3a13.7 13.7 0 0 1 0-8.7l-7.1-5.5a22 22 0 0 0 0 19.7l7.1-5.5Z"
          />
          <path
            fill="#EA4335"
            d="M24 10.1c4.1 0 7.5 1.4 9.9 3.7l6-6C36 4 30.9 2 24 2 15.4 2 8.1 6.9 4.4 14.1l7.1 5.5C13.3 13.9 18.2 10.1 24 10.1Z"
          />
        </svg>
        {busy ? 'Connecting…' : 'Continue with Google'}
      </button>
      {!enabled ? (
        <p className="tiny muted" style={{ textAlign: 'center' }}>
          Google sign-in turns on once Supabase is connected.
        </p>
      ) : null}
    </div>
  );
}

export function AuthPage({ mode: initial }: { mode: Mode }) {
  const navigate = useNavigate();
  const { signInWithAccount, config } = useStore();
  const [mode, setMode] = useState<Mode>(initial);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => setMode(initial), [initial]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === 'login') {
      if (!emailOk(email)) return setError('Enter a valid email address.');
      if (!password) return setError('Enter your password.');
    }
    if (mode === 'register') {
      if (!name.trim()) return setError('Tell us what to call you.');
      if (!emailOk(email)) return setError('Enter a valid email address.');
      if (password.length < 8) return setError('Use at least 8 characters.');
    }
    if (mode === 'forgot' && !emailOk(email)) {
      return setError('Enter a valid email address.');
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithAccount(await login(email, password));
      } else if (mode === 'register') {
        const result = await register({ name, email, password });
        if (result.needsEmailConfirm) {
          setNeedsConfirm(true);
        } else if (result.account) {
          await signInWithAccount(result.account);
        }
      } else if (mode === 'forgot') {
        const { resetPath } = await forgotPassword(email);
        setResetLink(resetPath || null);
        setMode('reset-sent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------ register */
  if (needsConfirm) {
    return (
      <Shell>
        <div className="stack">
          <div>
            <div className="eyebrow">Almost there</div>
            <h1 style={{ fontSize: 30, marginTop: 6 }}>Check your inbox</h1>
            <p className="lede" style={{ marginTop: 8 }}>
              We sent a confirmation link to <strong>{email}</strong>. Open it, then come back and
              sign in.
            </p>
          </div>
          <Button variant="primary" block onClick={() => navigate('/login')}>
            Go to sign in
          </Button>
        </div>
      </Shell>
    );
  }

  /* -------------------------------------------------------------- reset */
  if (mode === 'reset-sent') {
    return (
      <Shell>
        <div className="stack">
          <div>
            <div className="eyebrow">Password reset</div>
            <h1 style={{ fontSize: 30, marginTop: 6 }}>Check your email</h1>
            <p className="lede" style={{ marginTop: 8 }}>
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
            </p>
          </div>

          {resetLink ? (
            <div className="card stack-sm">
              <div className="label">Demo mode has no mail server</div>
              <p className="hint">
                Use this link now to choose a new password. It is single-use and expires shortly.
              </p>
              <Button variant="primary" block onClick={() => navigate(resetLink)}>
                <Icon.Link /> Open reset link
              </Button>
            </div>
          ) : null}

          <Button variant="quiet" block onClick={() => navigate('/login')}>
            Back to sign in
          </Button>
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------ welcome */
  if (mode === 'welcome') {
    return (
      <Shell>
        <div>
          <Wordmark size={24} />
          <div className="eyebrow" style={{ marginTop: 10, marginBottom: 8 }}>
            Lyric-aware lineups
          </div>
          <h1>
            Aria reads your
            <br />
            lyrics, then builds
            <br />
            the set with you.
          </h1>
          <p className="lede" style={{ marginTop: 12 }}>
            Paste lyrics part by part. Aria names the message — love, faith, hope. Then drag a
            chorus here, a bridge there, and get a lineup that hasn't been used lately.
          </p>
        </div>

        <div className="steps">
          <div className="step">Create an account, or continue with Google.</div>
          <div className="step">Add a song, one part at a time: verse, chorus, bridge.</div>
          <div className="step">Build a lineup by dragging parts. Fast and slow in one set.</div>
          <div className="step">Teams join with a code. LRU keeps sets fresh.</div>
        </div>

        <div className="stack-sm">
          <Button variant="primary" block onClick={() => setMode('register')}>
            Create an account <Icon.Chevron />
          </Button>
          <Button block onClick={() => setMode('login')}>
            I already have one
          </Button>
          <GoogleButton onError={setError} />
          {error ? <p className="small" style={{ color: 'var(--danger)' }}>{error}</p> : null}
          <p className="tiny muted" style={{ textAlign: 'center' }}>
            Demo team code <strong>ARIA-123</strong> is available after you sign in.
          </p>
        </div>
      </Shell>
    );
  }

  /* -------------------------------------------------------- login/register/forgot */
  const title =
    mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset password';
  const subtitle =
    mode === 'login'
      ? 'Sign in to reach your songs, lineups and teams.'
      : mode === 'register'
        ? 'One account keeps your songs, lineups and teams together.'
        : 'Enter your email and we will send a reset link.';

  return (
    <Shell>
      <div>
        <Wordmark size={24} />
        <h1 style={{ fontSize: 30, marginTop: 12 }}>{title}</h1>
        <p className="lede" style={{ marginTop: 6 }}>{subtitle}</p>
      </div>

      <form className="stack" onSubmit={submit}>
        {mode === 'register' ? (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              value={name}
              autoComplete="name"
              placeholder="e.g. Kim"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
        </div>

        {mode !== 'forgot' ? (
          <div className="field">
            <div className="row-between">
              <label htmlFor="password">Password</label>
              {mode === 'login' ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                  }}
                >
                  Forgot password?
                </button>
              ) : null}
            </div>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </div>
        ) : null}

        {error ? <p className="small" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        {notice ? <p className="small" style={{ color: 'var(--brand-text)' }}>{notice}</p> : null}

        <Button type="submit" variant="primary" block disabled={busy}>
          {busy
            ? 'Working…'
            : mode === 'login'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create account'
                : 'Send reset link'}
        </Button>

        {mode !== 'forgot' ? (
          <>
            <div className="or-divider">
              <span>or</span>
            </div>
            <GoogleButton onError={setError} />
          </>
        ) : null}
      </form>

      <div className="stack-sm">
        {mode === 'login' ? (
          <p className="small muted" style={{ textAlign: 'center' }}>
            New to Aria?{' '}
            <button type="button" className="link-button" onClick={() => setMode('register')}>
              Create an account
            </button>
          </p>
        ) : (
          <p className="small muted" style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Back to sign in
            </button>
          </p>
        )}
        {config.driver === 'demo' ? (
          <p className="tiny muted" style={{ textAlign: 'center' }}>
            <Logo size={12} style={{ display: 'inline-block', verticalAlign: '-1px' }} /> Local
            accounts are active. Connect Supabase to use Google and emailed resets.
          </p>
        ) : null}
      </div>
    </Shell>
  );
}

/** Landing at /reset?token=… — outside the auth shell so it works signed in too. */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signInWithAccount, user } = useStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const token = params.get('token');
  const driver = getConfig().driver;

  useEffect(() => {
    if (token) rememberResetToken(token);
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Those passwords do not match.');
    setBusy(true);
    try {
      const account = await resetPassword(password, token);
      if (account) await signInWithAccount(account);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Shell>
        <div className="stack">
          <div>
            <div className="eyebrow">All set</div>
            <h1 style={{ fontSize: 30, marginTop: 6 }}>Password updated</h1>
            <p className="lede" style={{ marginTop: 8 }}>
              You are signed in{user ? ` as ${user.name}` : ''}. Your old password no longer works.
            </p>
          </div>
          <Button variant="primary" block onClick={() => navigate('/')}>
            Go to my songs
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div>
        <Wordmark size={24} />
        <h1 style={{ fontSize: 30, marginTop: 12 }}>Choose a new password</h1>
        <p className="lede" style={{ marginTop: 6 }}>
          {driver === 'demo' && !token
            ? 'Open the reset link from the previous step, or request a new one.'
            : 'Pick something you have not used before.'}
        </p>
      </div>

      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder="At least 8 characters"
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
          />
        </div>
        {error ? <p className="small" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <Button type="submit" variant="primary" block disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </Button>
        <Button variant="quiet" block onClick={() => navigate('/forgot')}>
          Request a new link
        </Button>
      </form>
    </Shell>
  );
}
