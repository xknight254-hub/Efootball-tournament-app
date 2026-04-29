import { useState } from 'react';
// import { useParams } from 'react-router-dom';

const tournament = {
  id: 1,
  name: 'eFootball Pro League',
  format: 'knockout',
  maxPlayers: 16,
  participants: 12,
  prizePool: '$500',
  status: 'open',
  startDate: 'May 15, 2026',
  description: 'The ultimate eFootball competitive tournament. Compete against the best players and prove you are the champion!',
  rules: 'Best of 3 matches. Submit screenshots of your match results.',
};

const matches = [
  { id: 1, round: 1, player1: 'PlayerOne', player2: 'PlayerTwo', score1: 2, score2: 1, status: 'completed', winner: 'PlayerOne' },
  { id: 2, round: 1, player1: 'PlayerThree', player2: 'PlayerFour', score1: 0, score2: 2, status: 'completed', winner: 'PlayerFour' },
  { id: 3, round: 1, player1: 'PlayerFive', player2: 'PlayerSix', score1: null, score2: null, status: 'pending' },
  { id: 4, round: 1, player1: 'PlayerSeven', player2: 'PlayerEight', score1: null, score2: null, status: 'pending' },
  { id: 5, round: 2, player1: 'PlayerOne', player2: 'PlayerFour', score1: null, score2: null, status: 'scheduled' },
];

export function TournamentDetailPage() {
  // const { id } = useParams();
  const [activeTab, setActiveTab] = useState<'overview' | 'bracket' | 'participants' | 'chat'>('overview');
  
  return (
    <div className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="status-badge status-open">Open</span>
            <span className="text-gray-500 text-sm">Knockout • 16 players</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">{tournament.name}</h1>
          <p className="text-gray-400">{tournament.description}</p>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-dark-700 pb-4">
          {(['overview', 'bracket', 'participants', 'chat'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
                    <span className="text-white">Knockout (Single Elimination)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Match Format</span>
                    <span className="text-white">Best of 3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Prize Pool</span>
                    <span className="text-neon-green font-semibold">{tournament.prizePool}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Start Date</span>
                    <span className="text-white">{tournament.startDate}</span>
                  </div>
                </div>
              </div>
              
              <div className="glass-card-dark p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Rules</h3>
                <p className="text-gray-400">{tournament.rules}</p>
              </div>
            </div>
            
            <div>
              <div className="glass-card-dark p-6 sticky top-24">
                <h3 className="text-lg font-semibold text-white mb-4">Participants</h3>
                <div className="text-3xl font-bold gradient-text mb-2">{tournament.participants}/{tournament.maxPlayers}</div>
                <p className="text-gray-500 text-sm mb-6">players registered</p>
                <button className="w-full btn-glow py-3 rounded-xl text-white font-semibold">
                  Join Tournament
                </button>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'bracket' && (
          <div className="glass-card-dark p-8 overflow-x-auto">
            <h3 className="text-xl font-semibold text-white mb-6">Tournament Bracket</h3>
            <div className="flex gap-8 min-w-max">
              {/* Round 1 */}
              <div className="space-y-4">
                <h4 className="text-gray-400 text-sm font-medium text-center">Round 1</h4>
                {matches.filter(m => m.round === 1).map((match) => (
                  <div key={match.id} className="w-64 p-4 bg-dark-700/50 rounded-xl border border-dark-600">
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-sm ${match.winner === match.player1 ? 'text-neon-green font-bold' : 'text-white'}`}>
                        {match.player1}
                      </span>
                      <span className="text-white font-mono">{match.score1 ?? '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${match.winner === match.player2 ? 'text-neon-green font-bold' : 'text-white'}`}>
                        {match.player2}
                      </span>
                      <span className="text-white font-mono">{match.score2 ?? '-'}</span>
                    </div>
                    {match.status === 'completed' && (
                      <div className="mt-2 text-xs text-gray-500 text-center">Completed</div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Round 2 */}
              <div className="flex items-center">
                <div className="w-px h-32 bg-dark-600" />
              </div>
              <div className="space-y-4">
                <h4 className="text-gray-400 text-sm font-medium text-center">Round 2</h4>
                {matches.filter(m => m.round === 2).map((match) => (
                  <div key={match.id} className="w-64 p-4 bg-dark-700/50 rounded-xl border border-dark-600">
                    <div className="text-gray-500 text-sm text-center">TBD</div>
                    <div className="text-center text-gray-600 text-xs mt-2">vs</div>
                    <div className="text-gray-500 text-sm text-center">TBD</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'participants' && (
          <div className="glass-card-dark p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Registered Players</h3>
            <div className="space-y-3">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 bg-dark-700/50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-neon-blue flex items-center justify-center">
                    <span className="text-white font-bold">P{idx + 1}</span>
                  </div>
                  <span className="text-white">Player{idx + 1}</span>
                  <span className="ml-auto text-gray-500 text-sm">Seed #{idx + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'chat' && (
          <div className="glass-card-dark p-6 h-[500px] flex flex-col">
            <h3 className="text-xl font-semibold text-white mb-4">Tournament Chat</h3>
            <div className="flex-grow bg-dark-800/50 rounded-xl p-4 mb-4 overflow-y-auto">
              <div className="space-y-3">
                <div className="chat-bubble chat-bubble-received">
                  <span className="text-primary font-medium">Player1:</span> Good luck everyone!
                </div>
                <div className="chat-bubble chat-bubble-received">
                  <span className="text-primary font-medium">Player2:</span> Who wants to practice?
                </div>
                <div className="chat-bubble chat-bubble-sent">
                  <span className="text-white font-medium">You:</span> Let's go!
                </div>
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
          </div>
        )}
      </div>
    </div>
  );
}