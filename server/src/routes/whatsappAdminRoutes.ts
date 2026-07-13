import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import db from '../db.js';
import {
  getSettings,
  updateSettings,
  getConnectionState,
  hasApiKey,
} from '../channels/whatsapp/whatsappSettings.js';
import { whatsappConfig, JWT_SECRET } from '../channels/whatsapp/config.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

// ─── Gateway settings (read + live update) ───
router.get('/settings', (req, res) => {
  const s = getSettings();
  res.json({
    ...s,
    hasApiKey: whatsappConfig.omnirouteKey.length > 0,
    connectionState: getConnectionState(),
    modelOptions: [
      'oc/deepseek-v4-flash-free',
      'gpt-4o-mini',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-haiku',
    ],
  });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const patch: any = {};
  if (typeof body.mpesaTill === 'string') patch.mpesaTill = body.mpesaTill.trim();
  if (typeof body.aiEnabled === 'boolean') patch.aiEnabled = body.aiEnabled;
  if (typeof body.aiModel === 'string') patch.aiModel = body.aiModel.trim();
  if ('broadcastGroupJid' in body) patch.broadcastGroupJid = body.broadcastGroupJid || null;
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  try {
    const next = updateSettings(patch);
    res.json(next);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update settings' });
  }
});

// ─── Low-confidence AI messages (human review queue) ───
router.get('/lowconf', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, admin_id, action, details, payload, created_at
       FROM admin_logs WHERE whatsapp_ai_lowconf = 1 ORDER BY created_at DESC LIMIT 100`
    )
    .all() as any[];
  res.json({ items: rows, total: rows.length });
});

router.post('/lowconf/:id/resolve', (req, res) => {
  const id = Number(req.params.id);
  const note = (req.body?.note as string) || null;
  try {
    db.prepare(
      `UPDATE admin_logs SET whatsapp_ai_lowconf = 0, payload = ?
       WHERE id = ? AND whatsapp_ai_lowconf = 1`
    ).run(
      JSON.stringify({ resolvedAt: new Date().toISOString(), resolutionNote: note, resolvedBy: (req as any).user?.id }),
      id
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── WhatsApp-reported M-Pesa payments pending review ───
router.get('/payments', (req, res) => {
  const status = (req.query.status as string) || 'pending';
  const rows = db
    .prepare(
      `SELECT p.id, p.user_id, p.tournament_id, p.amount, p.receipt_code, p.till,
              p.status, p.source, p.verified_by, p.verified_at, p.review_note, p.created_at,
              u.username, u.phone, t.name as tournament_name
       FROM tournament_payments p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN tournaments t ON t.id = p.tournament_id
       WHERE p.status = ? ORDER BY p.created_at DESC LIMIT 200`
    )
    .all(status) as any[];
  res.json({ items: rows, total: rows.length });
});

router.post('/payments/:id/verify', (req, res) => {
  const id = Number(req.params.id);
  const note = (req.body?.note as string) || null;
  const adminId = (req as any).user?.id;
  try {
    db.prepare(
      `UPDATE tournament_payments
       SET status = 'completed', verified_by = ?, verified_at = CURRENT_TIMESTAMP, review_note = ?
       WHERE id = ?`
    ).run(adminId, note, id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Link token generation for existing app users ───
// Mints a JWT the user pastes in WhatsApp: \`link <token>\`
router.post('/link-token', (req, res) => {
  const userId = Number(req.body?.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, expiresIn: '7d' });
});

// ─── WhatsApp result submissions pending review ───
router.get('/result-reviews', (req, res) => {
  const rows = db
    .prepare(
      `SELECT rs.id, rs.match_id, rs.uploader_id, rs.screenshot_url, rs.ocr_score_left,
              rs.ocr_score_right, rs.ocr_team_left, rs.ocr_team_right, rs.verification_status,
              rs.verification_confidence, rs.fraud_score, rs.created_at,
              u.username as uploader_username,
              m.player1_id, m.player2_id, m.player1_score, m.player2_score,
              p1.username as player1_username, p2.username as player2_username
       FROM result_submissions rs
       LEFT JOIN users u ON u.id = rs.uploader_id
       LEFT JOIN matches m ON m.id = rs.match_id
       LEFT JOIN users p1 ON p1.id = m.player1_id
       LEFT JOIN users p2 ON p2.id = m.player2_id
       WHERE rs.verification_status IN ('admin_review','pending')
       ORDER BY rs.created_at DESC LIMIT 200`
    )
    .all() as any[];
  res.json({ items: rows, total: rows.length });
});

router.post('/result-reviews/:id/resolve', (req, res) => {
  const id = Number(req.params.id);
  const { winnerId, player1Score, player2Score } = req.body || {};
  const adminId = (req as any).user?.id;
  const sub = db.prepare('SELECT * FROM result_submissions WHERE id = ?').get(id) as any;
  if (!sub) return res.status(404).json({ error: 'Submission not found' });
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(sub.match_id) as any;
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const w = Number(winnerId);
  const s1 = Number(player1Score);
  const s2 = Number(player2Score);
  if (w !== match.player1_id && w !== match.player2_id)
    return res.status(400).json({ error: 'Winner must be a participant' });
  try {
    db.prepare(
      `UPDATE matches SET player1_score = ?, player2_score = ?, winner_id = ?,
        status = 'completed', confirmation_status = 'admin_resolved',
        confirmed_at = CURRENT_TIMESTAMP, verification_status = 'admin_verified'
       WHERE id = ?`
    ).run(s1, s2, w, sub.match_id);
    db.prepare(
      `UPDATE result_submissions SET verification_status = 'admin_resolved',
        reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?`
    ).run(adminId, id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
