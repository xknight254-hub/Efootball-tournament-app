import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Tournament, Match, Participant, isAuthenticated } from '../api';

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tournamentId = id ? parseInt(id) : 0;
  
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bracket' | 'participants' | 'chat'>('overview');

  useEffect(() => {
    async function loadData() {
      if (!tournamentId) return;
      
      try {
        setLoading(true);
        const [tournamentData, matchesData] = await Promise.all([
          api.tournaments.get(tournamentId),
          api.matches.list(tournamentId),
        ]);
        setTournament(tournamentData);
        setMatches(matchesData.matches || []);
        
        try {
          const participantsData = await api.tournaments.participants(tournamentId);
          setParticipants(participantsData.participants || []);
        } catch {
          setParticipants([]);
        }
      } catch (err: any) {
        setError(err.error || 'Failed to load tournament');
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [tournamentId]);

  const handleJoin = async () => {
    if (!isAuthenticated()) return;
    
    setJoining(true);
    setJoinError(null);
    
    try {
      await api.tournaments.join(tournamentId);
      setJoinSuccess(true);
      const participantsData = await api.tournaments.participants(tournamentId);
      setParticipants(participantsData.participants || []);
      const updatedTournament = await api.tournaments.get(tournamentId);
      setTournament(updatedTournament);
    } catch (err: any) {
      setJoinError(err.error || 'Failed to join tournament');
    } finally {
      setJoining(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusClasses: Record<string, string> = {
      open: 'status-open',
      check_in: 'status-active',
      fixtures_ready: 'status-active',
      in_progress: 'status-active',
      completed: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
    };
    return statusClasses[status] || 'status-open';
  };

  const getStatusText = (status: string) => {
    const statusTexts: Record<string, string> = {
      open: 'Open',
      check_in: 'Check-in',
      fixtures_ready: 'Fixtures Ready',
      in_progress: 'In Progress',
      completed: 'Completed',
    };
    return statusTexts[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 pt-24 pb-20 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-dark-900 pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="glass-card-dark p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Tournament Not Found</h2>
            <p className="text-gray-400 mb-6">{error || 'This tournament does not exist.'}</p>
            <Link to="/tournaments" className="btn-glow px-6 py-3 rounded-xl text-white font-medium inline-block">
              Browse Tournaments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const rounds = Array.from(new Set(matches.map(m => m.round))).sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className={`status-badge ${getStatusBadge(tournament.status)}`}>
              {getStatusText(tournament.status)}
            </span>
            <span className="text-gray-500 text-sm capitalize">
              {tournament.format} • {tournament.maxPlayers} players
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">{tournament.name}</h1>
          <p className="text-gray-400">{tournament.description || 'No description provided.'}</p>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-dark-700 pb-4 overflow-x-auto">
          {(['overview', 'bracket', 'participants', 'chat'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-primary text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        
        {/* Content */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <div className="glass-card-dark p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Tournament Info</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Format</span>
                    <span className="text-white capitalize">{tournament.format === 'knockout' ? 'Knockout (Single Elimination)' : 'League'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Match Format</span>
                    <span className="text-white">Best of {tournament.bestOf}</span>
                  </div>
                  {tournament.prizePool && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Prize Pool</span>
                      <span className="text-neon-green font-semibold">{tournament.prizePool}</span>
                    </div>
                  )}
                  {tournament.registrationDeadline && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Registration Deadline</span>
                      <span className="text-white">{new Date(tournament.registrationDeadline).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">Created</span>
                    <span className="text-white">{new Date(tournament.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              
              {tournament.rules && (
                <div className="glass-card-dark p-6">
                  <h3 className="text-xl font-semibold text-white mb-4">Rules</h3>
                  <p className="text-gray-400 whitespace-pre-wrap">{tournament.rules}</p>
                </div>
              )}
            </div>
            
            <div>
              <div className="glass-card-dark p-6 sticky top-24">
                <h3 className="text-lg font-semibold text-white mb-4">Participants</h3>
                <div className="text-3xl font-bold gradient-text mb-2">
                  {tournament.participantCount}/{tournament.maxPlayers}
                </div>
                <p className="text-gray-500 text-sm mb-6">players registered</p>
                
                {(tournament.status === 'registration_open' || tournament.status === 'open' || tournament.status === 'check_in') && (
                  isAuthenticated() ? (
                    joinSuccess ? (
                      <div className="w-full py-3 rounded-xl bg-green-500/20 text-green-400 font-semibold text-center">
                        ✓ Joined!
                      </div>
                    ) : (
                      <>
                        <button 
                          onClick={handleJoin} 
                          disabled={joining}
                          className="w-full btn-glow py-3 rounded-xl text-white font-semibold disabled:opacity-50"
                        >
                          {joining ? 'Joining...' : 'Join Tournament'}
                        </button>
                        {joinError && <p className="text-red-400 text-sm mt-2">{joinError}</p>}
                      </>
                    )
                  ) : (
                    <Link to="/login" className="w-full block text-center btn-glow py-3 rounded-xl text-white font-semibold">
                      Login to Join
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'bracket' && (
          <div className="glass-card-dark p-8 overflow-x-auto">
            <h3 className="text-xl font-semibold text-white mb-6">Tournament Bracket</h3>
            {matches.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No matches scheduled yet. Participants need to join first.
              </div>
            ) : (
              <div className="flex gap-8 min-w-max">
                {rounds.map((round) => (
                  <div key={round} className="space-y-4">
                    <h4 className="text-gray-400 text-sm font-medium text-center">
                      {round === rounds.length ? 'Final' : round === rounds.length - 1 ? 'Semi Finals' : `Round ${round}`}
                    </h4>
                    {matches.filter(m => m.round === round).map((match) => (
                      <div key={match.id} className="w-64 p-4 bg-dark-700/50 rounded-xl border border-dark-600">
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-sm ${match.winner?.id === match.player1?.id ? 'text-neon-green font-bold' : 'text-white'}`}>
                            {match.player1?.username || 'TBD'}
                          </span>
                          <span className="text-white font-mono">{match.player1Score ?? '-'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-sm ${match.winner?.id === match.player2?.id ? 'text-neon-green font-bold' : 'text-white'}`}>
                            {match.player2?.username || 'TBD'}
                          </span>
                          <span className="text-white font-mono">{match.player2Score ?? '-'}</span>
                        </div>
                        {match.status === 'completed' && (
                          <div className="mt-2 text-xs text-gray-500 text-center">Completed</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'participants' && (
          <div className="glass-card-dark p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Registered Players</h3>
            {participants.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No players have joined yet. Be the first!
              </div>
            ) : (
              <div className="space-y-3">
                {participants.map((participant, idx) => (
                  <div key={participant.id} className="flex items-center gap-4 p-3 bg-dark-700/50 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-neon-blue flex items-center justify-center">
                      <span className="text-white font-bold">{idx + 1}</span>
                    </div>
                    <span className="text-white">{participant.username}</span>
                    <span className="ml-auto text-gray-500 text-sm">
                      {participant.seed ? `Seed #${participant.seed}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'chat' && (
          <div className="glass-card-dark p-6 h-[500px] flex flex-col">
            <h3 className="text-xl font-semibold text-white mb-4">Tournament Chat</h3>
            {!isAuthenticated() ? (
              <div className="flex-grow flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-400 mb-4">Login to participate in tournament chat</p>
                  <Link to="/login" className="btn-glow px-6 py-3 rounded-xl text-white font-medium inline-block">
                    Login
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-grow bg-dark-800/50 rounded-xl p-4 mb-4 overflow-y-auto">
                  <div className="text-center text-gray-500 text-sm">
                    Chat messages will appear here in real-time
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-grow px-4 py-3 rounded-xl bg-dark-800 border border-dark-600 text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                  <button className="btn-glow px-6 py-3 rounded-xl text-white font-medium">
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}