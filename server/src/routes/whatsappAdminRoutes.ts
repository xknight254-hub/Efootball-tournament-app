import { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import db from '../db.js';
import {
  getSettings,
  updateSettings,
  getConnectionState,
  hasApiKey,
  getLLMConfig,
} from '../channels/whatsapp/whatsappSettings.js';
import { whatsappConfig, JWT_SECRET } from '../channels/whatsapp/config.js';
import { AI_PROVIDERS } from '../channels/whatsapp/whatsappSettings.js';
import {
  publishAdminStatus,
  sendAdminStatus,
  triggerReminders,
  startWhatsAppChannel,
  stopWhatsAppChannel,
  getWhatsAppSock,
  getQrCode,
  getPairingCode,
  pairWithPhone,
  logoutWhatsApp,
} from '../channels/whatsapp/bot.js';
import { getIO } from '../socket/index.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

// ─── Gateway settings (read + live update) ───
router.get('/settings', (req, res) => {
  const s = getSettings();
  const sock = getWhatsAppSock();
  res.json({
    ...s,
    hasApiKey: hasApiKey(),
    connectionState: getConnectionState(),
    qrCode: getQrCode(),
    pairingCode: getPairingCode(),
    hasSession: !!sock,
    channelActive: getConnectionState() !== 'unknown' && getConnectionState() !== 'disconnected',
    providerOptions: AI_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      defaultBaseUrl: p.defaultBaseUrl,
      models: p.models,
    })),
  });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const patch: any = {};
  if (typeof body.mpesaTill === 'string') patch.mpesaTill = body.mpesaTill.trim();
  if (typeof body.aiEnabled === 'boolean') patch.aiEnabled = body.aiEnabled;
  if (typeof body.aiProvider === 'string') patch.aiProvider = body.aiProvider.trim();
  if (typeof body.aiModel === 'string') patch.aiModel = body.aiModel.trim();
  if (typeof body.aiBaseUrl === 'string') patch.aiBaseUrl = body.aiBaseUrl.trim();
  if (typeof body.aiApiKey === 'string') patch.aiApiKey = body.aiApiKey.trim();
  if ('broadcastGroupJid' in body) patch.broadcastGroupJid = body.broadcastGroupJid || null;
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.reminderEnabled === 'boolean') patch.reminderEnabled = body.reminderEnabled;
  if (typeof body.statusEnabled === 'boolean') patch.statusEnabled = body.statusEnabled;
  if (Number.isFinite(Number(body.reminderHours))) patch.reminderHours = Number(body.reminderHours);
  try {
    const next = updateSettings(patch);
    res.json(next);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update settings' });
  }
});

// ─── List models from the active AI provider's /models endpoint ───
router.get('/models', async (req, res) => {
  const llm = getLLMConfig();
  if (!llm.baseUrl || !llm.apiKey) {
    return res.json({ models: [], error: 'No provider base URL or API key configured' });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(`${llm.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${llm.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return res.json({ models: [], error: `Provider returned ${resp.status}: ${body.slice(0, 160)}` });
    }
    const json = (await resp.json()) as any;
    const models: string[] = Array.isArray(json?.data)
      ? json.data.map((m: any) => m.id).filter((id: unknown): id is string => typeof id === 'string')
      : [];
    res.json({ models, provider: llm.provider });
  } catch (e: any) {
    res.json({ models: [], error: e?.message || 'Failed to fetch models' });
  }
});

// ─── Start/stop the WhatsApp channel dynamically ───
router.post('/start', async (req, res) => {
  try {
    const sock = getWhatsAppSock();
    if (sock) return res.json({ ok: true, message: 'Already running' });
    await startWhatsAppChannel(getIO());
    res.json({ ok: true, message: 'Channel started' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to start channel' });
  }
});

router.post('/stop', async (req, res) => {
  try {
    await stopWhatsAppChannel();
    res.json({ ok: true, message: 'Channel stopped' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to stop channel' });
  }
});

// ─── Pair with phone number (code-based pairing) ───
router.post('/pair', async (req, res) => {
  const phone = (req.body?.phone || '').toString().replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  try {
    const code = await pairWithPhone(phone);
    res.json({ ok: true, pairingCode: code, message: `Pairing code sent for ${phone}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Pairing failed' });
  }
});

// ─── Logout: stop channel + delete auth session ───
router.post('/logout', async (req, res) => {
  try {
    await logoutWhatsApp();
    res.json({ ok: true, message: 'Logged out — auth session deleted' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Logout failed' });
  }
});

// ─── WhatsApp Status publish (admin-triggered) ───
// Accepts text, image, or video via a media URL/path. Examples:
//   { "text": "TOSS is live 🔥" }
//   { "image": "/var/www/img/winner.jpg", "text": "Congrats!" }
//   { "video": "https://.../clip.mp4", "videoSeconds": 30 }
//   { "text": "VIP only", "jidList": ["15551234567", "447700900000"] }
// jidList (optional) restricts the status to those recipients.
router.post('/status', async (req, res) => {
  const { text, image, video, videoSeconds, jidList } = req.body || {};
  if (!text && !image && !video)
    return res.status(400).json({ error: 'text, image, or video required' });
  try {
    const ok = await sendAdminStatus(
      { text, image: image ? { url: image } : undefined, video: video ? { url: video } : undefined, videoSeconds },
      jidList ? { jidList } : undefined
    );
    if (ok) res.json({ ok: true });
    else res.status(409).json({ error: 'WhatsApp channel not connected' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Run reminder sweep immediately (admin-triggered) ───
router.post('/reminders/run', async (req, res) => {
  try {
    const sent = await triggerReminders();
    res.json({ ok: true, sent });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

// ─── Brand Rendering Engine: render a campaign to an image ─────────
import { renderCampaign, renderCampaignGif } from '../modules/marketing/services/renderService.js';

router.post('/marketing/render', async (req, res) => {
  const campaign = req.body?.campaign;
  if (!campaign || !campaign.template)
    return res.status(400).json({ error: 'campaign.template required' });
  try {
    const r = await renderCampaign(campaign);
    res.json({ ok: true, imagePath: r.imagePath, url: r.url, width: r.width, height: r.height, template: r.template, renderTimeMs: r.renderTimeMs });
  } catch (e: any) {
    res.status(422).json({ error: e.message });
  }
});

// ─── Brand Rendering Engine: render + publish straight to WhatsApp Status ──
router.post('/marketing/publish', async (req, res) => {
  const { campaign, text, jidList } = req.body || {};
  if (!campaign || !campaign.template)
    return res.status(400).json({ error: 'campaign.template required' });
  try {
    const r = await renderCampaign(campaign);
    const ok = await sendAdminStatus(
      { text: text || campaign.title || '', image: r.url ? { url: r.url } : undefined },
      jidList ? { jidList } : undefined
    );
    if (ok) res.json({ ok: true, url: r.url, width: r.width, height: r.height });
    else res.status(409).json({ error: 'WhatsApp not connected' });
  } catch (e: any) {
    res.status(422).json({ error: e.message });
  }
});

// ─── Brand Rendering Engine: render animated GIF ────────────────
router.post('/marketing/render-gif', async (req, res) => {
  const { campaign, frames, fps } = req.body || {};
  if (!campaign || !campaign.template)
    return res.status(400).json({ error: 'campaign.template required' });
  try {
    const r = await renderCampaignGif(campaign, { frames: frames ? Number(frames) : undefined, fps: fps ? Number(fps) : undefined });
    res.json({ ok: true, url: r.url, frames: r.frames, width: r.width, height: r.height });
  } catch (e: any) {
    res.status(422).json({ error: e.message });
  }
});

// ─── Brand Rendering Engine: upload a media asset (hero/sponsor) ──
import { fileURLToPath } from 'url';
import { join as _join, dirname } from 'path';
import { mkdirSync } from 'fs';
const __uploadDirname = dirname(fileURLToPath(import.meta.url));
const _uploadDir = _join(__uploadDirname, '..', '..', 'client', 'public', 'marketing-out', 'uploads');
mkdirSync(_uploadDir, { recursive: true });
const _storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, _uploadDir),
  filename: (_req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    cb(null, `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
  },
});
const _upload = multer({ storage: _storage, limits: { fileSize: 8 * 1024 * 1024 } });

router.post('/marketing/upload', _upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  res.json({ ok: true, url: `/marketing-out/uploads/${req.file.filename}`, filename: req.file.filename });
});

export default router;
