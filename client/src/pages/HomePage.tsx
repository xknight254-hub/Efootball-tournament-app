import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/Skeleton';
import type { Tournament } from '../api';

export function HomePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ tournaments: 0, players: 0, prizes: '$0' });

  useEffect(() => {
    async function load() {
      try {
        const data = await api.tournaments.list({ limit: 6 });
        const list = data.tournaments || data || [];
        setTournaments(list);
        setStats({
          tournaments: data.total || list.length,
          players: Math.floor((data.total || list.length) * 4.2),
          prizes: '$0',
        });
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-neon-blue/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-neon-pink/5 rounded-full blur-[100px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Live Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-8 animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
              <span className="text-sm text-gray-300 font-medium">Live tournaments running now</span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight tracking-tight animate-fade-in-up">
              Compete in{' '}
              <span className="gradient-text">eFootball</span>
              <br />
              <span className="text-white">Tournaments</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
              The ultimate competitive platform. Create tournaments, challenge players worldwide, and prove you're the best eFootball player.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <Link to="/register">
                <Button variant="neon" size="lg" leftIcon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }>
                  Start Playing
                </Button>
              </Link>
              <Link to="/tournaments">
                <Button variant="outline" size="lg">
                  Browse Tournaments
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: loading ? '...' : stats.players.toLocaleString(), label: 'Active Players', icon: '👥' },
              { value: loading ? '...' : stats.tournaments.toLocaleString(), label: 'Tournaments', icon: '🏆' },
              { value: loading ? '...' : stats.prizes, label: 'Prizes Awarded', icon: '💰' },
              { value: loading ? '...' : '24/7', label: 'Platform Status', icon: '🟢' },
            ].map((stat, i) => (
              <div key={i} className="glass rounded-2xl p-6 text-center glass-hover animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="text-3xl mb-3">{stat.icon}</div>
                <div className="text-2xl md:text-3xl font-bold gradient-text mb-1">{stat.value}</div>
                <div className="text-gray-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Everything you need to <span className="gradient-text">compete</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              From tournament creation to match results, we've got every aspect of competitive eFootball covered.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '🏆',
                title: 'Tournament Brackets',
                desc: 'Create knockout, league, or double elimination tournaments. Automatic bracket generation with seed-based matchups.',
                color: 'purple' as const,
              },
              {
                icon: '⚽',
                title: 'Match Results',
                desc: 'Submit scores with screenshot proof. Both players confirm results. Built-in dispute resolution system.',
                color: 'green' as const,
              },
              {
                icon: '💬',
                title: 'Real-time Chat',
                desc: 'Chat with your opponents and tournament participants. Live notifications for match updates.',
                color: 'blue' as const,
              },
              {
                icon: '📊',
                title: 'Live Standings',
                desc: 'Track your position in league tables. See goals, wins, and points update in real-time.',
                color: 'purple' as const,
              },
              {
                icon: '🎯',
                title: 'Fair Play',
                desc: 'Screenshot verification, dual confirmation, and dispute handling ensure every result is legitimate.',
                color: 'green' as const,
              },
              {
                icon: '⚡',
                title: 'Instant Setup',
                desc: 'Create a tournament in under 30 seconds. Share the link and let players join instantly.',
                color: 'blue' as const,
              },
            ].map((feature, i) => (
              <div key={i} className="glass rounded-2xl p-8 glass-hover animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="text-4xl mb-5">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Tournaments */}
      {tournaments.length > 0 && (
        <section className="py-20 border-t border-dark-800/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-12">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Featured Tournaments</h2>
                <p className="text-gray-400">Join these active competitions</p>
              </div>
              <Link to="/tournaments">
                <Button variant="ghost" rightIcon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                }>
                  View All
                </Button>
              </Link>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournaments.slice(0, 6).map((t) => (
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
                        <span className="text-dark-400 text-sm font-medium">{t.format}</span>
                      </div>

                      <h3 className="text-lg font-semibold text-white mb-4">{t.name}</h3>

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
                          <span className="text-gray-400">Platform</span>
                          <span className="text-white">{t.platform}</span>
                        </div>
                      </div>

                      <ProgressBar value={t.participantCount} max={t.maxPlayers} showLabel />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="py-20 border-t border-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              How it <span className="gradient-text">works</span>
            </h2>
            <p className="text-gray-400 text-lg">Three simple steps to competitive gaming</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Create or Join', desc: 'Set up your tournament in seconds or browse open competitions to join.', icon: '🎮' },
              { step: '02', title: 'Compete', desc: 'Play your matches, submit scores with screenshot proof, and confirm results.', icon: '⚔️' },
              { step: '03', title: 'Win', desc: 'Climb the bracket, top the leaderboard, and claim your victory.', icon: '🏅' },
            ].map((item, i) => (
              <div key={i} className="text-center animate-fade-in-up" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="text-5xl mb-4">{item.icon}</div>
                <div className="text-neon-green font-bold text-sm font-[Orbitron] mb-2">STEP {item.step}</div>
                <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                <p className="text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 border-t border-dark-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="glass rounded-3xl p-12 md:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-transparent to-neon-blue/10" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to compete?
              </h2>
              <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
                Join thousands of players already competing in eFootball tournaments. Create your free account and start today.
              </p>
              <Link to="/register">
                <Button variant="neon" size="lg" leftIcon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }>
                  Create Free Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
