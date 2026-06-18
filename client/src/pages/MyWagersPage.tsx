import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';

interface MyWager {
  id: number;
  creatorName: string;
  challengerName?: string;
  stakeAmount: number;
  totalPot: number;
  matchCode: string;
  status: string;
  isWinner: boolean;
  createdAt: string;
  completedAt?: string;
}

const STATUS_META: Record<string, { label: string; variant: 'open' | 'live' | 'completed' | 'disputed' | 'checkin' }> = {
  open: { label: 'Open', variant: 'open' },
  awaiting_payment: { label: 'Awaiting Payment', variant: 'checkin' },
  active: { label: 'Active', variant: 'live' },
  pending_confirmation: { label: 'Pending Confirmation', variant: 'checkin' },
  completed: { label: 'Completed', variant: 'completed' },
  disputed: { label: 'Disputed', variant: 'disputed' },
  cancelled: { label: 'Cancelled', variant: 'completed' },
  resolved_refunded: { label: 'Refunded', variant: 'completed' },
};

export function MyWagersPage() {
  const navigate = useNavigate();
  const [wagers, setWagers] = useState<MyWager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const loadWagers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.wagers.myWagers();
      setWagers(data.wagers || []);
    } catch (err: any) {
      setError(err.error || 'Failed to load wagers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWagers(); }, [loadWagers]);

  const filtered = filter === 'all' ? wagers : wagers.filter(w => w.status === filter);

  const stats = {
    total: wagers.length,
    active: wagers.filter(w => ['active', 'pending_confirmation', 'open', 'awaiting_payment'].includes(w.status)).length,
    won: wagers.filter(w => w.isWinner).length,
    totalWon: wagers.filter(w => w.isWinner).reduce((sum, w) => sum + w.totalPot, 0),
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Wagers</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Your challenge history</p>
        </div>
        <Button variant="neon" onClick={() => navigate('/wagers')}>+ New Challenge</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Active', value: stats.active, color: 'text-[#fb923c]' },
          { label: 'Won', value: stats.won, color: 'text-[#22c55e]' },
          { label: 'Total Won', value: `KES ${stats.totalWon}`, color: 'text-[#22c55e]' },
        ].map((stat, i) => (
          <div key={i} className="rounded-xl p-4 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-[var(--color-text-dim)] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {['all', 'open', 'active', 'pending_confirmation', 'completed', 'disputed', 'cancelled'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
            style={{
              background: filter === f ? 'rgba(249,115,22,0.15)' : 'var(--color-bg-surface)',
              border: `1px solid ${filter === f ? '#F97316' : 'var(--color-border)'}`,
              color: filter === f ? '#fb923c' : 'var(--color-text-muted)',
            }}
          >
            {f === 'all' ? 'All' : STATUS_META[f]?.label || f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-3xl mb-3">📋</div>
          <h3 className="text-lg font-bold text-white mb-2">
            {filter === 'all' ? 'No Wagers Yet' : `No ${STATUS_META[filter]?.label || filter} wagers`}
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            {filter === 'all' ? 'Create your first challenge to get started!' : 'Try a different filter.'}
          </p>
          <Button variant="neon" onClick={() => navigate('/wagers')}>Create Challenge</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(wager => {
            const meta = STATUS_META[wager.status] || { label: wager.status, variant: 'open' as const };
            return (
              <div
                key={wager.id}
                className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                onClick={() => navigate(`/wagers/${wager.id}`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={meta.variant} pulse={meta.variant === 'live'}>{meta.label}</Badge>
                      {wager.isWinner && <Badge variant="completed">🏆 Won KES {wager.totalPot}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-white font-medium">{wager.creatorName}</span>
                      <span className="text-[var(--color-text-dim)]">vs</span>
                      <span className="text-[var(--color-text-muted)]">{wager.challengerName || 'Waiting...'}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-white">KES {wager.stakeAmount}</div>
                    <div className="text-[10px] text-[var(--color-text-dim)]">Pot: KES {wager.totalPot}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <code className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-surface)', color: '#fb923c' }}>
                    {wager.matchCode}
                  </code>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyCode(wager.matchCode); }}
                    className="text-[10px] text-[var(--color-text-dim)] hover:text-white transition-colors"
                  >
                    Copy
                  </button>
                  <span className="text-[10px] text-[var(--color-text-dim)] ml-auto">
                    {new Date(wager.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
