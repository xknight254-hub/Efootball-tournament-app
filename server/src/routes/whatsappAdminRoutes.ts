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

export default router;
