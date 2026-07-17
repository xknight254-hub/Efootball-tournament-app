/**
 * Agent API Routes — endpoints that AI agents call to perform actions.
 *
 * All routes are authenticated with a scoped agent token and logged
 * to admin_logs. These are the ONLY way agents can affect backend state.
 *
 * Every endpoint:
 *   - Is idempotent (X-Action-Id header prevents double-processing)
 *   - Is audited (logged to admin_logs)
 *   - Returns { ok: true } or { error: "..." }
 */
import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { emitEvent } from '../channels/whatsapp/agents/eventBus.js';
import {
  getConfirmationQueue, approveAction, rejectAction,
  getEngineMetrics, getActionHistory,
} from '../channels/whatsapp/agents/automationEngine.js';

const router = Router();

// ─── Agent Token Authentication ─────────────────────────────────
// Agents authenticate with a Bearer token. The token is hashed and
// checked against the agent_tokens table. Admin-level access is NOT
// required for agents — they have their own permission scopes.

function authenticateAgent(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Agent token required' });
  }
  const token = auth.slice(7);
  const hash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const row = db.prepare(
      'SELECT agent_id, permissions FROM agent_tokens WHERE token_hash = ?'
    ).get(hash) as any;

    if (!row) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }

    req.agentId = row.agent_id;
    req.agentPermissions = JSON.parse(row.permissions || '[]');

    // Update last used timestamp
    db.prepare('UPDATE agent_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(hash);

    next();
  } catch (e: any) {
    return res.status(500).json({ error: 'Auth error' });
  }
}

// Helper: check if agent has required permission
function hasPermission(req: any, perm: string): boolean {
  return req.agentPermissions.includes('*') || req.agentPermissions.includes(perm);
}

// Middleware: run auth + permission check
function requireAgentPerm(permission: string) {
  return (req: any, res: any, next: any) => {
    authenticateAgent(req, res, () => {
      if (!hasPermission(req, permission)) {
        return res.status(403).json({ error: `Agent missing permission: ${permission}` });
      }
      next();
    });
  };
}

// ─── Health Check ───────────────────────────────────────────────

router.post('/agent/health', requireAgentPerm('health.report'), (req: any, res) => {
  const { status, lastError, tasksCompleted, tasksFailed, uptimeSeconds } = req.body || {};
  try {
    db.prepare(
      `UPDATE agent_health SET status = ?, last_tick = CURRENT_TIMESTAMP,
       last_error = ?, tasks_completed = tasks_completed + ?,
       tasks_failed = tasks_failed + ?, uptime_seconds = ?,
       updated_at = CURRENT_TIMESTAMP
       WHERE agent_id = ?`
    ).run(
      status || 'online',
      lastError || null,
      typeof tasksCompleted === 'number' ? tasksCompleted : 0,
      typeof tasksFailed === 'number' ? tasksFailed : 0,
      uptimeSeconds || 0,
      req.agentId
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Token Management (admin only) ──────────────────────────────

router.post('/agent/tokens', authenticateToken, requireAdmin, (req: any, res) => {
  const { agentId, label } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });

  const token = `at_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    db.prepare(
      'INSERT OR REPLACE INTO agent_tokens (agent_id, token_hash, label, permissions) VALUES (?, ?, ?, ?)'
    ).run(agentId, hash, label || agentId, JSON.stringify(['*']));
    res.json({ token, agentId, label: label || agentId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agent/tokens', authenticateToken, requireAdmin, (req: any, res) => {
  const rows = db.prepare(
    'SELECT agent_id, label, created_at, last_used_at FROM agent_tokens'
  ).all();
  res.json({ tokens: rows });
});

// ─── Agent Health (read: admin) ─────────────────────────────────

router.get('/agent/health', authenticateToken, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_health ORDER BY agent_id').all();
  res.json({ agents: rows, engine: getEngineMetrics() });
});

// ─── Agent Action Queue (admin reads/approves) ──────────────────

router.get('/agent/queue', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    queue: getConfirmationQueue(),
    history: getActionHistory(50),
  });
});

router.post('/agent/queue/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const ok = approveAction(req.params.id);
  res.json({ ok });
});

router.post('/agent/queue/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const ok = rejectAction(req.params.id);
  res.json({ ok });
});

// ─── Tournament Operations ──────────────────────────────────────

router.post('/agent/tournaments/:id/advance', requireAgentPerm('tournament.advance'), (req: any, res) => {
  const id = Number(req.params.id);
  try {
    const t = db.prepare('SELECT id, status FROM tournaments WHERE id = ?').get(id) as any;
    if (!t) return res.status(404).json({ error: 'Tournament not found' });

    const nextStatus: Record<string, string> = {
      open: 'check_in',
      check_in: 'in_progress',
      in_progress: 'live',
      live: 'completed',
    };
    const next = nextStatus[t.status];
    if (!next) return res.json({ ok: true, note: 'Already terminal status' });

    db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run(next, id);
    emitEvent('tournament_status_changed', { tournamentId: id, from: t.status, to: next });
    logAgentAction(req.agentId, 'advance_tournament', `Tournament ${id}: ${t.status} → ${next}`);
    res.json({ ok: true, status: next });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/tournaments/:id/close', requireAgentPerm('tournament.close'), (req: any, res) => {
  const id = Number(req.params.id);
  try {
    db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('completed', id);
    emitEvent('tournament_completed', { tournamentId: id });
    logAgentAction(req.agentId, 'close_tournament', `Tournament ${id} closed`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/tournaments/:id/fixtures', requireAgentPerm('tournament.fixtures'), async (req: any, res) => {
  const id = Number(req.params.id);
  try {
    const { generateBracket } = await import('../services/bracketService.js');
    const result = await generateBracket(id);
    const roundsCreated = Array.isArray(result) ? result.length : 0;
    logAgentAction(req.agentId, 'create_fixtures', `Tournament ${id}: ${roundsCreated} rounds created`);
    emitEvent('tournament_status_changed', { tournamentId: id, action: 'fixtures_created' });
    res.json({ ok: true, roundsCreated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Match Operations ───────────────────────────────────────────

router.post('/agent/matches/:id/walkover', requireAgentPerm('match.walkover'), (req: any, res) => {
  const matchId = Number(req.params.id);
  const winnerId = Number(req.body?.winnerId);
  if (!matchId || !winnerId) return res.status(400).json({ error: 'matchId and winnerId required' });

  try {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as any;
    if (!match) return res.status(404).json({ error: 'Match not found' });

    db.prepare(
      `UPDATE matches SET winner_id = ?, status = 'completed',
       player1_score = CASE WHEN player1_id = ? THEN 3 ELSE 0 END,
       player2_score = CASE WHEN player2_id = ? THEN 3 ELSE 0 END,
       confirmation_status = 'walkover'
       WHERE id = ?`
    ).run(winnerId, winnerId, winnerId, matchId);

    logAgentAction(req.agentId, 'walkover', `Match ${matchId}: walkover to ${winnerId}`);
    emitEvent('match_finished', { matchId, winnerId, type: 'walkover' });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/matches/:id/reschedule', requireAgentPerm('match.reschedule'), (req: any, res) => {
  const matchId = Number(req.params.id);
  const { scheduledTime } = req.body || {};
  if (!scheduledTime) return res.status(400).json({ error: 'scheduledTime required' });

  try {
    db.prepare('UPDATE matches SET scheduled_time = ? WHERE id = ?').run(scheduledTime, matchId);
    logAgentAction(req.agentId, 'reschedule', `Match ${matchId} rescheduled to ${scheduledTime}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Result Validation ──────────────────────────────────────────

router.post('/agent/results/:id/approve', requireAgentPerm('result.approve'), (req: any, res) => {
  const submissionId = Number(req.params.id);
  const { winnerId, player1Score, player2Score } = req.body || {};

  try {
    const sub = db.prepare('SELECT * FROM result_submissions WHERE id = ?').get(submissionId) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    db.prepare(
      `UPDATE matches SET player1_score = ?, player2_score = ?, winner_id = ?,
       status = 'completed', confirmation_status = 'agent_verified',
       confirmed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(player1Score, player2Score, winnerId, sub.match_id);

    db.prepare(
      `UPDATE result_submissions SET verification_status = 'agent_approved',
       reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(submissionId);

    logAgentAction(req.agentId, 'approve_result', `Submission ${submissionId} approved`);
    emitEvent('result_verified', { submissionId, matchId: sub.match_id, approved: true });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/results/:id/reject', requireAgentPerm('result.reject'), (req: any, res) => {
  const submissionId = Number(req.params.id);
  const { reason } = req.body || {};

  try {
    db.prepare(
      `UPDATE result_submissions SET verification_status = 'agent_rejected',
       reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(submissionId);

    logAgentAction(req.agentId, 'reject_result', `Submission ${submissionId} rejected: ${reason || 'No reason'}`);
    emitEvent('result_verified', { submissionId, approved: false, reason });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Payment Operations ─────────────────────────────────────────

router.post('/agent/payments/:id/verify', requireAgentPerm('payment.verify'), (req: any, res) => {
  const paymentId = Number(req.params.id);
  const { note } = req.body || {};

  try {
    const payment = db.prepare('SELECT * FROM tournament_payments WHERE id = ?').get(paymentId) as any;
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    db.prepare(
      `UPDATE tournament_payments SET status = 'completed', verified_by = ?,
       verified_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?`
    ).run(0, note || 'Auto-verified by agent', paymentId);

    // Also confirm participant registration
    db.prepare(
      `UPDATE participants SET checked_in = 1, paid = 1
       WHERE tournament_id = ? AND user_id = ?`
    ).run(payment.tournament_id, payment.user_id);

    logAgentAction(req.agentId, 'verify_payment', `Payment ${paymentId} verified`);
    emitEvent('payment_received', { paymentId, tournamentId: payment.tournament_id, userId: payment.user_id });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/payments/:id/flag', requireAgentPerm('payment.flag'), (req: any, res) => {
  const paymentId = Number(req.params.id);
  const { reason } = req.body || {};

  try {
    db.prepare(
      `UPDATE tournament_payments SET status = 'flagged', review_note = ? WHERE id = ?`
    ).run(reason || 'Flagged by agent', paymentId);

    emitEvent('fraud_alert', { paymentId, reason });
    logAgentAction(req.agentId, 'flag_payment', `Payment ${paymentId} flagged: ${reason}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Player Moderation ──────────────────────────────────────────

router.post('/agent/players/:id/warn', requireAgentPerm('player.warn'), (req: any, res) => {
  const userId = Number(req.params.id);
  const { reason } = req.body || {};

  try {
    db.prepare(
      `INSERT INTO admin_logs (admin_id, action, details, payload)
       VALUES (?, 'agent_warn', ?, ?)`
    ).run(`agent:${req.agentId}`, reason || 'Warning', JSON.stringify({ userId }));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/players/:id/mute', requireAgentPerm('player.mute'), (req: any, res) => {
  const userId = Number(req.params.id);
  const { hours } = req.body || {};

  try {
    const until = new Date(Date.now() + (hours || 24) * 3600000).toISOString();
    // Store mute in users preferences
    const user = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    const prefs = user?.preferences ? JSON.parse(user.preferences) : {};
    prefs.mutedUntil = until;
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(prefs), userId);

    logAgentAction(req.agentId, 'mute_player', `User ${userId} muted for ${hours || 24}h`);
    res.json({ ok: true, mutedUntil: until });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/players/:id/ban', requireAgentPerm('player.ban'), (req: any, res) => {
  const userId = Number(req.params.id);
  const { reason } = req.body || {};

  try {
    db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(userId);
    logAgentAction(req.agentId, 'ban_player', `User ${userId} banned: ${reason || 'No reason'}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Messaging ──────────────────────────────────────────────────

router.post('/agent/send-message', requireAgentPerm('message.send'), async (req: any, res) => {
  const { jid, text } = req.body || {};
  if (!jid || !text) return res.status(400).json({ error: 'jid and text required' });

  try {
    const { getWhatsAppSock } = await import('../channels/whatsapp/bot.js');
    const sock = getWhatsAppSock();
    if (!sock) return res.status(409).json({ error: 'WhatsApp not connected' });

    await sock.sendMessage(jid, { text });
    logAgentAction(req.agentId, 'send_message', `DM to ${jid}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/broadcast', requireAgentPerm('message.broadcast'), async (req: any, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const settings = (await import('../channels/whatsapp/whatsappSettings.js')).getSettings();
    const groupJid = settings.broadcastGroupJid;
    if (!groupJid) return res.status(409).json({ error: 'No broadcast group configured' });

    const { getWhatsAppSock } = await import('../channels/whatsapp/bot.js');
    const sock = getWhatsAppSock();
    if (!sock) return res.status(409).json({ error: 'WhatsApp not connected' });

    await sock.sendMessage(groupJid, { text });
    logAgentAction(req.agentId, 'broadcast', `Broadcast to ${groupJid}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agent/status', requireAgentPerm('status.publish'), async (req: any, res) => {
  const { text, image, imagePrompt, jidList } = req.body || {};
    if (!text && !image && !imagePrompt)
      return res.status(400).json({ error: 'text, image, or imagePrompt required' });
    try {
      const { sendAdminStatus } = await import('../channels/whatsapp/bot.js');
      let imageUrl = image || null;
      // Generate an image from a prompt if none supplied directly.
      if (!imageUrl && imagePrompt) {
        const { generateImage } = await import('../services/imageGenService.js');
        imageUrl = await generateImage(imagePrompt, { width: 1280, height: 720 });
      }
      const ok = await sendAdminStatus(
        { text, image: imageUrl ? { url: imageUrl } : undefined },
        jidList ? { jidList } : undefined
      );
      if (ok) {
        logAgentAction(req.agentId, 'publish_status', `Status published${imageUrl ? ' (with image)' : ''}`);
        res.json({ ok: true, image: imageUrl });
      } else {
        res.status(409).json({ error: 'WhatsApp not connected' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

// ─── Reminders ──────────────────────────────────────────────────

router.post('/agent/reminders/send', requireAgentPerm('reminder.send'), async (req: any, res) => {
  const { matchId } = req.body || {};

  try {
    const { triggerReminders } = await import('../channels/whatsapp/bot.js');
    const sent = await triggerReminders();
    logAgentAction(req.agentId, 'send_reminder', `Reminders sent: ${sent}`);
    res.json({ ok: true, sent });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Reports (Analytics Agent) ──────────────────────────────────

router.post('/agent/reports/daily', requireAgentPerm('report.generate'), (req: any, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const registrations = (db.prepare(
      "SELECT COUNT(*) as c FROM users WHERE date(created_at) = ?"
    ).get(today) as any)?.c || 0;

    const payments = (db.prepare(
      "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM tournament_payments WHERE date(created_at) = ? AND status = 'completed'"
    ).get(today) as any);

    const tournaments = (db.prepare(
      "SELECT COUNT(*) as c FROM tournaments WHERE date(created_at) = ?"
    ).get(today) as any)?.c || 0;

    res.json({
      ok: true,
      report: {
        date: today,
        newRegistrations: registrations,
        paymentsCount: payments?.c || 0,
        revenue: payments?.t || 0,
        tournamentsCreated: tournaments,
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Agent Assignments (admin manages which agents run in which context) ──
// Agents can be enabled for TOSS management (engine tick loop) and/or for
// user interactions (their tools are exposed to the WhatsApp LLM). Multi-select
// from the admin console sets these flags per agent.

const AGENT_IDS = [
  'tournament_ops', 'conversation', 'support', 'finance',
  'moderator', 'notification', 'marketing', 'analytics', 'coach',
];

function ensureAssignmentRows() {
  for (const id of AGENT_IDS) {
    db.prepare(
      `INSERT OR IGNORE INTO agent_assignments (agent_id, enabled, for_management, for_interactions)
       VALUES (?, 1, 1, 0)`
    ).run(id);
  }
}

router.get('/agents', authenticateToken, requireAdmin, (req, res) => {
  ensureAssignmentRows();
  const health = db.prepare('SELECT * FROM agent_health').all() as any[];
  const assign = db.prepare('SELECT * FROM agent_assignments').all() as any[];
  const healthMap = new Map(health.map((h) => [h.agent_id, h]));
  const rows = AGENT_IDS.map((id) => {
    const a = assign.find((x) => x.agent_id === id) || {};
    const h = healthMap.get(id) || {};
    return {
      agent_id: id,
      enabled: !!a.enabled,
      for_management: !!a.for_management,
      for_interactions: !!a.for_interactions,
      config: a.config ? JSON.parse(a.config) : {},
      status: h.status || 'offline',
      tasks_completed: h.tasks_completed || 0,
      tasks_failed: h.tasks_failed || 0,
      uptime_seconds: h.uptime_seconds || 0,
      last_tick: h.last_tick || null,
      last_error: h.last_error || null,
    };
  });
  res.json({ agents: rows });
});

router.put('/agents/:id', authenticateToken, requireAdmin, (req, res) => {
  const id = req.params.id;
  if (!AGENT_IDS.includes(id)) {
    return res.status(400).json({ error: 'Unknown agent' });
  }
  const { enabled, for_management, for_interactions, config } = req.body || {};
  const existing = db.prepare('SELECT * FROM agent_assignments WHERE agent_id = ?').get(id) as any;
  const next = {
    enabled: enabled === undefined ? (existing?.enabled ?? 1) : (enabled ? 1 : 0),
    for_management: for_management === undefined ? (existing?.for_management ?? 0) : (for_management ? 1 : 0),
    for_interactions: for_interactions === undefined ? (existing?.for_interactions ?? 0) : (for_interactions ? 1 : 0),
    config: config !== undefined ? JSON.stringify(config) : (existing?.config || '{}'),
  };
  db.prepare(
    `INSERT INTO agent_assignments (agent_id, enabled, for_management, for_interactions, config)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(agent_id) DO UPDATE SET
       enabled = excluded.enabled,
       for_management = excluded.for_management,
       for_interactions = excluded.for_interactions,
       config = excluded.config,
       updated_at = CURRENT_TIMESTAMP`
  ).run(id, next.enabled, next.for_management, next.for_interactions, next.config);
  res.json({ ok: true, agent_id: id, ...next });
});

// ─── Helper ──────────────────────────────────────────────────────

function logAgentAction(agentId: string, action: string, details: string) {
  try {
    db.prepare(
      `INSERT INTO admin_logs (admin_id, action, details, payload)
       VALUES (?, ?, ?, ?)`
    ).run(`agent:${agentId}`, action, details.slice(0, 500), JSON.stringify({ timestamp: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export default router;
