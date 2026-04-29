import { useState } from 'react';

const tournaments = [
  {
    id: 1,
    name: 'eFootball Pro League',
    format: 'knockout',
    maxPlayers: 16,
    participants: 12,
    prizePool: '$500',
    status: 'open',
    startDate: 'May 15, 2026',
  },
  {
    id: 2,
    name: 'Weekend Warriors Cup',
    format: 'league',
    maxPlayers: 8,
    participants: 8,
    prizePool: '$200',
    status: 'in_progress',
    startDate: 'May 10, 2026',
  },
  {
    id: 3,
    name: 'Beginner Championship',
    format: 'knockout',
    maxPlayers: 32,
    participants: 24,
    prizePool: '$100',
    status: 'open',
    startDate: 'May 20, 2026',
  },
  {
    id: 4,
    name: '1v1 Masters',
    format: 'knockout',
    maxPlayers: 64,
    participants: 48,
    prizePool: '$1000',
    status: 'in_progress',
    startDate: 'May 8, 2026',
  },
];

export function TournamentsPage() {
  const [filter, setFilter] = useState('all');
  
  const statusColors: Record<string, string> = {
    open: 'bg-green-500/20 text-green-400 border-green-500/30',
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
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
          <button className="btn-glow px-6 py-3 rounded-xl text-white font-semibold mt-4 md:mt-0">
            + Create Tournament
          </button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          {['all', 'open', 'in_progress', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-primary text-white'
                  : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
        
        {/* Tournament Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament, i) => (
            <div 
              key={tournament.id}
              className="tournament-card rounded-2xl p-6 hover:border-primary/50 transition-all duration-300 cursor-pointer slide-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {/* Status Badge */}
              <div className="flex items-center justify-between mb-4">
                <span className={`status-badge ${statusColors[tournament.status]} border`}>
                  {tournament.status === 'in_progress' ? 'Live' : tournament.status}
                </span>
                <span className="text-gray-500 text-sm">{tournament.format}</span>
              </div>
              
              {/* Title */}
              <h3 className="text-xl font-semibold text-white mb-4">{tournament.name}</h3>
              
              {/* Info */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Players</span>
                  <span className="text-white">{tournament.participants}/{tournament.maxPlayers}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Prize Pool</span>
                  <span className="text-neon-green font-semibold">{tournament.prizePool}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Starts</span>
                  <span className="text-white">{tournament.startDate}</span>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-neon-blue rounded-full transition-all duration-500"
                  style={{ width: `${(tournament.participants / tournament.maxPlayers) * 100}%` }}
                />
              </div>
              
              {/* Action */}
              <button className="w-full mt-4 py-3 rounded-xl bg-dark-700/50 text-white font-medium hover:bg-primary/20 transition-all">
                {tournament.status === 'open' ? 'Join Tournament' : 'View Details'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}