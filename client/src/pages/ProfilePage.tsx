import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';

export function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading, updateUser } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', firstName: '', lastName: '' });

  // Admin code redemption
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }
    if (user) {
      setFormData({ username: user.username || '', email: user.email || '', firstName: user.firstName || '', lastName: user.lastName || '' });
    }
  }, [authLoading, isAuthenticated, user, navigate]);

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

  const handleRedeemCode = async () => {
    if (!codeInput.trim()) {
      setRedeemMsg('Please enter a code');
      return;
    }
    if (codeInput.trim().length > 8) {
      setRedeemMsg('Code must be 1-8 characters');
      return;
    }
    setRedeeming(true);
    setRedeemMsg('');
    try {
      const result = await api.redeemCode(codeInput.trim());
      if (result.success) {
        setRedeemMsg('🎉 Congratulations! You are now an admin!');
        updateUser(result.user);
        setCodeInput('');
        setTimeout(() => setRedeemMsg(''), 5000);
      }
    } catch (err: any) {
      setRedeemMsg(err.error || 'Invalid code');
    } finally {
      setRedeeming(false);
    }
  };

  if (authLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!user) return null;

  const isAdmin = user.isAdmin || user.isSuperAdmin;
  const canRedeem = !isAdmin && !user.isSuperAdmin;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: User Card */}
        <div className="md:col-span-1">
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-lg font-semibold text-white">{user.username}</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-3">{user.email}</p>
            <div className="flex flex-wrap gap-1 justify-center mb-3">
              {user.isSuperAdmin && <Badge variant="disputed">Super Admin</Badge>}
              {user.isAdmin && !user.isSuperAdmin && <Badge variant="open">Admin</Badge>}
              {!isAdmin && <Badge variant="completed">Player</Badge>}
            </div>
            <div className="h-px my-4" style={{ background: 'var(--color-border)' }} />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Member Since</span>
                <span className="text-white">{new Date().toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Role</span>
                <span className="font-bold" style={{ color: isAdmin ? '#22c55e' : 'var(--color-text-secondary)' }}>
                  {user.isSuperAdmin ? 'Super Admin' : user.isAdmin ? 'Admin' : 'Player'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Account Details + Code Redemption */}
        <div className="md:col-span-2 space-y-4">
          {/* Account Details */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Account Details</h3>
              {!editMode ? (
                <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>Edit</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>Save</Button>
                </div>
              )}
            </div>
            {saveMsg && (
              <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ background: saveMsg.includes('updated') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: saveMsg.includes('updated') ? '#4ade80' : '#f87171' }}>
                {saveMsg}
              </div>
            )}
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
                {[
                  ['Username', user.username],
                  ['Email', user.email],
                  ['Name', `${user.firstName || ''} ${user.lastName || ''}`.trim() || '—'],
                  ['Role', user.isSuperAdmin ? 'Super Administrator' : user.isAdmin ? 'Administrator' : 'Player'],
                ].map(([label, value], i) => (
                  <div key={i} className="flex justify-between py-2" style={{ borderBottom: i < 3 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                    <span className="text-[var(--color-text-muted)]">{label}</span>
                    <span className="text-white">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Code Redemption — only for non-admins */}
          {canRedeem && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <h3 className="text-base font-semibold text-white mb-1">🔑 Request Admin Access</h3>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                Have an admin code? Enter it below to become an admin and create tournaments.
              </p>

              {redeemMsg && (
                <div className="mb-3 p-2.5 rounded-lg text-xs" style={{
                  background: redeemMsg.includes('🎉') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: redeemMsg.includes('🎉') ? '#4ade80' : '#f87171',
                }}>
                  {redeemMsg}
                </div>
              )}

              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter admin code (e.g. A7X9K2)"
                    value={codeInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCodeInput(e.target.value.toUpperCase())}
                    maxLength={8}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  />
                </div>
                <Button
                  variant="neon"
                  onClick={handleRedeemCode}
                  isLoading={redeeming}
                  disabled={!codeInput.trim()}
                >
                  {redeeming ? 'Checking...' : 'Redeem'}
                </Button>
              </div>
            </div>
          )}

          {/* Admin badge for admins */}
          {isAdmin && !user.isSuperAdmin && (
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="text-2xl">✅</div>
              <div>
                <p className="text-sm font-medium text-[#22c55e]">You are an Admin</p>
                <p className="text-xs text-[var(--color-text-muted)]">You can create and manage tournaments. To grant admin access to others, ask the Super Admin for an admin code.</p>
              </div>
            </div>
          )}

          {/* Super Admin badge */}
          {user.isSuperAdmin && (
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="text-2xl">👑</div>
              <div>
                <p className="text-sm font-medium text-[#fbbf24]">You are the Super Admin</p>
                <p className="text-xs text-[var(--color-text-muted)]">You have full control over the platform. Go to Admin Panel → Admin Codes to generate codes for new admins.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
