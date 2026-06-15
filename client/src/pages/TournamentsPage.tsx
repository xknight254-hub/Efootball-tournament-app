import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, isAuthenticated } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Input';
import type { Tournament } from '../api';

interface TournamentImage {
  filename: string;
  url: string;
}

const formatLabel = (f: string) => {
  const map: Record<string, string> = {
    knockout: 'Knockout',
    league: 'League',
    multi_bracket: 'Multi-Bracket',
    swiss: 'Swiss',
  };
  return map[f] || f;
};

const formatChipColor = (f: string) => {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    knockout: { bg: 'rgba(249,115,22,0.15)', text: '#FB923C', border: 'rgba(249,115,22,0.25)' },
    league: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA', border: 'rgba(59,130,246,0.25)' },
    multi_bracket: { bg: 'rgba(168,85,247,0.15)', text: '#C084FC', border: 'rgba(168,85,247,0.25)' },
    swiss: { bg: 'rgba(20,184,166,0.15)', text: '#2DD4BF', border: 'rgba(20,184,166,0.25)' },
  };
  return map[f] || map.knockout;
};

const avatarColors = [
  'linear-gradient(135deg,#F97316,#FB923C)',
  'linear-gradient(135deg,#3B82F6,#60A5FA)',
  'linear-gradient(135deg,#22C55E,#4ADE80)',
  'linear-gradient(135deg,#A855F7,#C084FC)',
  'linear-gradient(135deg,#EC4899,#F472B6)',
  'linear-gradient(135deg,#F59E0B,#FBBF24)',
  'linear-gradient(135deg,#14B8A6,#2DD4BF)',
  'linear-gradient(135deg,#EF4444,#F87171)',
];

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
  const [formData, setFormData] = useState({
    name: '', description: '', format: 'knockout', maxPlayers: '8',
    bestOf: '1', prizePool: '', platform: 'efootball', rules: '',
    groupCount: '2', imageUrl: '',
  });
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

  const loadAvailableImages = async () => {
    try {
      setImagesLoading(true);
      const data = await api.images.listTournamentImages();
      setAvailableImages(data.images || []);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally { setImagesLoading(false); }
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
      const payload: any = {
        name: formData.name, description: formData.description || undefined,
        format: formData.format, maxPlayers: parseInt(formData.maxPlayers),
        bestOf: parseInt(formData.bestOf), prizePool: formData.prizePool || undefined,
        platform: formData.platform, rules: formData.rules || undefined,
      };
      if (formData.format === 'multi_bracket') payload.groupCount = parseInt(formData.groupCount) || 2;
      if (formData.imageUrl) payload.imageUrl = formData.imageUrl;
      const result = await api.tournaments.create(payload);
      setShowCreate(false);
      navigate(`/tournaments/${result.id}`);
    } catch (err: any) { setCreateError(err.error || 'Failed to create tournament'); } finally { setCreating(false); }
  };

  const totalPages = Math.ceil(total / limit);

  const filters = [
    { v: 'all', l: 'All' },
    { v: 'open', l: 'Open' },
    { v: 'in_progress', l: 'Live' },
    { v: 'completed', l: 'Completed' },
  ];

  return (
    <div className="space-y-5">

      {/* === PAGE HEADER === */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight" style={{ fontFamily: 'Orbitron, sans-serif' }}>Tournaments</h1>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">Compete. Climb. Conquer.</p>
        </div>
        {isAdmin && (
          <Button variant="neon" onClick={handleOpenCreate}>Create Tournament</Button>
        )}
      </div>

      {/* === FILTER PILLS + SEARCH === */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button key={f.v} onClick={() => { setFilter(f.v); setPage(0); }}
              className="filter-pill px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: filter === f.v ? 'rgba(249,115,22,0.12)' : 'rgba(18,18,20,0.6)',
                border: filter === f.v ? '1px solid rgba(249,115,22,0.3)' : '1px solid var(--color-border)',
                color: filter === f.v ? '#F97316' : 'var(--color-text-muted)',
              }}>
              {f.l}
              {f.v === 'all' && <span className="ml-1.5 text-[10px] opacity-60">{total}</span>}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-auto sm:max-w-[280px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="search" placeholder="Search tournaments..."
            className="w-full pl-10 pr-4 py-2.5 rounded-full text-sm transition-all"
            style={{
              background: 'rgba(18,18,20,0.6)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            onFocus={e => { e.target.style.borderColor = 'rgba(249,115,22,0.3)'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.1)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
      </div>

      {/* === LOADING === */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <Skeleton className="h-32 w-full" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === ERROR === */}
      {error && !loading && (
        <div className="rounded-xl p-6 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm mb-3" style={{ color: '#f87171' }}>{error}</p>
          <Button variant="outline" onClick={loadTournaments}>Retry</Button>
        </div>
      )}

      {/* === EMPTY === */}
      {!loading && !error && tournaments.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-4xl font-extrabold text-[var(--color-text-dim)] mb-3">No tournaments yet</div>
          <p className="text-sm text-[var(--color-text-muted)] mb-5">
            {filter !== 'all' ? 'Try a different filter or check back later.' : 'Be the first to create a tournament and start competing.'}
          </p>
          {isAdmin && filter === 'all' && (
            <Button variant="neon" onClick={handleOpenCreate}>Create Tournament</Button>
          )}
        </div>
      )}

      {/* === TOURNAMENT CARDS — LOVABLE PORTRAIT DESIGN === */}
      {!loading && tournaments.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => {
              const chip = formatChipColor(t.format);
              const pct = Math.min(100, (t.participantCount / t.maxPlayers) * 100);
              const isLive = t.status === 'in_progress';
              const isOpen = t.status === 'open' || t.status === 'registration_open';
              const statusLabel = isLive ? 'LIVE' : isOpen ? 'OPEN' : t.status.toUpperCase();

              return (
                <Link key={t.id} to={`/tournaments/${t.id}`}>
                  <div className="tcard group h-full flex flex-col overflow-hidden rounded-2xl transition-all duration-300"
                    style={{
                      background: 'rgba(18,18,20,0.5)',
                      border: '1px solid var(--color-border)',
                    }}>
                    {/* Banner */}
                    <div className="tcard-banner relative h-[130px] flex-shrink-0 overflow-hidden">
                      {t.imageUrl ? (
                        <img src={t.imageUrl} alt={t.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                      ) : (
                        <div className="absolute inset-0" style={{
                          background: `linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)`,
                        }} />
                      )}
                      <div className="absolute inset-0" style={{
                        background: 'linear-gradient(180deg, transparent 0%, rgba(10,10,11,0.4) 50%, rgba(10,10,11,0.85) 100%)',
                      }} />
                      {/* Top chips */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
                        <span className="chip px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                          style={{ background: chip.bg, color: chip.text, border: `1px solid ${chip.border}`, backdropFilter: 'blur(12px)' }}>
                          {formatLabel(t.format)}
                        </span>
                        {isLive ? (
                          <span className="live-badge flex items-center gap-1.5 px-3 py-1 rounded-full"
                            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', backdropFilter: 'blur(12px)' }}>
                            <span className="w-[7px] h-[7px] rounded-full" style={{ background: '#EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.6)', animation: 'neon-pulse 2s ease-in-out infinite' }} />
                            <span className="text-[10px] font-bold text-[#F87171] uppercase tracking-widest">Live</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                            style={{
                              background: isOpen ? 'rgba(34,197,94,0.15)' : 'rgba(113,113,122,0.15)',
                              color: isOpen ? '#4ade80' : '#A1A1AA',
                              border: isOpen ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(113,113,122,0.25)',
                              backdropFilter: 'blur(12px)',
                            }}>
                            {statusLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="text-lg font-bold text-white mb-3 leading-snug line-clamp-1">{t.name}</h3>

                      {/* Meta rows */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                          <svg className="w-[15px] h-[15px] flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Prize Pool <strong className="text-white font-semibold">{t.prizePool || 'N/A'}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                          <svg className="w-[15px] h-[15px] flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span><strong className="text-white font-semibold">{t.participantCount}/{t.maxPlayers}</strong> Players</span>
                        </div>
                        <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                          <svg className="w-[15px] h-[15px] flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{isLive ? <><strong className="text-white font-semibold">Round 3 of 7</strong></> : <><strong className="text-white font-semibold">Starts soon</strong></>}</span>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="mb-4">
                        <div className="flex justify-between text-[10px] font-semibold mb-1.5 uppercase tracking-wider">
                          <span style={{ color: 'var(--color-text-muted)' }}>Slots filled</span>
                          <span style={{ color: 'var(--color-text-muted)' }}>{t.participantCount}/{t.maxPlayers}</span>
                        </div>
                        <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--color-bg-elevated)' }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #F97316, #F59E0B)' }} />
                        </div>
                      </div>

                      {/* Footer: Prize + Avatars */}
                      <div className="flex items-center justify-between pt-3 mt-auto" style={{ borderTop: '1px solid var(--color-border)' }}>
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Prize Pool</div>
                          <div className="text-xl font-extrabold text-[#22c55e] leading-tight">{t.prizePool || 'N/A'}</div>
                        </div>
                        <div className="flex items-center">
                          {Array.from({ length: Math.min(5, t.participantCount) }).map((_, i) => (
                            <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-black"
                              style={{
                                background: avatarColors[i % avatarColors.length],
                                border: '2.5px solid var(--color-bg-card)',
                                marginLeft: i > 0 ? '-9px' : '0',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                              }}>
                              {String.fromCharCode(65 + i)}
                            </div>
                          ))}
                          {t.participantCount > 5 && (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-medium"
                              style={{
                                background: 'var(--color-bg-elevated)',
                                color: 'var(--color-text-secondary)',
                                border: '2.5px solid var(--color-bg-card)',
                                marginLeft: '-9px',
                              }}>
                              +{t.participantCount - 5}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CTA strip */}
                    <div className="px-5 py-3 flex items-center justify-between gap-3"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(14,14,16,0.6)' }}>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {isLive ? 'Top Seed: #12' : `${Math.floor(Math.random() * 30 + 5)} watching`}
                      </span>
                      <button className="btn btn-success text-[12px] px-5 py-2"
                        style={{ borderRadius: '8px' }}>
                        {isLive ? 'View Bracket' : 'Join Tournament'}
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-[11px] text-[var(--color-text-muted)] px-3 font-medium">Page {page + 1} of {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {/* === CREATE MODAL === */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); }} title="Create Tournament" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && <div className="p-3 rounded-lg text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>{createError}</div>}

          <Input label="Tournament Name" placeholder="Friday Night Championship" value={formData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, name: e.target.value }))} required />

          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1.5">Description</label>
            <textarea className="input-field min-h-[50px] resize-y text-sm" placeholder="Describe your tournament..." value={formData.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(p => ({ ...p, description: e.target.value }))} />
          </div>

          {/* Image Picker */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1.5">Tournament Image</label>
            {formData.imageUrl && (
              <div className="relative mb-2 rounded-lg overflow-hidden" style={{ height: '100px' }}>
                <img src={formData.imageUrl} alt="Selected" className="w-full h-full object-cover" />
                <button type="button" onClick={() => { setSelectedImage(''); setFormData(p => ({ ...p, imageUrl: '' })); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-xs hover:bg-black/80 transition-colors">
                  X
                </button>
              </div>
            )}
            {imagesLoading ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="w-14 h-12 flex-shrink-0" />)}
              </div>
            ) : availableImages.length > 0 ? (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mb-2 max-h-[140px] overflow-y-auto">
                {availableImages.map((img) => (
                  <button key={img.filename} type="button" onClick={() => handleImageSelect(img.url)}
                    className={`relative rounded-lg overflow-hidden transition-all aspect-square ${selectedImage === img.url ? 'ring-2 ring-[#F97316] ring-offset-1 ring-offset-[var(--color-bg)] scale-105' : 'hover:opacity-80'}`}>
                    <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                    {selectedImage === img.url && (
                      <div className="absolute inset-0 bg-[#F97316]/20 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">OK</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-[var(--color-text-muted)] mb-2">No images available. Upload one below.</div>
            )}
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} isLoading={uploadingImage}>
                {uploadingImage ? 'Uploading...' : 'Upload Image'}
              </Button>
              <span className="text-[10px] text-[var(--color-text-dim)]">JPG, PNG, WebP (max 5MB)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1.5">Format</label>
              <select className="input-field text-sm" value={formData.format} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, format: e.target.value }))}>
                <option value="knockout">Knockout</option>
                <option value="league">League (Round Robin)</option>
                <option value="multi_bracket">Multi-Bracket (Groups + KO)</option>
                <option value="swiss">Swiss System</option>
              </select>
            </div>
            <Select label="Max Players" value={formData.maxPlayers} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, maxPlayers: e.target.value }))} options={[{ value: '2', label: '2' }, { value: '4', label: '4' }, { value: '8', label: '8' }, { value: '16', label: '16' }, { value: '32', label: '32' }]} />
          </div>

          {formData.format === 'multi_bracket' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
              <Input label="Number of Groups" type="number" min="2" max="8" value={formData.groupCount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, groupCount: e.target.value }))} />
              <div className="flex items-end pb-1">
                <p className="text-[10px] text-[var(--color-text-muted)]">Players divided into groups, top finishers advance to knockout</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select label="Match Format" value={formData.bestOf} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, bestOf: e.target.value }))} options={[{ value: '1', label: 'Best of 1' }, { value: '3', label: 'Best of 3' }, { value: '5', label: 'Best of 5' }]} />
            <Input label="Prize Pool" placeholder="e.g. $100" value={formData.prizePool} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, prizePool: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1.5">Rules (Optional)</label>
            <textarea className="input-field min-h-[40px] resize-y text-sm" placeholder="Tournament rules, settings, etc..." value={formData.rules} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(p => ({ ...p, rules: e.target.value }))} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="neon" className="flex-1" isLoading={creating}>{creating ? 'Creating...' : 'Create Tournament'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
