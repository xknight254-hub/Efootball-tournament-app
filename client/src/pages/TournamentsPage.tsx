import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isAuthenticated } from '../api';

interface TournamentData {
  id: number;
  name: string;
  description?: string;
  platform: string;
  format: string;
  maxPlayers: number;
  participantCount: number;
  prizePool?: string;
  status: string;
  createdAt: string;
}

export function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const data = await api.tournaments.list();
      setTournaments(data.tournaments || data);
    } catch (err: any) {
      console.error('Failed to load tournaments:', err);
      setError('Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClick = () => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    alert('Create Tournament feature coming soon!');
  };

  const filteredTournaments = tournaments.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const statusColors: Record<string, string> = {
    open: 'bg-green-500/20 text-green-400 border-green-500/30',
    registration_open: 'bg-green-500/20 text-green-400 border-green-500/30',
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    ended: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  
  return (
    <div className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Tournaments</h1>
            <p className="text-gray-400">Join a tournament and prove your skills</p>
          </div>
          <button onClick={handleCreateClick} className="btn-glow px-6 py-3 rounded-xl text-white font-semibold mt-4 md:mt-0">
            + Create Tournament
          </button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { value: 'all', label: 'All' },
            { value: 'registration_open', label: 'Open' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'completed', label: 'Completed' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        
        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-400">Loading tournaments...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={loadTournaments} className="btn-glow px-4 py-2 rounded-lg text-white">
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredTournaments.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No tournaments found</p>
            <p className="text-gray-500">Check back later or create one!</p>
          </div>
        )}

        {/* Tournament Grid */}
        {!loading && !error && filteredTournaments.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTournaments.map((tournament, i) => (
              <div 
                key={tournament.id}
                onClick={() => navigate(`/tournaments/${tournament.id}`)}
                className="tournament-card rounded-2xl p-6 hover:border-primary/50 transition-all duration-300 cursor-pointer slide-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-4">
                  <span className={`status-badge ${statusColors[tournament.status] || statusColors.open} border`}>
                    {tournament.status === 'in_progress' ? 'Live' : tournament.status === 'registration_open' ? 'Open' : tournament.status}
                  </span>
                  <span className="text-gray-500 text-sm">{tournament.format}</span>
                </div>
                
                {/* Title */}
                <h3 className="text-xl font-semibold text-white mb-4">{tournament.name}</h3>
                
                {/* Info */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Players</span>
                    <span className="text-white">{tournament.participantCount}/{tournament.maxPlayers}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Prize Pool</span>
                    <span className="text-neon-green font-semibold">{tournament.prizePool || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Platform</span>
                    <span className="text-white">{tournament.platform}</span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-neon-blue rounded-full transition-all duration-500"
                    style={{ width: `${(tournament.participantCount / tournament.maxPlayers) * 100}%` }}
                  />
                </div>
                
                {/* Action */}
                <button className="w-full mt-4 py-3 rounded-xl bg-dark-700/50 text-white font-medium hover:bg-primary/20 transition-all">
                  {tournament.status === 'registration_open' ? 'Join Tournament' : 'View Details'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}