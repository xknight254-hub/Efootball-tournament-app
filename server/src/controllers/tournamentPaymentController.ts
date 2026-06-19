/**
 * Tournament Payment Controller
 *
 * Handles M-Pesa STK Push for tournament entry fees.
 * Flow:
 *  1. Player requests to join paid tournament → STK Push sent to their phone
 *  2. Player pays on phone → M-Pesa callback confirms payment
 *  3. Player is registered in the tournament
 */

import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { stkPush } from '../services/mpesaService.js';

// In-memory store for pending tournament payments (checkoutRequestId → data)
const pendingPayments = new Map<string, { tournamentId: number; userId: number }>();

export function getPendingPayments() {
  return pendingPayments;
}

/**
 * POST /api/tournaments/:id/pay
 * Initiate M-Pesa STK Push for tournament entry fee
 */
export async function initiateTournamentPayment(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const tournamentId = parseInt(id);
  if (isNaN(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  // Format phone
  let phone = (phoneNumber as string).replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (phone.startsWith('+')) phone = phone.slice(1);

  if (!phone.match(/^2547\d{8}$/)) {
    return res.status(400).json({ error: 'Valid Safaricom number required (e.g. 0712345678)' });
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  if (tournament.status !== 'open' && tournament.status !== 'registration_open') {
    return res.status(400).json({ error: 'Registration is closed for this tournament' });
  }

  const entryFee = tournament.entry_fee || 0;
  if (entryFee <= 0) {
    return res.status(400).json({ error: 'This tournament is free. Use /join instead.' });
  }

  // Check already registered
  const existing = db.prepare(
    'SELECT * FROM participants WHERE tournament_id = ? AND user_id = ?'
  ).get(tournamentId, req.user.id);
  if (existing) {
    return res.status(400).json({ error: 'You are already registered in this tournament' });
  }

  // Check capacity
  const participantCount = db.prepare(
    'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
  ).get(tournamentId) as { count: number };
  if (participantCount.count >= tournament.max_players) {
    return res.status(400).json({ error: 'Tournament is full' });
  }

  // Check for existing pending payment
  const existingPending = db.prepare(`
    SELECT id FROM tournament_payments
    WHERE tournament_id = ? AND user_id = ? AND status = 'pending'
    AND created_at > datetime('now', '-10 minutes')
  `).get(tournamentId, req.user.id);
  if (existingPending) {
    return res.status(400).json({ error: 'You already have a pending payment. Wait 10 minutes or let it expire.' });
  }

  // Initiate M-Pesa STK Push
  const accountRef = `tournament-${tournamentId}-user-${req.user.id}`;
  const result = await stkPush({
    phoneNumber: phone,
    amount: entryFee,
    accountReference: accountRef,
    transactionDesc: `Entry: ${tournament.name.slice(0, 10)}`,
  });

  if (!result.success) {
    return res.status(502).json({ error: result.message || 'M-Pesa payment failed. Try again.' });
  }

  // Record pending payment
  db.prepare(`
    INSERT INTO tournament_payments (tournament_id, user_id, amount, checkout_request_id, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(tournamentId, req.user.id, entryFee, result.checkoutRequestId);

  // Store in memory for callback lookup
  pendingPayments.set(result.checkoutRequestId!, { tournamentId, userId: req.user.id });

  res.json({
    message: 'Check your phone for the M-Pesa prompt',
    checkoutRequestId: result.checkoutRequestId,
    amount: entryFee,
  });
}

/**
 * POST /api/tournaments/payment-callback
 * M-Pesa Daraja callback — called by Safaricom after STK Push
 */
export async function tournamentPaymentCallback(req: AuthRequest, res: Response) {
  const body = req.body;
  console.log('[Tournament Payment Callback]', JSON.stringify(body).slice(0, 500));

  try {
    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback) {
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    // Find the pending payment
    const payment = db.prepare(
      'SELECT * FROM tournament_payments WHERE checkout_request_id = ? AND status = \'pending\''
    ).get(checkoutRequestId) as any;

    if (!payment) {
      console.log('[Tournament Payment] No pending payment for', checkoutRequestId);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (resultCode === 0) {
      // Payment successful — extract amount from callback metadata
      const metadata = stkCallback.CallbackMetadata;
      let amount = payment.amount;
      if (metadata?.Item) {
        const amountItem = metadata.Item.find((i: any) => i.Name === 'Amount');
        if (amountItem) amount = amountItem.Value;
      }

      // Register participant
      const participantCount = db.prepare(
        'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
      ).get(payment.tournament_id) as { count: number };

      const seed = participantCount.count + 1;
      db.prepare(
        'INSERT INTO participants (tournament_id, user_id, seed, status) VALUES (?, ?, ?, ?)'
      ).run(payment.tournament_id, payment.user_id, seed, 'registered');

      // Mark payment as completed
      db.prepare(
        'UPDATE tournament_payments SET status = \'completed\', amount = ? WHERE id = ?'
      ).run(amount, payment.id);

      console.log(`[Tournament Payment] User ${payment.user_id} joined tournament ${payment.tournament_id}`);
    } else {
      // Payment failed or cancelled
      db.prepare(
        'UPDATE tournament_payments SET status = \'failed\', failure_reason = ? WHERE id = ?'
      ).run(resultDesc, payment.id);
      console.log(`[Tournament Payment] Failed: ${resultDesc}`);
    }

    // Clean up memory
    pendingPayments.delete(checkoutRequestId);

    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err: any) {
    console.error('[Tournament Payment Callback Error]', err.message);
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
}

/**
 * GET /api/tournaments/:id/payment-status/:checkoutId
 * Poll for payment status (for frontend to check after STK Push)
 */
export async function checkTournamentPaymentStatus(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { checkoutId } = req.params;

  const payment = db.prepare(
    'SELECT * FROM tournament_payments WHERE checkout_request_id = ? AND user_id = ?'
  ).get(checkoutId, req.user.id) as any;

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json({
    status: payment.status,
    amount: payment.amount,
    failureReason: payment.failure_reason,
  });
}
