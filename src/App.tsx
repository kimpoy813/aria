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
            className="avatar-button"
            aria-label="Account"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </button>
        ) : null}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={user?.name || 'Account'}>
        <div className="stack">
          {user?.email && <div className="small">{user.email}</div>}

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
            <span className="label">Theme</span>
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
              How Aria works
            </Button>
            <Button
              variant="danger"
              block
              onClick={async () => {
                setMenuOpen(false);
                await signOut();
              }}
            >
              Sign out
            </Button>
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
  const { loading, user, onboarded, popupStatus } = useStore();
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
      <ScrollToTop />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
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
