import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { WhatsAppAdmin } from '../components/admin/WhatsAppAdmin';
import { BrandStudio } from '../components/admin/BrandStudio';

interface AdminStats {
  stats: { userCount: number; tournamentCount: number; matchCount: number; participantCount: number };
  tournamentsByStatus: { status: string; count: number }[];
  recentUsers: any[];
  recentTournaments: any[];
}

interface AdminUser {
  id: number; username: string; email: string;
  firstName: string | null; lastName: string | null;
  isAdmin: boolean; createdAt: string;
}

interface AdminTournament {
  id: number; name: string; status: string; format: string;
  max_players: number; owner_name: string; participant_count: number; created_at: string;
}

interface AdminLog {
  id: number; admin_id: string; admin_name: string | null;
  action: string; details: string; created_at: string;
}

interface AdminCode {
  id: number; code: string; is_active: number; note: string | null;
  created_at: string; used_at: string | null;
  created_by_name: string | null; used_by_name: string | null;
}

interface CodeStats { total: number; active: number; used: number; deactivated: number; }

type Tab = 'overview' | 'users' | 'tournaments' | 'logs' | 'whatsapp' | 'codes' | 'brand';

export function AdminDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
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

  // Admin Codes state
  const [codes, setCodes] = useState<AdminCode[]>([]);
  const [codeStats, setCodeStats] = useState<CodeStats | null>(null);
  const [genCount, setGenCount] = useState(1);
  const [genLength, setGenLength] = useState(6);
  const [genNote, setGenNote] = useState('');
  const [genError, setGenError] = useState('');
  const [genSuccess, setGenSuccess] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { navigate('/login'); return; }
    if (!isLoading && isAuthenticated && !isAdmin) { navigate('/'); return; }
  }, [isLoading, isAuthenticated, isAdmin, navigate]);

  const showMsg = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) setStats(await res.json());
    } catch { /* */ }
  }, []);

  const fetchUsers = useCallback(async (search = '') => {
    try {
      const url = `/api/admin/users?limit=50&offset=0${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) { const data = await res.json(); setUsers(data.users); setUsersTotal(data.total); }
    } catch { /* */ }
  }, []);

  const fetchTournaments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tournaments?limit=50&offset=0', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) { const data = await res.json(); setTournaments(data.tournaments); setTournamentsTotal(data.total); }
    } catch { /* */ }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/logs?limit=50&offset=0', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) { const data = await res.json(); setLogs(data.logs); setLogsTotal(data.total); }
    } catch { /* */ }
  }, []);

  const fetchCodes = useCallback(async () => {
    try {
      const res = await api.admin.listCodes();
      setCodes(res.codes || []);
      setCodeStats(res.stats || null);
    } catch { /* */ }
  }, []);

  useEffect(() => { if (!isAdmin) return; setLoading(true); fetchStats().finally(() => setLoading(false)); }, [isAdmin, fetchStats]);
  useEffect(() => { if (tab === 'users' && isAdmin) fetchUsers(usersSearch); }, [tab, isAdmin, fetchUsers, usersSearch]);
  useEffect(() => { if (tab === 'tournaments' && isAdmin) fetchTournaments(); }, [tab, isAdmin, fetchTournaments]);
  useEffect(() => { if (tab === 'logs' && isAdmin) fetchLogs(); }, [tab, isAdmin, fetchLogs]);
  useEffect(() => { if (tab === 'codes' && user?.isSuperAdmin) fetchCodes(); }, [tab, user?.isSuperAdmin, fetchCodes]);

  const handleToggleAdmin = async (userId: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ isAdmin: !currentStatus })
      });
      if (res.ok) { showMsg('User updated'); fetchUsers(usersSearch); fetchStats(); }
      else { const err = await res.json(); showMsg(err.error || 'Failed'); }
    } catch { showMsg('Network error'); }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) { showMsg('User deleted'); fetchUsers(usersSearch); fetchStats(); }
    } catch { showMsg('Network error'); }
  };

  const handleDeleteTournament = async (id: number) => {
    if (!confirm('Delete this tournament?')) return;
    try {
      const res = await fetch(`/api/admin/tournaments/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) { showMsg('Tournament deleted'); fetchTournaments(); fetchStats(); }
    } catch { showMsg('Network error'); }
  };

  const handleGenerateCodes = async () => {
    setGenerating(true); setGenError(''); setGenSuccess('');
    try {
      const result = await api.admin.generateCodes(genCount, genLength, genNote);
      if (result.generated?.length > 0) {
        setGenSuccess(`Generated ${result.generated.length} code${result.generated.length > 1 ? 's' : ''}`);
        fetchCodes();
        setGenNote('');
      }
      if (result.errors?.length > 0) setGenError(result.errors.join(', '));
    } catch (err: any) { setGenError(err.error || 'Failed to generate codes'); }
    finally { setGenerating(false); }
  };

  const handleRevokeCode = async (codeId: number) => {
    if (!confirm('Revoke this code? It will no longer be usable.')) return;
    try {
      await api.admin.revokeCode(codeId);
      fetchCodes();
      showMsg('Code revoked');
    } catch (err: any) { showMsg(err.error || 'Failed to revoke'); }
  };

  // Redirects
  if (!isLoading && !isAuthenticated) return <div className="text-center py-20"><p className="text-[var(--color-text-muted)] mb-4">Please login</p><Button variant="primary" onClick={() => navigate('/login')}>Login</Button></div>;
  if (!isLoading && isAuthenticated && !isAdmin) return <div className="text-center py-20"><div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}><span className="text-2xl font-extrabold text-[var(--color-text-dim)]">A</span></div><h2 className="text-lg font-bold text-white mb-2">Admin Access Required</h2><p className="text-sm text-[var(--color-text-muted)]">You do not have permission to view this page.</p></div>;

  const isSuperAdmin = user?.isSuperAdmin;

  const tabs: { key: Tab; label: string; superOnly?: boolean }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: 'Users' },
    { key: 'tournaments', label: 'Tournaments' },
    { key: 'logs', label: 'Logs' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'brand', label: 'Brand Studio' },
    { key: 'codes', label: 'Admin Codes', superOnly: true },
  ];

  const statusColor: Record<string, string> = {
    open: '#22c55e', check_in: '#f59e0b', fixtures_ready: '#3b82f6',
    in_progress: '#F59E0B', completed: '#6b7280', registration_open: '#22c55e'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {isSuperAdmin ? 'Super Admin' : 'Admin'} Dashboard
            </h1>
          <p className="text-[var(--color-text-muted)] text-sm mt-1">
            {isSuperAdmin ? 'Full platform control' : 'Manage users, tournaments, and view logs'}
          </p>
        </div>
        {actionMsg && (
          <div className="px-4 py-2 rounded-lg text-sm" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
            {actionMsg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        {tabs.filter(t => !t.superOnly || isSuperAdmin).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${tab === t.key ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
            style={tab === t.key ? { background: 'rgba(249,115,22,0.15)' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ==================== OVERVIEW ==================== */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Users', value: stats.stats.userCount, color: '#F97316' },
                  { label: 'Tournaments', value: stats.stats.tournamentCount, color: '#22c55e' },
                  { label: 'Matches', value: stats.stats.matchCount, color: '#f59e0b' },
                  { label: 'Participants', value: stats.stats.participantCount, color: '#F59E0B' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <p className="text-2xl font-extrabold text-white tracking-tight">{s.value}</p>
                  </div>
                ))}
              </div>
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
              <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <h3 className="text-sm font-semibold text-white mb-3">Recent Users</h3>
                <div className="space-y-2">
                  {stats.recentUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#F97316' }}>
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
          ) : <p className="text-[var(--color-text-muted)]">Failed to load stats</p>}
        </div>
      )}

      {/* ==================== USERS ==================== */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <input type="text" placeholder="Search users..." value={usersSearch} onChange={e => setUsersSearch(e.target.value)}
              className="input-field pl-10 py-2 text-sm w-full" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{usersTotal} users total</p>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-xl gap-2" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: '#F97316' }}>
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{u.username}</p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {u.isAdmin && <Badge variant="open">Admin</Badge>}
                  <span className="text-xs text-[var(--color-text-dim)] hidden sm:inline">{new Date(u.createdAt).toLocaleDateString()}</span>
                  {u.id !== user?.id && (
                    <>
                      <button onClick={() => handleToggleAdmin(u.id, u.isAdmin)}
                        className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: u.isAdmin ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: u.isAdmin ? '#ef4444' : '#22c55e', border: `1px solid ${u.isAdmin ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}` }}>
                        {u.isAdmin ? 'Demote' : 'Make Admin'}
                      </button>
                      <button onClick={() => handleDeleteUser(u.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                        Delete
                      </button>
                    </>
                  )}
                  {u.id === user?.id && <span className="text-xs text-[var(--color-text-dim)]">You</span>}
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No users found</p>}
          </div>
        </div>
      )}

      {/* ==================== TOURNAMENTS ==================== */}
      {tab === 'tournaments' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">{tournamentsTotal} tournaments total</p>
          <div className="space-y-2">
            {tournaments.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl gap-2" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{t.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${statusColor[t.status] || '#6b7280'}20`, color: statusColor[t.status] || '#6b7280' }}>
                      {t.status}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">{t.format} • {t.participant_count}/{t.max_players} • by {t.owner_name}</span>
                  </div>
                </div>
                <button onClick={() => handleDeleteTournament(t.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                  Delete
                </button>
              </div>
            ))}
            {tournaments.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No tournaments found</p>}
          </div>
        </div>
      )}

      {/* ==================== LOGS ==================== */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">{logsTotal} log entries</p>
          <div className="space-y-2">
            {logs.map(l => (
              <div key={l.id} className="p-3 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0" style={{ background: 'rgba(249,115,22,0.15)', color: '#F97316' }}>{l.action}</span>
                    <span className="text-sm text-white truncate">{l.details}</span>
                  </div>
                  <span className="text-xs text-[var(--color-text-dim)] shrink-0">{new Date(l.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">by {l.admin_name || l.admin_id}</p>
              </div>
            ))}
            {logs.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No logs yet</p>}
          </div>
        </div>
      )}

      {/* ==================== WHATSAPP GATEWAY ==================== */}
      {tab === 'whatsapp' && (
        <WhatsAppAdmin />
      )}

      {/* ==================== BRAND STUDIO ==================== */}
      {tab === 'brand' && (
        <BrandStudio />
      )}

      {/* ==================== ADMIN CODES (SUPER ADMIN ONLY) ==================== */}
      {tab === 'codes' && isSuperAdmin && (
        <div className="space-y-6">
          {/* Generate Codes */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-base font-semibold text-white mb-1">Generate Admin Codes</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Create codes that users can redeem to become admins. Codes are 1-8 characters, alphanumeric.</p>

            {genError && <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>{genError}</div>}
            {genSuccess && <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }}>{genSuccess}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1">Count</label>
                <input type="number" min="1" max="20" value={genCount} onChange={e => setGenCount(parseInt(e.target.value) || 1)}
                  className="input-field text-center text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1">Length</label>
                <select value={genLength} onChange={e => setGenLength(parseInt(e.target.value))} className="input-field text-center text-sm">
                  {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} chars</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1">Note (optional)</label>
                <input type="text" value={genNote} onChange={e => setGenNote(e.target.value)} placeholder="e.g. for John"
                  className="input-field text-sm" maxLength={100} />
              </div>
              <div className="flex items-end">
                <Button variant="neon" onClick={handleGenerateCodes} isLoading={generating} className="w-full">
                  {generating ? 'Generating...' : 'Generate'}
                </Button>
              </div>
            </div>

            {/* Recently generated codes display */}
            {genSuccess && codes.length > 0 && (
              <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Recently generated codes:</p>
                <div className="flex flex-wrap gap-2">
                  {codes.slice(-20).filter(c => !c.used_by_name && c.is_active).map(c => (
                    <code key={c.id} className="px-2 py-1 rounded text-xs font-mono font-bold"
                      style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
                      {c.code}
                      {c.note && <span className="font-normal text-[var(--color-text-dim)] ml-1">({c.note})</span>}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Codes List */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-base font-semibold text-white">All Codes</h3>
              {codeStats && (
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                    {codeStats.active} active
                  </span>
                  <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.1)', color: '#F97316' }}>
                    {codeStats.used} used
                  </span>
                  {codeStats.deactivated > 0 && (
                    <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(113,113,122,0.1)', color: '#71717a' }}>
                      {codeStats.deactivated} revoked
                    </span>
                  )}
                </div>
              )}
            </div>

            {codes.length === 0 ? (
              <p className="text-center text-[var(--color-text-muted)] py-8">No codes generated yet</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {codes.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg gap-2"
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: `1px solid ${c.used_by_name ? 'rgba(249,115,22,0.2)' : c.is_active ? 'var(--color-border-subtle)' : 'rgba(113,113,122,0.15)'}`,
                      opacity: c.is_active === 0 ? 0.5 : 1,
                    }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <code className="text-sm font-mono font-bold px-2 py-0.5 rounded"
                        style={{
                          background: c.used_by_name ? 'rgba(249,115,22,0.15)' : 'rgba(34,197,94,0.1)',
                          color: c.used_by_name ? '#fb923c' : '#22c55e',
                        }}>
                        {c.code}
                      </code>
                      <div className="text-xs min-w-0">
                        {c.note && <span className="text-[var(--color-text-secondary)]">{c.note}</span>}
                        {c.used_by_name && (
                          <span className="text-[var(--color-text-muted)] block">Used by <strong className="text-[#fb923c]">{c.used_by_name}</strong> {c.used_at && new Date(c.used_at).toLocaleDateString()}</span>
                        )}
                        {!c.used_by_name && c.is_active && (
                          <span className="text-[var(--color-text-dim)]">Unused • Created {new Date(c.created_at).toLocaleDateString()}</span>
                        )}
                        {c.is_active === 0 && <span className="text-[#ef4444]">Revoked</span>}
                      </div>
                    </div>
                    {c.is_active === 1 && !c.used_by_name && (
                      <button onClick={() => handleRevokeCode(c.id)}
                        className="px-2 py-1 rounded text-xs font-medium shrink-0"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                        Revoke
                      </button>
                    )}
                    {c.used_by_name && <Badge variant="open" className="shrink-0">Used</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
