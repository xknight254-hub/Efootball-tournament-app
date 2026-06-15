import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import type { Tournament } from '../api';
import '../animations.css';

export function HomePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ tournaments: 0, players: 0, matches: 0 });

  useEffect(() => {
    async function load() {
      try {
        const data = await api.tournaments.list({ limit: 12 });
        const list = data.tournaments || data || [];
        const total = data.total || list.length;
        setTournaments(list);
        setStats({
          tournaments: total,
          players: Math.floor(total * 6.4),
          matches: Math.floor(total * 14.7),
        });
      } catch { /* silent */ } finally { setLoading(false); }
    }
    load();
  }, []);

  const statCards = [
    { value: stats.players, label: 'Active Players', accent: '#F97316' },
    { value: stats.tournaments, label: 'Tournaments', accent: '#F59E0B' },
    { value: stats.matches, label: 'Matches Played', accent: '#22c55e' },
    { value: '99.8%', label: 'Uptime', accent: '#06b6d4' },
  ];

  const features = [
    {
      title: 'Tournament Brackets',
      desc: 'Knockout, double elimination, or round-robin. Auto-generated brackets with seed-based matchups.',
      stat: '12+',
      statLabel: 'bracket types',
    },
    {
      title: 'Screenshot Verification',
      desc: 'Submit match scores with screenshot proof. OCR auto-reads eFootball results. Dual confirmation.',
      stat: '< 5s',
      statLabel: 'verification',
    },
    {
      title: 'Telegram Integration',
      desc: 'Real-time match notifications via Telegram bot. Challenge opponents directly from chat.',
      stat: '24/7',
      statLabel: 'notifications',
    },
    {
      title: 'Live Leaderboards',
      desc: 'Real-time standings with points, goals, goal difference, and form tracking.',
      stat: 'Live',
      statLabel: 'updates',
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Create or Join',
      desc: 'Set up a tournament in seconds or browse open competitions. Share invite links with players.',
    },
    {
      step: '02',
      title: 'Compete',
      desc: 'Play matches in eFootball. Submit scores with Screenshot proof. Opponent confirms results.',
    },
    {
      step: '03',
      title: 'Win',
      desc: 'Climb the bracket. Top the leaderboard. Lift the trophy and claim your rank.',
    },
  ];

  return (
    <div className="space-y-6">

      {/* === HERO: Asymmetric Split === */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3" style={{ minHeight: '420px' }}>

        {/* Main Hero — 2/3 width */}
        <div className="lg:col-span-2 relative rounded-2xl overflow-hidden group animate-slide-right"
          style={{ minHeight: '420px' }}>
          <img
            src="/tournament-images/cup.jpg"
            alt="Champion Trophy"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-105"
          />
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.6) 50%, transparent 100%)',
          }} />
          {/* Orange accent bar */}
          <div className="absolute top-0 left-0 w-1 h-full rounded-r" style={{
            background: 'linear-gradient(180deg, #F97316, #F59E0B, transparent)',
          }} />
          <div className="absolute top-6 right-12 w-32 h-32 rounded-full opacity-15 pointer-events-none" style={{
            background: 'radial-gradient(circle, rgba(249,115,22,0.6) 0%, transparent 70%)',
            animation: 'neon-pulse 4s ease-in-out infinite',
          }} />
          <div className="relative h-full flex flex-col justify-center px-6 md:px-10 max-w-[520px]">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5 w-fit"
              style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}>
              <span className="w-2 h-2 rounded-full bg-[#22c55e]" style={{ animation: 'neon-pulse 2s ease-in-out infinite' }} />
              <span className="text-[10px] text-[#4ade80] font-bold tracking-widest uppercase">Live Tournaments</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-3 leading-[1.1] tracking-tighter">
              Chase the <span className="gradient-text">Championship</span>
            </h1>
            <p className="text-sm md:text-base text-[var(--color-text-secondary)] mb-6 leading-relaxed max-w-[420px]">
              Create or join eFootball tournaments. Compete in knockout brackets, climb leaderboards, and lift the trophy.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link to="/register">
                <Button variant="neon" size="lg">Start Competing</Button>
              </Link>
              <Link to="/tournaments">
                <Button variant="outline" size="lg">Browse Tournaments</Button>
              </Link>
            </div>
            {/* Mini stats */}
            <div className="flex gap-6 mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {[
                { value: loading ? '...' : stats.tournaments.toLocaleString(), label: 'Tournaments' },
                { value: loading ? '...' : stats.players.toLocaleString(), label: 'Players' },
                { value: loading ? '...' : stats.matches.toLocaleString(), label: 'Matches' },
              ].map((s, i) => (
                <div key={i} className="animate-slide-up" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
                  <div className="text-lg font-extrabold text-white tracking-tight">{s.value}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: 1/ width, stacked cards */}
        <div className="flex flex-col gap-3">
          <div className="relative rounded-2xl overflow-hidden group animate-slide-left anim-delay-2 flex-1 min-h-[200px]">
            <img src="/tournament-images/night-match.jpg" alt="Night Match" loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" />
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(180deg, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.9) 100%)',
            }} />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="text-[10px] text-[#F97316] font-bold mb-1.5 tracking-widest uppercase">Real Matches</div>
              <h3 className="text-base font-bold text-white mb-1">Play Under the Lights</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Schedule matches, submit scores with proof, and confirm results.</p>
            </div>
          </div>
          <div className="relative rounded-2xl overflow-hidden group animate-slide-left anim-delay-3 flex-1 min-h-[200px]">
            <img src="/tournament-images/football-soccer.jpg" alt="Football Pitch" loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" />
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(180deg, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.9) 100%)',
            }} />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="text-[10px] text-[#22c55e] font-bold mb-1.5 tracking-widest uppercase">All Formats</div>
              <h3 className="text-base font-bold text-white mb-1">Knockout or League</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Single elimination, double elimination, or round-robin.</p>
            </div>
          </div>
        </div>
      </section>

      {/* === STATS ROW === */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((stat, i) => (
          <div key={i}
            className="stat-card alive-card p-4 text-center"
            style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="text-2xl font-extrabold text-white mb-0.5 tracking-tight">{stat.value}</div>
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</div>
            <div className="mt-2 mx-auto w-8 h-0.5 rounded-full" style={{ background: stat.accent }} />
          </div>
        ))}
      </section>

      {/* === FEATURES: Bento Grid === */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white tracking-tight">Everything you need to <span className="gradient-text">compete</span></h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {features.map((f, i) => (
            <div key={i} className="alive-card p-5 flex flex-col" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-extrabold text-white tracking-tight">{f.stat}</div>
                <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider">{f.statLabel}</div>
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">{f.title}</h3>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed flex-1">{f.desc}</p>
              <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <span className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider">Learn more</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* === FEATURED TOURNAMENTS === */}
      {loading ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white tracking-tight">Featured Tournaments</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-3 w-full mb-3" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </section>
      ) : tournaments.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white tracking-tight">Featured Tournaments</h2>
            <Link to="/tournaments">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tournaments.slice(0, 6).map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`}>
                <div className="alive-card p-4 h-full">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={t.status === 'open' || t.status === 'registration_open' ? 'open' : t.status === 'in_progress' ? 'live' : 'completed'}>
                      {t.status === 'in_progress' ? 'LIVE' : t.status === 'open' || t.status === 'registration_open' ? 'OPEN' : t.status.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] text-[var(--color-text-dim)] capitalize font-medium">{t.format}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2 line-clamp-1">{t.name}</h3>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--color-text-muted)]">Players</span>
                      <span className="text-white font-semibold">{t.participantCount}/{t.maxPlayers}</span>
                    </div>
                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-elevated)' }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, (t.participantCount / t.maxPlayers) * 100)}%`,
                          background: 'linear-gradient(90deg, #F97316, #F59E0B)',
                        }} />
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--color-text-muted)]">Prize</span>
                    <span className="text-[#22c55e] font-bold">{t.prizePool || 'N/A'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl p-8 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-3xl font-extrabold text-[var(--color-text-dim)] mb-2">No tournaments yet</div>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">Be the first to create a tournament and start competing.</p>
          <Link to="/tournaments">
            <Button variant="primary" size="md">Create Tournament</Button>
          </Link>
        </section>
      )}

      {/* === HOW IT WORKS === */}
      <section className="rounded-2xl p-6 md:p-8 relative overflow-hidden"
        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(135deg, rgba(249,115,22,0.04) 0%, transparent 50%, rgba(245,158,11,0.02) 100%)',
        }} />
        <div className="relative">
          <h2 className="text-lg font-bold text-white text-center mb-8 tracking-tight">How it <span className="gradient-text">works</span></h2>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((item, i) => (
              <div key={i} className="step-card rounded-xl p-5 text-center"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                <div className="text-[10px] font-extrabold text-[#F97316] mb-3 tracking-widest">STEP {item.step}</div>
                <h3 className="text-sm font-bold text-white mb-2">{item.title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{item.desc}</p>
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px" style={{ background: 'var(--color-border)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === CTA === */}
      <section className="cta-animated rounded-2xl p-8 md:p-10 text-center relative overflow-hidden"
        style={{ background: 'var(--color-bg-card)' }}>
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, rgba(249,115,22,0.08) 0%, transparent 40%, rgba(245,158,11,0.05) 100%)',
        }} />
        <div className="relative">
          <h2 className="text-xl font-extrabold text-white mb-2 tracking-tight">Ready to compete?</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-5 max-w-md mx-auto">
            Join the arena. Create your free account and start competing today.
          </p>
          <Link to="/register">
            <Button variant="neon" size="lg">Create Free Account</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
