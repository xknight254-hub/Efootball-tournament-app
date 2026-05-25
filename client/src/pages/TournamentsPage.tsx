import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, isAuthenticated } from '../api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { ProgressBar } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Input';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
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

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    format: 'knockout',
    maxPlayers: '16',
    bestOf: '1',
    prizePool: '',
    platform: 'efootball',
    rules: '',
  });

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
    } catch (err: any) {
      setError(err.error || 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, [filter, search, page]);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    if (!formData.name.trim()) {
      setCreateError('Tournament name is required');
      return;
    }

    setCreating(true);
    setCreateError('');

    try {
      const result = await api.tournaments.create({
        name: formData.name,
        description: formData.description || undefined,
        format: formData.format as 'knockout' | 'league',
        maxPlayers: parseInt(formData.maxPlayers),
        bestOf: parseInt(formData.bestOf),
        prizePool: formData.prizePool || undefined,
        platform: formData.platform,
        rules: formData.rules || undefined,
      });
      setShowCreate(false);
      navigate(`/tournaments/${result.id}`);
    } catch (err: any) {
      setCreateError(err.error || 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Tournaments</h1>
            <p className="text-gray-400">Join a tournament and prove your skills</p>
          </div>
          <Button
            variant="neon"
            onClick={() => isAuthenticated() ? setShowCreate(true) : navigate('/login')}
            leftIcon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Create Tournament
          </Button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'registration_open', label: 'Registration Open' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'completed', label: 'Completed' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => { setFilter(f.value); setPage(0); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === f.value
                    ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                    : 'bg-dark-800/50 text-gray-400 hover:text-white border border-transparent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search tournaments..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              leftIcon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="h-56" />
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <Button variant="outline" onClick={loadTournaments}>Retry</Button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && tournaments.length === 0 && (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">🏟️</div>
            <h3 className="text-xl font-semibold text-white mb-2">No tournaments found</h3>
            <p className="text-gray-400 mb-6">Be the first to create one!</p>
            <Button variant="primary" onClick={() => isAuthenticated() ? setShowCreate(true) : navigate('/login')}>
              Create Tournament
            </Button>
          </div>
        )}

        {/* Tournament Grid */}
        {!loading && tournaments.length > 0 && (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {tournaments.map((t) => (
                <Link key={t.id} to={`/tournaments/${t.id}`}>
                  <div className="tournament-card p-6 h-full">
                    <div className="relative">
                      <div className="flex items-center justify-between mb-4">
                        <Badge
                          variant={t.status === 'open' || t.status === 'registration_open' ? 'open' : t.status === 'in_progress' ? 'live' : 'completed'}
                          pulse={t.status === 'in_progress'}
                        >
                          {t.status === 'in_progress' ? 'LIVE' : t.status === 'open' || t.status === 'registration_open' ? 'OPEN' : t.status.toUpperCase()}
                        </Badge>
                        <span className="text-dark-400 text-sm font-medium capitalize">{t.format}</span>
                      </div>

                      <h3 className="text-lg font-semibold text-white mb-2">{t.name}</h3>
                      {t.description && (
                        <p className="text-gray-400 text-sm mb-4 line-clamp-2">{t.description}</p>
                      )}

                      <div className="space-y-2.5 mb-5">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Players</span>
                          <span className="text-white font-medium">{t.participantCount}/{t.maxPlayers}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Prize Pool</span>
                          <span className="text-neon-green font-semibold">{t.prizePool || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Match</span>
                          <span className="text-white">Best of {t.bestOf}</span>
                        </div>
                      </div>

                      <ProgressBar value={t.participantCount} max={t.maxPlayers} showLabel />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-gray-400 px-4">
                  Page {page + 1} of {totalPages}
                </span>
                <Button variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Tournament Modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); }} title="Create Tournament" size="lg">
        <form onSubmit={handleCreate} className="space-y-5">
          {createError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm" role="alert">
              {createError}
            </div>
          )}

          <Input
            label="Tournament Name *"
            placeholder="e.g. Friday Night Championship"
            value={formData.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            required
          />

          <div>
            <label className="input-label">Description</label>
            <textarea
              className="input-field min-h-[80px] resize-y"
              placeholder="Describe your tournament..."
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Format"
              value={formData.format}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ ...prev, format: e.target.value }))}
              options={[
                { value: 'knockout', label: 'Knockout (Single Elimination)' },
                { value: 'league', label: 'League (Round Robin)' },
              ]}
            />
            <Select
              label="Max Players"
              value={formData.maxPlayers}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ ...prev, maxPlayers: e.target.value }))}
              options={[
                { value: '2', label: '2 Players' },
                { value: '4', label: '4 Players' },
                { value: '8', label: '8 Players' },
                { value: '16', label: '16 Players' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Match Format"
              value={formData.bestOf}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ ...prev, bestOf: e.target.value }))}
              options={[
                { value: '1', label: 'Best of 1' },
                { value: '3', label: 'Best of 3' },
                { value: '5', label: 'Best of 5' },
              ]}
            />
            <Input
              label="Prize Pool"
              placeholder="e.g. $100"
              value={formData.prizePool}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, prizePool: e.target.value }))}
            />
          </div>

          <div>
            <label className="input-label">Rules (optional)</label>
            <textarea
              className="input-field min-h-[80px] resize-y"
              placeholder="Tournament rules and regulations..."
              value={formData.rules}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, rules: e.target.value }))}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="neon" className="flex-1" isLoading={creating}>
              {creating ? 'Creating...' : 'Create Tournament'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
