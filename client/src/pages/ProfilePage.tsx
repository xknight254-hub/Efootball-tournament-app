import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTelegram } from '../context/TelegramContext';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';

export function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading, updateUser } = useAuth();
  const { isInTelegram, telegramUser, telegramInitData, showAlert } = useTelegram();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', firstName: '', lastName: '' });

  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Admin code redemption
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');

  // Telegram linking
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [telegramLinkMsg, setTelegramLinkMsg] = useState('');

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
        setRedeemMsg('Success! You are now an admin!');
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

  const handleAvatarUpload = async (file: File) => {
    setAvatarUploading(true);
    setAvatarMsg('');
    try {
      // Show instant preview
      const reader = new FileReader();
      reader.onload = (e) => setAvatarPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      const result = await api.images.uploadAvatar(file);
      updateUser({ ...user!, avatarUrl: result.url });
      setAvatarMsg('✅ Avatar updated!');
      setTimeout(() => setAvatarMsg(''), 3000);
    } catch (err: any) {
      setAvatarMsg(err.error || 'Failed to upload avatar');
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleAvatarUpload(file);
    }
  };

  // ─── Telegram Linking ─────────────────────────────────────────
  const handleLinkTelegram = async () => {
    if (!telegramInitData) {
      showAlert('Please open this app from Telegram to link your account.');
      return;
    }
    if (user?.telegramId) {
      showAlert('Your account is already linked to a Telegram account.');
      return;
    }
    setLinkingTelegram(true);
    setTelegramLinkMsg('');
    try {
      const result = await api.auth.linkTelegram(telegramInitData);
      if (result.success) {
        updateUser(result.user);
        setTelegramLinkMsg('✅ Telegram account linked successfully!');
        setTimeout(() => setTelegramLinkMsg(''), 5000);
      }
    } catch (err: any) {
      setTelegramLinkMsg(err.error || 'Failed to link Telegram');
    } finally {
      setLinkingTelegram(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!user?.telegramId) return;
    try {
      await api.auth.unlinkTelegram();
      updateUser({ ...user, telegramId: undefined, telegramUsername: undefined });
      setTelegramLinkMsg('🔓 Telegram account unlinked.');
      setTimeout(() => setTelegramLinkMsg(''), 3000);
    } catch (err: any) {
      setTelegramLinkMsg(err.error || 'Failed to unlink');
    }
  };

  if (authLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!user) return null;

  const isAdmin = user.isAdmin || user.isSuperAdmin;
  const canRedeem = !isAdmin && !user.isSuperAdmin;

  const displayAvatar = avatarPreview || user.avatarUrl;
  const initials = user.username.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: User Card */}
        <div className="md:col-span-1">
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Avatar with drag-drop */}
            <div
              className="relative mx-auto group"
              style={{ width: '120px', height: '120px' }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Avatar Display */}
              <div
                className="w-full h-full rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-bold transition-all"
                style={{
                  background: displayAvatar ? 'transparent' : 'linear-gradient(135deg, #F97316, #F59E0B)',
                  border: `3px solid ${isDragging ? '#F97316' : 'rgba(249,115,22,0.3)'}`,
                  boxShadow: isDragging ? '0 0 20px rgba(249,115,22,0.4)' : 'none',
                }}
              >
                {displayAvatar ? (
                  <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span style={{ fontSize: '2.5rem' }}>{initials}</span>
                )}
              </div>

              {/* Hover overlay */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{ background: 'rgba(0,0,0,0.6)' }}
                onClick={() => avatarInputRef.current?.click()}
              >
                <div className="text-center">
                  <div className="text-xs text-white font-medium">Change</div>
                  <div className="text-[10px] text-white/70">or drop</div>
                </div>
              </div>

              {/* Drag overlay */}
              {isDragging && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.3)', border: '2px dashed #F97316' }}>
                  <span className="text-white text-xs font-bold">Drop here</span>
                </div>
              )}

              {/* Upload spinner */}
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
            </div>

            {/* Upload button */}
            <div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="text-xs px-4 py-1.5 rounded-lg transition-all"
                style={{
                  background: 'rgba(249,115,22,0.1)',
                  border: '1px solid rgba(249,115,22,0.3)',
                  color: '#fdba74',
                }}
              >
                Upload Avatar
              </button>
            </div>

            {/* Avatar status message */}
            {avatarMsg && (
              <div className="text-xs py-1.5 px-3 rounded-lg" style={{
                background: avatarMsg.includes('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: avatarMsg.includes('✅') ? '#4ade80' : '#f87171',
              }}>
                {avatarMsg}
              </div>
            )}

            {/* User info */}
            <div>
              <h3 className="text-lg font-semibold text-white" style={{ marginTop: '4px' }}>{user.username}</h3>
              <p className="text-[var(--color-text-muted)] text-sm mb-3">{user.email}</p>
            </div>

            <div className="flex flex-wrap gap-1 justify-center mb-3">
              {user.isSuperAdmin && <Badge variant="disputed" style={{ marginTop: '4px' }}>Super Admin</Badge>}
              {user.isAdmin && !user.isSuperAdmin && <Badge variant="open" style={{ marginTop: '4px' }}>Admin</Badge>}
              {!isAdmin && <Badge variant="completed" style={{ marginTop: '4px' }}>Player</Badge>}
            </div>
            <div className="h-px" style={{ background: 'var(--color-border)', marginTop: '4px' }} />
            <div className="space-y-2 text-sm" style={{ marginTop: '4px' }}>
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
              <h3 className="text-base font-semibold text-white mb-1">Request Admin Access</h3>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                Have an admin code? Enter it below to become an admin and create tournaments.
              </p>

              {redeemMsg && (
                <div className="mb-3 p-2.5 rounded-lg text-xs" style={{
                  background: redeemMsg.startsWith('Success') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: redeemMsg.startsWith('Success') ? '#4ade80' : '#f87171',
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

          {/* Telegram Account Linking */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: isInTelegram ? '1px solid rgba(0,136,204,0.3)' : '1px solid rgba(100,100,100,0.2)' }}>
            <h3 className="text-base font-semibold text-white mb-1">
              📱 Telegram {!isInTelegram && <span className="text-xs font-normal text-[var(--color-text-muted)]">(open from Telegram to link)</span>}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              {user?.telegramId
                ? `Linked: @${user.telegramUsername || 'telegram'}`
                : 'Connect your Telegram account for one-tap login, match notifications, and tournament updates via bot.'}
            </p>

            {telegramLinkMsg && (
              <div className="mb-3 p-2.5 rounded-lg text-xs" style={{
                background: telegramLinkMsg.includes('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: telegramLinkMsg.includes('✅') ? '#4ade80' : '#f87171',
              }}>
                {telegramLinkMsg}
              </div>
            )}

            {isInTelegram && !user?.telegramId && (
              <div className="flex items-center gap-3 p-3 rounded-lg mb-3" style={{ background: 'rgba(0,136,204,0.05)', border: '1px solid rgba(0,136,204,0.15)' }}>
                {telegramUser?.photo_url && (
                  <img src={telegramUser.photo_url} alt="" className="w-10 h-10 rounded-full" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{telegramUser?.first_name} {telegramUser?.last_name}</p>
                  {telegramUser?.username && <p className="text-xs text-[var(--color-text-muted)]">@{telegramUser.username}</p>}
                  {telegramUser?.is_premium && <Badge variant="disputed" className="text-[10px]">Premium</Badge>}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!user?.telegramId ? (
                <Button
                  variant="primary"
                  onClick={handleLinkTelegram}
                  isLoading={linkingTelegram}
                  disabled={!isInTelegram || !telegramInitData}
                >
                  {linkingTelegram ? 'Linking...' : '🔗 Link Telegram Account'}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleUnlinkTelegram}
                  className="!text-red-400 hover:!text-red-300"
                >
                  Unlink Telegram
                </Button>
              )}
              {isInTelegram && user?.telegramId && (
                <div className="flex items-center gap-1.5 text-xs text-[#4ade80]">
                  <span className="w-2 h-2 rounded-full bg-[#4ade80] inline-block" />
                  Connected via Telegram
                </div>
              )}
            </div>
          </div>

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
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}><span className="text-sm font-bold text-[#F59E0B]">SA</span></div>
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
