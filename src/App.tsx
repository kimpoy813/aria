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
import { Button, Icon, IconButton, Sheet } from './components/ui';
import type { IconName } from './components/Icon';
import { LogoHero, Wordmark } from './components/Logo';
import {
  AuthPage,
  GooglePopupStartPage,
  PopupStatusPage,
  ResetPasswordPage,
} from './pages/AuthPage';
import { SongsPage } from './pages/SongsPage';
import { SongFormPage } from './pages/SongFormPage';
import { SongDetailPage } from './pages/SongDetailPage';
import { LineupsPage } from './pages/LineupsPage';
import { BuilderPage } from './pages/BuilderPage';
import { TeamsPage } from './pages/TeamsPage';
import { LineupViewPage } from './pages/LineupViewPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SharedPage } from './pages/SharedPage';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Songs', icon: 'songs' },
  { to: '/lineups', label: 'Lineups', icon: 'lineup' },
  { to: '/teams', label: 'Teams', icon: 'teams' },
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

function isTabActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' || pathname.startsWith('/songs') : pathname.startsWith(to);
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
    config,
  } = useStore();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const counts: Record<string, number> = {
    '/': songs.length,
    '/lineups': lineups.length,
    '/teams': teams.length,
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          type="button"
          className="brand-home"
          onClick={() => navigate('/')}
          aria-label="Aria home"
        >
          <Wordmark size={30} />
        </button>

        <nav className="desktop-nav" aria-label="Primary">
          {TABS.map((tab) => {
            const active = isTabActive(pathname, tab.to);
            const count = counts[tab.to] ?? 0;
            return (
              <button
                key={tab.to}
                type="button"
                className={`desktop-tab ${active ? 'active' : ''}`}
                onClick={() => navigate(tab.to)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={tab.icon} size={16} />
                <span>{tab.label}</span>
                {count > 0 && <span className="nav-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="push" />

        <IconButton
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
        </IconButton>

        {user ? (
          <button
            type="button"
            className="avatar-button"
            aria-label="Account and settings"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </button>
        ) : null}
      </div>

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Account & workspace"
        subtitle="Manage your profile, appearance, and session."
      >
        <div className="stack">
          {user && (
            <div className="account-profile">
              <div className="account-avatar-lg">{user.name.slice(0, 1).toUpperCase()}</div>
              <div className="account-meta">
                <div className="account-name">{user.name}</div>
                {user.email && <div className="small">{user.email}</div>}
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <span className="chip brand">
                    {config.driver === 'supabase' ? 'Cloud sync' : 'Local workspace'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="stat-strip">
            <div className="stat-cell">
              <strong>{songs.length}</strong>
              <span>Songs</span>
            </div>
            <div className="stat-cell">
              <strong>{lineups.length}</strong>
              <span>Lineups</span>
            </div>
            <div className="stat-cell">
              <strong>{teams.length}</strong>
              <span>Teams</span>
            </div>
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

          <div className="stack-sm">
            <Button
              block
              onClick={() => {
                setMenuOpen(false);
                navigate('/onboarding');
              }}
            >
              <Icon name="sparkle" size={16} /> How Aria works
            </Button>
            <Button
              variant="danger"
              block
              onClick={async () => {
                setMenuOpen(false);
                await signOut();
              }}
            >
              <Icon name="logout" size={16} /> Sign out
            </Button>
          </div>
        </div>
      </Sheet>
    </header>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  const { songs, lineups, teams } = useStore();
  const navigate = useNavigate();

  const counts: Record<string, number> = {
    '/': songs.length,
    '/lineups': lineups.length,
    '/teams': teams.length,
  };

  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TABS.map((tab) => {
          const active = isTabActive(pathname, tab.to);
          const count = counts[tab.to] ?? 0;
          return (
            <button
              key={tab.to}
              type="button"
              className={`tab ${active ? 'active' : ''}`}
              onClick={() => navigate(tab.to)}
              aria-current={active ? 'page' : undefined}
            >
              <span className="tab-icon-wrap">
                <Icon name={tab.icon} size={20} />
                {count > 0 && <span className="tab-badge">{count}</span>}
              </span>
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
  const { loading, user, onboarded, popupStatus } = useStore();
  const { pathname } = useLocation();

  // OAuth popup entry & completion screens run outside the session gate.
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

  // Password recovery works whether or not a session exists.
  if (pathname === '/reset') {
    return (
      <div className="app">
        <Routes>
          <Route path="/reset" element={<ResetPasswordPage />} />
        </Routes>
      </div>
    );
  }

  // Public share links open for anyone, signed in or not.
  if (pathname.startsWith('/s/')) {
    return (
      <div className="app">
        <Routes>
          <Route path="/s/:token" element={<SharedPage />} />
        </Routes>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app">
        <div className="overlay-center">
          <div className="stack-sm" style={{ alignItems: 'center' }}>
            <LogoHero size={56} />
            <p className="small" style={{ marginTop: 6 }}>
              Tuning your studio…
            </p>
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

  // Onboarding is a dedicated full-screen route, outside the tab shell.
  if (pathname === '/onboarding') {
    return (
      <div className="app">
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage replay />} />
        </Routes>
      </div>
    );
  }

  // First visit after signing in: show the tour before the library.
  if (!onboarded) {
    return (
      <div className="app">
        <OnboardingPage />
      </div>
    );
  }

  const isBuilder =
    pathname === '/lineups/new' || /^\/lineups\/[^/]+\/edit$/.test(pathname);

  return (
    <div className="app">
      <TopBar />
      <ScrollToTop />
      <main className={`app-main ${isBuilder ? 'app-main-wide' : ''}`.trim()}>
        <Routes>
          <Route path="/" element={<SongsPage />} />
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
