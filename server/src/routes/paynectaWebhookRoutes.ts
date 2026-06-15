/**
 * Paynecta Webhook Routes
 *
 * Handles incoming payment event notifications from Paynecta.
 * These endpoints are called by Paynecta's servers — no auth required.
 */

import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// ─── In-memory dedup cache (event_id → timestamp) ───
const processedEvents = new Map<string, number>();
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of processedEvents) {
    if (now - ts > DEDUP_TTL_MS) processedEvents.delete(id);
  }
}, 10 * 60 * 1000);

function isDuplicate(eventId: string): boolean {
  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, Date.now());
  return false;
}

/**
 * POST /api/paynecta/webhook
 *
 * Paynecta sends payment events here.
 * Event types: payment.completed, payment.failed, payment.cancelled
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const payload = req.body;

  console.log('[Paynecta] Webhook received:', JSON.stringify(payload).slice(0, 500));

  // Validate payload structure
  if (!payload.event_type || !payload.event_id || !payload.data) {
    console.warn('[Paynecta] Invalid webhook payload');
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const { event_type, event_id, data } = payload;

  // Dedup check
  if (isDuplicate(event_id)) {
    console.log(`[Paynecta] Duplicate event ${event_id}, ignoring`);
    return res.json({ success: true, message: 'Already processed' });
  }

  // Extract transaction reference
  const transactionRef = data?.transaction?.reference;
  if (!transactionRef) {
    console.warn('[Paynecta] No transaction reference in webhook');
    return res.json({ success: true, message: 'No transaction ref' });
  }

  // Find pending payment by transaction reference
  const pendingPayment = db.prepare(`
    SELECT wp.*, wc.creator_id, wc.challenger_id
    FROM wager_payments wp
    JOIN wager_challenges wc ON wp.challenge_id = wc.id
    WHERE wp.paynecta_transaction_ref = ? AND wp.status = 'pending'
  `).get(transactionRef) as any;

  if (!pendingPayment) {
    console.log(`[Paynecta] No pending payment for ref ${transactionRef}`);
    return res.json({ success: true, message: 'No pending payment' });
  }

  // Handle by event type
  switch (event_type) {
    case 'payment.completed': {
      const receiptNumber = data?.MpesaReceiptNumber || 'UNKNOWN';

      // Mark payment as paid
      db.prepare(`
        UPDATE wager_payments SET status = 'paid', mpesa_receipt = ?, paid_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(String(receiptNumber), pendingPayment.id);

      console.log(`[Paynecta] Payment completed for wager ${pendingPayment.challenge_id}, receipt: ${receiptNumber}`);

      // Check if both players have paid
      const paidCount = db.prepare(`
        SELECT COUNT(*) as count FROM wager_payments
        WHERE challenge_id = ? AND status = 'paid'
      `).get(pendingPayment.challenge_id) as any;

      if (paidCount.count >= 2) {
        db.prepare(`UPDATE wager_challenges SET status = 'active' WHERE id = ?`).run(pendingPayment.challenge_id);
        console.log(`[Wager] Challenge ${pendingPayment.challenge_id} activated! Both players paid.`);
      } else if (paidCount.count === 1 && pendingPayment.payer_id === pendingPayment.creator_id) {
        db.prepare(`UPDATE wager_challenges SET status = 'open' WHERE id = ?`).run(pendingPayment.challenge_id);
        console.log(`[Wager] Challenge ${pendingPayment.challenge_id} is now open for challengers.`);
      }
      break;
    }

    case 'payment.failed': {
      const reason = data?.reason || 'Payment failed';

      db.prepare(`UPDATE wager_payments SET status = 'failed' WHERE id = ?`).run(pendingPayment.id);
      console.log(`[Paynecta] Payment failed for wager ${pendingPayment.challenge_id}: ${reason}`);

      // Cancel challenge if no other pending payments
      const otherPending = db.prepare(`
        SELECT COUNT(*) as c FROM wager_payments WHERE challenge_id = ? AND status = 'pending' AND id != ?
      `).get(pendingPayment.challenge_id, pendingPayment.id) as any;

      if (otherPending.c === 0) {
        db.prepare(`UPDATE wager_challenges SET status = 'cancelled' WHERE id = ?`).run(pendingPayment.challenge_id);
      }
      break;
    }

    case 'payment.cancelled': {
      const reason = data?.reason || 'Payment cancelled';

      db.prepare(`UPDATE wager_payments SET status = 'cancelled' WHERE id = ?`).run(pendingPayment.id);
      console.log(`[Paynecta] Payment cancelled for wager ${pendingPayment.challenge_id}: ${reason}`);

      // Cancel challenge if no other pending payments
      const otherPending = db.prepare(`
        SELECT COUNT(*) as c FROM wager_payments WHERE challenge_id = ? AND status = 'pending' AND id != ?
      `).get(pendingPayment.challenge_id, pendingPayment.id) as any;

      if (otherPending.c === 0) {
        db.prepare(`UPDATE wager_challenges SET status = 'cancelled' WHERE id = ?`).run(pendingPayment.challenge_id);
      }
      break;
    }

    default:
      console.warn(`[Paynecta] Unknown event type: ${event_type}`);
  }

  return res.json({ success: true, message: 'Webhook processed' });
});

/**
 * GET /api/paynecta/health
 * Simple health check for webhook endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'paynecta-webhook' });
});

export default router;
