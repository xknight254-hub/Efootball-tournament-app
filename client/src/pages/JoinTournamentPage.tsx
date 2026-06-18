import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';

export function JoinTournamentPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!token) { setError('Invalid link'); setLoading(false); return; }
    api.tournaments.getByToken(token)
      .then(t => { setTournament(t); setLoading(false); })
      .catch((err: any) => { setError(err.error || 'Tournament not found'); setLoading(false); });
  }, [token]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) { setJoinError('Phone number required'); return; }
    setJoining(true);
    setJoinError('');
    try {
      const result = await api.tournaments.joinByToken(token!, phone.trim());
      setJoined(true);
      // Redirect to tournament page after 2 seconds
      setTimeout(() => navigate(`/tournaments/${result.tournament.id}`), 2000);
    } catch (err: any) {
      setJoinError(err.error || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-white mb-2">Tournament Not Found</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">{error}</p>
        <Link to="/tournaments"><Button variant="primary">Browse Tournaments</Button></Link>
      </div>
    </div>
  );

  if (joined) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-white mb-2">You're In!</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-2">Successfully joined <strong className="text-white">{tournament.name}</strong></p>
        <p className="text-xs text-[var(--color-text-dim)]">Redirecting to tournament...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Join Tournament</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Enter your phone number to register</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {/* Tournament info */}
          <div className="mb-5 p-4 rounded-xl" style={{ background: 'var(--color-bg-surface)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={tournament.status === 'open' || tournament.status === 'registration_open' ? 'open' : 'completed'}>
                {tournament.status.replace('_', ' ').toUpperCase()}
              </Badge>
              <span className="text-[10px] text-[var(--color-text-dim)] capitalize">{tournament.format}</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">{tournament.name}</h2>
            {tournament.description && <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{tournament.description}</p>}
            <div className="flex gap-4 mt-3 text-xs text-[var(--color-text-secondary)]">
              <span>{tournament.participantCount}/{tournament.maxPlayers} players</span>
              {tournament.prizePool && <span>Prize: {tournament.prizePool}</span>}
              {tournament.entryFee > 0 && <span className="text-[#F97316]">Entry: KES {tournament.entryFee}</span>}
            </div>
          </div>

          {/* Join form */}
          <form onSubmit={handleJoin} className="space-y-4">
            {joinError && (
              <div className="p-3 rounded-lg text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                {joinError}
              </div>
            )}

            <Input
              label="Phone Number"
              type="tel"
              placeholder="0712345678"
              value={phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
              required
            />

            <p className="text-[10px] text-[var(--color-text-dim)]">
              We'll use this number for M-Pesa payments and match notifications. No password needed.
            </p>

            <Button type="submit" variant="neon" className="w-full" size="lg" isLoading={joining}>
              {joining ? 'Joining...' : 'Join Tournament'}
            </Button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs text-[var(--color-text-dim)]">
          Already have an account?{' '}
          <Link to="/login" className="text-[#F97316] font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
