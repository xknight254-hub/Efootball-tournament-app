import db from '../../db.js';
import jwt from 'jsonwebtoken';
import { whatsappConfig } from './config.js';
import { linkStore } from './linkStore.js';
import { interpret, interpretWithLLM } from './assistant.js';

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

export async function handleCommand(
  text: string,
  ctx: Ctx
): Promise<string> {
  const raw = (text || '').trim();
  if (!raw) return help();
  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ').trim();
  const known = ['help','start','link','table','tournaments','rank','rankings','fixtures','me','join','pay'];
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
