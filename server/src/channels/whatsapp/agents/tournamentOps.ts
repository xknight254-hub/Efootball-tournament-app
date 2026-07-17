/**
 * Tournament Operations Agent — manages the full tournament lifecycle.
 *
 * This agent is the automated tournament director. It monitors tournament
 * state transitions, deadline compliance, match activity, and bracket
 * advancement, then proposes actions for the Automation Engine to execute.
 *
 * Responsibilities:
 *   - Auto-start tournaments when registration deadline passes or max players reached
 *   - Detect stale/overdue matches and send reminders
 *   - Recommend walkovers for unplayed matches past the result deadline
 *   - Detect completed rounds and advance brackets
 *   - Detect tournament completion and award winners
 *   - Close completed/cancelled tournaments gracefully
 *
 * Conventions:
 *   - evaluate(ctx) scans ctx.db (read-only) and returns AgentAction[]
 *   - execute(action) calls agentApi to perform the action via backend REST API
 *   - Never modifies DB directly — always goes through the API
 *   - Every action carries an idempotency key (actionId)
 */

import type { AgentModule, AgentContext, AgentAction, AgentHealth } from './agentTypes.js';
import { agentApi, actionId } from './agentApi.js';
import { emitEvent } from './eventBus.js';

// ─── Module identity ──────────────────────────────────────────────

const MODULE_ID = 'tournament_ops' as const;
const VERSION = '1.0.0';
const START_TIME = Date.now();

// ─── Agent state ──────────────────────────────────────────────────

let tasksCompleted = 0;
let tasksFailed = 0;
let lastTick: string | null = null;
let lastError: string | null = null;

// Track which tournaments we've already proposed actions for, keyed by
// `${tournamentId}:${actionType}` so we don't spam the same action every tick.
const proposedActions = new Set<string>();
// GC old entries after 1 hour
const PROPOSED_TTL_MS = 60 * 60 * 1000;

// ─── Deadline / staleness thresholds (configurable via ctx.config) ─

function resolveConfig(ctx: AgentContext): {
  resultDeadlineHours: number;
  registrationGraceMinutes: number;
  walkoverHours: number;
  reminderIntervalMinutes: number;
  minPlayersToAutoStart: number;
} {
  const c = ctx.config;
  return {
    resultDeadlineHours: Number(c.resultDeadlineHours) || 24,
    registrationGraceMinutes: Number(c.registrationGraceMinutes) || 60,
    walkoverHours: Number(c.walkoverHours) || 48,
    reminderIntervalMinutes: Number(c.reminderIntervalMinutes) || 120,
    minPlayersToAutoStart: Number(c.minPlayersToAutoStart) || 2,
  };
}

// ─── Interface helpers ────────────────────────────────────────────

interface TournamentRow {
  id: number;
  name: string;
  format: string;
  status: string;
  max_players: number;
  registration_deadline: string | null;
  result_deadline_hours: number;
  winner_id: number | null;
  owner_id: number;
  created_at: string;
}

interface MatchRow {
  id: number;
  tournament_id: number;
  player1_id: number;
  player2_id: number;
  player1_score: number | null;
  player2_score: number | null;
  status: string;
  winner_id: number | null;
  round: number;
  scheduled_time: string | null;
  created_at: string;
}

interface ParticipantCountRow {
  count: number;
}

// ─── Idempotency guard ────────────────────────────────────────────

function markProposed(key: string): boolean {
  if (proposedActions.has(key)) return false;
  proposedActions.add(key);
  // Schedule removal after TTL (use setTimeout with a noop — it's fine in Node)
  setTimeout(() => proposedActions.delete(key), PROPOSED_TTL_MS).unref();
  return true;
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Total completed matches in a tournament. */
function completedMatchCount(db: any, tournamentId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM matches
     WHERE tournament_id = ? AND status = 'completed'`
  ).get(tournamentId) as ParticipantCountRow;
  return row?.count ?? 0;
}

/** Total matches in a tournament. */
function totalMatchCount(db: any, tournamentId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM matches
     WHERE tournament_id = ?`
  ).get(tournamentId) as ParticipantCountRow;
  return row?.count ?? 0;
}

/** Count participants in a tournament. */
function participantCount(db: any, tournamentId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM participants
     WHERE tournament_id = ? AND status = 'registered'`
  ).get(tournamentId) as ParticipantCountRow;
  return row?.count ?? 0;
}

/** Get the highest completed round in a knockout tournament. */
function highestCompletedRound(db: any, tournamentId: number): number {
  const row = db.prepare(
    `SELECT MAX(round) as max_round FROM matches
     WHERE tournament_id = ? AND status = 'completed'`
  ).get(tournamentId) as { max_round: number | null };
  return row?.max_round ?? 0;
}

/** Get all matches in a specific round. */
function matchesInRound(db: any, tournamentId: number, round: number): MatchRow[] {
  return db.prepare(
    `SELECT * FROM matches
     WHERE tournament_id = ? AND round = ?`
  ).all(tournamentId, round) as MatchRow[];
}

/** Determine the number of rounds in a knockout tournament. */
function totalRounds(playerCount: number): number {
  return Math.ceil(Math.log2(playerCount));
}

// ─── Evaluate: scan state, return actions ─────────────────────────

async function evaluate(ctx: AgentContext): Promise<{ actions: AgentAction[]; metrics?: Record<string, any> }> {
  const actions: AgentAction[] = [];
  const now = ctx.now;
  const db = ctx.db;
  const cfg = resolveConfig(ctx);

  const scannedTournaments = { open: 0, active: 0, stuckCheckin: 0, oldLeagues: 0 };

  try {
    // ── 1. Tournaments in 'open' or 'registration_open' ──────────
    //     Auto-start if registration deadline passed OR tournament is full.
    const openTournaments = db.prepare(
      `SELECT * FROM tournaments
       WHERE status IN ('open', 'registration_open')`
    ).all() as TournamentRow[];
    scannedTournaments.open = openTournaments.length;

    for (const t of openTournaments) {
      const pCount = participantCount(db, t.id);

      // Condition A: max players reached
      if (pCount >= t.max_players) {
        const key = `${t.id}:create_fixtures`;
        if (markProposed(key)) {
          actions.push({
            id: actionId(MODULE_ID, 'create_fixtures', t.id),
            agentId: MODULE_ID,
            type: 'create_fixtures',
            params: { tournamentId: t.id, tournamentName: t.name },
            priority: 'high',
            description: `Tournament "${t.name}" (${t.id}) is full (${pCount}/${t.max_players}) — generating fixtures`,
            requiresConfirmation: false,
          });
        }
        continue;
      }

      // Condition B: registration deadline passed (with grace period)
      if (t.registration_deadline) {
        const deadline = new Date(t.registration_deadline);
        const deadlineWithGrace = new Date(deadline.getTime() + cfg.registrationGraceMinutes * 60_000);
        if (now > deadlineWithGrace && pCount >= cfg.minPlayersToAutoStart) {
          const key = `${t.id}:create_fixtures`;
          if (markProposed(key)) {
            actions.push({
              id: actionId(MODULE_ID, 'create_fixtures', t.id),
              agentId: MODULE_ID,
              type: 'create_fixtures',
              params: { tournamentId: t.id, tournamentName: t.name },
              priority: 'high',
              description: `Registration deadline passed for "${t.name}" (${t.id}) with ${pCount} players — generating fixtures`,
              requiresConfirmation: false,
            });
          }
        }
      }
    }

    // ── 2. Tournaments 'in_progress' — stale matches & round advancement ──
    const activeTournaments = db.prepare(
      `SELECT * FROM tournaments WHERE status = 'in_progress'`
    ).all() as TournamentRow[];
    scannedTournaments.active = activeTournaments.length;

    for (const t of activeTournaments) {
      const deadlineHrs = t.result_deadline_hours || cfg.resultDeadlineHours;

      // Stale pending matches
      const staleMatches = db.prepare(
        `SELECT m.* FROM matches m
         WHERE m.tournament_id = ?
           AND m.status IN ('pending', 'scheduled')
           AND (m.scheduled_time IS NULL OR m.scheduled_time < ?)`
      ).all(t.id, new Date(now.getTime() - deadlineHrs * 60 * 60 * 1000).toISOString()) as MatchRow[];

      for (const m of staleMatches) {
        // If very stale (beyond walkover threshold), recommend walkover
        const walkoverThreshold = deadlineHrs * 2; // 2x result deadline
        const isVeryStale =
          m.scheduled_time &&
          now.getTime() - new Date(m.scheduled_time).getTime() > walkoverThreshold * 60 * 60 * 1000;

        if (isVeryStale) {
          const key = `${m.id}:recommend_walkover`;
          if (markProposed(key)) {
            actions.push({
              id: actionId(MODULE_ID, 'recommend_walkover', m.id),
              agentId: MODULE_ID,
              type: 'recommend_walkover',
              params: {
                matchId: m.id,
                tournamentId: t.id,
                tournamentName: t.name,
                player1Id: m.player1_id,
                player2Id: m.player2_id,
              },
              priority: 'normal',
              description: `Match #${m.id} in "${t.name}" is past walkover threshold — recommend awarding walkover`,
              requiresConfirmation: true, // walkovers need human approval
            });
          }
        } else {
          // Send reminder to players about pending match
          const key = `${m.id}:send_reminder`;
          if (markProposed(key)) {
            actions.push({
              id: actionId(MODULE_ID, 'send_reminder', m.id),
              agentId: MODULE_ID,
              type: 'send_reminder',
              params: {
                matchId: m.id,
                tournamentId: t.id,
                tournamentName: t.name,
                player1Id: m.player1_id,
                player2Id: m.player2_id,
              },
              priority: 'normal',
              description: `Match #${m.id} in "${t.name}" is overdue — sending reminder to players`,
              requiresConfirmation: false,
            });
          }
        }
      }

      // Check for completed rounds (knockout format) that need advancement
      if (t.format === 'knockout' || t.format === 'multi_bracket') {
        const totalRnds = totalRounds(t.max_players);
        const highestRnd = highestCompletedRound(db, t.id);

        // If all matches in the current highest round are completed, advance
        if (highestRnd > 0 && highestRnd < totalRnds) {
          const matchesCurrentRnd = matchesInRound(db, t.id, highestRnd);
          const allCompleted = matchesCurrentRnd.length > 0 &&
            matchesCurrentRnd.every(m => m.status === 'completed');

          if (allCompleted) {
            const key = `${t.id}:advance_round_${highestRnd}`;
            if (markProposed(key)) {
              actions.push({
                id: actionId(MODULE_ID, 'advance_tournament', t.id, highestRnd),
                agentId: MODULE_ID,
                type: 'advance_tournament',
                params: {
                  tournamentId: t.id,
                  tournamentName: t.name,
                  completedRound: highestRnd,
                  nextRound: highestRnd + 1,
                },
                priority: 'high',
                description: `Round ${highestRnd} complete in "${t.name}" — advancing to round ${highestRnd + 1}`,
                requiresConfirmation: false,
              });
            }
          }
        }

        // Check if tournament is complete (all rounds finished)
        if (highestRnd >= totalRnds && totalRnds > 0) {
          const winnerMatch = db.prepare(
            `SELECT winner_id FROM matches
             WHERE tournament_id = ? AND round = ? AND status = 'completed' AND winner_id IS NOT NULL
             LIMIT 1`
          ).get(t.id, totalRnds) as { winner_id: number } | undefined;

          if (winnerMatch) {
            const key = `${t.id}:close_tournament`;
            if (markProposed(key)) {
              actions.push({
                id: actionId(MODULE_ID, 'close_tournament', t.id),
                agentId: MODULE_ID,
                type: 'close_tournament',
                params: {
                  tournamentId: t.id,
                  tournamentName: t.name,
                  winnerId: winnerMatch.winner_id,
                },
                priority: 'high',
                description: `All rounds complete in "${t.name}" — closing tournament and awarding winner`,
                requiresConfirmation: false,
              });
            }
          }
        }
      }
    }

    // ── 3. League-format tournaments possibly complete ────────────
    //     Heuristic: if a league has been 'in_progress' for > 7 days
    //     and all matches are completed, close it.
    const oldActiveTours = db.prepare(
      `SELECT * FROM tournaments
       WHERE status = 'in_progress'
         AND format = 'league'
         AND datetime(created_at, '+7 days') < datetime('now')`
    ).all() as TournamentRow[];
    scannedTournaments.oldLeagues = oldActiveTours.length;

    for (const t of oldActiveTours) {
      const total = totalMatchCount(db, t.id);
      const completed = completedMatchCount(db, t.id);

      if (total > 0 && completed >= total) {
        const standings = db.prepare(
          `SELECT
             p.user_id,
             u.username,
             COUNT(CASE WHEN m.winner_id = p.user_id THEN 1 END) as wins,
             COUNT(CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != p.user_id THEN 1 END) as losses,
             COUNT(CASE WHEN m.winner_id IS NULL AND m.status = 'completed' THEN 1 END) as draws
           FROM participants p
           JOIN users u ON p.user_id = u.id
           LEFT JOIN matches m ON m.tournament_id = p.tournament_id
             AND (m.player1_id = p.user_id OR m.player2_id = p.user_id)
             AND m.status = 'completed'
           WHERE p.tournament_id = ? AND p.status = 'registered'
           GROUP BY p.user_id
           ORDER BY wins DESC, draws DESC
           LIMIT 1`
        ).get(t.id) as { user_id: number; username: string } | undefined;

        if (standings) {
          const key = `${t.id}:close_league`;
          if (markProposed(key)) {
            actions.push({
              id: actionId(MODULE_ID, 'close_tournament', t.id),
              agentId: MODULE_ID,
              type: 'close_tournament',
              params: {
                tournamentId: t.id,
                tournamentName: t.name,
                winnerId: standings.user_id,
                winnerName: standings.username,
              },
              priority: 'high',
              description: `League "${t.name}" (${t.id}) — all matches completed, awarding winner ${standings.username}`,
              requiresConfirmation: false,
            });
          }
        }
      }
    }

    // ── 4. Tournaments stuck in 'check_in' for too long ──────────
    const stuckCheckin = db.prepare(
      `SELECT * FROM tournaments
       WHERE status = 'check_in'
         AND datetime(created_at, '+3 hours') < datetime('now')`
    ).all() as TournamentRow[];
    scannedTournaments.stuckCheckin = stuckCheckin.length;

    for (const t of stuckCheckin) {
      const pCount = participantCount(db, t.id);
      if (pCount >= cfg.minPlayersToAutoStart) {
        const key = `${t.id}:create_fixtures_checkin`;
        if (markProposed(key)) {
          actions.push({
            id: actionId(MODULE_ID, 'create_fixtures', t.id),
            agentId: MODULE_ID,
            type: 'create_fixtures',
            params: { tournamentId: t.id, tournamentName: t.name },
            priority: 'normal',
            description: `Check-in expired for "${t.name}" (${t.id}) — generating fixtures with ${pCount} players`,
            requiresConfirmation: false,
          });
        }
      } else {
        // Not enough players after check-in — recommend cancellation
        const key = `${t.id}:close_cancelled`;
        if (markProposed(key)) {
          actions.push({
            id: actionId(MODULE_ID, 'close_tournament', t.id),
            agentId: MODULE_ID,
            type: 'close_tournament',
            params: {
              tournamentId: t.id,
              tournamentName: t.name,
              reason: 'insufficient_players',
            },
            priority: 'normal',
            description: `Not enough players checked in for "${t.name}" (${t.id}) — recommending cancellation`,
            requiresConfirmation: true,
          });
        }
      }
    }

    lastTick = now.toISOString();
  } catch (err: any) {
    lastError = err.message || String(err);
  }

  return {
    actions,
    metrics: {
      proposedActions: actions.length,
      ...scannedTournaments,
      pendingMatchReminders: actions.filter(a => a.type === 'send_reminder').length,
      pendingWalkovers: actions.filter(a => a.type === 'recommend_walkover').length,
    },
  };
}

// ─── Execute: perform an action via the API ───────────────────────

async function execute(action: AgentAction): Promise<{ ok: boolean; error?: string }> {
  // The context token is injected by the Automation Engine when calling execute.
  // We receive it via a closure or pass it through — for now we use a module-level
  // token that the engine sets before calling execute.
  // (In production, the engine should store the admin token and make it available.)
  const token = (globalThis as any).__AGENT_TOKEN__ || '';
  const api = agentApi(token);

  try {
    switch (action.type) {
      case 'advance_tournament': {
        const { tournamentId } = action.params;
        await api.advanceTournament(tournamentId);
        tasksCompleted++;
        return { ok: true };
      }

      case 'close_tournament': {
        const { tournamentId } = action.params;
        await api.closeTournament(tournamentId);
        // Emit completion event so other agents can react
        emitEvent('tournament_completed', {
          tournamentId,
          tournamentName: action.params.tournamentName,
          winnerId: action.params.winnerId,
        });
        tasksCompleted++;
        return { ok: true };
      }

      case 'create_fixtures': {
        const { tournamentId } = action.params;
        await api.createFixtures(tournamentId);
        // After fixtures are created, also generate bracket
        try {
          await api.generateBracket(tournamentId);
        } catch {
          // bracket generation is optional (may fail for non-knockout formats)
        }
        emitEvent('tournament_status_changed', {
          tournamentId,
          newStatus: 'in_progress',
        });
        tasksCompleted++;
        return { ok: true };
      }

      case 'send_reminder': {
        const { matchId } = action.params;
        await api.sendReminder(matchId);
        tasksCompleted++;
        return { ok: true };
      }

      case 'recommend_walkover': {
        // Walkover needs a winner specified — we flag it for human review
        // This action type isn't directly in agentApi; we use publishStatus
        // to notify admins, and escalate for manual processing.
        const { matchId, tournamentName, player1Id, player2Id } = action.params;
        await api.publishStatus({
          text: `⚠️ Walkover needed: Match #${matchId} in "${tournamentName}" ` +
            `(Player ${player1Id} vs Player ${player2Id}) is past deadline. ` +
            `Admin intervention required to assign walkover.`,
        });
        tasksCompleted++;
        return { ok: true };
      }

      default:
        tasksFailed++;
        return { ok: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err: any) {
    tasksFailed++;
    lastError = err.message || String(err);
    emitEvent('agent_error', {
      agentId: MODULE_ID,
      actionType: action.type,
      error: lastError,
    });
    return { ok: false, error: lastError ?? undefined };
  }
}

// ─── Health: report agent status ──────────────────────────────────

function health(): AgentHealth {
  return {
    agentId: MODULE_ID,
    status: lastError && tasksFailed > 3 ? 'error' : 'online',
    lastTick,
    lastError,
    tasksCompleted,
    tasksFailed,
    queueLength: 0, // maintained by the engine
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    version: VERSION,
  };
}

// ─── Module export — conforms to AgentModule interface ────────────

const tournamentOpsAgent: AgentModule = {
  id: MODULE_ID,
  version: VERSION,
  evaluate,
  execute,
  health,
};

export default tournamentOpsAgent;
