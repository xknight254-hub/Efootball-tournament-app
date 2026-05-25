import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import type { Tournament } from '../api';

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', firstName: '', lastName: '' });

  useEffect(() => {
    async function load() {
      try {
        const data = await api.tournaments.list({ limit: 100 });
        setTournaments(data.tournaments || data || []);
        if (user) setFormData({ username: user.username || '', email: user.email || '', firstName: user.firstName || '', lastName: user.lastName || '' });
      } catch { } finally { setLoading(false); }
    }
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true); setSaveMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw await res.json();
      const result = await res.json();
      updateUser(result);
      setSaveMsg('Profile updated!');
      setEditMode(false);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err: any) { setSaveMsg(err.error || 'Failed'); } finally { setSaving(false); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!user) return <div className="text-center py-20"><p className="text-[var(--color-text-muted)] mb-4">Please login</p><Button variant="primary" onClick={() => window.location.href = '/login'}>Login</Button></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="md:col-span-1">
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-lg font-semibold text-white">{user.username}</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-3">{user.email}</p>
            {user.isAdmin && <Badge variant="open" className="mb-3">Admin</Badge>}
            <div className="h-px my-4" style={{ background: 'var(--color-border)' }} />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Member Since</span><span className="text-white">{new Date().toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Tournaments</span><span className="text-[#22c55e] font-bold">{tournaments.length}</span></div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Account Details</h3>
              {!editMode ? <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>Edit</Button> : <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Cancel</Button><Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>Save</Button></div>}
            </div>
            {saveMsg && <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ background: saveMsg.includes('success') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: saveMsg.includes('success') ? '#4ade80' : '#f87171' }}>{saveMsg}</div>}
            {editMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="First Name" value={formData.firstName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, firstName: e.target.value }))} />
                  <Input label="Last Name" value={formData.lastName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, lastName: e.target.value }))} />
                </div>
                <Input label="Username" value={formData.username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, username: e.target.value }))} />
                <Input label="Email" type="email" value={formData.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, email: e.target.value }))} />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {[['Username', user.username], ['Email', user.email], ['Name', `${user.firstName || ''} ${user.lastName || ''}`], ['Role', user.isAdmin ? 'Administrator' : 'Player']].map(([label, value], i) => (
                  <div key={i} className="flex justify-between py-2" style={{ borderBottom: i < 3 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                    <span className="text-[var(--color-text-muted)]">{label}</span>
                    <span className="text-white">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-base font-semibold text-white mb-4">Tournament History</h3>
            {tournaments.length === 0 ? <p className="text-[var(--color-text-muted)] text-center py-6 text-sm">No tournaments yet.</p> : (
              <div className="space-y-2">
                {tournaments.slice(0, 10).map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                    <div><p className="text-white text-sm font-medium">{t.name}</p><p className="text-[var(--color-text-dim)] text-xs capitalize">{t.format} • {t.status}</p></div>
                    <Badge variant={t.status === 'completed' ? 'completed' : t.status === 'in_progress' ? 'live' : 'open'}>{t.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
