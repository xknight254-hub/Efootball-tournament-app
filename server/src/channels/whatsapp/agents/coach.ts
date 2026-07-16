/**
 * Coach Agent — player performance analysis and improvement tips.
 *
 * Tracks win/loss ratios, analyzes performance by format, and
 * generates encouragement messages. Uses deterministic calculations
 * on existing match data — no LLM calls.
 */
import { AgentAction, AgentHealth } from './agentTypes.js';
import { actionId } from './agentApi.js';
import db from '../../../db.js';

export class CoachAgent {
  id = 'coach';
  version = '1.0.0';
  private token: string;
  private startTime = Date.now();
  private lastPlayerCheck: string | null = null;
  private health_: AgentHealth = {
    agentId: 'coach', status: 'online', lastTick: null,
    lastError: null, tasksCompleted: 0, tasksFailed: 0,
    queueLength: 0, uptimeSeconds: 0, version: '1.0.0',
  };

  constructor(config: { token: string }) {
    this.token = config.token;
  }

  async evaluate(ctx: { now: Date; db: any; events: any[] }) {
    const actions: AgentAction[] = [];
    const metrics: Record<string, any> = {};
    this.health_.lastTick = ctx.now.toISOString();

    try {
      // ─── Find players with completed matches for analysis ──
      const players = db.prepare(`
        SELECT u.id, u.username,
          COUNT(CASE WHEN m.winner_id = u.id THEN 1 END) as wins,
          COUNT(CASE WHEN m.status = 'completed' AND m.winner_id IS NOT NULL AND m.winner_id != u.id THEN 1 END) as losses,
          COUNT(CASE WHEN m.status = 'completed' AND m.winner_id IS NOT NULL THEN 1 END) as total
        FROM users u
        JOIN participants p ON p.user_id = u.id
        JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id)
        WHERE m.status = 'completed'
        GROUP BY u.id
        HAVING total >= 3
        ORDER BY total DESC
        LIMIT 10
      `).all() as any[];

      for (const player of players) {
        const winRate = player.total > 0 ? Math.round((player.wins / player.total) * 100) : 0;
        const total = player.total;

        // Encourage players on winning streaks
        if (winRate >= 70 && total >= 5) {
          actions.push({
            id: actionId('coach', 'encourage', player.id),
            agentId: 'coach',
            type: 'send_message',
            params: {
              userId: player.id,
              text: `🏆 *Great form, ${player.username}!* You've won ${player.wins}/${total} matches (${winRate}% win rate). Keep it up for the next tournament!`,
            },
            priority: 'low',
            description: `Encourage ${player.username}: ${winRate}% win rate over ${total} matches`,
            requiresConfirmation: false,
          });
        }

        // Analyze losses
        if (total >= 10 && winRate < 40) {
          actions.push({
            id: actionId('coach', 'improvement_tip', player.id),
            agentId: 'coach',
            type: 'send_message',
            params: {
              userId: player.id,
              text: `💪 *Keep pushing, ${player.username}!* You've played ${total} matches. Want to improve? Try practicing in friendly matches before the next tournament.`,
            },
            priority: 'low',
            description: `Improvement tip for ${player.username}: ${winRate}% win rate`,
            requiresConfirmation: false,
          });
        }
      }

      // ─── Tournament format performance ─────────────────────
      if (players.length > 0) {
        const formatStats = db.prepare(`
          SELECT t.format, COUNT(*) as count
          FROM matches m
          JOIN tournaments t ON t.id = m.tournament_id
          WHERE m.status = 'completed'
          GROUP BY t.format
          ORDER BY count DESC
        `).all() as any[];

        if (formatStats.length > 0) {
          metrics.mostPlayedFormat = formatStats[0].format;
          metrics.totalFormats = formatStats.length;
        }
      }

      this.health_.tasksCompleted++;

    } catch (e: any) {
      this.health_.lastError = e.message;
      this.health_.tasksFailed++;
    }

    return { actions, metrics };
  }

  async execute(action: AgentAction) {
    this.health_.tasksCompleted++;
    return { ok: true };
  }

  health() {
    this.health_.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    return this.health_;
  }
}
