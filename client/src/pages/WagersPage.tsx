import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

interface Wager {
  id: number;
  creatorName: string;
  challengerName?: string;
  stakeAmount: number;
  totalPot: number;
  matchCode: string;
  status: string;
  createdAt: string;
  creatorId?: number;
  challengerId?: number;
}

const STAKE_PRESETS = [50, 100, 200, 500, 1000];

const STATUS_META: Record<string, { label: string; variant: 'open' | 'live' | 'completed' | 'disputed' | 'checkin' }> = {
  open: { label: 'Open — Awaiting Challenger', variant: 'open' },
  awaiting_payment: { label: 'Awaiting Payment', variant: 'checkin' },
  active: { label: 'Active — Play Your Match', variant: 'live' },
  pending_confirmation: { label: 'Pending Confirmation', variant: 'checkin' },
  completed: { label: 'Completed', variant: 'completed' },
  disputed: { label: 'Disputed', variant: 'disputed' },
  cancelled: { label: 'Cancelled', variant: 'completed' },
  resolved_refunded: { label: 'Refunded', variant: 'completed' },
};

export function WagersPage() {
  const navigate = useNavigate();
  const { isAuthenticated: auth } = useAuth();
  const [searchParams] = useSearchParams();

  // View: 'home' | 'create' | 'enter'
  const [view, setView] = useState<'home' | 'create' | 'enter'>('home');

  // Create form
  const [stake, setStake] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdWager, setCreatedWager] = useState<Wager | null>(null);

  // Enter code form
  const [enterCode, setEnterCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [foundWager, setFoundWager] = useState<Wager | null>(null);

  // Accept form (after code lookup)
  const [acceptPhone, setAcceptPhone] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [acceptSuccess, setAcceptSuccess] = useState('');

  // Check for code in URL (deep link: /wagers?code=W-XXXX)
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setEnterCode(code.toUpperCase());
      setView('enter');
      handleLookup(code.toUpperCase());
    }
  }, []);

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
    try {
      const result = await api.wagers.create(stakeNum, phone.trim());
      setCreatedWager(result.challenge);
    } catch (err: any) {
      setCreateError(err.error || 'Failed to create challenge');
    } finally {
      setCreating(false);
    }
  };

  const handleLookup = useCallback(async (code?: string) => {
    const lookupCode = (code || enterCode).trim().toUpperCase();
    if (!lookupCode) { setLookupError('Enter a match code'); return; }

    setLookingUp(true);
    setLookupError('');
    setFoundWager(null);
    try {
      const data = await api.wagers.getByCode(lookupCode);
      setFoundWager(data);
    } catch (err: any) {
      setLookupError(err.error || 'Challenge not found');
    } finally {
      setLookingUp(false);
    }
  }, [enterCode]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) { navigate('/login'); return; }
    if (!foundWager) return;
    if (!acceptPhone.trim()) { setAcceptError('Phone number required'); return; }

    setAccepting(true);
    setAcceptError('');
    setAcceptSuccess('');
    try {
      const result = await api.wagers.accept(foundWager.id, acceptPhone.trim());
      setAcceptSuccess(result.message);
    } catch (err: any) {
      setAcceptError(err.error || 'Failed to accept challenge');
    } finally {
      setAccepting(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const shareCode = (code: string, stake: number) => {
    const text = `🎮 eFootball Wager Challenge!\n\nStake: KES ${stake}\nCode: ${code}\n\nAccept at: ${window.location.origin}/wagers?code=${code}`;
    if (navigator.share) {
      navigator.share({ title: 'Wager Challenge', text });
    } else {
      navigator.clipboard.writeText(text);
    }
  };

  // ─── HOME VIEW ────────────────────────────────────────────────
  if (view === 'home') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Wagers</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Challenge someone directly — no browsing needed</p>
        </div>

        {/* Two big action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Create */}
          <button
            onClick={() => { if (!auth) { navigate('/login'); return; } setView('create'); }}
            className="rounded-2xl p-6 text-left transition-all hover:scale-[1.02] group"
            style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-110" style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}>
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Create Challenge</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Set your stake, pay via M-Pesa, share the code</p>
          </button>

          {/* Enter Code */}
          <button
            onClick={() => { if (!auth) { navigate('/login'); return; } setView('enter'); }}
            className="rounded-2xl p-6 text-left transition-all hover:scale-[1.02] group"
            style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-110" style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Enter Code</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Got a code? Enter it to accept the challenge</p>
          </button>
        </div>

        {/* How it works */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-semibold text-white mb-4">How It Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              { step: '1', title: 'Create', desc: 'Set stake (KES 10–5,000), pay via M-Pesa', icon: '⚡' },
              { step: '2', title: 'Share Code', desc: 'Send the code via Telegram, SMS, or copy', icon: '📤' },
              { step: '3', title: 'Opponent Enters', desc: 'They enter the code and pay their stake', icon: '🎯' },
              { step: '4', title: 'Play & Confirm', desc: 'Play eFootball, both confirm the winner', icon: '🏆' },
            ].map(item => (
              <div key={item.step} className="flex gap-3 p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                <div className="text-xl">{item.icon}</div>
                <div>
                  <p className="text-xs font-semibold text-white">{item.step}. {item.title}</p>
                  <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick link to my wagers */}
        {auth && (
          <button
            onClick={() => navigate('/my-wagers')}
            className="w-full rounded-2xl p-4 flex items-center justify-between transition-all hover:scale-[1.01]"
            style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-bg-surface)' }}>
                <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">My Wagers</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">View your active and past challenges</p>
              </div>
            </div>
            <svg className="w-4 h-4 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // ─── CREATE VIEW ──────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        {/* Back */}
        <button onClick={() => { setView('home'); setCreatedWager(null); setCreateError(''); }} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {createdWager ? (
          /* ─── Success: Show code to share ─── */
          <div className="text-center space-y-6">
            <div className="rounded-2xl p-8" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-white mb-2">Challenge Created!</h2>
              <p className="text-sm text-[var(--color-text-muted)] mb-6">Share this code with your challenger</p>

              {/* Code display */}
              <div className="rounded-xl p-6 mb-6" style={{ background: 'var(--color-bg-surface)', border: '2px dashed var(--color-border)' }}>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Match Code</p>
                <p className="text-3xl font-mono font-bold text-white tracking-widest">{createdWager.matchCode}</p>
                <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                  <span className="text-[var(--color-text-muted)]">Stake: <span className="text-white font-bold">KES {createdWager.stakeAmount}</span></span>
                  <span className="text-[var(--color-text-dim)]">Pot: <span className="text-[#22c55e] font-bold">KES {createdWager.totalPot}</span></span>
                </div>
              </div>

              {/* Share buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => copyCode(createdWager.matchCode)}>
                  📋 Copy Code
                </Button>
                <Button variant="neon" onClick={() => shareCode(createdWager.matchCode, createdWager.stakeAmount)}>
                  📤 Share
                </Button>
              </div>

              <p className="text-[10px] text-[var(--color-text-dim)] mt-4">
                Waiting for challenger to enter this code and pay their stake
              </p>
            </div>

            <Button variant="ghost" onClick={() => navigate(`/wagers/${createdWager.id}`)}>
              View Challenge →
            </Button>
          </div>
        ) : (
          /* ─── Create form ─── */
          <div className="rounded-2xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <h2 className="text-xl font-bold text-white mb-1">Create Challenge</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">Set your stake and get a code to share</p>

            <form onSubmit={handleCreate} className="space-y-5">
              {createError && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  {createError}
                </div>
              )}

              {/* Stake */}
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
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">Min KES 10 · Max KES 5,000 · 10% platform fee</p>
              </div>

              {/* Phone */}
              <Input
                label="Your M-Pesa Number"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0712345678"
                required
              />

              {/* Pot preview */}
              {stake && Number(stake) >= 10 && (
                <div className="p-4 rounded-xl space-y-2" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">Your stake</span>
                    <span className="text-white font-medium">KES {Number(stake).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">Platform fee (10%)</span>
                    <span className="text-[#ef4444]">-KES {Math.ceil(Number(stake) * 0.1).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <span className="text-[var(--color-text-muted)] font-medium">Winner takes</span>
                    <span className="text-[#22c55e] font-bold">KES {(Number(stake) * 2 - Math.ceil(Number(stake) * 0.1)).toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setView('home')}>Cancel</Button>
                <Button type="submit" variant="neon" className="flex-1" isLoading={creating}>
                  {creating ? 'Creating...' : `Pay KES ${stake || '0'} & Get Code`}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ─── ENTER CODE VIEW ──────────────────────────────────────────
  if (view === 'enter') {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        {/* Back */}
        <button onClick={() => { setView('home'); setFoundWager(null); setLookupError(''); setAcceptSuccess(''); }} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Enter code form */}
        {!foundWager && (
          <div className="rounded-2xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <h2 className="text-xl font-bold text-white mb-1">Enter Challenge Code</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">Got a code from someone? Enter it here to accept</p>

            <form onSubmit={(e) => { e.preventDefault(); handleLookup(); }} className="space-y-4">
              {lookupError && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  {lookupError}
                </div>
              )}

              <Input
                label="Match Code"
                type="text"
                value={enterCode}
                onChange={e => setEnterCode(e.target.value.toUpperCase())}
                placeholder="W-XXXX-XXXX"
                maxLength={20}
                required
                autoFocus
              />

              <Button type="submit" variant="neon" className="w-full" isLoading={lookingUp}>
                {lookingUp ? 'Looking up...' : 'Look Up Challenge'}
              </Button>
            </form>
          </div>
        )}

        {/* Found wager details */}
        {foundWager && !acceptSuccess && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              {/* Header */}
              <div className="p-5 text-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <Badge variant={STATUS_META[foundWager.status]?.variant || 'open'}>
                  {STATUS_META[foundWager.status]?.label || foundWager.status}
                </Badge>
                <h3 className="text-lg font-bold text-white mt-3">Challenge from {foundWager.creatorName}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">Code: {foundWager.matchCode}</p>
              </div>

              {/* Stakes */}
              <div className="p-5 text-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="text-3xl font-bold text-white mb-1">KES {foundWager.stakeAmount}</div>
                <div className="text-xs text-[var(--color-text-dim)]">each player</div>
                <div className="mt-3 px-4 py-2 rounded-full inline-block" style={{ background: 'rgba(34,197,94,0.1)' }}>
                  <span className="text-sm font-bold text-[#4ade80]">Winner takes KES {foundWager.totalPot}</span>
                </div>
              </div>

              {/* Players */}
              <div className="grid grid-cols-2 divide-x" style={{ borderColor: 'var(--color-border)' }}>
                <div className="p-4 text-center">
                  <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}>
                    {foundWager.creatorName.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-white">{foundWager.creatorName}</p>
                  <p className="text-[10px] text-[var(--color-text-dim)]">Creator</p>
                </div>
                <div className="p-4 text-center">
                  {foundWager.challengerName ? (
                    <>
                      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>
                        {foundWager.challengerName.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-medium text-white">{foundWager.challengerName}</p>
                      <p className="text-[10px] text-[var(--color-text-dim)]">Challenger</p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-[var(--color-text-dim)]" style={{ background: 'var(--color-bg-surface)', border: '2px dashed var(--color-border)' }}>
                        ?
                      </div>
                      <p className="text-sm text-[var(--color-text-dim)]">Your spot</p>
                      <p className="text-[10px] text-[#fb923c] font-medium">Waiting for you</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Accept form */}
            {foundWager.status === 'open' && (
              <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                {acceptError && (
                  <div className="p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                    {acceptError}
                  </div>
                )}
                <form onSubmit={handleAccept} className="space-y-4">
                  <Input
                    label="Your M-Pesa Number"
                    type="tel"
                    value={acceptPhone}
                    onChange={e => setAcceptPhone(e.target.value)}
                    placeholder="0712345678"
                    required
                  />
                  <p className="text-[10px] text-[var(--color-text-dim)]">You'll pay KES {foundWager.stakeAmount} via STK push to accept</p>
                  <Button type="submit" variant="neon" className="w-full" isLoading={accepting}>
                    {accepting ? 'Processing...' : `Pay KES ${foundWager.stakeAmount} & Accept`}
                  </Button>
                </form>
              </div>
            )}

            {foundWager.status !== 'open' && (
              <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <p className="text-sm text-[var(--color-text-muted)]">
                  This challenge is no longer accepting new players.
                </p>
                <Button variant="outline" className="mt-3" onClick={() => navigate(`/wagers/${foundWager.id}`)}>
                  View Details
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Accept success */}
        {acceptSuccess && foundWager && (
          <div className="text-center space-y-4">
            <div className="rounded-2xl p-8" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-white mb-2">You're In!</h2>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">{acceptSuccess}</p>
              <div className="p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                <p className="text-xs text-[var(--color-text-dim)]">vs <span className="text-white font-medium">{foundWager.creatorName}</span></p>
                <p className="text-lg font-bold text-white mt-1">KES {foundWager.stakeAmount}</p>
              </div>
            </div>
            <Button variant="neon" onClick={() => navigate(`/wagers/${foundWager.id}`)}>
              View Challenge →
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
