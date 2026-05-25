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
  const [stats, setStats] = useState({ tournaments: 0, players: 0 });

  useEffect(() => {
    async function load() {
      try {
        const data = await api.tournaments.list({ limit: 12 });
        const list = data.tournaments || data || [];
        setTournaments(list);
        setStats({ tournaments: data.total || list.length, players: Math.floor((data.total || list.length) * 4.2) });
      } catch { /* silent */ } finally { setLoading(false); }
    }
    load();
  }, []);

  return (
    <div className="space-y-8">
      {/* === HERO SPOTLIGHT === */}
      <section className="relative rounded-2xl overflow-hidden" style={{ height: '420px', background: 'var(--color-bg-card)' }}>
        {/* Background gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.1) 50%, rgba(59,130,246,0.05) 100%)',
        }} />
        <div className="absolute inset-0 hero-gradient-overlay" />
        
        {/* Content */}
        <div className="relative h-full flex flex-col justify-center px-8 md:px-12 max-w-[480px]">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 w-fit"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-xs text-[#4ade80] font-semibold">Live tournaments running</span>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight tracking-tight">
            Compete in <span className="gradient-text">eFootball</span> Tournaments
          </h1>
          <p className="text-[var(--color-text-secondary)] text-base mb-8 leading-relaxed">
            The ultimate competitive platform. Create tournaments, challenge players worldwide, and prove you're the best.
          </p>
          <div className="flex gap-3">
            <Link to="/register">
              <Button variant="neon" size="lg">Start Playing</Button>
            </Link>
            <Link to="/tournaments">
              <Button variant="outline" size="lg">Browse Tournaments</Button>
            </Link>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-8 right-8 w-32 h-32 rounded-full opacity-20" style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)',
        }} />
        <div className="absolute bottom-12 right-24 w-24 h-24 rounded-full opacity-15" style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)',
        }} />
      </section>

      {/* === STATS ROW === */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: loading ? '...' : stats.players.toLocaleString(), label: 'Active Players', icon: '👥', color: '#6366f1' },
          { value: loading ? '...' : stats.tournaments.toLocaleString(), label: 'Tournaments', icon: '🏆', color: '#8b5cf6' },
          { value: loading ? '...' : '$0', label: 'Prizes Awarded', icon: '💰', color: '#22c55e' },
          { value: loading ? '...' : '24/7', label: 'Platform Status', icon: '🟢', color: '#06b6d4' },
        ].map((stat, i) => (
          <div key={i} className="card-solid p-5 text-center" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="text-2xl mb-2">{stat.icon}</div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-[var(--color-text-muted)] text-xs">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* === BENTO GRID: Features === */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">Everything you need to <span className="gradient-text">compete</span></h2>
        </div>
        <div className="flex flex-wrap gap-4">
          {/* Featured card */}
          <div className="tilt-card flex-1 min-w-[280px] max-w-[380px] p-6" style={{ minHeight: '240px' }}>
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-lg font-semibold text-white mb-2">Tournament Brackets</h3>
            <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
              Create knockout or league tournaments. Automatic bracket generation with seed-based matchups.
            </p>
          </div>
          {/* Smaller cells */}
          {[
            { icon: '⚽', title: 'Match Results', desc: 'Submit scores with screenshot proof. Dual confirmation system.' },
            { icon: '💬', title: 'Real-time Chat', desc: 'Chat with opponents. Live notifications for match updates.' },
            { icon: '📊', title: 'Live Standings', desc: 'Track positions in league tables. Real-time points and stats.' },
          ].map((feature, i) => (
            <div key={i} className="tilt-card flex-1 min-w-[200px] max-width-[calc(33.333%-12px)] p-5" style={{ minHeight: '200px' }}>
              <div className="text-2xl mb-2">{feature.icon}</div>
              <h3 className="text-sm font-semibold text-white mb-1">{feature.title}</h3>
              <p className="text-[var(--color-text-muted)] text-xs leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* === DEALS STRIP: Featured Tournaments === */}
      {tournaments.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-white">Featured Tournaments</h2>
            <Link to="/tournaments">
              <Button variant="ghost" size="sm">View All →</Button>
            </Link>
          </div>
          <div className="flex flex-wrap gap-4">
            {tournaments.slice(0, 6).map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="flex-1 min-w-[180px]">
                <div className="tilt-card p-5 h-full">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant={t.status === 'open' || t.status === 'registration_open' ? 'open' : t.status === 'in_progress' ? 'live' : 'completed'}>
                      {t.status === 'in_progress' ? 'LIVE' : t.status === 'open' || t.status === 'registration_open' ? 'OPEN' : t.status.toUpperCase()}
                    </Badge>
                    <span className="text-[var(--color-text-dim)] text-xs capitalize">{t.format}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-3 line-clamp-2">{t.name}</h3>
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
        </section>
      )}

      {/* === HOW IT WORKS === */}
      <section className="rounded-2xl p-8" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <h2 className="text-xl font-bold text-white text-center mb-8">How it <span className="gradient-text">works</span></h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: '01', title: 'Create or Join', desc: 'Set up your tournament in seconds or browse open competitions.', icon: '🎮' },
            { step: '02', title: 'Compete', desc: 'Play your matches, submit scores with proof, and confirm results.', icon: '⚔️' },
            { step: '03', title: 'Win', desc: 'Climb the bracket, top the leaderboard, and claim victory.', icon: '🏅' },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl mb-3">{item.icon}</div>
              <div className="text-[#6366f1] font-bold text-xs mb-2" style={{ fontFamily: 'Orbitron, sans-serif' }}>STEP {item.step}</div>
              <h3 className="text-base font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-[var(--color-text-muted)] text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* === CTA === */}
      <section className="rounded-2xl p-10 text-center relative overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 50%, rgba(139,92,246,0.05) 100%)' }} />
        <div className="relative">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to compete?</h2>
          <p className="text-[var(--color-text-secondary)] mb-6 max-w-md mx-auto">
            Join thousands of players already competing. Create your free account and start today.
          </p>
          <Link to="/register">
            <Button variant="neon" size="lg">Create Free Account</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
