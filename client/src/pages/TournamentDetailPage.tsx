import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, isAuthenticated } from '../api';
import { socketService } from '../services/socket';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import type { Tournament, Match, Participant } from '../api';

type Tab = 'overview' | 'bracket' | 'standings' | 'players' | 'chat';

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
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatConnected, setChatConnected] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [resultModal, setResultModal] = useState<{ open: boolean; match: Match | null }>({ open: false, match: null });
  const [resultScore1, setResultScore1] = useState('');
  const [resultScore2, setResultScore2] = useState('');
  const [submittingResult, setSubmittingResult] = useState(false);
  const [resultError, setResultError] = useState('');

  const loadData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setLoading(true);
      setError(null);
      const [tournamentData, matchesData] = await Promise.all([api.tournaments.get(tournamentId), api.matches.list(tournamentId)]);
      setTournament(tournamentData);
      setMatches(matchesData.matches || []);
      try { const pData = await api.tournaments.participants(tournamentId); setParticipants(pData.participants || []); } catch { setParticipants([]); }
    } catch (err: any) { setError(err.error || 'Failed to load'); } finally { setLoading(false); }
  }, [tournamentId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (activeTab === 'chat' && isAuthenticated()) {
      socketService.connect(tournamentId);
      const unsubMsg = socketService.onMessage((data: any) => setChatMessages(prev => [...prev, data]));
      const unsubConn = socketService.onConnectionChange(setChatConnected);
      return () => { unsubMsg(); unsubConn(); socketService.disconnect(); };
    }
  }, [activeTab, tournamentId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const handleJoin = async () => {
    if (!isAuthenticated()) { navigate('/login'); return; }
    setJoining(true); setJoinError(null);
    try { await api.tournaments.join(tournamentId); setJoinSuccess(true); await loadData(); } catch (err: any) { setJoinError(err.error || 'Failed'); } finally { setJoining(false); }
  };

  const handleSubmitResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultModal.match) return;
    setSubmittingResult(true); setResultError('');
    try { await api.matches.submitResult(resultModal.match.id, { player1Score: parseInt(resultScore1), player2Score: parseInt(resultScore2) }); setResultModal({ open: false, match: null }); setResultScore1(''); setResultScore2(''); await loadData(); } catch (err: any) { setResultError(err.error || 'Failed'); } finally { setSubmittingResult(false); }
  };

  const handleSendChat = (e: React.FormEvent) => { e.preventDefault(); if (!chatInput.trim()) return; socketService.sendMessage(chatInput); setChatInput(''); };

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-6 w-96" /><Skeleton className="h-96" /></div>;
  if (error || !tournament) return (
    <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <h2 className="text-xl font-bold text-white mb-4">Not Found</h2>
      <p className="text-[var(--color-text-muted)] mb-6">{error || 'Tournament does not exist.'}</p>
      <Link to="/tournaments"><Button variant="primary">Browse Tournaments</Button></Link>
    </div>
  );

  const rounds = Array.from(new Set(matches.map(m => m.round))).sort((a, b) => a - b);
  const tabs: { key: Tab; label: string }[] = [{ key: 'overview', label: 'Overview' }, { key: 'bracket', label: 'Bracket' }, { key: 'standings', label: 'Standings' }, { key: 'players', label: 'Players' }, { key: 'chat', label: 'Chat' }];

  const renderMatchCard = (match: Match) => (
    <div key={match.id} className="match-card w-56">
      <div className={`flex justify-between items-center py-1.5 ${match.winner?.id === match.player1?.id ? 'text-[#22c55e]' : match.winner?.id && match.winner?.id !== match.player1?.id ? 'text-[var(--color-text-dim)] line-through' : 'text-white'}`}>
        <span className="text-xs font-medium truncate max-w-[100px]">{match.player1?.username || 'TBD'}</span>
        <span className="font-mono text-xs font-bold">{match.player1Score ?? '-'}</span>
      </div>
      <div className="h-px" style={{ background: 'var(--color-border-subtle)' }} />
      <div className={`flex justify-between items-center py-1.5 ${match.winner?.id === match.player2?.id ? 'text-[#22c55e]' : match.winner?.id && match.winner?.id !== match.player2?.id ? 'text-[var(--color-text-dim)] line-through' : 'text-white'}`}>
        <span className="text-xs font-medium truncate max-w-[100px]">{match.player2?.username || 'TBD'}</span>
        <span className="font-mono text-xs font-bold">{match.player2Score ?? '-'}</span>
      </div>
      {match.status !== 'completed' && match.status !== 'disputed' && isAuthenticated() && (
        <div className="flex gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          <button onClick={() => setResultModal({ open: true, match })} className="flex-1 text-xs py-1 rounded transition-colors" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>Submit</button>
          {match.status === 'playing' && (
            <>
              <button onClick={() => api.matches.confirm(match.id).then(loadData)} className="flex-1 text-xs py-1 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>✓</button>
              <button onClick={() => api.matches.dispute(match.id).then(loadData)} className="flex-1 text-xs py-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>⚠</button>
            </>
          )}
        </div>
      )}
      {match.status === 'completed' && <div className="mt-2 text-xs text-center text-[#22c55e] font-medium">✓ {match.winner?.username}</div>}
      {match.status === 'disputed' && <div className="mt-2 text-xs text-center text-[#fbbf24] font-medium">⚠ Disputed</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Badge variant={tournament.status === 'open' || tournament.status === 'registration_open' ? 'open' : tournament.status === 'in_progress' ? 'live' : 'completed'}>
            {tournament.status.replace('_', ' ').toUpperCase()}
          </Badge>
          <span className="text-[var(--color-text-dim)] text-sm capitalize">{tournament.format} • {tournament.maxPlayers} players • Best of {tournament.bestOf}</span>
        </div>
        <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
        {tournament.description && <p className="text-[var(--color-text-secondary)] mt-1 text-sm">{tournament.description}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-all ${activeTab === tab.key ? 'nav-tab-active' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <h3 className="text-base font-semibold text-white mb-4">Tournament Info</h3>
              <div className="space-y-3 text-sm">
                {[
                  ['Format', tournament.format === 'knockout' ? 'Knockout (Single Elimination)' : 'League (Round Robin)'],
                  ['Match Format', `Best of ${tournament.bestOf}`],
                  ...(tournament.prizePool ? [['Prize Pool', tournament.prizePool]] : []),
                  ['Created', new Date(tournament.createdAt).toLocaleDateString()],
                ].map(([label, value], i) => (
                  <div key={i} className="flex justify-between py-2" style={{ borderBottom: i < 3 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                    <span className="text-[var(--color-text-muted)]">{label}</span>
                    <span className="text-white">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            {tournament.rules && (
              <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <h3 className="text-base font-semibold text-white mb-3">Rules</h3>
                <p className="text-[var(--color-text-secondary)] text-sm whitespace-pre-wrap">{tournament.rules}</p>
              </div>
            )}
          </div>
          <div>
            <div className="rounded-2xl p-5 sticky top-24" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="text-3xl font-bold text-white mb-1">{tournament.participantCount}/{tournament.maxPlayers}</div>
              <p className="text-[var(--color-text-muted)] text-xs mb-5">players registered</p>
              {(tournament.status === 'registration_open' || tournament.status === 'open' || tournament.status === 'check_in') && (
                isAuthenticated() ? (
                  joinSuccess ? <div className="w-full py-2.5 rounded-xl text-center text-sm font-semibold" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }}>✓ Joined!</div> : <>
                    <Button variant="neon" className="w-full" onClick={handleJoin} isLoading={joining}>{joining ? 'Joining...' : 'Join Tournament'}</Button>
                    {joinError && <p className="text-xs mt-2" style={{ color: '#f87171' }}>{joinError}</p>}
                  </>
                ) : <Link to="/login"><Button variant="primary" className="w-full">Login to Join</Button></Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bracket */}
      {activeTab === 'bracket' && (
        <div className="rounded-2xl p-6 overflow-x-auto" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-white">Tournament Bracket</h3>
            <Badge variant="open">{matches.length} matches</Badge>
          </div>
          {matches.length === 0 ? (
            <div className="text-center text-[var(--color-text-muted)] py-12">
              <div className="text-4xl mb-3">📋</div>
              <p className="mb-1">No matches scheduled yet.</p>
              <p className="text-xs">Matches will be generated when the tournament starts.</p>
            </div>
          ) : tournament.format === 'multi_bracket' || tournament.format === 'swiss' ? (
            /* Group stage + knockout for multi-bracket */
            <div className="space-y-4">
              {(() => {
                const groupRounds = rounds.filter(r => r <= (tournament.groupCount || 1));
                const koRounds = rounds.filter(r => r > (tournament.groupCount || 1));
                return (
                  <>
                    {groupRounds.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-[#818cf8] mb-3 uppercase tracking-wider">Group Stage</h4>
                        <div className="flex gap-4 overflow-x-auto pb-2">
                          {groupRounds.map(round => {
                            const rm = matches.filter(m => m.round === round);
                            return (
                              <div key={round} className="space-y-2">
                                <h5 className="text-[var(--color-text-dim)] text-xs text-center">Group {String.fromCharCode(64 + round)}</h5>
                                {rm.map(match => renderMatchCard(match))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {koRounds.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-[#fbbf24] mb-3 uppercase tracking-wider">Knockout Stage</h4>
                        <div className="flex gap-6 overflow-x-auto pb-4">
                          {koRounds.map((round, ridx) => {
                            const rm = matches.filter(m => m.round === round);
                            const rn = koRounds.length === 1 ? 'Final' : ridx === koRounds.length - 1 ? 'Final' : ridx === koRounds.length - 2 ? 'Semi Finals' : `Round ${round}`;
                            return (
                              <div key={round} className="space-y-3">
                                <h5 className="text-[var(--color-text-muted)] text-xs text-center">{rn}</h5>
                                {rm.map(match => renderMatchCard(match))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            /* Standard knockout bracket */
            <div className="flex gap-6 min-w-max pb-4">
              {rounds.map((round, roundIdx) => {
                const roundMatches = matches.filter(m => m.round === round);
                const roundName = rounds.length === 1 ? 'Final' : roundIdx === rounds.length - 1 ? 'Final' : roundIdx === rounds.length - 2 ? 'Semi Finals' : roundIdx === rounds.length - 3 ? 'Quarter Finals' : `Round ${round}`;
                const spacing = Math.pow(2, roundIdx) * 12;
                return (
                  <div key={round} className="space-y-3" style={{ marginTop: roundIdx > 0 ? `${spacing}px` : 0 }}>
                    <h4 className="text-[var(--color-text-muted)] text-xs font-medium text-center">{roundName}</h4>
                    <div className="space-y-3">
                      {roundMatches.map((match, midx) => (
                        <div key={match.id} style={{ marginTop: midx > 0 && roundIdx > 0 ? `${spacing * 2}px` : 0 }}>
                          {renderMatchCard(match)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Standings */}
      {activeTab === 'standings' && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold text-white mb-4">Standings</h3>
          {tournament.format === 'knockout' ? (
            <div className="text-center text-[var(--color-text-muted)] py-8">
              <div className="text-3xl mb-3">🏆</div>
              <p>Knockout tournaments use bracket view.</p>
              <button onClick={() => setActiveTab('bracket')} className="mt-3 text-sm text-[#818cf8] hover:underline">View Bracket →</button>
            </div>
          ) : participants.length === 0 ? (
            <div className="text-center text-[var(--color-text-muted)] py-8">No participants yet.</div>
          ) : (() => {
            // Calculate standings from matches
            const stats: Record<number, any> = {};
            participants.forEach(p => {
              stats[p.userId] = { userId: p.userId, username: p.username, seed: p.seed, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 };
            });
            matches.filter(m => m.status === 'completed').forEach(m => {
              const p1 = m.player1?.id, p2 = m.player2?.id;
              if (!p1 || !p2 || !stats[p1] || !stats[p2]) return;
              stats[p1].played++; stats[p2].played++;
              stats[p1].gf += m.player1Score || 0; stats[p1].ga += m.player2Score || 0;
              stats[p2].gf += m.player2Score || 0; stats[p2].ga += m.player1Score || 0;
              if ((m.player1Score || 0) > (m.player2Score || 0)) { stats[p1].wins++; stats[p1].pts += 3; stats[p2].losses++; }
              else if ((m.player2Score || 0) > (m.player1Score || 0)) { stats[p2].wins++; stats[p2].pts += 3; stats[p1].losses++; }
              else { stats[p1].draws++; stats[p2].draws++; stats[p1].pts++; stats[p2].pts++; }
            });
            const sorted = Object.values(stats).sort((a: any, b: any) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
            return (
              <table className="data-table">
                <thead><tr><th>#</th><th>Player</th><th className="text-center">MP</th><th className="text-center">W</th><th className="text-center">D</th><th className="text-center">L</th><th className="text-center">GF</th><th className="text-center">GA</th><th className="text-center">GD</th><th className="text-center">Pts</th></tr></thead>
                <tbody>{sorted.map((p: any, i) => (
                  <tr key={p.userId}>
                    <td className="text-[var(--color-text-muted)] font-medium">{i + 1}</td>
                    <td><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>{p.username.charAt(0).toUpperCase()}</div><span className="text-white text-sm font-medium">{p.username}</span></div></td>
                    <td className="text-center text-[var(--color-text-secondary)]">{p.played}</td>
                    <td className="text-center text-[#22c55e]">{p.wins}</td>
                    <td className="text-center text-[#fbbf24]">{p.draws}</td>
                    <td className="text-center text-[#ef4444]">{p.losses}</td>
                    <td className="text-center text-[var(--color-text-secondary)]">{p.gf}</td>
                    <td className="text-center text-[var(--color-text-secondary)]">{p.ga}</td>
                    <td className="text-center text-[var(--color-text-secondary)]">{p.gf - p.ga > 0 ? '+' : ''}{p.gf - p.ga}</td>
                    <td className="text-center text-white font-bold">{p.pts}</td>
                  </tr>
                ))}</tbody>
              </table>
            );
          })()}
        </div>
      )}

      {/* Players */}
      {activeTab === 'players' && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold text-white mb-4">Registered Players ({participants.length})</h3>
          {participants.length === 0 ? <div className="text-center text-[var(--color-text-muted)] py-8">No players yet.</div> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {participants.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>{p.username.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{p.username}</p><p className="text-[var(--color-text-dim)] text-xs">{p.seed ? `Seed #${p.seed}` : `Pos ${i + 1}`}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat */}
      {activeTab === 'chat' && (
        <div className="rounded-2xl h-[500px] flex flex-col" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between p-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h3 className="text-base font-semibold text-white">Tournament Chat</h3>
            {chatConnected && <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" /><span className="text-xs text-[#22c55e]">Connected</span></div>}
          </div>
          {!isAuthenticated() ? (
            <div className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-[var(--color-text-muted)] mb-3 text-sm">Login to chat</p><Link to="/login"><Button variant="primary" size="sm">Login</Button></Link></div></div>
          ) : (
            <>
              <div className="flex-1 p-4 overflow-y-auto space-y-2 scrollbar-hide">
                {chatMessages.length === 0 ? <div className="text-center text-[var(--color-text-dim)] text-sm py-8">No messages yet.</div> : chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%] rounded-lg px-3 py-2" style={{ background: msg.isOwn ? 'rgba(99,102,241,0.15)' : 'var(--color-bg-surface)' }}>
                      <div className="text-xs text-[var(--color-text-muted)] mb-0.5">{msg.senderUsername}</div>
                      <div className="text-sm text-[var(--color-text-primary)]">{msg.message}</div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendChat} className="flex gap-2 p-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." className="input-field" maxLength={500} />
                <Button type="submit" variant="primary" disabled={!chatInput.trim()}>Send</Button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Result Modal */}
      <Modal isOpen={resultModal.open} onClose={() => { setResultModal({ open: false, match: null }); setResultError(''); }} title="Submit Result">
        {resultModal.match && (
          <form onSubmit={handleSubmitResult} className="space-y-4">
            {resultError && <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>{resultError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">{resultModal.match.player1?.username}</label><input type="number" min="0" max="99" value={resultScore1} onChange={e => setResultScore1(e.target.value)} className="input-field text-center text-xl font-bold" placeholder="0" required /></div>
              <div><label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">{resultModal.match.player2?.username}</label><input type="number" min="0" max="99" value={resultScore2} onChange={e => setResultScore2(e.target.value)} className="input-field text-center text-xl font-bold" placeholder="0" required /></div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setResultModal({ open: false, match: null })}>Cancel</Button>
              <Button type="submit" variant="neon" className="flex-1" isLoading={submittingResult}>Submit</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
