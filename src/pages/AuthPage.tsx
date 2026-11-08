import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogoHero, Wordmark } from '../components/Logo';
import { Button, Icon, IconButton } from '../components/ui';
import { useStore } from '../lib/store';
import {
  OAuthCancelledError,
  completePopupRelay,
  forgotPassword,
  getConfig,
  login,
  loginWithGoogle,
  register,
  rememberPopupRelay,
  rememberResetToken,
  resetPassword,
  startGoogleRedirect,
} from '../lib/auth';

type Mode = 'welcome' | 'login' | 'register' | 'forgot' | 'reset-sent';

const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

function Shell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useStore();
  return (
    <div className="app">
      <div className="auth">
        <div className="auth-top">
          <Wordmark size={24} />
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="icon-btn-ghost"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
        </div>
        <div className="auth-main">{children}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 14, paddingBottom: 14 }}>
          <Link to="/privacy" className="link-button tiny">
            Privacy Policy
          </Link>
          <span className="tiny">·</span>
          <Link to="/delete-account" className="link-button tiny">
            Delete Account
          </Link>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  placeholder,
  autoComplete,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  onChange: (next: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-adorned">
      <input
        id={id}
        className="input"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="input-action"
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? 'eyeOff' : 'view'} size={16} />
      </button>
    </div>
  );
}

function GoogleButton({
  onError,
  onUnavailable,
}: {
  onError: (message: string) => void;
  onUnavailable: () => void;
}) {
  const { config, signInWithAccount, clearError } = useStore();
  const [busy, setBusy] = useState(false);
  const live =
    config.driver === 'supabase' && Boolean(config.supabaseUrl && config.supabaseAnonKey);

  return (
    <button
      type="button"
      className="btn btn-google btn-block"
      disabled={busy}
      onClick={async () => {
        clearError();
        if (!live) {
          if (config.driver === 'supabase') {
            onError(
              'Supabase client keys are missing on the server (set SUPABASE_URL and SUPABASE_ANON_KEY).',
            );
          } else {
            onUnavailable();
          }
          return;
        }
        setBusy(true);
        try {
          const account = await loginWithGoogle();
          if (account) {
            await signInWithAccount(account);
          }
        } catch (err) {
          if (!(err instanceof OAuthCancelledError)) {
            onError(err instanceof Error ? err.message : 'Google sign-in failed.');
          }
          setBusy(false);
        }
      }}
    >
      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
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
      <span>{busy ? 'Connecting…' : 'Continue with Google'}</span>
    </button>
  );
}

export function AuthPage({ mode: initial }: { mode: Mode }) {
  const navigate = useNavigate();
  const { signInWithAccount, config, error: storeError, clearError } = useStore();
  const [mode, setMode] = useState<Mode>(initial);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => setMode(initial), [initial]);

  const activeError = error || storeError;
  const isLoginView = mode === 'login' || mode === 'welcome';

  const resetErrors = () => {
    setError(null);
    setNotice(null);
    if (storeError) clearError();
  };

  const switchMode = (next: Mode) => {
    resetErrors();
    setMode(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetErrors();

    if (isLoginView) {
      if (!emailOk(email)) return setError('Enter a valid email address.');
      if (!password) return setError('Enter your password.');
    }
    if (mode === 'register') {
      if (!name.trim()) return setError('Enter your name.');
      if (!emailOk(email)) return setError('Enter a valid email address.');
      if (password.length < 8) return setError('Use at least 8 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
    }
    if (mode === 'forgot' && !emailOk(email)) {
      return setError('Enter a valid email address.');
    }

    setBusy(true);
    try {
      if (isLoginView) {
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

  if (needsConfirm) {
    return (
      <Shell>
        <div className="auth-head">
          <LogoHero size={48} />
          <h1 className="auth-title">Check your inbox</h1>
          <p className="auth-sub">
            Open the confirmation link sent to <strong>{email}</strong>, then sign in.
          </p>
        </div>
        <Button
          variant="primary"
          block
          onClick={() => {
            setNeedsConfirm(false);
            navigate('/login');
          }}
        >
          Back to sign in
        </Button>
      </Shell>
    );
  }

  if (mode === 'reset-sent') {
    return (
      <Shell>
        <div className="auth-head">
          <LogoHero size={48} />
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">
            If an account exists for <strong>{email}</strong>, a reset link expires in{' '}
            {config.resetMinutes} minutes.
          </p>
        </div>

        <div className="stack-sm">
          {resetLink ? (
            <div className="card stack-sm">
              <div className="label">Local recovery link</div>
              <Button variant="primary" block onClick={() => navigate(resetLink)}>
                Open reset link
              </Button>
            </div>
          ) : null}

          <Button variant="quiet" block onClick={() => switchMode('login')}>
            <Icon name="back" size={14} /> Back to sign in
          </Button>
        </div>
      </Shell>
    );
  }

  const title = isLoginView
    ? 'Sign in to Aria'
    : mode === 'register'
      ? 'Create your account'
      : 'Reset password';
  const subtitle = isLoginView
    ? 'Your songs, lyric insights, and setlists.'
    : mode === 'register'
      ? 'Start with a clean personal library.'
      : 'Enter your email to receive a reset link.';

  return (
    <Shell>
      <div className="auth-head">
        <LogoHero size={48} />
        <h1 className="auth-title">{title}</h1>
        <p className="auth-sub">{subtitle}</p>
      </div>

      {mode !== 'forgot' && (
        <div className="seg" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={isLoginView}
            className={isLoginView ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Sign up
          </button>
        </div>
      )}

      <div className="auth-body">
        {mode !== 'forgot' ? (
          <>
            <GoogleButton
              onError={setError}
              onUnavailable={() => {
                switchMode('login');
                setNotice('Google sign-in requires Supabase Auth.');
              }}
            />
            <div className="or-divider">
              <span>or</span>
            </div>
          </>
        ) : null}

        <form className="stack" onSubmit={submit}>
          {mode === 'register' ? (
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                className="input"
                value={name}
                autoComplete="name"
                placeholder="Your name"
                onChange={(e) => {
                  setName(e.target.value);
                  resetErrors();
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
                resetErrors();
              }}
            />
          </div>

          {mode !== 'forgot' ? (
            <div className="field">
              <div className="row-between">
                <label htmlFor="password">Password</label>
                {isLoginView ? (
                  <button
                    type="button"
                    className="link-button tiny"
                    onClick={() => switchMode('forgot')}
                  >
                    Forgot?
                  </button>
                ) : null}
              </div>
              <PasswordInput
                id="password"
                autoComplete={isLoginView ? 'current-password' : 'new-password'}
                value={password}
                placeholder={mode === 'register' ? '8+ characters' : 'Password'}
                onChange={(v) => {
                  setPassword(v);
                  resetErrors();
                }}
              />
            </div>
          ) : null}

          {mode === 'register' ? (
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                value={confirm}
                placeholder="Repeat password"
                onChange={(v) => {
                  setConfirm(v);
                  resetErrors();
                }}
              />
            </div>
          ) : null}

          {activeError ? (
            <div className="alert alert-danger" role="alert">
              {activeError}
            </div>
          ) : null}
          {notice ? (
            <div className="alert alert-info" role="status">
              {notice}
            </div>
          ) : null}

          <Button type="submit" variant="primary" block disabled={busy}>
            {busy
              ? 'Working…'
              : isLoginView
                ? 'Sign in'
                : mode === 'register'
                  ? 'Create account'
                  : 'Send reset link'}
          </Button>
        </form>

        {mode === 'forgot' ? (
          <Button variant="quiet" block onClick={() => switchMode('login')}>
            <Icon name="back" size={14} /> Back to sign in
          </Button>
        ) : null}
      </div>
    </Shell>
  );
}

/** Popup entry route (/auth/google?relay=…) opened when Aria runs inside an iframe. */
export function GooglePopupStartPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loading } = useStore();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const relay = params.get('relay');

  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;

    if (!relay) {
      navigate('/login', { replace: true });
      return;
    }

    rememberPopupRelay(relay);
    void startGoogleRedirect().catch(async (err) => {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      setError(message);
      await completePopupRelay(relay, { error: message });
    });
  }, [loading, navigate, relay]);

  return (
    <Shell>
      <div className="auth-head">
        <LogoHero size={48} />
        <h1 className="auth-title">{error ? 'Sign-in issue' : 'Connecting…'}</h1>
        <p className="auth-sub">{error || 'Redirecting to Google.'}</p>
      </div>
      {error ? (
        <Button variant="quiet" block onClick={() => window.close()}>
          Close window
        </Button>
      ) : null}
    </Shell>
  );
}

/** Displayed inside a returning OAuth popup if the browser does not immediately close it. */
export function PopupStatusPage() {
  const { popupStatus, error } = useStore();
  const ok = popupStatus === 'completed';
  return (
    <Shell>
      <div className="auth-head">
        <LogoHero size={48} />
        <h1 className="auth-title">{ok ? 'Signed in' : 'Sign-in incomplete'}</h1>
        <p className="auth-sub">
          {ok ? 'You can close this window.' : error || 'Return to Aria and try again.'}
        </p>
      </div>
      <Button variant="primary" block onClick={() => window.close()}>
        Close window
      </Button>
    </Shell>
  );
}

/** Landing at /reset?token=… */
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
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const account = await resetPassword(password, token);
      if (account) await signInWithAccount(account);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Shell>
        <div className="auth-head">
          <LogoHero size={48} />
          <h1 className="auth-title">Password updated</h1>
          <p className="auth-sub">Signed in{user ? ` as ${user.name}` : ''}.</p>
        </div>
        <Button variant="primary" block onClick={() => navigate('/')}>
          Continue
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="auth-head">
        <LogoHero size={48} />
        <h1 className="auth-title">New password</h1>
        <p className="auth-sub">
          {driver === 'demo' && !token
            ? 'Open the reset link from the previous step.'
            : 'Choose a password of at least 8 characters.'}
        </p>
      </div>

      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={password}
            placeholder="8+ characters"
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Confirm password</label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            value={confirm}
            placeholder="Repeat password"
            onChange={(v) => {
              setConfirm(v);
              setError(null);
            }}
          />
        </div>
        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}
        <Button type="submit" variant="primary" block disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </Button>
        <Button variant="quiet" block onClick={() => navigate('/forgot')}>
          Request a new link
        </Button>
      </form>
    </Shell>
  );
}
