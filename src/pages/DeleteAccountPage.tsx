import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wordmark } from '../components/Logo';
import { Button, Icon, IconButton } from '../components/ui';
import { OAuthCancelledError, login, loginWithGoogle } from '../lib/auth';
import { useStore } from '../lib/store';

export function DeleteAccountPage() {
  const {
    user,
    config,
    theme,
    toggleTheme,
    signInWithAccount,
    deleteAccount,
  } = useStore();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleLive =
    config.driver === 'supabase' && Boolean(config.supabaseUrl && config.supabaseAnonKey);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password to verify your account.');
      return;
    }
    setBusy(true);
    try {
      const account = await login(email, password);
      await signInWithAccount(account);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const account = await loginWithGoogle();
      if (account) {
        await signInWithAccount(account);
      }
    } catch (err) {
      if (!(err instanceof OAuthCancelledError)) {
        setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    if (confirmWord.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm permanent deletion.');
      return;
    }
    setBusy(true);
    try {
      await deleteAccount();
      setDeleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand-home" style={{ textDecoration: 'none' }}>
            <Wordmark size={24} />
          </Link>
          <div className="push" />
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="icon-btn-ghost"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
        </div>
      </header>

      <main className="app-main no-nav">
        <div className="stack">
          <div className="page-head">
            <h1>Delete Account</h1>
            <p>Permanently erase your Aria account and associated data</p>
          </div>

          {deleted ? (
            <div className="card stack">
              <div className="alert alert-ok">
                Your Aria account and all associated songs, lineups, and profile data have
                been permanently deleted.
              </div>
              <Button block onClick={() => navigate('/')}>
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="card stack-sm">
                <h2>What will be deleted</h2>
                <p className="small">
                  Deleting your Aria account immediately and permanently removes:
                </p>
                <ul className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
                  <li>Your profile, login credentials, and active sessions</li>
                  <li>All songs, lyric sections, and classifications you created</li>
                  <li>All lineups and public share links you own</li>
                  <li>Your membership in shared teams (and any solo teams you own)</li>
                </ul>
                <p className="tiny">
                  Retention period: None. Deletion is immediate and irreversible.
                </p>
              </div>

              {user ? (
                <div className="card stack">
                  <div className="stack-xs">
                    <span className="label">Signed in as</span>
                    <div style={{ fontWeight: 600 }}>{user.name}</div>
                    {user.email && <div className="tiny">{user.email}</div>}
                  </div>

                  <div className="field">
                    <label htmlFor="confirm-delete-input">
                      Type <strong>DELETE</strong> to confirm
                    </label>
                    <input
                      id="confirm-delete-input"
                      className="input code-input"
                      value={confirmWord}
                      onChange={(e) => setConfirmWord(e.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                    />
                  </div>

                  {error && (
                    <div className="alert alert-danger" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="stack-sm">
                    <Button
                      variant="danger"
                      block
                      disabled={busy || confirmWord.trim().toUpperCase() !== 'DELETE'}
                      onClick={handleDelete}
                    >
                      {busy ? 'Deleting account…' : 'Permanently delete account'}
                    </Button>
                    <Button block disabled={busy} onClick={() => navigate('/')}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="card stack">
                  <div className="stack-xs">
                    <h2>Verify your account</h2>
                    <p className="small">
                      Sign in to confirm ownership of the account you want to delete.
                    </p>
                  </div>

                  {googleLive && (
                    <Button
                      className="btn-google"
                      block
                      disabled={busy}
                      onClick={handleGoogleSignIn}
                    >
                      Continue with Google
                    </Button>
                  )}

                  <form className="stack" onSubmit={handleSignIn} noValidate>
                    <div className="field">
                      <label htmlFor="del-email">Email</label>
                      <input
                        id="del-email"
                        className="input"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="del-password">Password</label>
                      <input
                        id="del-password"
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
                      />
                    </div>

                    {error && (
                      <div className="alert alert-danger" role="alert">
                        {error}
                      </div>
                    )}

                    <Button variant="primary" block type="submit" disabled={busy}>
                      {busy ? 'Signing in…' : 'Sign in to continue'}
                    </Button>
                  </form>
                </div>
              )}

              <div className="row-between">
                <Link to="/privacy" className="link-button tiny">
                  Privacy Policy
                </Link>
                <Link to="/" className="link-button tiny">
                  Back to Aria
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
