import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, isAuthenticated } from '../api';
import { socketService } from '../services/socket';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import type { Tournament, Match, Participant } from '../api';

type Tab = 'overview' | 'bracket' | 'standings' | 'participants' | 'chat';

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tournamentId = id ? parseInt(id) : 0;
  
  const navigate = useNavigate();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatConnected, setChatConnected] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Match result modal
  const [resultModal, setResultModal] = useState<{ open: boolean; match: Match | null }>({ open: false, match: null });
  const [resultScore1, setResultScore1] = useState('');
  const [resultScore2, setResultScore2] = useState('');
  const [submittingResult, setSubmittingResult] = useState(false);
  const [resultError, setResultError] = useState('');

  // Load tournament data
  const loadData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setLoading(true);
      setError(null);
      const [tournamentData, matchesData] = await Promise.all([
        api.tournaments.get(tournamentId),
        api.matches.list(tournamentId),
      ]);
      setTournament(tournamentData);
      setMatches(matchesData.matches || []);
      try {
        const pData = await api.tournaments.participants(tournamentId);
        setParticipants(pData.participants || []);
      } catch {
        setParticipants([]);
      }
    } catch (err: any) {
      setError(err.error || 'Failed to load tournament');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Socket chat
  useEffect(() => {
    if (activeTab === 'chat' && isAuthenticated()) {
      socketService.connect(tournamentId);
      const unsubMsg = socketService.onMessage((data: any) => {
        setChatMessages(prev => [...prev, data]);
      });
      const unsubConn = socketService.onConnectionChange(setChatConnected);
      return () => {
        unsubMsg();
        unsubConn();
        socketService.disconnect();
      };
    }
  }, [activeTab, tournamentId, isAuthenticated]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleJoin = async () => {
    if (!isAuthenticated()) { navigate('/login'); return; }
    setJoining(true);
    setJoinError(null);
    try {
      await api.tournaments.join(tournamentId);
      setJoinSuccess(true);
      await loadData();
    } catch (err: any) {
      setJoinError(err.error || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleSubmitResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultModal.match) return;
    setSubmittingResult(true);
    setResultError('');
    try {
      await api.matches.submitResult(resultModal.match.id, {
        player1Score: parseInt(resultScore1),
        player2Score: parseInt(resultScore2),
      });
      setResultModal({ open: false, match: null });
      setResultScore1('');
      setResultScore2('');
      await loadData();
    } catch (err: any) {
      setResultError(err.error || 'Failed to submit result');
    } finally {
      setSubmittingResult(false);
    }
  };

  const handleConfirm = async (matchId: number) => {
    try {
      await api.matches.confirm(matchId);
      await loadData();
    } catch (err: any) {
      // silent
    }
  };

  const handleDispute = async (matchId: number) => {
    try {
      await api.matches.dispute(matchId);
      await loadData();
    } catch (err: any) {
      // silent
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketService.sendMessage(chatInput);
    setChatInput('');
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4">
          <Skeleton variant="title" className="w-64 mb-4" />
          <Skeleton className="h-6 w-96 mb-8" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2"><Skeleton variant="card" className="h-96" /></div>
            <Skeleton variant="card" className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold text-white mb-4">Tournament Not Found</h2>
          <p className="text-gray-400 mb-6">{error || 'This tournament does not exist.'}</p>
          <Link to="/tournaments">
            <Button variant="primary">Browse Tournaments</Button>
          </Link>
        </div>
      </div>
    );
  }

  const rounds = Array.from(new Set(matches.map(m => m.round))).sort((a, b) => a - b);

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Badge
              variant={tournament.status === 'open' || tournament.status === 'registration_open' ? 'open' : tournament.status === 'in_progress' ? 'live' : tournament.status === 'check_in' ? 'checkin' : 'completed'}
              pulse={tournament.status === 'in_progress'}
            >
              {tournament.status === 'in_progress' ? 'LIVE' : tournament.status.replace('_', ' ').toUpperCase()}
            </Badge>
            <span className="text-dark-400 text-sm capitalize">{tournament.format} • {tournament.maxPlayers} players • Best of {tournament.bestOf}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{tournament.name}</h1>
          {tournament.description && (
            <p className="text-gray-400 max-w-2xl">{tournament.description}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-dark-700 pb-4 overflow-x-auto scrollbar-hide">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'bracket', label: 'Bracket' },
            { key: 'standings', label: 'Standings' },
            { key: 'participants', label: 'Players' },
            { key: 'chat', label: 'Chat' },
          ] as { key: Tab; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-primary-500/20 text-primary-300'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <Card>
                <h3 className="text-xl font-semibold text-white mb-4">Tournament Info</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-dark-700/50">
                    <span className="text-gray-400">Format</span>
                    <span className="text-white capitalize">{tournament.format === 'knockout' ? 'Knockout (Single Elimination)' : 'League (Round Robin)'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-dark-700/50">
                    <span className="text-gray-400">Match Format</span>
                    <span className="text-white">Best of {tournament.bestOf}</span>
                  </div>
                  {tournament.prizePool && (
                    <div className="flex justify-between py-2 border-b border-dark-700/50">
                      <span className="text-gray-400">Prize Pool</span>
                      <span className="text-neon-green font-semibold">{tournament.prizePool}</span>
                    </div>
                  )}
                  {tournament.registrationDeadline && (
                    <div className="flex justify-between py-2 border-b border-dark-700/50">
                      <span className="text-gray-400">Registration Deadline</span>
                      <span className="text-white">{new Date(tournament.registrationDeadline).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2">
                    <span className="text-gray-400">Created</span>
                    <span className="text-white">{new Date(tournament.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>

              {tournament.rules && (
                <Card>
                  <h3 className="text-xl font-semibold text-white mb-4">Rules</h3>
                  <p className="text-gray-400 whitespace-pre-wrap leading-relaxed">{tournament.rules}</p>
                </Card>
              )}

              {/* Recent Matches */}
              {matches.length > 0 && (
                <Card>
                  <h3 className="text-xl font-semibold text-white mb-4">Recent Matches</h3>
                  <div className="space-y-3">
                    {matches.slice(-5).reverse().map(match => (
                      <div key={match.id} className="match-card flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium ${match.winner?.id === match.player1?.id ? 'text-neon-green' : 'text-white'}`}>
                            {match.player1?.username || 'TBD'}
                          </span>
                          <span className="text-dark-400">vs</span>
                          <span className={`text-sm font-medium ${match.winner?.id === match.player2?.id ? 'text-neon-green' : 'text-white'}`}>
                            {match.player2?.username || 'TBD'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-white font-mono text-sm">
                            {match.player1Score ?? '-'} : {match.player2Score ?? '-'}
                          </span>
                          <Badge variant={match.status === 'completed' ? 'completed' : match.status === 'disputed' ? 'disputed' : 'live'}>
                            {match.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div>
              <Card className="sticky top-24">
                <h3 className="text-lg font-semibold text-white mb-4">Participants</h3>
                <div className="text-4xl font-bold gradient-text mb-1">
                  {tournament.participantCount}/{tournament.maxPlayers}
                </div>
                <p className="text-gray-500 text-sm mb-6">players registered</p>

                {(tournament.status === 'registration_open' || tournament.status === 'open' || tournament.status === 'check_in') && (
                  isAuthenticated() ? (
                    joinSuccess ? (
                      <div className="w-full py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-semibold text-center">
                        ✓ Joined!
                      </div>
                    ) : (
                      <>
                        <Button
                          variant="neon"
                          className="w-full"
                          onClick={handleJoin}
                          isLoading={joining}
                        >
                          {joining ? 'Joining...' : 'Join Tournament'}
                        </Button>
                        {joinError && <p className="text-red-400 text-sm mt-2">{joinError}</p>}
                      </>
                    )
                  ) : (
                    <Link to="/login" className="block">
                      <Button variant="primary" className="w-full">Login to Join</Button>
                    </Link>
                  )
                )}

                {/* Top participants */}
                {participants.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <h4 className="text-sm font-medium text-gray-400 mb-3">Registered Players</h4>
                    {participants.slice(0, 8).map((p, idx) => (
                      <div key={p.id} className="flex items-center gap-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500/30 to-neon-blue/30 flex items-center justify-center text-xs text-primary-300 font-bold">
                          {idx + 1}
                        </div>
                        <span className="text-white text-sm">{p.username}</span>
                        {p.seed && <span className="text-dark-400 text-xs ml-auto">Seed #{p.seed}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* Bracket Tab */}
        {activeTab === 'bracket' && (
          <Card className="overflow-x-auto">
            <h3 className="text-xl font-semibold text-white mb-6">Tournament Bracket</h3>
            {matches.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-4">🏟️</div>
                <p>No matches scheduled yet. Participants need to join first.</p>
              </div>
            ) : (
              <div className="flex gap-8 min-w-max pb-4">
                {rounds.map((round, roundIdx) => {
                  const roundMatches = matches.filter(m => m.round === round);
                  const roundName = rounds.length === 1 ? 'Final' :
                    roundIdx === rounds.length - 1 ? 'Final' :
                    roundIdx === rounds.length - 2 ? 'Semi Finals' :
                    roundIdx === rounds.length - 3 ? 'Quarter Finals' :
                    `Round ${round}`;

                  return (
                    <div key={round} className="space-y-4">
                      <h4 className="text-gray-400 text-sm font-medium text-center">{roundName}</h4>
                      <div className="space-y-3">
                        {roundMatches.map((match) => (
                          <div key={match.id} className="w-64 match-card">
                            {/* Player 1 */}
                            <div className={`flex justify-between items-center py-2 ${match.winner?.id === match.player1?.id ? 'text-neon-green' : match.winner?.id && match.winner?.id !== match.player1?.id ? 'text-dark-400' : 'text-white'}`}>
                              <span className="text-sm font-medium truncate max-w-[120px]">
                                {match.player1?.username || 'TBD'}
                              </span>
                              <span className="font-mono text-sm">{match.player1Score ?? '-'}</span>
                            </div>
                            <div className="h-px bg-dark-700" />
                            {/* Player 2 */}
                            <div className={`flex justify-between items-center py-2 ${match.winner?.id === match.player2?.id ? 'text-neon-green' : match.winner?.id && match.winner?.id !== match.player2?.id ? 'text-dark-400' : 'text-white'}`}>
                              <span className="text-sm font-medium truncate max-w-[120px]">
                                {match.player2?.username || 'TBD'}
                              </span>
                              <span className="font-mono text-sm">{match.player2Score ?? '-'}</span>
                            </div>

                            {/* Match actions */}
                            {match.status !== 'completed' && isAuthenticated() && (
                              <div className="flex gap-2 mt-2 pt-2 border-t border-dark-700">
                                <button
                                  onClick={() => setResultModal({ open: true, match })}
                                  className="flex-1 text-xs py-1.5 rounded bg-primary-500/10 text-primary-300 hover:bg-primary-500/20 transition-colors"
                                >
                                  Submit Result
                                </button>
                                {match.status === 'playing' && (
                                  <>
                                    <button
                                      onClick={() => handleConfirm(match.id)}
                                      className="flex-1 text-xs py-1.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => handleDispute(match.id)}
                                      className="flex-1 text-xs py-1.5 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                                    >
                                      Dispute
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                            {match.status === 'completed' && (
                              <div className="mt-2 text-xs text-neon-green text-center font-medium">✓ Completed</div>
                            )}
                            {match.status === 'disputed' && (
                              <div className="mt-2 text-xs text-yellow-400 text-center font-medium">⚠ Disputed</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* Standings Tab */}
        {activeTab === 'standings' && (
          <Card>
            <h3 className="text-xl font-semibold text-white mb-6">League Standings</h3>
            {tournament.format === 'league' ? (
              participants.length === 0 ? (
                <div className="text-center text-gray-400 py-12">No participants yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-dark-700">
                        <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">#</th>
                        <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">Player</th>
                        <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">P</th>
                        <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">W</th>
                        <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">D</th>
                        <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">L</th>
                        <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">GD</th>
                        <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((p, idx) => (
                        <tr key={p.id} className="border-b border-dark-700/50 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 text-sm text-gray-400">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="avatar avatar-sm">{p.username.charAt(0).toUpperCase()}</div>
                              <span className="text-white font-medium">{p.username}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center text-sm text-gray-300">0</td>
                          <td className="py-3 px-4 text-center text-sm text-gray-300">0</td>
                          <td className="py-3 px-4 text-center text-sm text-gray-300">0</td>
                          <td className="py-3 px-4 text-center text-sm text-gray-300">0</td>
                          <td className="py-3 px-4 text-center text-sm text-gray-300">0</td>
                          <td className="py-3 px-4 text-center text-sm text-neon-green font-bold">0</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="text-center text-gray-400 py-12">
                <p>Standings are available for league format tournaments.</p>
                <p className="text-sm mt-2">This is a knockout tournament — check the Bracket tab.</p>
              </div>
            )}
          </Card>
        )}

        {/* Participants Tab */}
        {activeTab === 'participants' && (
          <Card>
            <h3 className="text-xl font-semibold text-white mb-4">Registered Players ({participants.length})</h3>
            {participants.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-4">👥</div>
                <p>No players have joined yet. Be the first!</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {participants.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                    <div className="avatar avatar-sm">{p.username.charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{p.username}</p>
                      <p className="text-dark-400 text-xs">
                        {p.seed ? `Seed #${p.seed}` : `Position ${idx + 1}`} • {p.status}
                      </p>
                    </div>
                    <Badge
                      variant={p.status === 'winner' ? 'open' : p.status === 'eliminated' ? 'completed' : 'live'}
                    >
                      {p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <Card className="h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Tournament Chat</h3>
              {chatConnected && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                  <span className="text-xs text-neon-green">Connected</span>
                </div>
              )}
            </div>

            {!isAuthenticated() ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-400 mb-4">Login to participate in tournament chat</p>
                  <Link to="/login">
                    <Button variant="primary">Login</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 bg-dark-800/30 rounded-xl p-4 mb-4 overflow-y-auto space-y-3 scrollbar-hide">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-dark-400 text-sm py-8">
                      No messages yet. Start the conversation!
                    </div>
                  ) : (
                    chatMessages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                          msg.isOwn
                            ? 'bg-primary-500/20 text-white'
                            : 'bg-dark-700/50 text-gray-200'
                        }`}>
                          <div className="text-xs text-gray-400 mb-1 font-medium">{msg.senderUsername}</div>
                          <div className="text-sm">{msg.message}</div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="input-field"
                    maxLength={500}
                  />
                  <Button type="submit" variant="primary" disabled={!chatInput.trim()}>
                    Send
                  </Button>
                </form>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Submit Result Modal */}
      <Modal isOpen={resultModal.open} onClose={() => { setResultModal({ open: false, match: null }); setResultError(''); }} title="Submit Match Result">
        {resultModal.match && (
          <form onSubmit={handleSubmitResult} className="space-y-5">
            {resultError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm" role="alert">
                {resultError}
              </div>
            )}

            <div className="text-center text-sm text-gray-400 mb-2">
              Round {resultModal.match.round} • Match #{resultModal.match.matchNumber}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">{resultModal.match.player1?.username || 'Player 1'}</label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={resultScore1}
                  onChange={e => setResultScore1(e.target.value)}
                  className="input-field text-center text-2xl font-bold"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="input-label">{resultModal.match.player2?.username || 'Player 2'}</label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={resultScore2}
                  onChange={e => setResultScore2(e.target.value)}
                  className="input-field text-center text-2xl font-bold"
                  placeholder="0"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setResultModal({ open: false, match: null })}>
                Cancel
              </Button>
              <Button type="submit" variant="neon" className="flex-1" isLoading={submittingResult}>
                Submit Result
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
