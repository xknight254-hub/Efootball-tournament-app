/**
 * Analytics Agent — generates reports and insights.
 *
 * Runs daily reports on revenue, player activity, tournament performance,
 * churn prediction, and growth. Creates events that the Marketing and
 * Notification agents can react to.
 */
import { AgentAction, AgentHealth } from './agentTypes.js';
import { actionId } from './agentApi.js';
import db from '../../../db.js';

export class AnalyticsAgent {
  id = 'analytics';
  version = '1.0.0';
  private token: string;
  private startTime = Date.now();
  private lastDailyReport: string | null = null;
  private health_: AgentHealth = {
    agentId: 'analytics', status: 'online', lastTick: null,
    lastError: null, tasksCompleted: 0, tasksFailed: 0,
    queueLength: 0, uptimeSeconds: 0, version: '1.0.0',
  };

  constructor(config: { token: string }) {
    this.token = config.token;
  }

  async evaluate(ctx: { now: Date; db: any; events: any[] }) {
    const actions: AgentAction[] = [];
    const metrics: Record<string, any> = {};
    const today = ctx.now.toISOString().slice(0, 10);

    this.health_.lastTick = ctx.now.toISOString();

    try {
      // ─── Daily report (once per day) ────────────────────────
      if (this.lastDailyReport !== today) {
        this.lastDailyReport = today;

        const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
        const newToday = (db.prepare(
          "SELECT COUNT(*) as c FROM users WHERE date(created_at) = ?"
        ).get(today) as any)?.c || 0;

        const activePlayers = (db.prepare(
          "SELECT COUNT(DISTINCT user_id) as c FROM matches WHERE date(created_at) = ?"
        ).get(today) as any)?.c || 0;

        const revenueToday = (db.prepare(
          "SELECT COALESCE(SUM(amount),0) as t FROM tournament_payments WHERE date(created_at) = ? AND status = 'completed'"
        ).get(today) as any)?.t || 0;

        const tournamentsRunning = (db.prepare(
          "SELECT COUNT(*) as c FROM tournaments WHERE status IN ('open','check_in','in_progress','live')"
        ).get() as any)?.c || 0;

        const tournamentsCompleted = (db.prepare(
          "SELECT COUNT(*) as c FROM tournaments WHERE status = 'completed'"
        ).get() as any)?.c || 0;

        actions.push({
          id: actionId('analytics', 'daily_report', today),
          agentId: 'analytics',
          type: 'generate_report',
          params: {
            type: 'daily',
            date: today,
            data: { totalUsers, newToday, activePlayers, revenueToday, tournamentsRunning, tournamentsCompleted },
          },
          priority: 'low',
          description: `Daily report: ${newToday} new users, KES ${revenueToday} revenue, ${tournamentsRunning} active tournaments`,
          requiresConfirmation: false,
        });

        // ─── Churn detection (players inactive >7 days) ────────
        const sevenDaysAgo = new Date(ctx.now.getTime() - 7 * 86400000).toISOString();
        const inactivePlayers = db.prepare(
          `SELECT u.id, u.username, MAX(m.created_at) as last_match
           FROM users u
           LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id)
           GROUP BY u.id
           HAVING last_match IS NULL OR last_match < ?
           ORDER BY last_match ASC LIMIT 10`
        ).all(sevenDaysAgo) as any[];

        if (inactivePlayers.length >= 5) {
          actions.push({
            id: actionId('analytics', 'churn_alert', today),
            agentId: 'analytics',
            type: 'generate_report',
            params: { type: 'churn', inactiveCount: inactivePlayers.length },
            priority: 'low',
            description: `Churn alert: ${inactivePlayers.length} players inactive >7 days`,
            requiresConfirmation: false,
          });
        }

        this.health_.tasksCompleted++;
      }

      // ─── Tournament performance (for active tournaments) ────
      const slowTournaments = db.prepare(
        `SELECT id, name, status, created_at
         FROM tournaments
         WHERE status IN ('open','check_in')
         AND julianday('now') - julianday(created_at) > 3
         ORDER BY created_at ASC LIMIT 5`
      ).all() as any[];

      if (slowTournaments.length > 0) {
        actions.push({
          id: actionId('analytics', 'stalled_tournaments', today),
          agentId: 'analytics',
          type: 'generate_report',
          params: { type: 'stalled', tournaments: slowTournaments.map((t: any) => t.id) },
          priority: 'low',
          description: `${slowTournaments.length} tournaments stalled >3 days`,
          requiresConfirmation: false,
        });
      }

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
