// AgentTool registry — read-only DB tools the WhatsApp AI assistant can
// call to answer user questions with REAL data instead of guessing.
//
// 'wire chats first' phase: every tool is read-only. The LLM chooses a
// tool via the OpenAI-compatible function-calling contract (see
// omnirouteChatWithTools). Each tool declares the agent that owns it; only
// tools whose owning agent has `for_interactions = 1` (see
// getAgentAssignments) are returned by getActiveTools().

import db from '../../db.js';

// Read which agents are enabled for user interactions directly from the
// agent_assignments table (self-contained; no external helper dependency).
export function getAgentAssignments(): Record<string, { for_interactions?: boolean }> {
  const rows = db.prepare('SELECT agent_id, for_interactions FROM agent_assignments').all() as any[];
  const map: Record<string, { for_interactions?: boolean }> = {};
  for (const r of rows) map[r.agent_id] = { for_interactions: !!r.for_interactions };
  return map;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: any; // JSON-schema-ish object for the function spec
  scope: 'read' | 'write';
  agentId: string;
  handler: (args: any) => Promise<any>;
}

// ─── Tool handlers (read-only) ──────────────────────────────────

async function getTournament(args: any): Promise<any> {
  const id = Number(args?.id);
  if (!id || isNaN(id)) return { error: 'missing or invalid id' };
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as any;
  if (!t) return { found: false, id };
  const count = db
    .prepare('SELECT COUNT(*) as c FROM participants WHERE tournament_id = ?')
    .get(id) as any;
  return {
    found: true,
    tournament: t,
    participant_count: count?.c ?? 0,
  };
}

async function listOpenTournaments(args: any): Promise<any> {
  const limit = Number(args?.limit) || 10;
  const rows = db
    .prepare(
      `SELECT id, name, platform, format, status, entry_fee, prize_pool, max_players
       FROM tournaments
       WHERE status IN ('open', 'registration_open', 'check_in')
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as any[];
  return { count: rows.length, tournaments: rows };
}

async function getLeaderboard(args: any): Promise<any> {
  const tournamentId = Number(args?.tournamentId);
  if (!tournamentId || isNaN(tournamentId)) return { error: 'missing or invalid tournamentId' };
  // Best-effort leaderboard: participant rows with win counts from matches.
  const rows = db
    .prepare(
      `SELECT p.id, p.tournament_id, p.user_id, p.status, p.seed,
              u.username,
              (SELECT COUNT(*) FROM matches m
                WHERE (m.player1_id = p.user_id OR m.player2_id = p.user_id)
                  AND m.tournament_id = p.tournament_id
                  AND m.winner_id = p.user_id) as wins
       FROM participants p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.tournament_id = ?
       ORDER BY wins DESC, p.seed ASC`
    )
    .all(tournamentId) as any[];
  return { tournamentId, count: rows.length, leaderboard: rows };
}

async function getFixtures(args: any): Promise<any> {
  const tournamentId = Number(args?.tournamentId);
  if (!tournamentId || isNaN(tournamentId)) return { error: 'missing or invalid tournamentId' };
  const rows = db
    .prepare(
      `SELECT id, tournament_id, round, match_number, player1_id, player2_id,
              player1_score, player2_score, status, winner_id, scheduled_time
       FROM matches WHERE tournament_id = ? ORDER BY round, match_number`
    )
    .all(tournamentId) as any[];
  return { tournamentId, count: rows.length, matches: rows };
}

async function getUserStats(args: any): Promise<any> {
  const phone = String(args?.phone || '').replace(/\D/g, '');
  if (!phone) return { error: 'missing or invalid phone' };
  // Normalize like the command layer: leading 0 -> 254; 2540 -> 254.
  let norm = phone;
  if (norm.startsWith('0')) norm = '254' + norm.slice(1);
  if (norm.startsWith('2540')) norm = '254' + norm.slice(4);
  const users = db
    .prepare('SELECT id, username, phone, registration_paid FROM users WHERE phone LIKE ?')
    .all(`%${norm.slice(-9)}`) as any[];
  if (users.length === 0) return { found: false, phone: norm };
  const result = users.map((u) => {
    const parts = db
      .prepare('SELECT tournament_id, status FROM participants WHERE user_id = ?')
      .all(u.id) as any[];
    return {
      id: u.id,
      username: u.username,
      registration_paid: !!u.registration_paid,
      tournaments: parts,
    };
  });
  return { found: true, phone: norm, users: result };
}

async function getFeeExplanation(args: any): Promise<any> {
  return {
    signing_fee: {
      label: 'Signing / Registration fee',
      amount_kes: 100,
      type: 'one_time',
      description:
        'A ONE-TIME 100 KES charge to create your TOSS platform account. Paid once via M-Pesa STK push. NOT a tournament fee, not per-tournament.',
      column: 'users.registration_paid',
    },
    tournament_entry_fee: {
      label: 'Tournament Entry fee',
      type: 'per_tournament',
      description:
        'Set by the organizer PER TOURNAMENT. Varies (e.g. 50/100/200 KES) and can be 0 = FREE. Paid only when joining that specific tournament.',
      column: 'tournaments.entry_fee',
    },
    note: 'These are TWO completely different fees. Never confuse them.',
  };
}

// ─── Registry ───────────────────────────────────────────────────

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_tournament',
    description:
      'Get full details for one tournament by id: name, entry_fee, prize_pool, status, format, max_players, platform, plus current participant count. Use when the user asks about a specific tournament (e.g. "what is the entry fee for tournament 20?").',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Tournament id, e.g. 20' } },
      required: ['id'],
    },
    scope: 'read',
    agentId: 'tournament_ops',
    handler: getTournament,
  },
  {
    name: 'list_open_tournaments',
    description:
      'List tournaments currently open for registration/check-in with their entry_fee. Use when the user asks for open tournaments, the table of tournaments, or "is there a free tournament?".',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max rows (default 10)' } },
    },
    scope: 'read',
    agentId: 'tournament_ops',
    handler: listOpenTournaments,
  },
  {
    name: 'get_leaderboard',
    description:
      'Get standings/leaderboard for a tournament from participants joined to users, with win counts. Use when the user asks about rankings, standings, or who is winning a tournament.',
    parameters: {
      type: 'object',
      properties: { tournamentId: { type: 'number', description: 'Tournament id' } },
      required: ['tournamentId'],
    },
    scope: 'read',
    agentId: 'tournament_ops',
    handler: getLeaderboard,
  },
  {
    name: 'get_fixtures',
    description:
      'Get all matches (fixtures) for a tournament: scores, status, players, round, scheduled time. Use when the user asks for fixtures, matches, or a draw for a tournament.',
    parameters: {
      type: 'object',
      properties: { tournamentId: { type: 'number', description: 'Tournament id' } },
      required: ['tournamentId'],
    },
    scope: 'read',
    agentId: 'tournament_ops',
    handler: getFixtures,
  },
  {
    name: 'get_user_stats',
    description:
      'Look up a user by phone number and return their id, username, registration_paid flag (signing fee paid), and the tournaments they participate in. Use when the user asks about their own account, signup status, or registration payment.',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'User phone, e.g. 2547xxxxxxxx' } },
      required: ['phone'],
    },
    scope: 'read',
    agentId: 'support',
    handler: getUserStats,
  },
  {
    name: 'get_fee_explanation',
    description:
      'Explain the TWO separate TOSS fees: the one-time 100 KES signing/registration fee vs. the per-tournament entry_fee (which varies and can be 0=free). Use whenever the user asks about fees, the signing fee, or tournament costs.',
    parameters: { type: 'object', properties: {} },
    scope: 'read',
    agentId: 'finance',
    handler: getFeeExplanation,
  },
];

// Tools whose owning agent has `for_interactions = 1` are exposed to the
// live user-facing WhatsApp assistant. Tools owned by agents gated off for
// interactions are filtered out.
export function getActiveTools(): AgentTool[] {
  let assignments: Record<string, { for_interactions?: boolean }> = {};
  try {
    assignments = getAgentAssignments();
  } catch {
    assignments = {};
  }
  return AGENT_TOOLS.filter((t) => assignments[t.agentId]?.for_interactions);
}

// ─── Agent personas ───────────────────────────────────────────
// Each multi-selectable agent maps to a ROLE the WhatsApp AI adopts.
// The active agents (for_interactions = 1) compose the system prompt,
// so the admin console's agent toggles literally change WHO the bot is.
// Lead-gen / support / finance / tournament-ops are the user-facing set;
// the rest refine tone when enabled.
export const AGENT_PERSONAS: Record<string, string> = {
  tournament_ops:
    'TOURNAMENT OPS: give real tournament info (fees, fixtures, standings) using your tools. Be precise with numbers.',
  conversation:
    'CONVERSATION: sound like a real, friendly TOSS rep — not a bot. Keep replies short and human. Never mention you are AI.',
  support:
    'SUPPORT: help users with accounts, registration status, and how to use TOSS. Patient and clear.',
  finance:
    'FINANCE: explain the TWO fees — one-time 100 KES signing/registration vs per-tournament entry_fee (varies, 0 = free) — and M-Pesa payment.',
  marketing:
    'LEAD GEN: proactively welcome new users, guide them to register/link their account, and surface upcoming tournaments.',
  moderator:
    'MODERATOR: keep tone respectful; if a user is abusive, stay calm and firm.',
  notification:
    'NOTIFICATIONS: mention users can opt into match reminders when relevant.',
  analytics:
    'ANALYTICS: when asked about platform stats, give honest, concise answers.',
  coach:
    'COACH: offer brief eFootball tips when a user asks for help improving.',
};

// Compose the persona section of the system prompt from the agents the
// admin has enabled for user interactions. Falls back to a sane default
// if none are active so the bot is never personality-less.
export function buildPersonaPrompt(
  assignments: Record<string, { for_interactions?: boolean }>
): string {
  const active = Object.keys(AGENT_PERSONAS).filter(
    (id) => assignments[id]?.for_interactions
  );
  if (active.length === 0) {
    return 'You are TOSS, a friendly human-sounding eFootball tournament support rep in Kenya.';
  }
  const roles = active.map((id) => `- ${AGENT_PERSONAS[id]}`).join('\n');
  return (
    'You are TOSS, operating as a combined team with these active roles:\n' +
    roles +
    '\nPersonalities blend into one helpful, human-sounding voice. Never say you are an AI, bot, assistant, or model. ' +
    'Never narrate your reasoning. Never dump a command menu unless the user explicitly types "help" or "menu".'
  );
}
