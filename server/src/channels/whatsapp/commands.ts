import db from '../../db.js';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join as joinPath } from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { whatsappConfig } from './config.js';
import { linkStore } from './linkStore.js';
import { interpret, interpretWithLLM } from './assistant.js';
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
  if (rows.length === 0) return 'No tournaments yet.';
  const lines = rows.map(
    (t) =>
      `#${t.id} ${t.name} · ${t.format} · ${t.status} · KSH ${t.entry_fee || 0}`
  );
  return ['📋 *Tournaments*', ...lines].join('\n');
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
  if (rows.length === 0) return 'No ranked players yet.';
  const lines = rows.map(
    (r, i) =>
      `${i + 1}. ${r.username} · ${r.wins}W-${r.losses}L · KSH ${r.wager_earnings || 0}`
  );
  return ['🏆 *Rankings*', ...lines].join('\n');
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

  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ').trim();
  const known = ['help','start','link','table','tournaments','rank','rankings','fixtures','me','join','pay','result'];
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
  // use it for intent extraction (with deterministic fallback); otherwise
  // use the offline rules. Either way, execution goes through the same
  // DB-backed handlers — the LLM never returns user-facing data.
  const useLLM =
    whatsappConfig.aiEnabled && whatsappConfig.omnirouteKey.length > 0;
  const intent = useLLM
    ? await interpretWithLLM(raw, {
        baseUrl: whatsappConfig.omnirouteBase,
        apiKey: whatsappConfig.omnirouteKey,
        model: whatsappConfig.aiModel,
      })
    : interpret(raw);
  if (intent.clarification) {
    if (intent.needsReview) {
      try {
        db.prepare(
          "INSERT INTO admin_logs (admin_id, action, details, whatsapp_ai_lowconf, payload) VALUES ('system', 'whatsapp_ai_lowconf', ?, 1, ?)"
        ).run(`phone=${normalizePhone(ctx.phone)} text=${raw.slice(0,200)}`,
          JSON.stringify({ phone: normalizePhone(ctx.phone), text: raw.slice(0, 500), type: 'lowconf' }));
      } catch (e) { console.error('[whatsapp] log lowconf', (e as Error).message); }
    }
    return intent.clarification;
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
