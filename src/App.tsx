import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { StoreProvider, useStore, type ThemePreference } from './lib/store';
import { Button, Chip, Icon, IconButton, Sheet } from './components/ui';
import type { IconName } from './components/Icon';
import { LogoHero, Wordmark } from './components/Logo';
import {
  AuthPage,
  GooglePopupStartPage,
  PopupStatusPage,
  ResetPasswordPage,
} from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { SongsPage } from './pages/SongsPage';
import { SongFormPage } from './pages/SongFormPage';
import { SongDetailPage } from './pages/SongDetailPage';
import { LineupsPage } from './pages/LineupsPage';
import { BuilderPage } from './pages/BuilderPage';
import { TeamsPage } from './pages/TeamsPage';
import { LineupViewPage } from './pages/LineupViewPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SharedPage } from './pages/SharedPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { DeleteAccountPage } from './pages/DeleteAccountPage';
import { AdminPage } from './pages/AdminPage';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/songs', label: 'Songs', icon: 'songs' },
  { to: '/lineups', label: 'Lineups', icon: 'lineup' },
  { to: '/teams', label: 'Teams', icon: 'teams' },
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Auto', icon: 'monitor' },
];

function isTabActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

function SystemBanner() {
  const { systemStatus, user } = useStore();
  const m = systemStatus.maintenance;
  if (!m.enabled) return null;

  return (
    <div
      className={`sys-banner ${m.mode === 'maintenance' ? 'sys-banner-warn' : ''}`}
      role="status"
    >
      <div className="row-between" style={{ gap: 8 }}>
        <strong className="sys-banner-title">{m.title || 'System Notice'}</strong>
        {m.mode === 'maintenance' && user?.isAdmin && (
          <span className="tiny">Admin bypass</span>
        )}
        {m.eta && <span className="tiny">{m.eta}</span>}
      </div>
      {m.message && <p className="sys-banner-msg">{m.message}</p>}
    </div>
  );
}

function TopBar() {
  const {
    theme,
    themePreference,
    toggleTheme,
    setThemePreference,
    user,
    songs,
    lineups,
    teams,
    signOut,
  } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          type="button"
          className="brand-home"
          onClick={() => navigate('/')}
          aria-label="Aria home"
        >
          <Wordmark size={26} />
        </button>

        <div className="push" />

        {user?.isAdmin && (
          <button
            type="button"
            className={`admin-pill-btn ${pathname.startsWith('/admin') ? 'active' : ''}`}
            onClick={() => navigate('/admin')}
            aria-label="Admin console"
          >
            <Icon name="shield" size={14} />
            <span>Admin</span>
          </button>
        )}

        <IconButton
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="icon-btn-ghost"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
        </IconButton>

        {user ? (
          <button
            type="button"
            className={`avatar-button ${menuOpen ? 'active' : ''}`}
            aria-label="Account"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            {(user.name?.trim().slice(0, 1) || 'U').toUpperCase()}
          </button>
        ) : null}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Account">
        <div className="stack">
          <div className="account-profile">
            <div className="account-avatar" aria-hidden="true">
              {(user?.name?.trim().slice(0, 1) || 'U').toUpperCase()}
            </div>
            <div className="account-meta">
              <div className="row" style={{ gap: 6 }}>
                <div className="account-name truncate">{user?.name || 'Listener'}</div>
                {user?.isAdmin && <Chip tone="brand">Admin</Chip>}
              </div>
              {user?.email ? (
                <div className="tiny truncate">{user.email}</div>
              ) : (
                <div className="tiny">Signed in</div>
              )}
            </div>
          </div>

          <div className="stat-strip">
            <button
              type="button"
              className="stat-cell"
              onClick={() => {
                setMenuOpen(false);
                navigate('/songs');
              }}
            >
              <strong>{songs.length}</strong>
              <span>Songs</span>
            </button>
            <button
              type="button"
              className="stat-cell"
              onClick={() => {
                setMenuOpen(false);
                navigate('/lineups');
              }}
            >
              <strong>{lineups.length}</strong>
              <span>Lineups</span>
            </button>
            <button
              type="button"
              className="stat-cell"
              onClick={() => {
                setMenuOpen(false);
                navigate('/teams');
              }}
            >
              <strong>{teams.length}</strong>
              <span>Teams</span>
            </button>
          </div>

          <div className="field">
            <span className="label">Appearance</span>
            <div className="seg" role="radiogroup" aria-label="Theme preference">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={themePreference === opt.value}
                  className={themePreference === opt.value ? 'active' : ''}
                  onClick={() => setThemePreference(opt.value)}
                >
                  <Icon name={opt.icon} size={14} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="list-group">
            {user?.isAdmin && (
              <button
                type="button"
                className="list-row"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/admin');
                }}
              >
                <Icon name="shield" size={16} className="muted" />
                <div className="list-row-body">
                  <div className="list-row-title">Admin console</div>
                  <div className="tiny">Statistics, notices &amp; user access</div>
                </div>
                <Icon name="chevronRight" size={16} className="muted" />
              </button>
            )}

            <button
              type="button"
              className="list-row"
              onClick={() => {
                setMenuOpen(false);
                navigate('/onboarding');
              }}
            >
              <Icon name="sparkle" size={16} className="muted" />
              <div className="list-row-body">
                <div className="list-row-title">How Aria works</div>
              </div>
              <Icon name="chevronRight" size={16} className="muted" />
            </button>

            <button
              type="button"
              className="list-row"
              onClick={() => {
                setMenuOpen(false);
                navigate('/privacy');
              }}
            >
              <Icon name="lock" size={16} className="muted" />
              <div className="list-row-body">
                <div className="list-row-title">Privacy policy</div>
              </div>
              <Icon name="chevronRight" size={16} className="muted" />
            </button>
          </div>

          <div className="account-actions">
            <Button
              block
              onClick={async () => {
                setMenuOpen(false);
                await signOut();
              }}
            >
              <Icon name="logout" size={15} /> Sign out
            </Button>
            {user?.id !== 'user_admin' && (
              <button
                type="button"
                className="account-delete-link"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/delete-account');
                }}
              >
                Delete account
              </button>
            )}
          </div>
        </div>
      </Sheet>
    </header>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TABS.map((tab) => {
          const active = isTabActive(pathname, tab.to);
          return (
            <button
              key={tab.to}
              type="button"
              className={`tab ${active ? 'active' : ''}`}
              onClick={() => navigate(tab.to)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={tab.icon} size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function Shell() {
  const { loading, user, onboarded, popupStatus, systemStatus, refresh, signOut } =
    useStore();
  const { pathname } = useLocation();

  if (pathname === '/auth/google') {
    return (
      <Routes>
        <Route path="/auth/google" element={<GooglePopupStartPage />} />
      </Routes>
    );
  }

  if (popupStatus !== 'idle') {
    return <PopupStatusPage />;
  }

  if (pathname === '/reset') {
    return (
      <div className="app">
        <Routes>
          <Route path="/reset" element={<ResetPasswordPage />} />
        </Routes>
      </div>
    );
  }

  if (pathname.startsWith('/s/')) {
    return (
      <div className="app">
        <Routes>
          <Route path="/s/:token" element={<SharedPage />} />
        </Routes>
      </div>
    );
  }

  if (pathname === '/privacy') {
    return (
      <div className="app">
        <Routes>
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </div>
    );
  }

  if (pathname === '/delete-account') {
    return (
      <div className="app">
        <Routes>
          <Route path="/delete-account" element={<DeleteAccountPage />} />
        </Routes>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app">
        <div className="overlay-center">
          <div className="stack-sm" style={{ alignItems: 'center' }}>
            <LogoHero size={48} />
            <p className="tiny">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/forgot" element={<AuthPage mode="forgot" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="*" element={<AuthPage mode="welcome" />} />
      </Routes>
    );
  }

  if (
    !user.isAdmin &&
    systemStatus.maintenance.enabled &&
    systemStatus.maintenance.mode === 'maintenance'
  ) {
    const m = systemStatus.maintenance;
    return (
      <div className="app">
        <TopBar />
        <main className="app-main no-nav" style={{ display: 'grid', alignItems: 'center' }}>
          <div className="card stack" style={{ textAlign: 'center', padding: '24px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <LogoHero size={48} />
            </div>
            <div className="stack-xs">
              <h2>{m.title || 'Scheduled Maintenance'}</h2>
              <p className="small">
                {m.message ||
                  'Aria is temporarily offline for scheduled maintenance. Please check back shortly.'}
              </p>
              {m.eta && <p className="tiny">{m.eta}</p>}
            </div>
            <div className="stack-sm">
              <Button variant="primary" block onClick={() => void refresh()}>
                <Icon name="refresh" size={15} /> Check status
              </Button>
              <Button variant="quiet" block onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pathname === '/onboarding') {
    return (
      <div className="app">
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage replay />} />
        </Routes>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div className="app">
        <OnboardingPage />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <SystemBanner />
      <ScrollToTop />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/songs" element={<SongsPage />} />
          <Route path="/songs/new" element={<SongFormPage />} />
          <Route path="/songs/:id" element={<SongDetailPage />} />
          <Route path="/songs/:id/edit" element={<SongFormPage />} />
          <Route path="/lineups" element={<LineupsPage />} />
          <Route path="/lineups/new" element={<BuilderPage />} />
          <Route path="/lineups/:id" element={<LineupViewPage />} />
          <Route path="/lineups/:id/edit" element={<BuilderPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </BrowserRouter>
  );
}
