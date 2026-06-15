/**
 * Wager Controller — Paynecta Edition
 *
 * Payment flow:
 *  1. Creator sets stake + pays via Paynecta STK Push
 *  2. Paynecta webhook confirms payment → challenge goes 'open'
 *  3. Challenger accepts + pays via Paynecta STK Push
 *  4. Paynecta webhook confirms → challenge goes 'active'
 *  5. Players play, confirm results
 *  6. Winner takes pot (payout handled separately — Paynecta is receive-only)
 */

import { Request, Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { sanitizeString } from '../utils/sanitize.js';
import paynectaService from '../services/paynectaService.js';

// ─── Config ───
const WAGER_COMMISSION_RATE = 0.10; // 10%
const PAYNECTA_LINK_CODE = process.env.PAYNECTA_PAYMENT_LINK_CODE || '';

// ─── Create a wager challenge ───
export async function createWager(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { stakeAmount, phoneNumber } = req.body;

  const stake = Number(stakeAmount);
  if (!stake || isNaN(stake) || stake < 10 || stake > 5000) {
    return res.status(400).json({ error: 'Stake must be between KES 10 and KES 5,000' });
  }

  let phone = (phoneNumber || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (!phone.match(/^2547\d{8}$/)) {
    return res.status(400).json({ error: 'Valid Safaricom number required (e.g. 0712345678)' });
  }

  if (!PAYNECTA_LINK_CODE) {
    return res.status(500).json({ error: 'Paynecta payment link not configured. Set PAYNECTA_PAYMENT_LINK_CODE.' });
  }

  // Check for existing unpaid wager
  const existing = db.prepare(`
    SELECT id FROM wager_challenges
    WHERE creator_id = ? AND status IN ('awaiting_payment', 'open') AND created_at > datetime('now', '-10 minutes')
  `).get(req.user.id);

  if (existing) {
    return res.status(400).json({ error: 'You already have a pending challenge. Wait 10 minutes or cancel it first.' });
  }

  const commission = Math.ceil(stake * WAGER_COMMISSION_RATE);
  const totalPot = stake * 2 - commission;
  const matchCode = 'W-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

  const result = db.prepare(`
    INSERT INTO wager_challenges (creator_id, stake_amount, commission, total_pot, match_code, creator_telegram_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment')
  `).run(req.user.id, stake, commission, totalPot, matchCode, String(req.user.telegram_id || ''));

  const challengeId = result.lastInsertRowid;

  // Initiate Paynecta STK Push
  const paymentResult = await paynectaService.initializePayment(PAYNECTA_LINK_CODE, phone, stake);

  if (!paymentResult.success && !paymentResult.transactionReference) {
    db.prepare(`UPDATE wager_challenges SET status = 'cancelled' WHERE id = ?`).run(challengeId);
    return res.status(502).json({ error: paymentResult.message || 'Payment initiation failed.' });
  }

  // Record payment as pending
  db.prepare(`
    INSERT INTO wager_payments (challenge_id, payer_id, amount, status, paynecta_transaction_ref)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(challengeId, req.user.id, stake, paymentResult.transactionReference || null);

  const challenge = db.prepare(`
    SELECT wc.*, u.username as creator_name
    FROM wager_challenges wc JOIN users u ON wc.creator_id = u.id
    WHERE wc.id = ?
  `).get(challengeId);

  res.status(201).json({
    challenge: {
      id: challenge.id,
      creatorName: challenge.creator_name,
      stakeAmount: challenge.stake_amount,
      commission: challenge.commission,
      totalPot: challenge.total_pot,
      matchCode: challenge.match_code,
      status: challenge.status,
      phoneNumber: phone,
      createdAt: challenge.created_at,
    },
    payment: {
      message: paymentResult.message,
      transactionReference: paymentResult.transactionReference,
    },
  });
}

// ─── List open challenges ───
export async function listOpenWagers(req: AuthRequest, res: Response) {
  const { minStake, maxStake, limit = 20, offset = 0 } = req.query;

  let query = `
    SELECT wc.*, u.username as creator_name
    FROM wager_challenges wc
    JOIN users u ON wc.creator_id = u.id
    WHERE wc.status = 'open'
  `;
  const params: any[] = [];

  if (minStake) { query += ' AND wc.stake_amount >= ?'; params.push(Number(minStake)); }
  if (maxStake) { query += ' AND wc.stake_amount <= ?'; params.push(Number(maxStake)); }

  query += ' ORDER BY wc.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const wagers = db.prepare(query).all(...params);
  const total = db.prepare("SELECT COUNT(*) as count FROM wager_challenges WHERE status = 'open'").get() as any;

  res.json({
    wagers: wagers.map((w: any) => ({
      id: w.id,
      creatorName: w.creator_name,
      stakeAmount: w.stake_amount,
      totalPot: w.total_pot,
      matchCode: w.match_code,
      createdAt: w.created_at,
    })),
    total: total.count,
    limit: Number(limit),
    offset: Number(offset),
  });
}

// ─── Get wager by match code ───
export async function getWagerByCode(req: AuthRequest, res: Response) {
  const { matchCode } = req.params;
  if (!matchCode || typeof matchCode !== 'string') {
    return res.status(400).json({ error: 'Match code required' });
  }

  const wager = db.prepare(`
    SELECT wc.*,
      c.username as creator_name,
      c.phone as creator_phone,
      ch.username as challenger_name,
      ch.phone as challenger_phone
    FROM wager_challenges wc
    JOIN users c ON wc.creator_id = c.id
    LEFT JOIN users ch ON wc.challenger_id = ch.id
    WHERE wc.match_code = ?
  `).get(matchCode.trim().toUpperCase()) as any;

  if (!wager) return res.status(404).json({ error: 'Wager not found' });

  res.json({
    id: wager.id,
    creatorId: wager.creator_id,
    creatorName: wager.creator_name,
    challengerId: wager.challenger_id,
    challengerName: wager.challenger_name || null,
    stakeAmount: wager.stake_amount,
    commission: wager.commission,
    totalPot: wager.total_pot,
    matchCode: wager.match_code,
    status: wager.status,
    winnerId: wager.winner_id,
    creatorConfirmed: wager.creator_confirmed,
    challengerConfirmed: wager.challenger_confirmed,
    disputeReason: wager.dispute_reason,
    createdAt: wager.created_at,
    expiresAt: wager.expires_at,
    completedAt: wager.completed_at,
  });
}

// ─── Get wager details ───
export async function getWager(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const wagerId = parseInt(id);
  if (isNaN(wagerId)) return res.status(400).json({ error: 'Invalid ID' });

  const wager = db.prepare(`
    SELECT wc.*,
      c.username as creator_name,
      ch.username as challenger_name
    FROM wager_challenges wc
    JOIN users c ON wc.creator_id = c.id
    LEFT JOIN users ch ON wc.challenger_id = ch.id
    WHERE wc.id = ?
  `).get(wagerId) as any;

  if (!wager) return res.status(404).json({ error: 'Wager not found' });

  res.json({
    id: wager.id,
    creatorId: wager.creator_id,
    creatorName: wager.creator_name,
    challengerId: wager.challenger_id,
    challengerName: wager.challenger_name || null,
    stakeAmount: wager.stake_amount,
    commission: wager.commission,
    totalPot: wager.total_pot,
    matchCode: wager.match_code,
    status: wager.status,
    winnerId: wager.winner_id,
    creatorConfirmed: wager.creator_confirmed,
    challengerConfirmed: wager.challenger_confirmed,
    disputeReason: wager.dispute_reason,
    createdAt: wager.created_at,
    expiresAt: wager.expires_at,
    completedAt: wager.completed_at,
  });
}

// ─── Accept a wager ───
export async function acceptWager(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { id } = req.params;
  const wagerId = parseInt(id);
  if (isNaN(wagerId)) return res.status(400).json({ error: 'Invalid ID' });

  const phoneNumber = (req.body.phoneNumber || '').replace(/\D/g, '');
  let phone = phoneNumber;
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (!phone.match(/^2547\d{8}$/)) {
    return res.status(400).json({ error: 'Valid Safaricom number required' });
  }

  if (!PAYNECTA_LINK_CODE) {
    return res.status(500).json({ error: 'Paynecta payment link not configured.' });
  }

  const wager = db.prepare('SELECT * FROM wager_challenges WHERE id = ?').get(wagerId) as any;
  if (!wager) return res.status(404).json({ error: 'Wager not found' });
  if (wager.status !== 'open') return res.status(400).json({ error: 'This challenge is no longer available' });
  if (wager.creator_id === req.user.id) return res.status(400).json({ error: 'Cannot accept your own challenge' });

  // Initiate Paynecta STK Push for challenger
  const paymentResult = await paynectaService.initializePayment(PAYNECTA_LINK_CODE, phone, wager.stake_amount);

  if (!paymentResult.success && !paymentResult.transactionReference) {
    return res.status(502).json({ error: paymentResult.message || 'Payment failed' });
  }

  // Register challenger payment
  db.prepare(`
    INSERT INTO wager_payments (challenge_id, payer_id, amount, status, paynecta_transaction_ref)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(wagerId, req.user.id, wager.stake_amount, paymentResult.transactionReference || null);

  db.prepare(`
    UPDATE wager_challenges
    SET challenger_id = ?, challenger_telegram_id = ?, status = 'awaiting_payment'
    WHERE id = ?
  `).run(req.user.id, String(req.user.telegram_id || ''), wagerId);

  res.json({
    message: 'Payment initiated. After M-Pesa confirmation, the challenge will become active.',
    matchCode: wager.match_code,
    stakeAmount: wager.stake_amount,
    paymentMessage: paymentResult.message,
    transactionReference: paymentResult.transactionReference,
  });
}

// ─── Confirm winner ───
export async function confirmResult(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { id } = req.params;
  const wagerId = parseInt(id);
  const { winner } = req.body;
  if (isNaN(wagerId)) return res.status(400).json({ error: 'Invalid ID' });

  const wager = db.prepare('SELECT * FROM wager_challenges WHERE id = ?').get(wagerId) as any;
  if (!wager) return res.status(404).json({ error: 'Wager not found' });
  if (wager.status !== 'active') return res.status(400).json({ error: 'Wager is not active' });

  const isCreator = wager.creator_id === req.user.id;
  const isChallenger = wager.challenger_id === req.user.id;
  if (!isCreator && !isChallenger) return res.status(403).json({ error: 'You are not part of this wager' });

  if (isCreator) {
    db.prepare('UPDATE wager_challenges SET creator_confirmed = 1, creator_winner_choice = ? WHERE id = ?').run(winner, wagerId);
  } else {
    db.prepare('UPDATE wager_challenges SET challenger_confirmed = 1, challenger_winner_choice = ? WHERE id = ?').run(winner, wagerId);
  }

  const updated = db.prepare('SELECT * FROM wager_challenges WHERE id = ?').get(wagerId) as any;

  if (updated.creator_confirmed && updated.challenger_confirmed) {
    if (updated.creator_winner_choice !== updated.challenger_winner_choice) {
      db.prepare(`UPDATE wager_challenges SET creator_confirmed = 0, challenger_confirmed = 0, status = 'disputed', dispute_reason = 'Players disagreed on winner' WHERE id = ?`).run(wagerId);
      return res.json({
        message: 'Players disagreed on the winner. Dispute raised — an admin will review.',
        status: 'disputed',
      });
    }

    const winnerId = winner === 'creator' ? updated.creator_id : updated.challenger_id;

    db.prepare(`
      UPDATE wager_challenges
      SET status = 'completed', winner_id = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(winnerId, wagerId);

    const winnerName = winner === 'creator' ? updated.creator_name : updated.challenger_name;
    return res.json({
      message: `Winner confirmed! ${winnerName} wins KES ${updated.total_pot}. Payout will be processed manually.`,
      status: 'completed',
      winnerId,
      payoutAmount: updated.total_pot,
    });
  }

  res.json({
    message: 'Confirmation recorded. Waiting for the other player to confirm.',
    status: 'pending_confirmation',
  });
}

// ─── Dispute a result ───
export async function disputeWager(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { id } = req.params;
  const wagerId = parseInt(id);
  const { reason } = req.body;
  if (isNaN(wagerId)) return res.status(400).json({ error: 'Invalid ID' });

  const wager = db.prepare('SELECT * FROM wager_challenges WHERE id = ?').get(wagerId) as any;
  if (!wager) return res.status(404).json({ error: 'Wager not found' });

  const isCreator = wager.creator_id === req.user.id;
  const isChallenger = wager.challenger_id === req.user.id;
  if (!isCreator && !isChallenger) return res.status(403).json({ error: 'Not part of this wager' });

  db.prepare(`
    UPDATE wager_challenges
    SET status = 'disputed', dispute_reason = ?
    WHERE id = ?
  `).run(sanitizeString(reason, 500), wagerId);

  db.prepare('UPDATE wager_challenges SET creator_confirmed = 0, challenger_confirmed = 0 WHERE id = ?').run(wagerId);

  res.json({ message: 'Dispute raised. An admin will review within 24 hours.' });
}

// ─── Cancel wager ───
export async function cancelWager(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { id } = req.params;
  const wagerId = parseInt(id);
  if (isNaN(wagerId)) return res.status(400).json({ error: 'Invalid ID' });

  const wager = db.prepare('SELECT * FROM wager_challenges WHERE id = ?').get(wagerId) as any;
  if (!wager) return res.status(404).json({ error: 'Wager not found' });
  if (wager.creator_id !== req.user.id) return res.status(403).json({ error: 'Only creator can cancel' });
  if (!['open', 'awaiting_payment'].includes(wager.status)) {
    return res.status(400).json({ error: `Cannot cancel wager in '${wager.status}' state` });
  }

  db.prepare(`UPDATE wager_challenges SET status = 'cancelled' WHERE id = ?`).run(wagerId);
  res.json({ message: 'Wager cancelled' });
}

// ─── My wager history ───
export async function myWagers(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const wagers = db.prepare(`
    SELECT wc.*,
      c.username as creator_name,
      ch.username as challenger_name,
      CASE WHEN wc.winner_id = ? THEN 1 ELSE 0 END as is_winner
    FROM wager_challenges wc
    JOIN users c ON wc.creator_id = c.id
    LEFT JOIN users ch ON wc.challenger_id = ch.id
    WHERE wc.creator_id = ? OR wc.challenger_id = ?
    ORDER BY wc.created_at DESC
    LIMIT 50
  `).all(req.user.id, req.user.id, req.user.id);

  res.json({
    wagers: wagers.map((w: any) => ({
      id: w.id,
      creatorName: w.creator_name,
      challengerName: w.challenger_name,
      stakeAmount: w.stake_amount,
      totalPot: w.total_pot,
      matchCode: w.match_code,
      status: w.status,
      isWinner: w.is_winner === 1,
      createdAt: w.created_at,
      completedAt: w.completed_at,
    })),
  });
}

// ─── Admin: list all wagers + stats ───
export async function adminWagerStats(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Required' });
  if (req.user.is_admin !== 1 && req.user.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Admin required' });
  }

  const totalWagers = db.prepare("SELECT COUNT(*) as c FROM wager_challenges").get() as any;
  const completedWagers = db.prepare("SELECT COUNT(*) as c FROM wager_challenges WHERE status = 'completed'").get() as any;
  const disputedWagers = db.prepare("SELECT COUNT(*) as c FROM wager_challenges WHERE status = 'disputed'").get() as any;
  const totalStakes = db.prepare("SELECT COALESCE(SUM(stake_amount * 2), 0) as total FROM wager_challenges WHERE status IN ('active','completed')").get() as any;
  const totalCommission = db.prepare("SELECT COALESCE(SUM(commission), 0) as total FROM wager_challenges WHERE status = 'completed'").get() as any;
  const avgStake = db.prepare("SELECT COALESCE(AVG(stake_amount), 0) as avg FROM wager_challenges").get() as any;

  const recentWagers = db.prepare(`
    SELECT wc.id, wc.match_code, wc.stake_amount, wc.status, wc.created_at,
      c.username as creator_name, ch.username as challenger_name
    FROM wager_challenges wc
    JOIN users c ON wc.creator_id = c.id
    LEFT JOIN users ch ON wc.challenger_id = ch.id
    ORDER BY wc.created_at DESC
    LIMIT 20
  `).all();

  res.json({
    stats: {
      totalWagers: totalWagers.c,
      completedWagers: completedWagers.c,
      disputedWagers: disputedWagers.c,
      totalStakes: totalStakes.total,
      totalCommission: totalCommission.total,
      avgStake: Math.round(avgStake.avg),
    },
    recentWagers,
  });
}

// ─── Admin: resolve dispute ───
export async function resolveDispute(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Required' });
  if (req.user.is_admin !== 1 && req.user.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Admin required' });
  }

  const { id } = req.params;
  const wagerId = parseInt(id);
  const { winnerId, refund } = req.body;

  const wager = db.prepare('SELECT * FROM wager_challenges WHERE id = ?').get(wagerId) as any;
  if (!wager) return res.status(404).json({ error: 'Wager not found' });
  if (wager.status !== 'disputed') return res.status(400).json({ error: 'Wager is not disputed' });

  if (refund) {
    db.prepare(`UPDATE wager_challenges SET status = 'resolved_refunded' WHERE id = ?`).run(wagerId);
    return res.json({ message: 'Both players refunded' });
  }

  if (winnerId) {
    db.prepare(`
      UPDATE wager_challenges SET status = 'completed', winner_id = ?, resolved_by = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(winnerId, req.user.id, wagerId);

    return res.json({ message: `Winner set. KES ${wager.total_pot} payout to be processed manually.` });
  }

  return res.status(400).json({ error: 'Provide winnerId or refund=true' });
}
