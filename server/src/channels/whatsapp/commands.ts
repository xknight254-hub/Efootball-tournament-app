import db from '../../db.js';
import jwt from 'jsonwebtoken';
import { whatsappConfig } from './config.js';
import { linkStore } from './linkStore.js';

const JWT_SECRET =
  process.env.JWT_SECRET || 'efootball-arena-super-secret-key-2024';

interface Ctx {
  phone: string;
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
  if (!userId) return '❌ Link your account first: `link <token>`';
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
  const count = db
    .prepare('SELECT COUNT(*) as c FROM participants WHERE tournament_id = ?')
    .get(id) as any;
  // max_players column may not exist on every row shape; read defensively
  const maxPlayers = t.max_players ?? 0;
  if (maxPlayers && count.c >= maxPlayers)
    return '❌ Tournament is full.';
  const seed = (count.c || 0) + 1;
  db.prepare(
    'INSERT INTO participants (tournament_id, user_id, seed, status) VALUES (?, ?, ?, ?)'
  ).run(id, userId, seed, 'registered');
  return `✅ Joined *${t.name}* as seed #${seed}.`;
}

export async function handleCommand(
  text: string,
  ctx: Ctx
): Promise<string> {
  const raw = (text || '').trim();
  if (!raw) return help();
  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ').trim();
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
    default:
      return `Unknown command: \`${cmd}\`. Send \`help\`.`;
  }
}
