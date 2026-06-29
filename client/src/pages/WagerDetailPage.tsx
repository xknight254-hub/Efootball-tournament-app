import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

interface WagerDetail {
  id: number;
  creatorId: number;
  creatorName: string;
  challengerId?: number;
  challengerName?: string;
  stakeAmount: number;
  commission: number;
  totalPot: number;
  matchCode: string;
  status: string;
  winnerId?: number;
  creatorConfirmed: boolean;
  challengerConfirmed: boolean;
  disputeReason?: string;
  createdAt: string;
  expiresAt?: string;
  completedAt?: string;
}

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

export function WagerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [wager, setWager] = useState<WagerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmWinner, setConfirmWinner] = useState<'creator' | 'challenger'>('creator');
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ success: boolean; message: string } | null>(null);

  // Dispute modal
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputing, setDisputing] = useState(false);
  const [disputeResult, setDisputeResult] = useState('');

  const loadWager = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError('');
      const data = await api.wagers.get(parseInt(id));
      setWager(data);
    } catch (err: any) {
      setError(err.error || 'Failed to load wager');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadWager(); }, [loadWager]);

  const isParticipant = user && wager && (user.id === wager.creatorId || user.id === wager.challengerId);
  const isCreator = user && wager && user.id === wager.creatorId;
  const isChallenger = user && wager && user.id === wager.challengerId;
  const hasConfirmed = (isCreator && wager?.creatorConfirmed) || (isChallenger && wager?.challengerConfirmed);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wager) return;
    setConfirming(true);
    setConfirmResult(null);
    try {
      const result = await api.wagers.confirm(wager.id, confirmWinner);
      setConfirmResult({ success: true, message: result.message });
      loadWager();
    } catch (err: any) {
      setConfirmResult({ success: false, message: err.error || 'Failed to confirm' });
    } finally {
      setConfirming(false);
    }
  };

  const handleDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wager || !disputeReason.trim()) return;
    setDisputing(true);
    setDisputeResult('');
    try {
      const result = await api.wagers.dispute(wager.id, disputeReason.trim());
      setDisputeResult(result.message);
      loadWager();
    } catch (err: any) {
      setDisputeResult(err.error || 'Failed to dispute');
    } finally {
      setDisputing(false);
    }
  };

  const handleCancel = async () => {
    if (!wager || !confirm('Cancel this wager?')) return;
    try {
      await api.wagers.cancel(wager.id);
      navigate('/wagers');
    } catch (err: any) {
      setError(err.error || 'Failed to cancel');
    }
  };

  const copyCode = () => {
    if (wager) navigator.clipboard.writeText(wager.matchCode);
  };

  const shareCode = () => {
    if (!wager) return;
    const text = `🎮 eFootball Wager Challenge!\n\nStake: KES ${wager.stakeAmount}\nCode: ${wager.matchCode}\n\nAccept at: ${window.location.origin}/wagers?code=${wager.matchCode}`;
    if (navigator.share) {
      navigator.share({ title: 'Wager Challenge', text });
    } else {
      navigator.clipboard.writeText(text);
    }
  };

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48" />
    </div>
  );

  if (error || !wager) return (
    <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <h2 className="text-xl font-bold text-white mb-4">Not Found</h2>
      <p className="text-[var(--color-text-muted)] mb-6">{error || 'Wager does not exist.'}</p>
      <Link to="/wagers"><Button variant="primary">Go to Wagers</Button></Link>
    </div>
  );

  const meta = STATUS_META[wager.status] || { label: wager.status, variant: 'open' as const };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/wagers')} className="btn-ghost btn-icon" aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Wager #{wager.id}</h1>
              <Badge variant={meta.variant} pulse={meta.variant === 'live'}>{meta.label}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {wager.status === 'open' && (
            <Button variant="outline" size="sm" onClick={shareCode}>📤 Share Code</Button>
          )}
          {isCreator && ['open', 'awaiting_payment'].includes(wager.status) && (
            <Button variant="danger" size="sm" onClick={handleCancel}>Cancel</Button>
          )}
        </div>
      </div>

      {/* Code card (prominent when open) */}
      {wager.status === 'open' && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '2px dashed var(--color-border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider mb-1">Match Code</p>
              <p className="text-2xl font-mono font-bold text-white tracking-wider">{wager.matchCode}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyCode}>📋 Copy</Button>
              <Button variant="neon" size="sm" onClick={shareCode}>📤 Share</Button>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-dim)] mt-3">
            Share this code with your challenger. They enter it at <span className="text-[var(--color-text-secondary)]">{window.location.origin}/wagers</span>
          </p>
        </div>
      )}

      {/* Players Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--color-border)' }}>
          {/* Creator */}
          <div className="p-4 sm:p-6 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-lg font-bold" style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}>
              {wager.creatorName.charAt(0).toUpperCase()}
            </div>
            <p className="text-sm font-medium text-white truncate">{wager.creatorName}</p>
            <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">Creator</p>
            {wager.creatorConfirmed && (
              <div className="mt-2 text-[10px] text-[#22c55e] font-medium">✓ Confirmed</div>
            )}
          </div>

          {/* VS / Stakes */}
          <div className="p-4 sm:p-6 text-center flex flex-col items-center justify-center">
            <div className="text-2xl font-black text-[var(--color-text-dim)] mb-2">VS</div>
            <div className="text-xl font-bold text-white">KES {wager.stakeAmount}</div>
            <div className="text-[10px] text-[var(--color-text-dim)] mt-1">each</div>
            <div className="mt-3 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
              Pot: KES {wager.totalPot}
            </div>
          </div>

          {/* Challenger */}
          <div className="p-4 sm:p-6 text-center">
            {wager.challengerName ? (
              <>
                <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-lg font-bold" style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>
                  {wager.challengerName.charAt(0).toUpperCase()}
                </div>
                <p className="text-sm font-medium text-white truncate">{wager.challengerName}</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">Challenger</p>
                {wager.challengerConfirmed && (
                  <div className="mt-2 text-[10px] text-[#22c55e] font-medium">✓ Confirmed</div>
                )}
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-[var(--color-text-dim)] text-lg font-bold" style={{ background: 'var(--color-bg-surface)', border: '2px dashed var(--color-border)' }}>
                  ?
                </div>
                <p className="text-sm text-[var(--color-text-dim)]">Waiting...</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">Challenger</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status-specific content */}
      {wager.status === 'active' && isParticipant && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold text-white mb-4">Match in Progress</h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Play your eFootball match. When done, both players must confirm the winner.
          </p>

          {hasConfirmed ? (
            <div className="p-4 rounded-xl text-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <p className="text-sm text-[#4ade80] font-medium">✓ You've confirmed your result</p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">Waiting for the other player to confirm...</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="neon"
                className="flex-1"
                onClick={() => { setConfirmWinner(isCreator ? 'creator' : 'challenger'); setShowConfirm(true); }}
              >
                I Won
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setConfirmWinner(isCreator ? 'challenger' : 'creator'); setShowConfirm(true); }}
              >
                Opponent Won
              </Button>
              <Button
                variant="ghost"
                className="flex-1 text-[#fbbf24]"
                onClick={() => setShowDispute(true)}
              >
                Dispute
              </Button>
            </div>
          )}
        </div>
      )}

      {wager.status === 'pending_confirmation' && isParticipant && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold text-white mb-3">Confirming Result</h3>
          {hasConfirmed ? (
            <div className="p-4 rounded-xl text-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <p className="text-sm text-[#4ade80] font-medium">✓ You've confirmed. Waiting for the other player...</p>
            </div>
          ) : (
            <div className="p-4 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="text-sm text-[#fbbf24] font-medium mb-3">The other player has confirmed. Please confirm or dispute.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="neon" className="flex-1" onClick={() => setShowConfirm(true)}>Confirm Result</Button>
                <Button variant="ghost" className="flex-1 text-[#fbbf24]" onClick={() => setShowDispute(true)}>Dispute</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {wager.status === 'completed' && (
        <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-3xl mb-3">🏆</div>
          <h3 className="text-lg font-bold text-white mb-1">Challenge Complete</h3>
          {wager.winnerId && (
            <p className="text-sm text-[#4ade80] font-medium">
              Winner: {wager.winnerId === wager.creatorId ? wager.creatorName : wager.challengerName} — KES {wager.totalPot}
            </p>
          )}
          {wager.completedAt && (
            <p className="text-xs text-[var(--color-text-dim)] mt-2">
              Completed {new Date(wager.completedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {wager.status === 'disputed' && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h3 className="text-base font-semibold text-[#fbbf24]">Dispute Under Review</h3>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            An admin will review this dispute within 24 hours. Both players may be contacted via Telegram.
          </p>
          {wager.disputeReason && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
              <p className="text-xs text-[var(--color-text-dim)] mb-1">Dispute reason:</p>
              <p className="text-sm text-[var(--color-text-secondary)]">{wager.disputeReason}</p>
            </div>
          )}
        </div>
      )}

      {/* Details */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-base font-semibold text-white mb-4">Details</h3>
        <div className="space-y-3 text-sm">
          {[
            ['Match Code', wager.matchCode],
            ['Stake (each)', `KES ${wager.stakeAmount}`],
            ['Platform Fee', `KES ${wager.commission} (10%)`],
            ['Winner Takes', `KES ${wager.totalPot}`],
            ['Created', new Date(wager.createdAt).toLocaleString()],
            ...(wager.completedAt ? [['Completed', new Date(wager.completedAt).toLocaleString()]] : []),
          ].map(([label, value], i) => (
            <div key={i} className="flex justify-between py-2" style={{ borderBottom: i < 5 ? '1px solid var(--color-border-subtle)' : 'none' }}>
              <span className="text-[var(--color-text-muted)]">{label}</span>
              <span className="text-white font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Modal */}
      <Modal isOpen={showConfirm} onClose={() => { setShowConfirm(false); setConfirmResult(null); }} title="Confirm Result" size="sm">
        <div className="space-y-4">
          {confirmResult ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">{confirmResult.success ? '✅' : '❌'}</div>
              <p className="text-sm text-white">{confirmResult.message}</p>
              <Button variant="outline" className="mt-4" onClick={() => { setShowConfirm(false); setConfirmResult(null); }}>Close</Button>
            </div>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-4">
              <p className="text-sm text-[var(--color-text-muted)]">
                Who won the match? Both players must agree for the payout to be processed.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmWinner('creator')}
                  className="p-4 rounded-xl text-center transition-all"
                  style={{
                    background: confirmWinner === 'creator' ? 'rgba(249,115,22,0.15)' : 'var(--color-bg-surface)',
                    border: `2px solid ${confirmWinner === 'creator' ? '#F97316' : 'var(--color-border)'}`,
                  }}
                >
                  <div className="text-lg font-bold text-white">{wager.creatorName}</div>
                  <div className="text-[10px] text-[var(--color-text-dim)]">Creator</div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmWinner('challenger')}
                  className="p-4 rounded-xl text-center transition-all"
                  style={{
                    background: confirmWinner === 'challenger' ? 'rgba(249,115,22,0.15)' : 'var(--color-bg-surface)',
                    border: `2px solid ${confirmWinner === 'challenger' ? '#F97316' : 'var(--color-border)'}`,
                  }}
                >
                  <div className="text-lg font-bold text-white">{wager.challengerName || 'Challenger'}</div>
                  <div className="text-[10px] text-[var(--color-text-dim)]">Challenger</div>
                </button>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>Cancel</Button>
                <Button type="submit" variant="neon" className="flex-1" isLoading={confirming}>
                  {confirming ? 'Confirming...' : 'Confirm'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* Dispute Modal */}
      <Modal isOpen={showDispute} onClose={() => { setShowDispute(false); setDisputeResult(''); setDisputeReason(''); }} title="Dispute Result" size="sm">
        <div className="space-y-4">
          {disputeResult ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-sm text-white">{disputeResult}</p>
              <Button variant="outline" className="mt-4" onClick={() => { setShowDispute(false); setDisputeResult(''); }}>Close</Button>
            </div>
          ) : (
            <form onSubmit={handleDispute} className="space-y-4">
              <p className="text-sm text-[var(--color-text-muted)]">
                Raising a dispute will pause the challenge and notify an admin. Only use this if there's a genuine disagreement.
              </p>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Reason</label>
                <textarea
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  placeholder="Describe the issue..."
                  className="input-field min-h-[80px] resize-none"
                  maxLength={500}
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDispute(false)}>Cancel</Button>
                <Button type="submit" variant="danger" className="flex-1" isLoading={disputing}>
                  {disputing ? 'Submitting...' : 'Raise Dispute'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}
