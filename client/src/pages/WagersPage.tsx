import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isAuthenticated } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Select } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';

interface Wager {
  id: number;
  creatorName: string;
  challengerName?: string;
  stakeAmount: number;
  totalPot: number;
  matchCode: string;
  status: string;
  createdAt: string;
  isWinner?: boolean;
  creatorId?: number;
  challengerId?: number;
  winnerId?: number;
  creatorConfirmed?: boolean;
  challengerConfirmed?: boolean;
  disputeReason?: string;
  expiresAt?: string;
  completedAt?: string;
}

const STAKE_PRESETS = [50, 100, 200, 500, 1000];

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

export function WagersPage() {
  const navigate = useNavigate();
  const { isAuthenticated: auth } = useAuth();
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [minStake, setMinStake] = useState('');
  const [maxStake, setMaxStake] = useState('');

  // Create form
  const [stake, setStake] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Accept form
  const [acceptingWager, setAcceptingWager] = useState<Wager | null>(null);
  const [acceptPhone, setAcceptPhone] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [acceptSuccess, setAcceptSuccess] = useState('');

  const loadWagers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: any = {};
      if (minStake) params.minStake = Number(minStake);
      if (maxStake) params.maxStake = Number(maxStake);
      const data = await api.wagers.list(params);
      setWagers(data.wagers || []);
    } catch (err: any) {
      setError(err.error || 'Failed to load wagers');
    } finally {
      setLoading(false);
    }
  }, [minStake, maxStake]);

  useEffect(() => { loadWagers(); }, [loadWagers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) { navigate('/login'); return; }
    const stakeNum = Number(stake);
    if (!stakeNum || stakeNum < 10 || stakeNum > 5000) {
      setCreateError('Stake must be between KES 10 and KES 5,000');
      return;
    }
    if (!phone.trim()) { setCreateError('Phone number required'); return; }

    setCreating(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      const result = await api.wagers.create(stakeNum, phone.trim());
      setCreateSuccess(`Challenge created! Code: ${result.challenge.matchCode}. Check your M-Pesa for the STK push.`);
      setShowCreate(false);
      setStake('');
      setPhone('');
      loadWagers();
    } catch (err: any) {
      setCreateError(err.error || 'Failed to create challenge');
    } finally {
      setCreating(false);
    }
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) { navigate('/login'); return; }
    if (!acceptingWager) return;
    if (!acceptPhone.trim()) { setAcceptError('Phone number required'); return; }

    setAccepting(true);
    setAcceptError('');
    setAcceptSuccess('');
    try {
      const result = await api.wagers.accept(acceptingWager.id, acceptPhone.trim());
      setAcceptSuccess(`Payment initiated! Code: ${result.matchCode}. Check your M-Pesa for the STK push.`);
      setAcceptingWager(null);
      setAcceptPhone('');
      loadWagers();
    } catch (err: any) {
      setAcceptError(err.error || 'Failed to accept challenge');
    } finally {
      setAccepting(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Wager Challenges</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Create or accept head-to-head challenges</p>
        </div>
        <Button variant="neon" onClick={() => { if (!auth) { navigate('/login'); return; } setShowCreate(true); }}>
          + Create Challenge
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-dim)]">Stake:</span>
          <input
            type="number"
            placeholder="Min"
            value={minStake}
            onChange={e => setMinStake(e.target.value)}
            className="input-field w-20 text-sm py-1.5"
            min={10}
          />
          <span className="text-[var(--color-text-dim)]">—</span>
          <input
            type="number"
            placeholder="Max"
            value={maxStake}
            onChange={e => setMaxStake(e.target.value)}
            className="input-field w-20 text-sm py-1.5"
            min={10}
          />
          <span className="text-xs text-[var(--color-text-dim)]">KES</span>
        </div>
        <Button variant="ghost" size="sm" onClick={loadWagers}>Refresh</Button>
      </div>

      {/* How it works */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-sm font-semibold text-white mb-3">How Wagering Works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { step: '1', title: 'Create', desc: 'Set your stake (KES 10–5,000) and pay via M-Pesa' },
            { step: '2', title: 'Share Code', desc: 'Share your match code with a challenger' },
            { step: '3', title: 'Accept', desc: 'Challenger pays the same stake via M-Pesa' },
            { step: '4', title: 'Play & Confirm', desc: 'Play your match, both confirm the winner' },
          ].map(item => (
            <div key={item.step} className="flex gap-3 p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}>
                {item.step}
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{item.title}</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Wagers List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : wagers.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-3xl mb-3">🎮</div>
          <h3 className="text-lg font-bold text-white mb-2">No Open Challenges</h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">Be the first to create a wager challenge!</p>
          <Button variant="neon" onClick={() => setShowCreate(true)}>Create Challenge</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {wagers.map(wager => {
            const meta = STATUS_META[wager.status] || { label: wager.status, variant: 'open' as const };
            return (
              <div
                key={wager.id}
                className="rounded-2xl p-4 sm:p-5 cursor-pointer transition-all hover:scale-[1.01]"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                onClick={() => navigate(`/wagers/${wager.id}`)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-xs text-[var(--color-text-dim)]">#{wager.id}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-white font-medium">{wager.creatorName}</span>
                      <span className="text-[var(--color-text-dim)]">vs</span>
                      <span className="text-[var(--color-text-muted)]">{wager.challengerName || 'Waiting for challenger...'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">KES {wager.stakeAmount}</div>
                      <div className="text-[10px] text-[var(--color-text-dim)]">Pot: KES {wager.totalPot}</div>
                    </div>
                    {wager.status === 'open' && (
                      <Button
                        variant="neon"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); if (!auth) { navigate('/login'); return; } setAcceptingWager(wager); }}
                      >
                        Accept
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <span className="text-[10px] text-[var(--color-text-dim)]">Code:</span>
                  <code className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-surface)', color: '#fb923c' }}>
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

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); setCreateSuccess(''); }} title="Create Wager Challenge" size="md">
        <div className="space-y-4">
          {createSuccess ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">✅</div>
              <p className="text-sm text-white font-medium mb-2">{createSuccess}</p>
              <p className="text-xs text-[var(--color-text-dim)]">Share the match code with your challenger</p>
              <Button variant="outline" className="mt-4" onClick={() => { setCreateSuccess(''); setShowCreate(false); }}>Done</Button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  {createError}
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Stake Amount (KES)</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {STAKE_PRESETS.map(amount => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setStake(String(amount))}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: stake === String(amount) ? 'rgba(249,115,22,0.2)' : 'var(--color-bg-surface)',
                        border: `1px solid ${stake === String(amount) ? '#F97316' : 'var(--color-border)'}`,
                        color: stake === String(amount) ? '#fb923c' : 'var(--color-text-secondary)',
                      }}
                    >
                      KES {amount}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  value={stake}
                  onChange={e => setStake(e.target.value)}
                  placeholder="Or enter custom amount"
                  min={10}
                  max={5000}
                  required
                />
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">Min KES 10, Max KES 5,000. 10% platform commission.</p>
              </div>

              <Input
                label="M-Pesa Phone Number"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0712345678"
                required
              />
              <p className="text-[10px] text-[var(--color-text-dim)]">You'll receive an STK push to pay your stake.</p>

              <div className="p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--color-text-muted)]">Your stake</span>
                  <span className="text-white">KES {stake || '0'}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-[var(--color-text-muted)]">Platform fee (10%)</span>
                  <span className="text-[#ef4444]">-KES {stake ? Math.ceil(Number(stake) * 0.1) : '0'}</span>
                </div>
                <div className="flex justify-between text-xs mt-1 pt-1" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <span className="text-[var(--color-text-muted)]">Winner takes</span>
                  <span className="text-[#22c55e] font-bold">KES {stake ? Number(stake) * 2 - Math.ceil(Number(stake) * 0.1) : '0'}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" variant="neon" className="flex-1" isLoading={creating}>
                  {creating ? 'Creating...' : 'Pay & Create'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* Accept Modal */}
      <Modal isOpen={!!acceptingWager} onClose={() => { setAcceptingWager(null); setAcceptError(''); setAcceptSuccess(''); }} title="Accept Challenge" size="md">
        {acceptingWager && (
          <div className="space-y-4">
            {acceptSuccess ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">✅</div>
                <p className="text-sm text-white font-medium mb-2">{acceptSuccess}</p>
                <p className="text-xs text-[var(--color-text-dim)]">Once both payments confirm, the challenge goes active.</p>
                <Button variant="outline" className="mt-4" onClick={() => { setAcceptSuccess(''); setAcceptingWager(null); }}>Done</Button>
              </div>
            ) : (
              <form onSubmit={handleAccept} className="space-y-4">
                {acceptError && (
                  <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                    {acceptError}
                  </div>
                )}

                <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--color-text-muted)]">Challenging</span>
                    <span className="text-sm text-white font-medium">{acceptingWager.creatorName}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--color-text-muted)]">Stake</span>
                    <span className="text-lg font-bold text-white">KES {acceptingWager.stakeAmount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-muted)]">Match Code</span>
                    <code className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-card)', color: '#fb923c' }}>
                      {acceptingWager.matchCode}
                    </code>
                  </div>
                </div>

                <Input
                  label="Your M-Pesa Phone Number"
                  type="tel"
                  value={acceptPhone}
                  onChange={e => setAcceptPhone(e.target.value)}
                  placeholder="0712345678"
                  required
                />
                <p className="text-[10px] text-[var(--color-text-dim)]">You'll receive an STK push to pay your stake.</p>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setAcceptingWager(null)}>Cancel</Button>
                  <Button type="submit" variant="neon" className="flex-1" isLoading={accepting}>
                    {accepting ? 'Processing...' : `Pay KES ${acceptingWager.stakeAmount} & Accept`}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
