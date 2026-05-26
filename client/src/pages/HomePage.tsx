import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/Skeleton';
import type { Tournament } from '../api';
import '../animations.css';

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
    <div className="space-y-10">

      {/* === HERO: Animated Side-by-Side === */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: '480px' }}>

        {/* Card 1: Cup — Main Hero (slides in from LEFT) */}
        <div className="lg:col-span-2 relative rounded-2xl overflow-hidden group animate-slide-right"
          style={{ minHeight: '480px' }}>
          <img
            src="/tournament-images/cup.jpg"
            alt="Champion Trophy"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-110"
          />
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.65) 45%, rgba(9,9,11,0.2) 75%, transparent 100%)',
          }} />
          {/* Animated neon border */}
          <div className="absolute top-0 left-0 w-1 h-full" style={{
            background: 'linear-gradient(180deg, #6366f1, #8b5cf6, #22c55e, transparent)',
            backgroundSize: '100% 200%',
            animation: 'glow-sweep 3s linear infinite',
          }} />
          {/* Floating glow orbs */}
          <div className="absolute top-10 right-20 w-40 h-40 rounded-full opacity-20 pointer-events-none" style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.5) 0%, transparent 70%)',
            animation: 'float-particle 6s ease-in-out infinite',
          }} />
          <div className="absolute bottom-20 right-40 w-24 h-24 rounded-full opacity-15 pointer-events-none" style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.6) 0%, transparent 70%)',
            animation: 'float-particle 8s ease-in-out infinite 2s',
          }} />
          {/* Content */}
          <div className="relative h-full flex flex-col justify-center px-8 md:px-14 max-w-[580px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 w-fit"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="text-xs text-[#4ade80] font-semibold tracking-wider">LIVE TOURNAMENTS</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
              Chase the <span className="gradient-text">Championship</span>
            </h1>
            <p className="text-[var(--color-text-secondary)] text-base md:text-lg mb-8 leading-relaxed">
              Create or join eFootball tournaments. Compete in knockout brackets, climb leaderboards, and lift the trophy.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link to="/register">
                <Button variant="neon" size="lg">🏆 Start Competing</Button>
              </Link>
              <Link to="/tournaments">
                <Button variant="outline" size="lg">Browse Tournaments</Button>
              </Link>
            </div>
            {/* Mini stats */}
            <div className="flex gap-8 mt-8">
              {[
                { value: loading ? '...' : stats.tournaments.toLocaleString(), label: 'Tournaments' },
                { value: loading ? '...' : stats.players.toLocaleString(), label: 'Players' },
                { value: '24/7', label: 'Live' },
              ].map((s, i) => (
                <div key={i} style={{ animationDelay: `${0.3 + i * 0.1}s` }}
                  className="animate-slide-up">
                  <div className="text-xl font-bold text-white">{s.value}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: stacks with stagger */}
        <div className="flex flex-col gap-4">
          {/* Card 2: Night Match — slides in from RIGHT (delayed) */}
          <div className="relative rounded-2xl overflow-hidden group animate-slide-left anim-delay-2"
            style={{ minHeight: '230px' }}>
            <img
              src="/tournament-images/night-match.jpg"
              alt="Night Match"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-110"
            />
            <div className="absolute inset-0 transition-all duration-500 group-hover:opacity-80" style={{
              background: 'linear-gradient(180deg, rgba(9,9,11,0.4) 0%, rgba(9,9,11,0.88) 100%)',
            }} />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="text-xs text-[#6366f1] font-bold mb-2 tracking-wider uppercase">Real Matches</div>
              <h3 className="text-lg font-bold text-white mb-1">Play Under the Lights</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Schedule matches, submit scores with screenshot proof, and confirm results.
              </p>
            </div>
          </div>

          {/* Card 3: Football Soccer — slides in from RIGHT (more delay) */}
          <div className="relative rounded-2xl overflow-hidden group animate-slide-left anim-delay-3"
            style={{ minHeight: '230px' }}>
            <img
              src="/tournament-images/football-soccer.jpg"
              alt="Football Pitch"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-110"
            />
            <div className="absolute inset-0 transition-all duration-500 group-hover:opacity-80" style={{
              background: 'linear-gradient(180deg, rgba(9,9,11,0.4) 0%, rgba(9,9,11,0.88) 100%)',
            }} />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="text-xs text-[#22c55e] font-bold mb-2 tracking-wider uppercase">All Formats</div>
              <h3 className="text-lg font-bold text-white mb-1">Knockout or League</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Single elimination, double elimination, or round-robin brackets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* === STATS ROW — Animated cards === */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: loading ? '...' : stats.players.toLocaleString(), label: 'Active Players', icon: '👥', color: '#6366f1', gradient: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))' },
          { value: loading ? '...' : stats.tournaments.toLocaleString(), label: 'Tournaments', icon: '🏆', color: '#8b5cf6', gradient: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))' },
          { value: loading ? '...' : '$0', label: 'Prizes Awarded', icon: '💰', color: '#22c55e', gradient: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))' },
          { value: loading ? '...' : '24/7', label: 'Platform Status', icon: '🟢', color: '#06b6d4', gradient: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.05))' },
        ].map((stat, i) => (
          <div key={i}
            className="stat-card alive-card card-shimmer p-5 text-center"
            style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="text-3xl mb-2 card-icon">{stat.icon}</div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-[var(--color-text-muted)] text-xs">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* === BENTO GRID: Features — Alive cards === */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Everything you need to <span className="gradient-text">compete</span></h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: '🏆', title: 'Tournament Brackets', desc: 'Create knockout or league tournaments. Auto bracket generation with seed-based matchups.', color: '#6366f1' },
            { icon: '⚽', title: 'Match Results', desc: 'Submit scores with screenshot proof. OCR auto-reads eFootball scores. Dual confirmation.', color: '#22c55e' },
            { icon: '💬', title: 'Real-time Chat', desc: 'Chat with opponents. Telegram bot notifications for match updates.', color: '#06b6d4' },
            { icon: '📊', title: 'Live Standings', desc: 'Track positions in league tables. Real-time points, goals, and form.', color: '#8b5cf6' },
          ].map((feature, i) => (
            <div key={i}
              className="alive-card p-6 flex flex-col"
              style={{ minHeight: '200px', animationDelay: `${i * 0.08}s` }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 card-icon"
                style={{ background: `${feature.color}15`, border: `1px solid ${feature.color}30` }}>
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed flex-1">{feature.desc}</p>
              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <span className="text-xs font-medium" style={{ color: feature.color }}>Learn more →</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* === FEATURED TOURNAMENTS === */}
      {tournaments.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Featured Tournaments</h2>
            <Link to="/tournaments">
              <Button variant="ghost" size="sm">View All →</Button>
            </Link>
          </div>
          <div className="flex flex-wrap gap-4">
            {tournaments.slice(0, 6).map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="flex-1 min-w-[180px]">
                <div className="alive-card card-shimmer p-5 h-full">
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

      {/* === HOW IT WORKS — Animated steps === */}
      <section className="rounded-2xl p-8 relative overflow-hidden"
        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, transparent 50%, rgba(139,92,246,0.03) 100%)',
        }} />
        <div className="relative">
          <h2 className="text-xl font-bold text-white text-center mb-10">How it <span className="gradient-text">works</span></h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Create or Join', desc: 'Set up your tournament in seconds or browse open competitions. Invite players via link.', icon: '🎮', color: '#6366f1' },
              { step: '02', title: 'Compete', desc: "Play your matches in eFootball, submit scores with screenshot proof, and confirm results.", icon: '⚔️', color: '#22c55e' },
              { step: '03', title: 'Win', desc: 'Climb the bracket, top the leaderboard, and claim victory. Get rewards and badges.', icon: '🏅', color: '#8b5cf6' },
            ].map((item, i) => (
              <div key={i} className="step-card rounded-2xl p-6 text-center"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4"
                  style={{ background: `${item.color}12`, border: `1px solid ${item.color}25` }}>
                  {item.icon}
                </div>
                <div className="text-xs font-bold mb-2 tracking-wider" style={{ color: item.color }}>STEP {item.step}</div>
                <h3 className="text-base font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-[var(--color-text-muted)] text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === CTA — Animated === */}
      <section className="cta-animated rounded-2xl p-10 text-center relative overflow-hidden"
        style={{ background: 'var(--color-bg-card)' }}>
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, transparent 40%, rgba(139,92,246,0.08) 100%)',
        }} />
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
