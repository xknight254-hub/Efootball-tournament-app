import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, isAuthenticated } from '../api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Skeleton, ProgressBar } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Input';
import type { Tournament } from '../api';

export function TournamentsPage() {
  const navigate = useNavigate();
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
  const [formData, setFormData] = useState({ name: '', description: '', format: 'knockout', maxPlayers: '16', bestOf: '1', prizePool: '', platform: 'efootball', rules: '' });
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated()) { navigate('/login'); return; }
    if (!formData.name.trim()) { setCreateError('Name is required'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const result = await api.tournaments.create({ name: formData.name, description: formData.description || undefined, format: formData.format as 'knockout' | 'league', maxPlayers: parseInt(formData.maxPlayers), bestOf: parseInt(formData.bestOf), prizePool: formData.prizePool || undefined, platform: formData.platform, rules: formData.rules || undefined });
      setShowCreate(false);
      navigate(`/tournaments/${result.id}`);
    } catch (err: any) { setCreateError(err.error || 'Failed'); } finally { setCreating(false); }
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
        <Button variant="neon" onClick={() => isAuthenticated() ? setShowCreate(true) : navigate('/login')}>
          + Create Tournament
        </Button>
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
          <p className="text-[var(--color-text-muted)] mb-6 text-sm">Be the first to create one!</p>
          <Button variant="primary" onClick={() => isAuthenticated() ? setShowCreate(true) : navigate('/login')}>Create Tournament</Button>
        </div>
      )}

      {/* Tournament Grid */}
      {!loading && tournaments.length > 0 && (
        <>
          <div className="flex flex-wrap gap-4">
            {tournaments.map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="flex-1 min-w-[280px] max-w-[calc(33.333%-12px)]">
                <div className="tilt-card p-5 h-full">
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
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>{createError}</div>}
          <Input label="Tournament Name *" placeholder="e.g. Friday Night Championship" value={formData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, name: e.target.value }))} required />
          <div>
            <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Description</label>
            <textarea className="input-field min-h-[60px] resize-y" placeholder="Describe your tournament..." value={formData.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Format" value={formData.format} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, format: e.target.value }))} options={[{ value: 'knockout', label: 'Knockout' }, { value: 'league', label: 'League' }]} />
            <Select label="Max Players" value={formData.maxPlayers} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, maxPlayers: e.target.value }))} options={[{ value: '2', label: '2' }, { value: '4', label: '4' }, { value: '8', label: '8' }, { value: '16', label: '16' }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Match Format" value={formData.bestOf} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, bestOf: e.target.value }))} options={[{ value: '1', label: 'Best of 1' }, { value: '3', label: 'Best of 3' }, { value: '5', label: 'Best of 5' }]} />
            <Input label="Prize Pool" placeholder="e.g. $100" value={formData.prizePool} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, prizePool: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="neon" className="flex-1" isLoading={creating}>{creating ? 'Creating...' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
