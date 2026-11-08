import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store';
import { Icon, IconButton } from './components/ui';
import { LogoHero, Wordmark } from './components/Logo';
import { Landing } from './pages/Landing';
import { SongsPage } from './pages/SongsPage';
import { SongFormPage } from './pages/SongFormPage';
import { SongDetailPage } from './pages/SongDetailPage';
import { LineupsPage } from './pages/LineupsPage';
import { BuilderPage } from './pages/BuilderPage';
import { TeamsPage } from './pages/TeamsPage';
import { LineupViewPage } from './pages/LineupViewPage';
import { SharedPage } from './pages/SharedPage';

function TopBar() {
  const { theme, toggleTheme, user } = useStore();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Wordmark />
        <div className="push" />
        {user ? (
          <span className="chip" title={user.name} style={{ maxWidth: 120 }}>
            <span className="truncate">{user.name}</span>
          </span>
        ) : null}
        <IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
          {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
        </IconButton>
      </div>
    </header>
  );
}

const TABS = [
  { to: '/', label: 'Songs', icon: Icon.Note },
  { to: '/lineups', label: 'Lineups', icon: Icon.List },
  { to: '/teams', label: 'Teams', icon: Icon.Users },
];

function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TABS.map((tab) => {
          const active = tab.to === '/' ? pathname === '/' || pathname.startsWith('/songs') : pathname.startsWith(tab.to);
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.to}
              type="button"
              className={`tab ${active ? 'active' : ''}`}
              onClick={() => navigate(tab.to)}
              aria-current={active ? 'page' : undefined}
            >
              <TabIcon size={21} />
              {tab.label}
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
  const { loading, user } = useStore();
  const { pathname } = useLocation();

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
            <LogoHero size={52} />
            <p className="small">Tuning up…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Landing />;

  return (
    <div className="app">
      <TopBar />
      <ScrollToTop />
      <main className={`app-main ${pathname.startsWith('/s/') ? 'no-nav' : ''}`}>
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
