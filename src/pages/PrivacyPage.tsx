import { Link, useNavigate } from 'react-router-dom';
import { Wordmark } from '../components/Logo';
import { Button, Icon, IconButton } from '../components/ui';
import { useStore } from '../lib/store';

export function PrivacyPage() {
  const { theme, toggleTheme, user } = useStore();
  const navigate = useNavigate();

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
            <h1>Privacy Policy</h1>
            <p>Last updated: November 8, 2026</p>
          </div>

          <div className="card stack-sm">
            <h2>1. Overview</h2>
            <p className="small">
              Aria provides a minimalist mobile song library, automatic lyric section
              classification, team collaboration, and least-recently-used (LRU) setlist
              rotation. Aria contains no advertisements, no third-party ad trackers, and never
              sells your personal information.
            </p>
          </div>

          <div className="card stack-sm">
            <h2>2. Information We Collect</h2>
            <p className="small">
              <strong>Account details:</strong> When you register with email and password or
              sign in with Google, we store your display name, email address, and unique
              account identifier.
            </p>
            <p className="small">
              <strong>User-created content:</strong> We store the songs, lyric sections,
              thematic classifications, lineups, usage timestamps, and team memberships you
              create inside Aria.
            </p>
          </div>

          <div className="card stack-sm">
            <h2>3. How Information Is Used</h2>
            <p className="small">
              Your data is used strictly to operate Aria: syncing your personal song library,
              recommending your least recently used lineups, and sharing songs or setlist
              links only when you choose to share them with teammates or via a public share
              URL.
            </p>
          </div>

          <div className="card stack-sm">
            <h2>4. Data Storage &amp; Security</h2>
            <p className="small">
              All network requests between your device and Aria are encrypted in transit over
              HTTPS/TLS. Authentication and cloud database records are hosted on Supabase
              (PostgreSQL) with Row Level Security enabled.
            </p>
          </div>

          <div id="account-deletion" className="card stack-sm">
            <h2>5. Account &amp; Data Deletion</h2>
            <p className="small">
              You may permanently delete your account and all songs, lyrics, lineups, and
              team memberships owned by you at any time by signing in to your account and
              tapping your top-right account avatar (<strong>Account → Delete account</strong>).
              Deleted data is erased immediately with no retention period and cannot be
              recovered.
            </p>
            {user && user.id !== 'user_admin' && (
              <div>
                <Link
                  to="/delete-account"
                  className="btn"
                  style={{ textDecoration: 'none', marginTop: 4 }}
                >
                  Delete account
                </Link>
              </div>
            )}
          </div>

          <div className="card stack-sm">
            <h2>6. Children’s Privacy</h2>
            <p className="small">
              Aria is intended for general audiences aged 13 and older and does not knowingly
              collect personal data from children under 13.
            </p>
          </div>

          <Button block onClick={() => navigate('/')}>
            {user ? 'Back to Aria' : 'Open Aria'}
          </Button>
        </div>
      </main>
    </div>
  );
}
