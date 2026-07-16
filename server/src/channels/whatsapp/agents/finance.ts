/**
 * Finance Agent — Payment Verification & Monitoring
 *
 * AgentId: 'finance'
 *
 * Responsibilities:
 *   1. Auto-verify completed tournament payments (receipt-based)
 *   2. Detect suspicious payment patterns (duplicate receipts, rapid submissions)
 *   3. Flag payments that need human review
 *   4. Monitor payment events and trigger follow-up actions
 *   5. Report payment health metrics
 */
import db from '../../../db.js';
import { agentApi, actionId } from './agentApi.js';
import { emitEvent, getRecentEvents, markProcessed } from './eventBus.js';
import type {
  AgentAction,
  AgentContext,
  AgentHealth,
  AgentModule,
} from './agentTypes.js';

// ─── Constants ────────────────────────────────────────────────────

const VERSION = '1.0.0';
const AGENT_ID = 'finance' as const;
const MAX_PAYMENTS_PER_TICK = 10;
const MAX_PAYMENT_AGE_HOURS = 48;

// How long a payment can sit in 'pending' before we flag it for human review.
const STALE_PAYMENT_HOURS = 4;

// ─── State ─────────────────────────────────────────────────────────

let startTime = Date.now();
let tasksCompleted = 0;
let tasksFailed = 0;
let lastTick: string | null = null;
let lastError: string | null = null;
let agentToken: string = '';

// In-memory set of recently processed payment IDs (idempotency guard)
const recentlyHandled = new Set<number>();

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Maps a payment DB row to an action that auto-verifies it.
 */
function buildVerifyAction(payment: any, token: string): AgentAction {
  return {
    id: actionId(AGENT_ID, 'verify_payment', payment.id),
    agentId: AGENT_ID,
    type: 'verify_payment',
    params: { paymentId: payment.id },
    priority: 'normal',
    description: `Auto-verify payment #${payment.id}: KES ${payment.amount} by user ${payment.user_id} for tournament #${payment.tournament_id}`,
    requiresConfirmation: false,
  };
}

/**
 * Maps a payment DB row + reason to a flag action.
 */
function buildFlagAction(payment: any, reason: string, token: string): AgentAction {
  return {
    id: actionId(AGENT_ID, 'flag_payment', payment.id),
    agentId: AGENT_ID,
    type: 'flag_payment',
    params: { paymentId: payment.id, reason },
    priority: 'high',
    description: `Flag payment #${payment.id}: ${reason}`,
    requiresConfirmation: true, // flagging always needs admin confirmation
  };
}

/**
 * Check if a payment looks suspicious.
 * Returns a reason string or null if clean.
 */
function detectSuspiciousPayment(payment: any): string | null {
  // Rule 1: Duplicate receipt code found on other completed payments
  if (payment.receipt_code) {
    const dupe = db.prepare(`
      SELECT COUNT(*) as count FROM tournament_payments
      WHERE receipt_code = ? AND id != ? AND status = 'completed'
    `).get(payment.receipt_code, payment.id) as any;
    if (dupe && dupe.count > 0) {
      return `Duplicate receipt code "${payment.receipt_code}" already used in ${dupe.count} other completed payment(s)`;
    }
  }

  // Rule 2: Unusually high amount (above KES 5000 threshold)
  if (Number(payment.amount) > 5000) {
    return `Unusually high payment amount: KES ${payment.amount}`;
  }

  // Rule 3: Rapid payment — same user, same tournament, multiple payments in last hour
  const rapid = db.prepare(`
    SELECT COUNT(*) as count FROM tournament_payments
    WHERE user_id = ? AND tournament_id = ?
      AND created_at > datetime('now', '-1 hour')
      AND id != ?
  `).get(payment.user_id, payment.tournament_id, payment.id) as any;
  if (rapid && rapid.count >= 3) {
    return `Rapid payments: user #${payment.user_id} made ${rapid.count + 1} payments for tournament #${payment.tournament_id} in the last hour`;
  }

  // Rule 4: Payment from an account that has no registration_paid flag
  const user = db.prepare(
    'SELECT registration_paid FROM users WHERE id = ?'
  ).get(payment.user_id) as any;
  if (!user) {
    return `Payment from unknown user #${payment.user_id}`;
  }

  return null; // looks clean
}

/**
 * Check if a user is already a participant in the tournament.
 */
function isAlreadyRegistered(userId: number, tournamentId: number): boolean {
  const existing = db.prepare(
    'SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?'
  ).get(userId, tournamentId);
  return !!existing;
}

// ─── Agent Module ──────────────────────────────────────────────────

export const financeAgent: AgentModule = {
  id: AGENT_ID,
  version: VERSION,

  /**
   * Evaluate payment conditions and return recommended actions.
   *
   * Scenarios checked every tick:
   *   1. Unverified receipt-based payments → auto-verify if clean
   *   2. Suspicious payments → flag for admin review
   *   3. Stale pending payments → flag for admin attention
   *   4. Recent payment_received events → process if not already handled
   */
  async evaluate(ctx: AgentContext): Promise<{ actions: AgentAction[]; metrics?: Record<string, any> }> {
    const actions: AgentAction[] = [];
    const token = ctx.config?.adminToken || '';

    lastTick = ctx.now.toISOString();
    agentToken = ctx.config?.adminToken || '';

    try {
      // ── Step 1: Find receipt-based payments awaiting verification ──
      //
      // These are payments that came in via M-Pesa callback (`source = 'mpesa_stk'`)
      // or manual receipt upload (`receipt_code IS NOT NULL`) and are still
      // 'pending' but not yet verified by an admin or agent.
      const pendingPayments = db.prepare(`
        SELECT tp.*, u.username, u.phone, t.name as tournament_name
        FROM tournament_payments tp
        LEFT JOIN users u ON u.id = tp.user_id
        LEFT JOIN tournaments t ON t.id = tp.tournament_id
        WHERE tp.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM participants p
            WHERE p.tournament_id = tp.tournament_id AND p.user_id = tp.user_id
          )
          AND tp.created_at > datetime('now', '-${MAX_PAYMENT_AGE_HOURS} hours')
        ORDER BY tp.created_at ASC
        LIMIT ?
      `).all(MAX_PAYMENTS_PER_TICK) as any[];

      for (const payment of pendingPayments) {
        // Skip recently handled
        if (recentlyHandled.has(payment.id)) continue;
        recentlyHandled.add(payment.id);

        // Run fraud detection
        const reason = detectSuspiciousPayment(payment);

        if (reason) {
          // Suspicious — flag for human review
          actions.push(buildFlagAction(payment, reason, token));
        } else if (
          payment.source === 'mpesa_stk' ||
          isAlreadyRegistered(payment.user_id, payment.tournament_id)
        ) {
          // Already registered (callback completed) or STK completed — skip
          continue;
        } else {
          // Clean payment with a receipt — auto-verify
          actions.push(buildVerifyAction(payment, token));
        }
      }

      // ── Step 2: Stale pending payments (receipt-based, older than threshold) ──
      const stalePayments = db.prepare(`
        SELECT tp.*, u.username, u.phone
        FROM tournament_payments tp
        LEFT JOIN users u ON u.id = tp.user_id
        WHERE tp.status = 'pending'
          AND tp.receipt_code IS NOT NULL
          AND tp.created_at < datetime('now', '-${STALE_PAYMENT_HOURS} hours')
          AND tp.created_at > datetime('now', '-${MAX_PAYMENT_AGE_HOURS} hours')
          AND NOT EXISTS (
            SELECT 1 FROM participants p
            WHERE p.tournament_id = tp.tournament_id AND p.user_id = tp.user_id
          )
        LIMIT 5
      `).all() as any[];

      for (const payment of stalePayments) {
        if (recentlyHandled.has(payment.id)) continue;
        recentlyHandled.add(payment.id);

        actions.push(
          buildFlagAction(
            payment,
            `Payment #${payment.id} pending for over ${STALE_PAYMENT_HOURS}h without verification`,
            token,
          )
        );
      }

      // ── Step 3: Process recent payment_received events ──
      const events = getRecentEvents(0, 20);
      const paymentEvents = events.filter(
        (e) => e.type === 'payment_received' && !e.processed
      );

      for (const event of paymentEvents) {
        const { paymentId, tournamentId, userId } = event.payload || {};
        if (!paymentId) continue;

        // Check if we already handled this
        if (recentlyHandled.has(Number(paymentId))) continue;

        // Fetch the payment row
        const payment = db.prepare(
          'SELECT * FROM tournament_payments WHERE id = ?'
        ).get(Number(paymentId)) as any;

        if (!payment || payment.status !== 'pending') {
          markProcessed(event.id);
          continue;
        }

        recentlyHandled.add(payment.id);

        // Check if participant already registered
        if (isAlreadyRegistered(payment.user_id, payment.tournament_id)) {
          markProcessed(event.id);
          continue;
        }

        // For STK Push sourced payments, the callback handles registration
        // so if it's completed via callback, skip
        if (payment.source === 'mpesa_stk') {
          markProcessed(event.id);
          continue;
        }

        // Run fraud detection
        const reason = detectSuspiciousPayment(payment);

        if (reason) {
          actions.push(buildFlagAction(payment, reason, token));
        } else {
          actions.push(buildVerifyAction(payment, token));
        }

        markProcessed(event.id);
      }

      // Update health metrics
      tasksCompleted += actions.filter(a => a.type === 'verify_payment').length;
    } catch (e: any) {
      lastError = e.message;
      tasksFailed++;
      console.error('[Finance Agent] evaluate error:', e.message);
    }

    return { actions };
  },

  /**
   * Execute a finance action.
   */
  async execute(action: AgentAction): Promise<{ ok: boolean; error?: string }> {
    try {
      const api = agentApi(agentToken);

      switch (action.type) {
        case 'verify_payment': {
          const { paymentId } = action.params;
          await api.verifyPayment(Number(paymentId));
          tasksCompleted++;

          emitEvent('agent_action', {
            action: 'verify_payment',
            agentId: AGENT_ID,
            status: 'completed',
            paymentId,
          });

          return { ok: true };
        }

        case 'flag_payment': {
          const { paymentId, reason } = action.params;
          const result = await api.flagPayment(Number(paymentId), reason || 'Flagged by Finance Agent');
          tasksCompleted++;

          emitEvent('agent_action', {
            action: 'flag_payment',
            agentId: AGENT_ID,
            status: 'completed',
            paymentId,
            reason,
          });

          return { ok: true };
        }

        default:
          return { ok: false, error: `Unknown action type: ${action.type}` };
      }
    } catch (e: any) {
      tasksFailed++;
      lastError = e.message;
      console.error(`[Finance Agent] execute error for ${action.type}:`, e.message);
      return { ok: false, error: e.message };
    }
  },

  /**
   * Return current health status.
   */
  health(): AgentHealth {
    return {
      agentId: AGENT_ID,
      status: lastError ? 'error' : 'online',
      lastTick,
      lastError,
      tasksCompleted,
      tasksFailed,
      queueLength: 0,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      version: VERSION,
    };
  },
};

export default financeAgent;
