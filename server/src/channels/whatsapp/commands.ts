import db, { isAdminPhone, addAdminPhone, grantPasses, consumeFreePass } from '../../db.js';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join as joinPath, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import sharp from 'sharp';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { whatsappConfig } from './config.js';
import { linkStore } from './linkStore.js';
import { interpret, interpretWithLLM, sanitizeReply, runAssistantWithTools } from './assistant.js';
import { getActiveTools, getAgentAssignments, AGENT_PERSONAS } from './tools.js';
import { agentApi } from './agents/agentApi.js';
import { approveAction, getEngineMetrics } from './agents/automationEngine.js';
import { getConnectionState } from './whatsappSettings.js';
import { getSettings } from './whatsappSettings.js';
import { getWorker, parseEFOTBScreenshot } from '../../services/ocrService.js';
import { processVerification } from '../../services/verificationService.js';

const JWT_SECRET =
  process.env.JWT_SECRET || 'efootball-arena-super-secret-key-2024';

interface Ctx {
  phone: string;
}

// Player forwards their M-Pesa (Buy-Goods / Till) payment confirmation;
// bot creates a TOSS account for that phone and replies with the new ID.
// Phase 1 is trust-based on the confirmation text; real Till reconciliation
// against Safaricom callbacks is a later hardening step.
const MPESA_RECEIPT_RE = /\b([A-Z0-9]{8,12})\b/;
const MPESA_AMOUNT_RE = /(ksh|kes)\s*([\d,]+(?:\.\d{2})?)/i;
// Buy-Goods Till numbers appear as "Till No. 123456" or "123456".
const MPESA_TILL_RE = /till\s*(?:no\.?|number)?\s*[:#]?\s*(\d{5,7})/i;
// Only auto-detect a forwarded confirmation when M-Pesa context is present,
// so normal chat isn't misrouted to signup.
const MPESA_CONTEXT_RE = /m-?pesa|confirmed|mpesa|receipt|till|buy goods/i;

function normalizePhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (p.startsWith('2540')) p = '254' + p.slice(4);
  return p;
}

// Mirror authController.verifyOTP auto-create, so WhatsApp-paid signup and
// OTP signup produce identical account shapes.
function createUserFromPhone(phone: string): { id: number; username: string } {
  const normalized = normalizePhone(phone);
  const existing = db
    .prepare('SELECT id, username FROM users WHERE phone = ?')
    .get(normalized) as { id: number; username: string } | undefined;
  if (existing) return existing;

  const base = `p_${normalized.slice(-8)}`;
  let finalUsername = base;
  let counter = 1;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername)) {
    finalUsername = `${base}_${counter}`;
    counter++;
  }
  const email = `${normalized}@phone.efootball`;
  const isFirstUser =
    (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c === 0;

  const result = db
    .prepare(
      'INSERT INTO users (username, email, password_hash, phone, is_admin, is_super_admin) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      finalUsername,
      email,
      'phone_auth',
      normalized,
      isFirstUser ? 1 : 0,
      isFirstUser ? 1 : 0
    );
  return {
    id: Number(result.lastInsertRowid),
    username: finalUsername,
  };
}

function help(): string {
  return [
    '🤖 *TOSS WhatsApp Assistant*',
    '',
    'Commands:',
    '• `table` — open & recent tournaments',
    '• `rank` — top player rankings',
    '• `fixtures <id>` — matches in a tournament',
    '• `me` — your stats (link first)',
    '• `join <id>` — join a tournament (link first)',
    '• `link <token>` — link your TOSS account',
    '• `pay` — forward your M-Pesa confirmation to register',
    '• `help` — this message',
  ].join('\n');
}

// ─── Multi-step WhatsApp tournament creation (admin) ──────────────
// The AI guides the admin step-by-step; the tournament image is uploaded
// via WhatsApp, auto-cropped to 16:9, and stored as the banner.
// OCR stays match-submission-only (per project decision).
const CREATE_DIR = joinPath(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'client', 'public', 'tournament-images'
);
const VALID_FORMATS = ['knockout', 'league', 'multi_bracket', 'swiss'];
const VALID_MAX = [2, 4, 8, 16, 32];

interface CreateState {
  step: 'name' | 'format' | 'max' | 'await_image' | 'type' | 'confirm';
  name?: string;
  format?: string;
  max_players?: number;
  image_url?: string;
  fee_type?: 'paid' | 'free';
  fee?: number;
}

export function getCreate(phone: string): CreateState | null {
  return (db.prepare('SELECT * FROM wx_create_state WHERE phone = ?').get(phone) as CreateState | undefined) || null;
}
function setCreate(phone: string, s: Partial<CreateState> & { step: CreateState['step'] }) {
  const cur = getCreate(phone) || { step: s.step };
  const next = { ...cur, ...s };
  db.prepare(
    `INSERT INTO wx_create_state (phone, step, name, format, max_players, image_url, fee_type, fee, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(phone) DO UPDATE SET step=?, name=?, format=?, max_players=?, image_url=?, fee_type=?, fee=?, updated_at=CURRENT_TIMESTAMP`
  ).run(
    phone, next.step, next.name ?? null, next.format ?? null, next.max_players ?? null,
    next.image_url ?? null, next.fee_type ?? null, next.fee ?? 0,
    next.step, next.name ?? null, next.format ?? null, next.max_players ?? null,
    next.image_url ?? null, next.fee_type ?? null, next.fee ?? 0
  );
}
function clearCreate(phone: string) {
  db.prepare('DELETE FROM wx_create_state WHERE phone = ?').run(phone);
}

export function startCreate(phone: string): string {
  setCreate(phone, { step: 'name' });
  return [
    '🏆 *New Tournament*',
    'Step 1/5 — what is the tournament *name*?',
    '(e.g. "Weekend Cup")',
  ].join('\n');
}

export async function handleCreateImage(sock: any, remoteJid: string, phone: string, msg: any): Promise<string> {
  const st = getCreate(phone);
  if (!st || st.step !== 'await_image') return '';
  try {
    if (!existsSync(CREATE_DIR)) mkdirSync(CREATE_DIR, { recursive: true });
    const buffer = await sock.downloadMediaMessage(msg);
    if (!buffer || buffer.length === 0) return '❌ Could not download the image. Send it again.';
    const rawName = `tcreate_${Date.now()}.jpg`;
    const rawPath = joinPath(CREATE_DIR, rawName);
    writeFileSync(rawPath, buffer);
    // Auto-crop to 16:9 (center, cover) — same math as /api/images/crop.
    const meta = await sharp(buffer).metadata();
    const ow = meta.width || 1280, oh = meta.height || 720;
    const RATIO = 16 / 9;
    const cw = ow, ch = Math.round(cw / RATIO);
    const left = Math.max(0, Math.min(Math.round((ow - cw) / 2), ow - cw));
    const top = Math.max(0, Math.min(Math.round((oh - ch) / 2), oh - ch));
    const cropW = Math.min(cw, ow), cropH = Math.min(ch, oh);
    const outName = `tcreate_${Date.now()}_crop.jpg`;
    const outPath = joinPath(CREATE_DIR, outName);
    await sharp(rawPath)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(1280, 720, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toFile(outPath);
    const url = `/tournament-images/${outName}`;
    setCreate(phone, { step: 'type', image_url: url });
    return [
      '✅ Image received & cropped (16:9 banner).',
      'Step 4/5 — is this *paid* or *free*?',
      '• `paid <fee KES>`  (e.g. `paid 100`)',
      '• `free`',
    ].join('\n');
  } catch (e: any) {
    return `❌ Image processing failed: ${e.message}`;
  }
}

export async function handleCreateStep(phone: string, raw: string): Promise<string | null> {
  const st = getCreate(phone);
  if (!st) return null;
  const text = raw.trim();
  if (/^cancel$/i.test(text)) {
    clearCreate(phone);
    return '🚫 Tournament creation cancelled.';
  }
  switch (st.step) {
    case 'name': {
      if (text.length < 2) return '❌ Name too short. Send the tournament name.';
      setCreate(phone, { step: 'format', name: text });
      return [
        `🏆 *${text}*`,
        'Step 2/5 — format?',
        '• `knockout`  • `league`  • `multi_bracket`  • `swiss`',
      ].join('\n');
    }
    case 'format': {
      const f = text.toLowerCase().replace(/[^a-z_]/g, '');
      if (!VALID_FORMATS.includes(f)) return '❌ Invalid format. Reply one of: knockout, league, multi_bracket, swiss.';
      setCreate(phone, { step: 'max', format: f });
      return [
        `Format: *${f}*`,
        'Step 3/5 — max players?',
        '• `2` • `4` • `8` • `16` • `32`',
      ].join('\n');
    }
    case 'max': {
      const n = parseInt(text, 10);
      if (!VALID_MAX.includes(n)) return '❌ Invalid max players. Reply one of: 2, 4, 8, 16, 32.';
      setCreate(phone, { step: 'await_image', max_players: n });
      return [
        `Players: *${n}*`,
        'Step 4/5 — 📷 *send the tournament image* (banner/logo).',
        'It will be auto-cropped to 16:9.',
      ].join('\n');
    }
    case 'await_image': {
      return '📷 Please send the tournament image (a photo), not text.';
    }
    case 'type': {
      const paid = text.match(/^paid\s+(\d+)$/i);
      if (paid) {
        const fee = parseInt(paid[1], 10);
        if (fee < 0) return '❌ Fee must be ≥ 0.';
        setCreate(phone, { step: 'confirm', fee_type: 'paid', fee });
      } else if (/^free$/i.test(text)) {
        setCreate(phone, { step: 'confirm', fee_type: 'free', fee: 0 });
      } else {
        return '❌ Reply `paid <fee KES>` (e.g. `paid 100`) or `free`.';
      }
      const c = getCreate(phone)!;
      return [
        '📋 *Confirm tournament*',
        `Name: *${c.name}*`,
        `Format: *${c.format}*`,
        `Max players: *${c.max_players}*`,
        `Image: ✅ banner set`,
        `Type: *${c.fee_type === 'paid' ? `paid — KES ${c.fee}` : 'free'}*`,
        '',
        'Reply `yes` to publish or `no` to cancel.',
      ].join('\n');
    }
    case 'confirm': {
      if (/^no$/i.test(text)) {
        clearCreate(phone);
        return '🚫 Cancelled. No tournament was created.';
      }
      if (!/^yes$/i.test(text)) return '❌ Reply `yes` to publish or `no` to cancel.';
      return finalizeCreate(phone);
    }
  }
  return null;
}

function finalizeCreate(phone: string): string {
  const c = getCreate(phone);
  if (!c || !c.name || !c.format || !c.max_players) {
    clearCreate(phone);
    return '❌ Incomplete tournament data. Start over with `create`.';
  }
  const ownerId = linkStore.getUserId(phone);
  const groupCount = c.format === 'multi_bracket' ? 2 : 0;
  const bracketType = c.format === 'multi_bracket' ? 'group_knockout' : 'single';
  const res = db.prepare(
    `INSERT INTO tournaments (name, description, platform, format, max_players, best_of, prize_pool,
       registration_deadline, result_deadline_hours, rules, owner_id, status, group_count, bracket_type, image_url, entry_fee, is_private, access_token)
     VALUES (?, ?, 'efootball', ?, ?, 1, NULL, NULL, 24, NULL, ?, 'registration_open', ?, ?, ?, ?, 0, NULL)`
  ).run(
    c.name, null, c.format, c.max_players, ownerId ?? 1, groupCount, bracketType, c.image_url ?? null, c.fee_type === 'paid' ? (c.fee || 0) : 0
  );
  const id = Number(res.lastInsertRowid);
  clearCreate(phone);
  const link = `https://xtournament.duckdns.org/t/${id}`;
  return [
    `✅ *${c.name}* published!`,
    `ID: #${id}`,
    `Type: ${c.fee_type === 'paid' ? `paid — KES ${c.fee}` : 'free'}`,
    `Status: registration open`,
    '',
    `Join link: ${link}`,
  ].join('\n');
}

async function link(phone: string, token?: string): Promise<string> {
  if (!token) return '❌ Usage: `link <token>` — paste your TOSS API token.';
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const user = db
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(decoded.userId) as { id: number; username: string } | undefined;
    if (!user) return '❌ Token valid but account not found.';
    linkStore.set(phone, user.id);
    return `✅ Linked to *${user.username}*. You can now use \`join\`, \`me\`.`;
  } catch {
    return '❌ Invalid or expired token.';
  }
}

function table(): string {
  const rows = db
    .prepare(
      'SELECT id, name, format, status, entry_fee, prize_pool FROM tournaments ORDER BY created_at DESC LIMIT ?'
    )
    .all(whatsappConfig.maxTournaments) as any[];
  if (rows.length === 0)
    return 'No tournaments open right now — new ones drop often, check back soon 🎾';
  const lines = rows.map(
    (t) =>
      `#${t.id} ${t.name} · ${t.format} · ${t.status} · Ksh ${t.entry_fee || 0}`
  );
  return [
    `🏆 *Live Tournaments* (${rows.length})`,
    ...lines,
    '',
    'Send `join <id>` to jump in 🎟️',
  ].join('\n');
}

function rank(): string {
  const rows = db
    .prepare(
      `SELECT u.id, u.username,
        COUNT(DISTINCT CASE WHEN m.winner_id = u.id THEN m.id END) as wins,
        COUNT(DISTINCT CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != u.id AND (m.player1_id = u.id OR m.player2_id = u.id) THEN m.id END) as losses,
        COALESCE(SUM(CASE WHEN w.winner_id = u.id THEN w.total_pot ELSE 0 END),0) as wager_earnings
      FROM users u
      LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'completed'
      LEFT JOIN wager_challenges w ON w.status = 'completed'
      GROUP BY u.id HAVING COUNT(DISTINCT CASE WHEN m.player1_id = u.id OR m.player2_id = u.id THEN m.id END) > 0
      ORDER BY wager_earnings DESC, wins DESC LIMIT ?`
    )
    .all(whatsappConfig.maxRankings) as any[];
  if (rows.length === 0)
    return 'No ranked players yet — go win some matches and top the board 👑';
  const lines = rows.map(
    (r, i) =>
      `${i + 1}. ${r.username} · ${r.wins}W-${r.losses}L · Ksh ${r.wager_earnings || 0}`
  );
  return [
    `🏆 *Top Players* (${rows.length})`,
    ...lines,
    '',
    'Send `me` to see your own record 📊',
  ].join('\n');
}

function fixtures(idStr?: string): string {
  const id = Number(idStr);
  if (!idStr || isNaN(id)) return '❌ Usage: `fixtures <id>`';
  const rows = db
    .prepare(
      'SELECT id, round, match_number, player1_id, player2_id, player1_score, player2_score, status FROM matches WHERE tournament_id = ? ORDER BY round, match_number'
    )
    .all(id) as any[];
  if (rows.length === 0) return `No matches found for tournament #${id}.`;
  const lines = rows.map((m) => {
    const score =
      m.player1_score !== null && m.player2_score !== null
        ? ` (${m.player1_score}-${m.player2_score})`
        : '';
    return `R${m.round} M${m.match_number}: P${m.player1_id} vs P${m.player2_id}${score} · ${m.status}`;
  });
  return [`🎮 *Fixtures — Tournament #${id}*`, ...lines].join('\n');
}

function me(phone: string): string {
  const userId = linkStore.getUserId(phone);
  if (!userId) return '❌ Link your account first: `link <token>`';
  const r = db
    .prepare(
      `SELECT COUNT(DISTINCT CASE WHEN m.winner_id = u.id THEN m.id END) as wins,
        COUNT(DISTINCT CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != u.id AND (m.player1_id = u.id OR m.player2_id = u.id) THEN m.id END) as losses
      FROM users u
      LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'completed'
      WHERE u.id = ? GROUP BY u.id`
    )
    .get(userId) as any;
  if (!r) return 'No match history yet.';
  return `👤 *Your stats*\nWins: ${r.wins}\nLosses: ${r.losses}`;
}

async function join(phone: string, idStr?: string): Promise<string> {
  const userId = linkStore.getUserId(phone);
  if (!userId)
    return '❌ Account not found. Forward your M-Pesa confirmation with `pay <id> <confirmation>` to register and join.';
  const id = Number(idStr);
  if (!idStr || isNaN(id))
    return '❌ Usage: `join <id>` — e.g. `join 20`';
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as any;
  if (!t) return `❌ Tournament #${id} not found.`;
  if (t.status !== 'registration_open' && t.status !== 'open')
    return '❌ Registration is closed for this tournament.';
  if (
    t.registration_deadline &&
    new Date(t.registration_deadline) < new Date()
  )
    return '❌ Registration deadline has passed.';
  const existing = db
    .prepare('SELECT * FROM participants WHERE tournament_id = ? AND user_id = ?')
    .get(id, userId);
  if (existing) return '❌ You are already registered in this tournament.';
  // FREE PASS: testers / pass-holders join paid tournaments with no M-Pesa.
  if (consumeFreePass(phone)) {
    try {
      db.prepare(
        `INSERT INTO tournament_payments (user_id, tournament_id, amount, receipt_code, till, status, source)
         VALUES (?, ?, 0, 'free_pass', NULL, 'completed', 'free_pass')`
      ).run(userId, id);
    } catch { /* idempotent-ish; join below still gates */ }
    const joined = doJoin(userId, t);
    return `🎟 Joined *${t.name}* on a free pass — no M-Pesa needed.\n${joined}`;
  }
  // PAY-TO-JOIN: a completed M-Pesa payment for this tournament is required.
  const paid = db
    .prepare(
      'SELECT * FROM tournament_payments WHERE user_id = ? AND tournament_id = ? AND status = ?'
    )
    .get(userId, id, 'completed') as any;
  if (!paid)
    return `❌ Pay the entry fee to join. Forward your M-Pesa confirmation with \`pay ${id} <confirmation>\`, or \`pay ${id}\` then paste it.`;
  return doJoin(userId, t);
}

function doJoin(userId: number, t: any): string {
  const count = db
    .prepare('SELECT COUNT(*) as c FROM participants WHERE tournament_id = ?')
    .get(t.id) as any;
  const maxPlayers = t.max_players ?? 0;
  if (maxPlayers && count.c >= maxPlayers)
    return '❌ Tournament is full.';
  const seed = (count.c || 0) + 1;
  db.prepare(
    'INSERT INTO participants (tournament_id, user_id, seed, status) VALUES (?, ?, ?, ?)'
  ).run(t.id, userId, seed, 'registered');
  return `✅ Joined *${t.name}* as seed #${seed}.`;
}

// Player pays via M-Pesa (Buy-Goods / Till) and forwards the confirmation.
// Two modes:
//   pay <tournamentId> <confirmation text>  -> record fee + auto-join
//   pay <confirmation text>                  -> signup-by-payment (account from phone)
async function pay(phone: string, text: string): Promise<string> {
  if (!text || text.length < 4)
    return '❌ Forward your M-Pesa confirmation message. For joining, use `pay <id> <confirmation>`.';
  const receipt = text.match(MPESA_RECEIPT_RE)?.[1];
  if (!receipt)
    return '❌ Could not find an M-Pesa receipt code. Forward the full confirmation SMS.';

  // Till gating: if a till is configured, the confirmation must reference it.
  const configuredTill = process.env.WHATSAPP_MPESA_TILL || whatsappConfig.mpesaTill;
  const msgTill = text.match(MPESA_TILL_RE)?.[1];
  if (configuredTill && msgTill !== configuredTill) {
    return `❌ That payment was not made to our Till ${configuredTill}. Forward the confirmation for the correct till.`;
  }

  const amount = text.match(MPESA_AMOUNT_RE)?.[2] || 'unknown';

  // Mode 1: joining a specific tournament -> pay <id> <text>
  const idMatch = text.match(/\bpay\s+(\d+)\b/i) || text.match(/^(\d{1,6})\b/);
  const joinId = idMatch ? Number(idMatch[1]) : NaN;
  if (!isNaN(joinId)) {
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(joinId) as any;
    if (!t) return `❌ Tournament #${joinId} not found.`;
    const userId = linkStore.getUserId(phone);
    if (!userId) {
      // Not linked yet: create the account from the phone, then pay+join.
      const u = createUserFromPhone(phone);
      linkStore.set(phone, u.id);
      return recordPaymentAndJoin(u.id, t, receipt, msgTill, amount, phone);
    }
    return recordPaymentAndJoin(userId, t, receipt, msgTill, amount, phone);
  }

  // Mode 2: signup-by-payment (no tournament specified)
  const user = createUserFromPhone(phone);
  linkStore.set(phone, user.id);
  try {
    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, details, whatsapp_pay_review, payload) VALUES ('system', 'whatsapp_pay_signup', ?, 1, ?)"
    ).run(
      `phone=${normalizePhone(phone)} till=${msgTill || 'n/a'} receipt=${receipt} amount=${amount} user=${user.id}`,
      JSON.stringify({ phone: normalizePhone(phone), receipt, till: msgTill || null, amount, userId: user.id, type: 'signup' })
    );
    // Record the signup payment for admin verification (source=whatsapp_sms, pending).
    db.prepare(
      `INSERT INTO tournament_payments (user_id, tournament_id, amount, receipt_code, till, status, source)
       VALUES (?, 0, ?, ?, ?, 'pending', 'whatsapp_sms')`
    ).run(user.id, Number(amount.replace(/,/g, '')) || 0, receipt, msgTill || null);
  } catch (e) { console.error('[whatsapp] log signup', (e as Error).message); }
  return [
    `✅ *Account created*`,
    `User ID: *${user.id}*`,
    `Username: ${user.username}`,
    ``,
    `Payment noted: ${receipt} (Ksh ${amount})${msgTill ? ` · Till ${msgTill}` : ''}.`,
    `To join a tournament, send \`pay <id> <confirmation>\`.`,
  ].join('\n');
}

function recordPaymentAndJoin(
  userId: number,
  t: any,
  receipt: string,
  till: string | undefined,
  amount: string,
  phone: string
): string {
  // Idempotent: one completed payment per (user, tournament).
  const prior = db
    .prepare(
      'SELECT * FROM tournament_payments WHERE user_id = ? AND tournament_id = ?'
    )
    .get(userId, t.id) as any;
  if (!prior) {
    db.prepare(
      `INSERT INTO tournament_payments (user_id, tournament_id, amount, receipt_code, till, status, source)
       VALUES (?, ?, ?, ?, ?, 'pending', 'whatsapp_sms')`
    ).run(userId, t.id, Number(amount.replace(/,/g, '')) || 0, receipt, till || null);
  }
  const alreadyJoined = db
    .prepare('SELECT * FROM participants WHERE tournament_id = ? AND user_id = ?')
    .get(t.id, userId);
  if (alreadyJoined) return `✅ Payment recorded for *${t.name}*. You are already registered.`;
  const joined = doJoin(userId, t);
  try {
    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, details, whatsapp_pay_review, payload) VALUES ('system', 'whatsapp_pay_join', ?, 1, ?)"
    ).run(`phone=${normalizePhone(phone)} user=${userId} tournament=${t.id} receipt=${receipt}`,
      JSON.stringify({ phone: normalizePhone(phone), userId, tournamentId: t.id, receipt, type: 'join' }));
  } catch (e) { console.error('[whatsapp] log join', (e as Error).message); }
  return [`💰 Payment recorded for *${t.name}*.`, joined].join('\n');
}

// ─── Phase 3: WhatsApp result submission ───────────────────────
// Text-based: `result <matchId> <a>-<b>`. Updates the match for the
// WhatsApp-linked user and records a result_submissions row so it shows
// in the admin review queue. The screenshot path (bot.ts) calls the
// full OCR verification pipeline instead.
function submitResultText(phone: string, matchId: number, a: number, b: number): string {
  const userId = linkStore.getUserId(phone);
  if (!userId) return '❌ Link your TOSS account first with `link <token>`.';

  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as any;
  if (!m) return `❌ Match #${matchId} not found.`;
  if (m.status === 'completed') return `❌ Match #${matchId} is already completed.`;

  const isP1 = m.player1_id === userId;
  const isP2 = m.player2_id === userId;
  if (!isP1 && !isP2) return `❌ You are not a participant in match #${matchId}.`;

  db.prepare(`
    UPDATE matches SET
      player1_score = ?, player2_score = ?,
      submitted_by = ?, submitted_at = CURRENT_TIMESTAMP,
      status = 'playing'
    WHERE id = ?
  `).run(isP1 ? a : m.player1_score, isP2 ? b : m.player2_score, userId, matchId);

  try {
    db.prepare(`
      INSERT INTO result_submissions (match_id, uploader_id, ocr_score_left, ocr_score_right, verification_status, team_match_result)
      VALUES (?, ?, ?, ?, 'pending', 'both')
    `).run(matchId, userId, a, b);
  } catch (e) { console.error('[whatsapp] result submit', (e as Error).message); }

  try {
    const oppId = isP1 ? m.player2_id : m.player1_id;
    if (oppId) {
      db.prepare(`INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, 'result')`)
        .run(oppId, 'Result Submitted', `A result for match #${matchId} was submitted via WhatsApp. Confirm or dispute.`, 'result');
    }
  } catch { /* ignore */ }

  const decisive = a !== b;
  const winnerLine = decisive
    ? `Winner: *${a > b ? (isP1 ? 'you' : 'opponent') : (isP1 ? 'opponent' : 'you')}*.`
    : `It's a draw — awaiting confirmation.`;
  return [
    `✅ Result submitted for match #${matchId}: *${a} - ${b}*.`,
    winnerLine,
    `Send a screenshot of the final score to auto-verify.`,
  ].join('\n');
}

// ─── Phase 3: WhatsApp screenshot result (OCR verification) ────
// User sends a screenshot of the final score with an optional caption
// `result <matchId>`. We download the image, OCR it, and run the existing
// verification pipeline (team validation + fraud + confidence). The match
// is auto-approved on high confidence, otherwise escalated for review.
export async function handleResultScreenshot(
  sock: any,
  remoteJid: string,
  phone: string,
  msg: any,
  caption: string
): Promise<string> {
  const userId = linkStore.getUserId(phone);
  if (!userId) return '❌ Link your TOSS account first with `link <token>` before submitting results.';

  const matchIdMatch = caption.match(/result\s+(\d+)/i);
  if (!matchIdMatch) {
    return '📸 Got your screenshot. To verify a result, send it with a caption: `result <matchId>` (e.g. `result 15`).';
  }
  const matchId = Number(matchIdMatch[1]);
  const fixture = db.prepare('SELECT id, player1_id, player2_id, player1_team, player2_team, status FROM matches WHERE id = ?').get(matchId) as any;
  if (!fixture) return `❌ Match #${matchId} not found.`;
  if (fixture.status === 'completed') return `❌ Match #${matchId} is already completed.`;
  if (fixture.player1_id !== userId && fixture.player2_id !== userId)
    return `❌ You are not a participant in match #${matchId}.`;

  try {
    const stream = await downloadContentFromMessage(msg.imageMessage, 'image');
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const buffer = Buffer.concat(chunks);

    // Persist locally so it's viewable in the admin console.
    const hash = createHash('sha256').update(buffer).digest('hex');
    const dir = joinPath(__dirname, '..', '..', '..', 'client', 'public', 'screenshots', 'whatsapp');
    mkdirSync(dir, { recursive: true });
    const rel = `/screenshots/whatsapp/${hash}.jpg`;
    writeFileSync(joinPath(dir, `${hash}.jpg`), buffer);

    // OCR
    const w = await getWorker();
    const { data: { text } } = await w.recognize(buffer);
    const parsed = parseEFOTBScreenshot(text);

    const ocrTeams = {
      leftTeam: parsed.player1Name,
      rightTeam: parsed.player2Name,
      leftScore: parsed.player1Score,
      rightScore: parsed.player2Score,
      matchTime: parsed.matchTime,
      rawText: text,
      ocrConfidence: parsed.confidence,
    };

    const result = await processVerification(matchId, userId, rel, buffer, ocrTeams as any);

    if (result.status === 'auto_approved') {
      return `✅ Result auto-verified for match #${matchId} (${result.player1Score}-${result.player2Score}). Confidence ${result.overallConfidence}%.`;
    }
    if (result.status === 'rejected') {
      return `⚠️ Submission rejected (fraud score ${result.fraudCheck.score}). An admin will review.`;
    }
    if (result.status === 'opponent_review') {
      return `🔍 Screenshot verified at ${result.overallConfidence}% confidence. Awaiting opponent confirmation.`;
    }
    return `🔍 Submitted for admin review (confidence ${result.overallConfidence}%). You'll be notified when resolved.`;
  } catch (e: any) {
    console.error('[whatsapp] OCR failed', e?.message);
    return '❌ Could not read the screenshot. Make sure it clearly shows the final score screen and resend.';
  }
}

export async function handleCommand(
  text: string,
  ctx: Ctx
): Promise<string> {
  const raw = (text || '').trim();
  if (!raw) return help();

  // ─── Admin self-connect + admin command surface ────────
  // Any user can claim admin with a one-time code: `/admin <code>`.
  // Once their phone is in admin_phones, they get the admin commands.
  const claimMatch = raw.match(/^\/admin\s+(\S+)$/i);
  if (claimMatch) {
    const code = claimMatch[1];
    const row = db.prepare(
      `SELECT id, used_by, is_active FROM admin_codes WHERE code = ?`
    ).get(code) as any;
    if (!row || row.is_active !== 1 || row.used_by) {
      return '❌ Invalid or already-used admin code.';
    }
    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(ctx.phone) as any;
    db.prepare('UPDATE admin_codes SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(existing?.id ?? null, row.id);
    const added = addAdminPhone(ctx.phone, 'self-claimed');
    if (!added) return '❌ Could not register admin number.';
    return '✅ You are now an admin on this number. Commands: `broadcast <text>`, `status`, `agents`, `approve <id>`, `tester <phone>`, `passes <phone> <n>`.';
  }

  const isAdmin = isAdminPhone(ctx.phone);
  if (isAdmin) {
    const [acmd, ...arest] = raw.split(/\s+/);
    const aarg = arest.join(' ').trim();
    switch (acmd.toLowerCase()) {
      case 'create': {
        return startCreate(ctx.phone);
      }
      case 'broadcast': {
        if (!aarg) return '❌ Usage: `broadcast <text>`';
        try {
          const api = agentApi('');
          await api.sendBroadcast(aarg);
          return '✅ Broadcast sent.';
        } catch (e: any) { return `❌ ${e.message}`; }
      }
      case 'status': {
        const m = getEngineMetrics();
        const t = db.prepare('SELECT (SELECT COUNT(*) FROM tournaments) AS t, (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM participants) AS p').get() as any;
        return [
          `🤖 TOSS status`,
          `WhatsApp: ${getConnectionState()}`,
          `Agents online: ${m.agentsOnline}/${m.agentsOnline + m.agentsOffline}`,
          `Actions executed: ${m.actionsExecuted} | queued: ${m.actionsQueued}`,
          `Tournaments: ${t?.t || 0} | Users: ${t?.u || 0} | Participants: ${t?.p || 0}`,
        ].join('\n');
      }
      case 'agents': {
        const a = getAgentAssignments();
        const list = Object.keys(AGENT_PERSONAS)
          .map(id => `• ${id}: ${a[id]?.for_interactions ? 'ON' : 'off'}`)
          .join('\n');
        return `Agents (interactions):\n${list}`;
      }
      case 'approve': {
        if (!aarg) return '❌ Usage: `approve <actionId>`';
        const ok = approveAction(aarg);
        return ok ? '✅ Action approved & executed.' : '❌ Action not found (expired?).';
      }
      case 'tester': {
        if (!aarg) return '❌ Usage: `tester <phone>`';
        const p = aarg.replace(/\D/g, '');
        const r = db.prepare('UPDATE users SET is_tester = 1 WHERE phone = ?').run(p);
        return r.changes ? `✅ ${p} is now a permanent tester (free entry).` : `❌ No user with phone ${p}.`;
      }
      case 'passes': {
        const m = aarg.match(/^(\+?\d[\d\s-]{6,})\s+(\d+)$/);
        if (!m) return '❌ Usage: `passes <phone> <n>`';
        const p = m[1].replace(/\D/g, '');
        const ok = grantPasses(p, Number(m[2]));
        return ok ? `✅ Granted ${m[2]} free pass(es) to ${p}.` : `❌ Grant failed.`;
      }
      case 'user': {
        if (!aarg) return '❌ Usage: `user <phone>`';
        const p = aarg.replace(/\D/g, '');
        const u = db.prepare(
          `SELECT u.id, u.username, u.is_tester, COALESCE(u.free_passes,0) AS fp,
                  (SELECT COUNT(*) FROM participants p WHERE p.user_id=u.id) AS tours,
                  (SELECT COUNT(*) FROM tournament_payments tp WHERE tp.user_id=u.id AND tp.status='completed') AS paid
           FROM users u WHERE u.phone = ?`
        ).get(p) as any;
        if (!u) return `❌ No user with phone ${p}.`;
        return [
          `👤 User ${u.id} — ${u.username || '(no name)'}`,
          `Tester: ${u.is_tester ? 'yes' : 'no'} | Free passes: ${u.fp}`,
          `Tournaments joined: ${u.tours} | Paid entries: ${u.paid}`,
        ].join('\n');
      }
      default:
        // Not an admin command — fall through to normal handling below.
        break;
    }
  }

  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ').trim();
  const known = ['help','start','link','table','tournaments','rank','rankings','fixtures','me','join','pay','result'];
  // Mid-create-flow routing: if this admin is mid-tournament-creation,
  // every text reply advances the guided step (unless they cancel).
  if (isAdminPhone(ctx.phone)) {
    const creating = getCreate(ctx.phone);
    if (creating) {
      const stepReply = await handleCreateStep(ctx.phone, raw);
      if (stepReply) return stepReply;
    }
  }
  if (known.includes(cmd.toLowerCase())) {
    switch (cmd.toLowerCase()) {
      case 'help':
      case 'start':
        return help();
      case 'link':
        return link(ctx.phone, arg);
      case 'table':
      case 'tournaments':
        return table();
      case 'rank':
      case 'rankings':
        return rank();
      case 'fixtures':
        return fixtures(arg);
      case 'me':
        return me(ctx.phone);
      case 'join':
        return join(ctx.phone, arg);
      case 'pay':
        return pay(ctx.phone, arg);
      case 'result': {
        // result <matchId> <a>-<b>  (e.g. "result 15 3-1")
        const m = arg.match(/^(\d+)\s+(\d+)\s*[-–—:]\s*(\d+)$/);
        if (!m) return '❌ Usage: `result <matchId> <scoreA>-<scoreB>` (e.g. `result 15 3-1`).';
        return submitResultText(ctx.phone, Number(m[1]), Number(m[2]), Number(m[3]));
      }
    }
  }

  // Phase 2: natural-language assistant. When the Omniroute LLM is enabled,
  // The model + enabled flag are authoritative from the DB (admin console),
  // not the static config default — the DB holds the working model while the
  // config default (oc/deepseek-v4-flash-free) is rate-limited/429s.
  const ws = getSettings();
  const useLLM =
    ws.aiEnabled && whatsappConfig.omnirouteKey.length > 0;
  const llm = {
    baseUrl: ws.aiBaseUrl || whatsappConfig.omnirouteBase,
    apiKey: whatsappConfig.omnirouteKey,
    model: ws.aiModel || whatsappConfig.aiModel,
  };
  if (useLLM) {
    const tools = getActiveTools();
    if (tools.length) {
      const toolReply = await runAssistantWithTools(raw, llm, tools);
      if (toolReply && toolReply.trim()) return sanitizeReply(toolReply);
    }
  }
  const intent = useLLM ? await interpretWithLLM(raw, llm) : interpret(raw);
  if (intent.clarification) {
    if (intent.needsReview) {
      try {
        db.prepare(
          "INSERT INTO admin_logs (admin_id, action, details, whatsapp_ai_lowconf, payload) VALUES ('system', 'whatsapp_ai_lowconf', ?, 1, ?)"
        ).run(`phone=${normalizePhone(ctx.phone)} text=${raw.slice(0,200)}`,
          JSON.stringify({ phone: normalizePhone(ctx.phone), text: raw.slice(0, 500), type: 'lowconf' }));
      } catch (e) { console.error('[whatsapp] log lowconf', (e as Error).message); }
    }
    return sanitizeReply(intent.clarification);
  }
  switch (intent.action) {
    case 'help': return help();
    case 'table': return table();
    case 'rank': return rank();
    case 'fixtures': return fixtures(intent.arg || '');
    case 'me': return me(ctx.phone);
    case 'join': return join(ctx.phone, intent.arg);
    case 'pay': return pay(ctx.phone, intent.arg || raw);
    case 'signup': return pay(ctx.phone, raw);
    default: return help();
  }
}
