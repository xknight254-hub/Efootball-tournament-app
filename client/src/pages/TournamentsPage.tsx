import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, isAuthenticated } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Skeleton, ProgressBar } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Input';
import type { Tournament } from '../api';

interface TournamentImage {
  filename: string;
  url: string;
}

export function TournamentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin || user?.isSuperAdmin;
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [formData, setFormData] = useState({ name: '', description: '', format: 'knockout', maxPlayers: '8', bestOf: '1', prizePool: '', platform: 'efootball', rules: '', groupCount: '2', imageUrl: '' });

  // Image picker state
  const [availableImages, setAvailableImages] = useState<TournamentImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 12;

  const loadTournaments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: any = { limit, offset: page * limit };
      if (filter !== 'all') params.status = filter;
      if (search) params.search = search;
      const data = await api.tournaments.list(params);
      setTournaments(data.tournaments || data || []);
      setTotal(data.total || 0);
    } catch (err: any) { setError(err.error || 'Failed to load'); } finally { setLoading(false); }
  }, [filter, search, page]);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  // Load available images when modal opens
  const loadAvailableImages = async () => {
    try {
      setImagesLoading(true);
      const data = await api.images.listTournamentImages();
      setAvailableImages(data.images || []);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setImagesLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setShowCreate(true);
    setFormData({ name: '', description: '', format: 'knockout', maxPlayers: '8', bestOf: '1', prizePool: '', platform: 'efootball', rules: '', groupCount: '2', imageUrl: '' });
    setSelectedImage('');
    loadAvailableImages();
  };

  const handleImageSelect = (url: string) => {
    setSelectedImage(url);
    setFormData(p => ({ ...p, imageUrl: url }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await api.images.upload(file);
      // Add to available images and select it
      const newImage: TournamentImage = { filename: result.url.split('/').pop() || '', url: result.url };
      setAvailableImages(prev => [...prev, newImage]);
      handleImageSelect(result.url);
    } catch (err: any) {
      setCreateError(err.error || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated()) { navigate('/login'); return; }
    if (!formData.name.trim()) { setCreateError('Name is required'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const payload: any = { name: formData.name, description: formData.description || undefined, format: formData.format, maxPlayers: parseInt(formData.maxPlayers), bestOf: parseInt(formData.bestOf), prizePool: formData.prizePool || undefined, platform: formData.platform, rules: formData.rules || undefined };
      if (formData.format === 'multi_bracket') payload.groupCount = parseInt(formData.groupCount) || 2;
      if (formData.imageUrl) payload.imageUrl = formData.imageUrl;
      const result = await api.tournaments.create(payload);
      setShowCreate(false);
      setFormData({ name: '', description: '', format: 'knockout', maxPlayers: '8', bestOf: '1', prizePool: '', platform: 'efootball', rules: '', groupCount: '2', imageUrl: '' });
      setSelectedImage('');
      navigate(`/tournaments/${result.id}`);
    } catch (err: any) { setCreateError(err.error || 'Failed to create tournament'); } finally { setCreating(false); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tournaments</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Join a tournament and prove your skills</p>
        </div>
        {isAdmin && (
          <Button variant="neon" onClick={handleOpenCreate}>
            + Create Tournament
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {[{ v: 'all', l: 'All' }, { v: 'open', l: 'Open' }, { v: 'in_progress', l: 'Live' }, { v: 'completed', l: 'Completed' }].map(f => (
            <button key={f.v} onClick={() => { setFilter(f.v); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.v ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}
              style={filter === f.v ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' } : { background: 'var(--color-bg-surface)' }}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex-1 max-w-xs">
          <Input placeholder="Search tournaments..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="flex-1 min-w-[280px] h-56" />)}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#f87171' }} className="mb-4">{error}</p>
          <Button variant="outline" onClick={loadTournaments}>Retry</Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && tournaments.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-4xl mb-3">🏟️</div>
          <h3 className="text-lg font-semibold text-white mb-2">No tournaments found</h3>
          <p className="text-[var(--color-text-muted)] mb-6 text-sm">Check back later for new tournaments</p>
        </div>
      )}

      {/* Tournament Grid */}
      {!loading && tournaments.length > 0 && (
        <>
          <div className="flex flex-wrap gap-4">
            {tournaments.map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="flex-1 min-w-[280px] max-w-[calc(33.333%-12px)]">
                <div className="tilt-card h-full relative overflow-hidden rounded-2xl" style={t.imageUrl ? { minHeight: '220px' } : undefined}>
                  {t.imageUrl ? (
                    <>
                      {/* Background Image */}
                      <img
                        src={t.imageUrl}
                        alt={t.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {/* Dark Gradient Overlay */}
                      <div className="absolute inset-0" style={{
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.85) 100%)',
                      }} />
                      {/* Content */}
                      <div className="relative p-5 h-full flex flex-col justify-end" style={{ minHeight: '220px' }}>
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={t.status === 'open' || t.status === 'registration_open' ? 'open' : t.status === 'in_progress' ? 'live' : 'completed'}>
                            {t.status === 'in_progress' ? 'LIVE' : t.status === 'open' || t.status === 'registration_open' ? 'OPEN' : t.status.toUpperCase()}
                          </Badge>
                          <span className="text-white/70 text-xs capitalize">{t.format}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2">{t.name}</h3>
                        <div className="space-y-2 mb-3">
                          <div className="flex justify-between text-xs">
                            <span className="text-white/70">Players</span>
                            <span className="text-white font-medium">{t.participantCount}/{t.maxPlayers}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-white/70">Prize</span>
                            <span className="text-[#22c55e] font-semibold">{t.prizePool || 'N/A'}</span>
                          </div>
                        </div>
                        <ProgressBar value={t.participantCount} max={t.maxPlayers} />
                      </div>
                    </>
                  ) : (
                    <div className="p-5 h-full" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant={t.status === 'open' || t.status === 'registration_open' ? 'open' : t.status === 'in_progress' ? 'live' : 'completed'}>
                          {t.status === 'in_progress' ? 'LIVE' : t.status === 'open' || t.status === 'registration_open' ? 'OPEN' : t.status.toUpperCase()}
                        </Badge>
                        <span className="text-[var(--color-text-dim)] text-xs capitalize">{t.format}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2">{t.name}</h3>
                      {t.description && <p className="text-[var(--color-text-muted)] text-xs mb-3 line-clamp-2">{t.description}</p>}
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--color-text-muted)]">Players</span>
                          <span className="text-white font-medium">{t.participantCount}/{t.maxPlayers}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--color-text-muted)]">Prize</span>
                          <span className="text-[#22c55e] font-semibold">{t.prizePool || 'N/A'}</span>
                        </div>
                      </div>
                      <ProgressBar value={t.participantCount} max={t.maxPlayers} />
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-xs text-[var(--color-text-muted)] px-3">Page {page + 1} of {totalPages}</span>
              <Button variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); }} title="Create Tournament" size="lg">
        <form onSubmit={handleCreate} className="space-y-5">
          {createError && <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>{createError}</div>}
          
          <Input label="Tournament Name *" placeholder="e.g. Friday Night Championship" value={formData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, name: e.target.value }))} required />
          
          <div>
            <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Description</label>
            <textarea className="input-field min-h-[60px] resize-y" placeholder="Describe your tournament..." value={formData.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(p => ({ ...p, description: e.target.value }))} />
          </div>

          {/* Image Picker Section */}
          <div>
            <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">
              Tournament Image
            </label>
            {formData.imageUrl && (
              <div className="relative mb-3 rounded-xl overflow-hidden" style={{ height: '120px' }}>
                <img src={formData.imageUrl} alt="Selected" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setSelectedImage(''); setFormData(p => ({ ...p, imageUrl: '' })); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
            
          {/* Image Grid */}
          {imagesLoading ? (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="w-16 h-14 flex-shrink-0" />
              ))}
            </div>
          ) : availableImages.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-3 max-h-[160px] overflow-y-auto p-1">
              {availableImages.map((img) => (
                <button
                  key={img.filename}
                  type="button"
                  onClick={() => handleImageSelect(img.url)}
                  className={`relative rounded-lg overflow-hidden transition-all aspect-square ${
                    selectedImage === img.url
                      ? 'ring-2 ring-[#6366f1] ring-offset-2 ring-offset-[var(--color-bg)] scale-105'
                      : 'hover:opacity-80'
                  }`}
                >
                  <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                  {selectedImage === img.url && (
                    <div className="absolute inset-0 bg-[#6366f1]/20 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] mb-3">No images available. Upload one below.</div>
            )}

            {/* Upload Button */}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                isLoading={uploadingImage}
              >
                {uploadingImage ? 'Uploading...' : '+ Upload New Image'}
              </Button>
              <span className="text-xs text-[var(--color-text-muted)]">JPG, PNG, WebP (max 5MB)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Format *</label>
              <select className="input-field" value={formData.format} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, format: e.target.value }))}>
                <option value="knockout">🏆 Knockout</option>
                <option value="league">⚽ League (Round Robin)</option>
                <option value="multi_bracket">🎯 Multi-Bracket (Groups + KO)</option>
                <option value="swiss">♟️ Swiss System</option>
              </select>
            </div>
            <Select label="Max Players" value={formData.maxPlayers} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, maxPlayers: e.target.value }))} options={[{ value: '2', label: '2' }, { value: '4', label: '4' }, { value: '8', label: '8' }, { value: '16', label: '16' }, { value: '32', label: '32' }]} />
          </div>

          {formData.format === 'multi_bracket' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <Input label="Number of Groups" type="number" min="2" max="8" value={formData.groupCount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, groupCount: e.target.value }))} />
              <div className="flex items-end pb-1">
                <p className="text-xs text-[var(--color-text-muted)]">Players divided into groups, top finishers advance to knockout</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Match Format" value={formData.bestOf} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, bestOf: e.target.value }))} options={[{ value: '1', label: 'Best of 1' }, { value: '3', label: 'Best of 3' }, { value: '5', label: 'Best of 5' }]} />
            <Input label="Prize Pool" placeholder="e.g. $100" value={formData.prizePool} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, prizePool: e.target.value }))} />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Rules (Optional)</label>
            <textarea className="input-field min-h-[50px] resize-y text-sm" placeholder="Tournament rules, settings, etc..." value={formData.rules} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(p => ({ ...p, rules: e.target.value }))} />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="neon" className="flex-1" isLoading={creating}>{creating ? 'Creating...' : 'Create Tournament'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
