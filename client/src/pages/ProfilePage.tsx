import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import type { Tournament } from '../api';

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    avatarUrl: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await api.tournaments.list({ limit: 100 });
        setTournaments(data.tournaments || data || []);
        if (user) {
          setFormData({
            username: user.username || '',
            email: user.email || '',
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            avatarUrl: user.avatarUrl || '',
          });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:3001/api') + '/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw await res.json();
      const result = await res.json();
      updateUser(result);
      setSaveMessage('Profile updated successfully!');
      setEditMode(false);
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      setSaveMessage(err.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4">
          <Skeleton variant="title" className="w-48 mb-2" />
          <Skeleton className="h-5 w-64 mb-8" />
          <Skeleton variant="card" className="h-64" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Please login to view your profile</p>
          <Button variant="primary" onClick={() => window.location.href = '/login'}>Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <h1 className="text-3xl font-bold text-white mb-2">Profile</h1>
        <p className="text-gray-400 mb-8">Manage your account and view your tournament history</p>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="md:col-span-1">
            <Card className="text-center">
              <div className="avatar avatar-xl mx-auto mb-4">{user.username.charAt(0).toUpperCase()}</div>
              <h3 className="text-xl font-semibold text-white">{user.username}</h3>
              <p className="text-gray-400 text-sm mb-4">{user.email}</p>
              {user.isAdmin && (
                <Badge variant="open" className="mb-4">Admin</Badge>
              )}

              <div className="h-px bg-dark-700 my-4" />

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Member Since</span>
                  <span className="text-white">{new Date().toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tournaments</span>
                  <span className="text-neon-green font-bold">{tournaments.length}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Details */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Account Details</h3>
                {!editMode ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>Edit</Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>Save</Button>
                  </div>
                )}
              </div>

              {saveMessage && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${saveMessage.includes('success') ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {saveMessage}
                </div>
              )}

              {editMode ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="First Name" value={formData.firstName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, firstName: e.target.value }))} />
                    <Input label="Last Name" value={formData.lastName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, lastName: e.target.value }))} />
                  </div>
                  <Input label="Username" value={formData.username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, username: e.target.value }))} />
                  <Input label="Email" type="email" value={formData.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, email: e.target.value }))} />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-dark-700/50">
                    <span className="text-gray-400">Username</span>
                    <span className="text-white">{user.username}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-dark-700/50">
                    <span className="text-gray-400">Email</span>
                    <span className="text-white">{user.email}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-dark-700/50">
                    <span className="text-gray-400">Name</span>
                    <span className="text-white">{user.firstName || ''} {user.lastName || ''}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-400">Role</span>
                    <span className="text-white">{user.isAdmin ? 'Administrator' : 'Player'}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Tournament History */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Tournament History</h3>
              {tournaments.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No tournaments yet. Join or create one!</p>
              ) : (
                <div className="space-y-2">
                  {tournaments.slice(0, 10).map(t => (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg hover:bg-dark-800 transition-colors">
                      <div>
                        <p className="text-white text-sm font-medium">{t.name}</p>
                        <p className="text-dark-400 text-xs capitalize">{t.format} • {t.status}</p>
                      </div>
                      <Badge
                        variant={t.status === 'completed' ? 'completed' : t.status === 'in_progress' ? 'live' : 'open'}
                      >
                        {t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
