import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';

interface AdminStats {
  stats: {
    userCount: number;
    tournamentCount: number;
    matchCount: number;
    participantCount: number;
  };
  tournamentsByStatus: { status: string; count: number }[];
  recentUsers: any[];
  recentTournaments: any[];
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  createdAt: string;
}

interface AdminTournament {
  id: number;
  name: string;
  status: string;
  format: string;
  max_players: number;
  owner_name: string;
  participant_count: number;
  created_at: string;
}

interface AdminLog {
  id: number;
  admin_id: string;
  admin_name: string | null;
  action: string;
  details: string;
  created_at: string;
}

type Tab = 'overview' | 'users' | 'tournaments' | 'logs';

export function AdminDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'users' | 'tournaments' | 'logs'>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState('');
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [tournamentsTotal, setTournamentsTotal] = useState(0);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [actionMsg, setActionMsg] = useState('');

  const isAdmin = user?.isAdmin;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!isLoading && isAuthenticated && !isAdmin) {
      navigate('/');
      return;
    }
  }, [isLoading, isAuthenticated, isAdmin, navigate]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchUsers = useCallback(async (search = '') => {
    try {
      const url = `/api/admin/users?limit=50&offset=0${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setUsersTotal(data.total);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchTournaments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tournaments?limit=50&offset=0', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTournaments(data.tournaments);
        setTournamentsTotal(data.total);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/logs?limit=50&offset=0', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setLogsTotal(data.total);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    fetchStats().finally(() => setLoading(false));
  }, [isAdmin, fetchStats]);

  useEffect(() => {
    if (tab === 'users' && isAdmin) fetchUsers(usersSearch);
  }, [tab, isAdmin, fetchUsers, usersSearch]);

  useEffect(() => {
    if (tab === 'tournaments' && isAdmin) fetchTournaments();
  }, [tab, isAdmin, fetchTournaments]);

  useEffect(() => {
    if (tab === 'logs' && isAdmin) fetchLogs();
  }, [tab, isAdmin, fetchLogs]);

  const handleToggleAdmin = async (userId: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ isAdmin: !currentStatus })
      });
      if (res.ok) {
        setActionMsg('User updated');
        fetchUsers(usersSearch);
        fetchStats();
      } else {
        const err = await res.json();
        setActionMsg(err.error || 'Failed');
      }
    } catch { setActionMsg('Network error'); }
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setActionMsg('User deleted');
        fetchUsers(usersSearch);
        fetchStats();
      }
    } catch { setActionMsg('Network error'); }
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleDeleteTournament = async (id: number) => {
    if (!confirm('Delete this tournament?')) return;
    try {
      const res = await fetch(`/api/admin/tournaments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setActionMsg('Tournament deleted');
        fetchTournaments();
        fetchStats();
      }
    } catch { setActionMsg('Network error'); }
    setTimeout(() => setActionMsg(''), 3000);
  };

  // Redirect if not admin
  if (!isLoading && !isAuthenticated) return <div className="text-center py-20"><p className="text-[var(--color-text-muted)] mb-4">Please login</p><Button variant="primary" onClick={() => navigate('/login')}>Login</Button></div>;
  if (!isLoading && isAuthenticated && !isAdmin) return <div className="text-center py-20"><p className="text-4xl mb-4">🛡️</p><h2 className="text-xl font-bold text-white mb-2">Admin Access Required</h2><p className="text-[var(--color-text-muted)]">You don't have permission to view this page.</p></div>;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'tournaments', label: 'Tournaments', icon: '🏆' },
    { key: 'logs', label: 'Logs', icon: '📋' },
  ];

  const statusColor: Record<string, string> = {
    open: '#22c55e', check_in: '#f59e0b', fixtures_ready: '#3b82f6',
    in_progress: '#8b5cf6', completed: '#6b7280', registration_open: '#22c55e'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🛡️ Admin Dashboard
          </h1>
          <p className="text-[var(--color-text-muted)] text-sm mt-1">Manage users, tournaments, and view logs</p>
        </div>
        {actionMsg && (
          <div className="px-4 py-2 rounded-lg text-sm" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
            {actionMsg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
            style={tab === t.key ? { background: 'rgba(99,102,241,0.15)' } : {}}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : stats ? (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Users', value: stats.stats.userCount, icon: '👥', color: '#6366f1' },
                  { label: 'Tournaments', value: stats.stats.tournamentCount, icon: '🏆', color: '#22c55e' },
                  { label: 'Matches', value: stats.stats.matchCount, icon: '⚔️', color: '#f59e0b' },
                  { label: 'Participants', value: stats.stats.participantCount, icon: '🎮', color: '#8b5cf6' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{s.icon}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${s.color}15`, color: s.color }}>{s.label}</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Tournaments by Status */}
              <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <h3 className="text-sm font-semibold text-white mb-3">Tournaments by Status</h3>
                <div className="flex flex-wrap gap-2">
                  {stats.tournamentsByStatus.map(s => (
                    <span key={s.status} className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: `${statusColor[s.status] || '#6b7280'}20`, color: statusColor[s.status] || '#6b7280' }}>
                      {s.status}: {s.count}
                    </span>
                  ))}
                  {stats.tournamentsByStatus.length === 0 && <span className="text-[var(--color-text-muted)] text-sm">No tournaments yet</span>}
                </div>
              </div>

              {/* Recent Users */}
              <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <h3 className="text-sm font-semibold text-white mb-3">Recent Users</h3>
                <div className="space-y-2">
                  {stats.recentUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium">{u.username}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.is_admin === 1 && <Badge variant="open">Admin</Badge>}
                        <span className="text-xs text-[var(--color-text-dim)]">{new Date(u.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-[var(--color-text-muted)]">Failed to load stats</p>
          )}
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search users..."
              value={usersSearch}
              onChange={e => setUsersSearch(e.target.value)}
              className="input-field pl-10 py-2 text-sm w-full max-w-sm"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{usersTotal} users total</p>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{u.username}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {u.isAdmin && <Badge variant="open">Admin</Badge>}
                  <span className="text-xs text-[var(--color-text-dim)]">{new Date(u.createdAt).toLocaleDateString()}</span>
                  {u.id !== user?.id && (
                    <>
                      <button
                        onClick={() => handleToggleAdmin(u.id, u.isAdmin)}
                        className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: u.isAdmin ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: u.isAdmin ? '#ef4444' : '#22c55e', border: `1px solid ${u.isAdmin ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}` }}
                      >
                        {u.isAdmin ? 'Demote' : 'Make Admin'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No users found</p>}
          </div>
        </div>
      )}

      {/* Tournaments Tab */}
      {tab === 'tournaments' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">{tournamentsTotal} tournaments total</p>
          <div className="space-y-2">
            {tournaments.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p className="text-sm text-white font-medium">{t.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${statusColor[t.status] || '#6b7280'}20`, color: statusColor[t.status] || '#6b7280' }}>
                      {t.status}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">{t.format} • {t.participant_count}/{t.max_players} players • by {t.owner_name}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTournament(t.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  Delete
                </button>
              </div>
            ))}
            {tournaments.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No tournaments found</p>}
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">{logsTotal} log entries</p>
          <div className="space-y-2">
            {logs.map(l => (
              <div key={l.id} className="p-3 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>
                      {l.action}
                    </span>
                    <span className="text-sm text-white">{l.details}</span>
                  </div>
                  <span className="text-xs text-[var(--color-text-dim)]">{new Date(l.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">by {l.admin_name || l.admin_id}</p>
              </div>
            ))}
            {logs.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No logs yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}
