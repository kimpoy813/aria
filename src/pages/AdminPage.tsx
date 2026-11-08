import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  BackBar,
  Button,
  Chip,
  Empty,
  Icon,
  IconButton,
  Sheet,
  Switch,
  Toast,
} from '../components/ui';
import { api } from '../lib/api';
import { storeToken } from '../lib/auth';
import { timeAgo } from '../lib/lru';
import { useStore } from '../lib/store';
import type { AdminOverview, AdminUserSummary } from '../lib/types';

type AdminTab = 'stats' | 'notice' | 'users' | 'content';
type ContentKind = 'songs' | 'lineups' | 'teams';
type UserFilter = 'all' | 'admins' | 'suspended';

export function AdminPage() {
  const { user, refresh, refreshSystemStatus } = useStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<AdminTab>('stats');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Announcement / maintenance form state
  const [mEnabled, setMEnabled] = useState(false);
  const [mMode, setMMode] = useState<'info' | 'maintenance'>('info');
  const [mTitle, setMTitle] = useState('Scheduled Maintenance');
  const [mMessage, setMMessage] = useState('');
  const [mEta, setMEta] = useState('');
  const [allowReg, setAllowReg] = useState(true);

  // Users tab state
  const [userQuery, setUserQuery] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);

  // Create user sheet state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  // Admin password sheet state
  const [pwOpen, setPwOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminPwConfirm, setAdminPwConfirm] = useState('');

  // Content tab state
  const [contentKind, setContentKind] = useState<ContentKind>('songs');
  const [contentQuery, setContentQuery] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await api.adminOverview();
      setData(overview);
      setMEnabled(overview.settings.maintenance.enabled);
      setMMode(overview.settings.maintenance.mode);
      setMTitle(overview.settings.maintenance.title || 'Scheduled Maintenance');
      setMMessage(overview.settings.maintenance.message || '');
      setMEta(overview.settings.maintenance.eta || '');
      setAllowReg(overview.settings.allowRegistration);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) {
      void loadOverview();
    }
  }, [user?.isAdmin, loadOverview]);

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = userQuery.trim().toLowerCase();
    return data.users.filter((u) => {
      if (userFilter === 'admins' && !u.isAdmin) return false;
      if (userFilter === 'suspended' && !u.suspended) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    });
  }, [data, userQuery, userFilter]);

  const filteredSongs = useMemo(() => {
    if (!data) return [];
    const q = contentQuery.trim().toLowerCase();
    if (!q) return data.songs;
    return data.songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.ownerName.toLowerCase().includes(q) ||
        (s.theme || '').toLowerCase().includes(q),
    );
  }, [data, contentQuery]);

  const filteredLineups = useMemo(() => {
    if (!data) return [];
    const q = contentQuery.trim().toLowerCase();
    if (!q) return data.lineups;
    return data.lineups.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.ownerName.toLowerCase().includes(q) ||
        (l.theme || '').toLowerCase().includes(q),
    );
  }, [data, contentQuery]);

  const filteredTeams = useMemo(() => {
    if (!data) return [];
    const q = contentQuery.trim().toLowerCase();
    if (!q) return data.teams;
    return data.teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q),
    );
  }, [data, contentQuery]);

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  const saveAnnouncement = async () => {
    setBusy(true);
    try {
      const res = await api.adminUpdateSettings({
        maintenance: {
          enabled: mEnabled,
          mode: mMode,
          title: mTitle.trim() || 'Scheduled Maintenance',
          message: mMessage.trim(),
          eta: mEta.trim(),
        },
        allowRegistration: allowReg,
      });
      if (data) {
        setData({ ...data, settings: res.settings });
      }
      await refreshSystemStatus();
      showToast(mEnabled ? 'Announcement published' : 'Announcement turned off');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setBusy(false);
    }
  };

  const toggleRegistration = async (next: boolean) => {
    setAllowReg(next);
    try {
      const res = await api.adminUpdateSettings({ allowRegistration: next });
      if (data) setData({ ...data, settings: res.settings });
      await refreshSystemStatus();
      showToast(next ? 'Registrations enabled' : 'Registrations paused');
    } catch (err) {
      setAllowReg(!next);
      showToast(err instanceof Error ? err.message : 'Could not update setting');
    }
  };

  const handleUpdateUser = async (
    target: AdminUserSummary,
    patch: { role?: 'user' | 'admin'; suspended?: boolean },
  ) => {
    setBusy(true);
    try {
      await api.adminUpdateUser(target.id, patch);
      await loadOverview();
      setSelectedUser((prev) =>
        prev && prev.id === target.id
          ? {
              ...prev,
              role: patch.role ?? prev.role,
              isAdmin: patch.role ? patch.role === 'admin' : prev.isAdmin,
              suspended:
                patch.role === 'admin'
                  ? false
                  : patch.suspended ?? prev.suspended,
            }
          : prev,
      );
      showToast('User access updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update user');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (target: AdminUserSummary) => {
    setBusy(true);
    try {
      await api.adminDeleteUser(target.id);
      setConfirmDeleteUser(false);
      setSelectedUser(null);
      await loadOverview();
      await refresh();
      showToast('User deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete user');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.adminCreateUser({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      setCreateOpen(false);
      await loadOverview();
      showToast('Account added');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create user');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPw.length < 8) {
      showToast('Use at least 8 characters');
      return;
    }
    if (adminPw !== adminPwConfirm) {
      showToast('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const res = await api.adminSetPassword(adminPw);
      if (res.token) {
        storeToken(res.token);
      }
      setAdminPw('');
      setAdminPwConfirm('');
      setPwOpen(false);
      showToast('Admin password updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteItem = async (kind: ContentKind, id: string) => {
    setBusy(true);
    try {
      if (kind === 'songs') await api.adminDeleteSong(id);
      if (kind === 'lineups') await api.adminDeleteLineup(id);
      if (kind === 'teams') await api.adminDeleteTeam(id);
      await loadOverview();
      await refresh();
      showToast('Removed');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove item');
    } finally {
      setBusy(false);
    }
  };

  const stats = data?.stats;
  const fastPct =
    stats && stats.totalSongs > 0
      ? Math.round((stats.fastSongs / stats.totalSongs) * 100)
      : 50;

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate('/')}
        label="Home"
        right={
          <IconButton
            label="Refresh system data"
            onClick={() => void loadOverview()}
            disabled={loading}
          >
            <Icon name="refresh" size={16} />
          </IconButton>
        }
      />

      <div className="page-head">
        <div className="row" style={{ gap: 8 }}>
          <h1>Admin</h1>
          <Chip tone="brand">System</Chip>
        </div>
        <p>Statistics, maintenance notices, and user access</p>
      </div>

      <div className="seg" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'stats'}
          className={tab === 'stats' ? 'active' : ''}
          onClick={() => setTab('stats')}
        >
          Stats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'notice'}
          className={tab === 'notice' ? 'active' : ''}
          onClick={() => setTab('notice')}
        >
          Notice
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'users'}
          className={tab === 'users' ? 'active' : ''}
          onClick={() => setTab('users')}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'content'}
          className={tab === 'content' ? 'active' : ''}
          onClick={() => setTab('content')}
        >
          System
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="overlay-center" style={{ minHeight: '36vh' }}>
          <span className="tiny">Loading system overview…</span>
        </div>
      ) : data && stats ? (
        <>
          {/* -------------------------------------------------- 1. STATS */}
          {tab === 'stats' && (
            <div className="stack">
              <div className="admin-kpi-grid">
                <button
                  type="button"
                  className="admin-kpi"
                  onClick={() => setTab('users')}
                >
                  <span className="eyebrow">Users</span>
                  <strong>{stats.totalUsers}</strong>
                  <span className="tiny">
                    {stats.activeUsers} active
                    {stats.suspendedUsers > 0 ? ` · ${stats.suspendedUsers} suspended` : ''}
                  </span>
                </button>

                <button
                  type="button"
                  className="admin-kpi"
                  onClick={() => {
                    setContentKind('songs');
                    setTab('content');
                  }}
                >
                  <span className="eyebrow">Songs</span>
                  <strong>{stats.totalSongs}</strong>
                  <span className="tiny">
                    {stats.fastSongs} fast · {stats.slowSongs} slow
                  </span>
                </button>

                <button
                  type="button"
                  className="admin-kpi"
                  onClick={() => {
                    setContentKind('lineups');
                    setTab('content');
                  }}
                >
                  <span className="eyebrow">Lineups</span>
                  <strong>{stats.totalLineups}</strong>
                  <span className="tiny">
                    {stats.totalLineupUses} total shares/uses
                  </span>
                </button>

                <button
                  type="button"
                  className="admin-kpi"
                  onClick={() => {
                    setContentKind('teams');
                    setTab('content');
                  }}
                >
                  <span className="eyebrow">Teams</span>
                  <strong>{stats.totalTeams}</strong>
                  <span className="tiny">
                    {stats.totalTeamMemberships} memberships
                  </span>
                </button>
              </div>

              <div className="card stack-sm">
                <div className="row-between">
                  <span className="label">Catalog tempo balance</span>
                  <span className="tiny">
                    {stats.fastSongs} Fast · {stats.slowSongs} Slow
                  </span>
                </div>
                <div className="tempo-meter" aria-hidden="true">
                  <div
                    className="tempo-meter-fast"
                    style={{ width: `${fastPct}%` }}
                  />
                </div>
                {stats.topThemes.length > 0 && (
                  <div className="stack-xs" style={{ paddingTop: 4 }}>
                    <span className="tiny">Top song classes</span>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      {stats.topThemes.map((t) => (
                        <Chip key={t.theme} tone="brand">
                          {t.theme} · {t.count}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="card stack-sm">
                <span className="label">System status</span>
                <div className="admin-kv">
                  <span>Announcement</span>
                  <Chip tone={data.settings.maintenance.enabled ? 'warn' : undefined}>
                    {data.settings.maintenance.enabled
                      ? data.settings.maintenance.mode === 'maintenance'
                        ? 'Maintenance lockout'
                        : 'Banner active'
                      : 'Off'}
                  </Chip>
                </div>
                <div className="admin-kv">
                  <span>New registrations</span>
                  <Chip tone={data.settings.allowRegistration ? 'brand' : 'warn'}>
                    {data.settings.allowRegistration ? 'Open' : 'Paused'}
                  </Chip>
                </div>
                <div className="admin-kv">
                  <span>Storage / Auth</span>
                  <span className="tiny">
                    {stats.storageDriver} / {stats.authDriver}
                  </span>
                </div>
                <div className="admin-kv">
                  <span>Admin account</span>
                  <span className="tiny">{data.adminEmail}</span>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------- 2. NOTICE */}
          {tab === 'notice' && (
            <div className="stack">
              <div className="card stack">
                <div className="row-between">
                  <div className="stack-xs">
                    <h2>Maintenance &amp; Announcement</h2>
                    <p className="tiny">
                      Broadcast a notice across Aria or pause non-admin access
                    </p>
                  </div>
                  <Switch
                    checked={mEnabled}
                    onChange={setMEnabled}
                    label="Enable maintenance announcement"
                  />
                </div>

                <div className="field">
                  <span className="label">Mode</span>
                  <div className="seg" role="radiogroup" aria-label="Notice mode">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mMode === 'info'}
                      className={mMode === 'info' ? 'active' : ''}
                      onClick={() => setMMode('info')}
                    >
                      Banner notice
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mMode === 'maintenance'}
                      className={mMode === 'maintenance' ? 'active' : ''}
                      onClick={() => setMMode('maintenance')}
                    >
                      Maintenance lockout
                    </button>
                  </div>
                  <span className="tiny">
                    {mMode === 'maintenance'
                      ? 'Non-admin users see a maintenance screen and writes are paused. Admins keep full access.'
                      : 'Shows a banner at the top of Aria for all users while keeping the app open.'}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="m-title">Headline</label>
                  <input
                    id="m-title"
                    className="input"
                    value={mTitle}
                    onChange={(e) => setMTitle(e.target.value)}
                    placeholder="Scheduled Maintenance"
                  />
                </div>

                <div className="field">
                  <label htmlFor="m-msg">Message</label>
                  <textarea
                    id="m-msg"
                    className="textarea"
                    rows={3}
                    value={mMessage}
                    onChange={(e) => setMMessage(e.target.value)}
                    placeholder="We are upgrading Aria and will be right back."
                  />
                </div>

                <div className="field">
                  <label htmlFor="m-eta">Expected completion (optional)</label>
                  <input
                    id="m-eta"
                    className="input"
                    value={mEta}
                    onChange={(e) => setMEta(e.target.value)}
                    placeholder="e.g. Back at 10:00 PM UTC"
                  />
                </div>

                <Button variant="primary" block disabled={busy} onClick={saveAnnouncement}>
                  {busy ? 'Saving…' : 'Save announcement'}
                </Button>
              </div>

              <div className="card stack-sm">
                <div className="row-between">
                  <div className="stack-xs">
                    <h2>New user sign-ups</h2>
                    <p className="tiny">Allow new accounts to register</p>
                  </div>
                  <Switch
                    checked={allowReg}
                    onChange={toggleRegistration}
                    label="Allow new user registrations"
                  />
                </div>
              </div>

              <div className="card stack-sm">
                <div className="row-between">
                  <div className="stack-xs">
                    <h2>System admin credentials</h2>
                    <p className="tiny">{data.adminEmail}</p>
                  </div>
                  <Button onClick={() => setPwOpen(true)}>
                    <Icon name="lock" size={14} /> Password
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------- 3. USERS */}
          {tab === 'users' && (
            <div className="stack-sm">
              <div className="row" style={{ gap: 8 }}>
                <div className="search" style={{ flex: 1 }}>
                  <Icon name="search" size={16} />
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search users…"
                    aria-label="Search users"
                  />
                  {userQuery && (
                    <button
                      type="button"
                      className="search-clear"
                      aria-label="Clear search"
                      onClick={() => setUserQuery('')}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Icon name="add" size={15} /> User
                </Button>
              </div>

              <div className="filter-row">
                {(['all', 'admins', 'suspended'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`filter-pill ${userFilter === f ? 'active' : ''}`}
                    onClick={() => setUserFilter(f)}
                  >
                    {f === 'all'
                      ? `All (${data.users.length})`
                      : f === 'admins'
                        ? `Admins (${stats.adminUsers})`
                        : `Suspended (${stats.suspendedUsers})`}
                  </button>
                ))}
              </div>

              {filteredUsers.length === 0 ? (
                <Empty
                  icon="user"
                  title="No matching users"
                  body="Try a different search or filter."
                />
              ) : (
                <div className="list-group">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="list-row"
                      onClick={() => {
                        setConfirmDeleteUser(false);
                        setSelectedUser(u);
                      }}
                    >
                      <div className="member-avatar">
                        {(u.name?.trim().slice(0, 1) || 'U').toUpperCase()}
                      </div>
                      <div className="list-row-body">
                        <div className="list-row-title truncate">{u.name}</div>
                        <div className="tiny truncate">
                          {u.email || u.id} · {u.songsCount} songs · {u.lineupsCount} lineups
                        </div>
                      </div>
                      <div className="row" style={{ gap: 5, flexShrink: 0 }}>
                        {u.isAdmin && <Chip tone="brand">Admin</Chip>}
                        {u.suspended && <Chip tone="warn">Suspended</Chip>}
                        <Icon name="chevronRight" size={16} className="muted" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------ 4. CONTENT */}
          {tab === 'content' && (
            <div className="stack-sm">
              <div className="seg">
                <button
                  type="button"
                  className={contentKind === 'songs' ? 'active' : ''}
                  onClick={() => setContentKind('songs')}
                >
                  Songs ({data.songs.length})
                </button>
                <button
                  type="button"
                  className={contentKind === 'lineups' ? 'active' : ''}
                  onClick={() => setContentKind('lineups')}
                >
                  Lineups ({data.lineups.length})
                </button>
                <button
                  type="button"
                  className={contentKind === 'teams' ? 'active' : ''}
                  onClick={() => setContentKind('teams')}
                >
                  Teams ({data.teams.length})
                </button>
              </div>

              <div className="search">
                <Icon name="search" size={16} />
                <input
                  value={contentQuery}
                  onChange={(e) => setContentQuery(e.target.value)}
                  placeholder={`Filter ${contentKind}…`}
                  aria-label={`Filter ${contentKind}`}
                />
                {contentQuery && (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="Clear filter"
                    onClick={() => setContentQuery('')}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>

              {contentKind === 'songs' &&
                (filteredSongs.length === 0 ? (
                  <Empty icon="songs" title="No songs" body="No songs in the system yet." />
                ) : (
                  <div className="list-group">
                    {filteredSongs.map((s) => (
                      <div key={s.id} className="list-row" style={{ cursor: 'default' }}>
                        <span className={`tempo-dot ${s.tempo}`} />
                        <div className="list-row-body">
                          <div className="list-row-title truncate">{s.title}</div>
                          <div className="tiny truncate">
                            by {s.ownerName} · {s.partsCount} parts
                            {s.theme ? ` · ${s.theme}` : ''}
                          </div>
                        </div>
                        <IconButton
                          label={`Delete ${s.title}`}
                          className="icon-btn-ghost"
                          disabled={busy}
                          onClick={() => void handleDeleteItem('songs', s.id)}
                        >
                          <Icon name="trash" size={15} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                ))}

              {contentKind === 'lineups' &&
                (filteredLineups.length === 0 ? (
                  <Empty
                    icon="lineup"
                    title="No lineups"
                    body="No lineups in the system yet."
                  />
                ) : (
                  <div className="list-group">
                    {filteredLineups.map((l) => (
                      <div key={l.id} className="list-row" style={{ cursor: 'default' }}>
                        <div className="list-row-body">
                          <div className="list-row-title truncate">{l.name}</div>
                          <div className="tiny truncate">
                            by {l.ownerName} · {l.partsCount} parts · {l.useCount} uses ·{' '}
                            {timeAgo(l.lastUsedAt)}
                          </div>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          {l.shareToken && (
                            <IconButton
                              label="View shared lineup"
                              className="icon-btn-ghost"
                              onClick={() => navigate(`/s/${l.shareToken}`)}
                            >
                              <Icon name="view" size={15} />
                            </IconButton>
                          )}
                          <IconButton
                            label={`Delete ${l.name}`}
                            className="icon-btn-ghost"
                            disabled={busy}
                            onClick={() => void handleDeleteItem('lineups', l.id)}
                          >
                            <Icon name="trash" size={15} />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {contentKind === 'teams' &&
                (filteredTeams.length === 0 ? (
                  <Empty icon="teams" title="No teams" body="No teams in the system yet." />
                ) : (
                  <div className="list-group">
                    {filteredTeams.map((t) => (
                      <div key={t.id} className="list-row" style={{ cursor: 'default' }}>
                        <div className="list-row-body">
                          <div className="list-row-title truncate">{t.name}</div>
                          <div className="tiny truncate">
                            Code {t.code} · {t.membersCount}{' '}
                            {t.membersCount === 1 ? 'member' : 'members'}
                          </div>
                        </div>
                        <IconButton
                          label={`Delete ${t.name}`}
                          className="icon-btn-ghost"
                          disabled={busy}
                          onClick={() => void handleDeleteItem('teams', t.id)}
                        >
                          <Icon name="trash" size={15} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </>
      ) : null}

      {/* User Access Management Sheet */}
      <Sheet
        open={Boolean(selectedUser)}
        onClose={() => {
          setSelectedUser(null);
          setConfirmDeleteUser(false);
        }}
        title={selectedUser?.name || 'User access'}
        subtitle={selectedUser?.email || selectedUser?.id}
      >
        {selectedUser && (
          <div className="stack">
            <div className="stat-strip">
              <div className="stat-cell" style={{ cursor: 'default' }}>
                <strong>{selectedUser.songsCount}</strong>
                <span>Songs</span>
              </div>
              <div className="stat-cell" style={{ cursor: 'default' }}>
                <strong>{selectedUser.lineupsCount}</strong>
                <span>Lineups</span>
              </div>
              <div className="stat-cell" style={{ cursor: 'default' }}>
                <strong>{selectedUser.teamsCount}</strong>
                <span>Teams</span>
              </div>
            </div>

            {selectedUser.isBuiltInAdmin ? (
              <div className="tiny">
                This is Aria’s built-in root administrator account and always retains full
                system access.
              </div>
            ) : selectedUser.id === user.id ? (
              <div className="tiny">
                This is your currently signed-in administrator account.
              </div>
            ) : (
              <>
                <div className="field">
                  <span className="label">Role</span>
                  <div className="seg">
                    <button
                      type="button"
                      className={!selectedUser.isAdmin ? 'active' : ''}
                      disabled={busy}
                      onClick={() => void handleUpdateUser(selectedUser, { role: 'user' })}
                    >
                      Standard user
                    </button>
                    <button
                      type="button"
                      className={selectedUser.isAdmin ? 'active' : ''}
                      disabled={busy}
                      onClick={() => void handleUpdateUser(selectedUser, { role: 'admin' })}
                    >
                      Administrator
                    </button>
                  </div>
                </div>

                {!selectedUser.isAdmin && (
                  <div className="card stack-sm">
                    <div className="row-between">
                      <div className="stack-xs">
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                          {selectedUser.suspended ? 'Access suspended' : 'Active access'}
                        </span>
                        <span className="tiny">
                          {selectedUser.suspended
                            ? 'User cannot sign in or access Aria.'
                            : 'User can sign in and manage songs & lineups.'}
                        </span>
                      </div>
                      <Button
                        variant={selectedUser.suspended ? 'primary' : 'default'}
                        disabled={busy}
                        onClick={() =>
                          void handleUpdateUser(selectedUser, {
                            suspended: !selectedUser.suspended,
                          })
                        }
                      >
                        {selectedUser.suspended ? 'Restore' : 'Suspend'}
                      </Button>
                    </div>
                  </div>
                )}

                {!confirmDeleteUser ? (
                  <Button
                    variant="danger"
                    block
                    disabled={busy}
                    onClick={() => setConfirmDeleteUser(true)}
                  >
                    Delete user &amp; content
                  </Button>
                ) : (
                  <div className="card stack-sm">
                    <p className="small">
                      Permanently delete <strong>{selectedUser.name}</strong> and all of
                      their owned songs and lineups?
                    </p>
                    <div className="row" style={{ gap: 8 }}>
                      <Button
                        onClick={() => setConfirmDeleteUser(false)}
                        style={{ flex: 1 }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => void handleDeleteUser(selectedUser)}
                        style={{ flex: 1 }}
                      >
                        {busy ? 'Deleting…' : 'Confirm delete'}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Sheet>

      {/* Create / Authorize User Sheet */}
      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add user"
        subtitle={
          stats?.authDriver === 'demo'
            ? 'Create a local account and assign its role.'
            : 'Pre-authorize an account email and role.'
        }
      >
        <form className="stack" onSubmit={handleCreateUser}>
          <div className="field">
            <label htmlFor="admin-new-name">Name</label>
            <input
              id="admin-new-name"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="admin-new-email">Email</label>
            <input
              id="admin-new-email"
              className="input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>
          {stats?.authDriver === 'demo' && (
            <div className="field">
              <label htmlFor="admin-new-pw">Password</label>
              <input
                id="admin-new-pw"
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8+ characters"
                required
              />
            </div>
          )}
          <div className="field">
            <span className="label">Role</span>
            <div className="seg">
              <button
                type="button"
                className={newRole === 'user' ? 'active' : ''}
                onClick={() => setNewRole('user')}
              >
                Standard user
              </button>
              <button
                type="button"
                className={newRole === 'admin' ? 'active' : ''}
                onClick={() => setNewRole('admin')}
              >
                Administrator
              </button>
            </div>
          </div>
          <Button variant="primary" block type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </Button>
        </form>
      </Sheet>

      {/* Change Built-in Admin Password Sheet */}
      <Sheet
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Admin password"
        subtitle={`Update password for ${data?.adminEmail || 'admin@aria.app'}`}
      >
        <form className="stack" onSubmit={handleChangeAdminPassword}>
          <div className="field">
            <label htmlFor="adm-pw-1">New password</label>
            <input
              id="adm-pw-1"
              className="input"
              type="password"
              value={adminPw}
              onChange={(e) => setAdminPw(e.target.value)}
              placeholder="8+ characters"
            />
          </div>
          <div className="field">
            <label htmlFor="adm-pw-2">Confirm new password</label>
            <input
              id="adm-pw-2"
              className="input"
              type="password"
              value={adminPwConfirm}
              onChange={(e) => setAdminPwConfirm(e.target.value)}
              placeholder="Repeat password"
            />
          </div>
          <Button variant="primary" block type="submit" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
