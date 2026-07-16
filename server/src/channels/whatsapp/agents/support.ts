/**
 * Support Agent — handles FAQ, rules, registration help, payment guidance.
 *
 * Provides automated responses to common player queries. Deterministic
 * keyword-based routing for v1, with escalation path to LLM for
 * complex questions.
 */
import { AgentAction, AgentHealth } from './agentTypes.js';
import { actionId } from './agentApi.js';
import db from '../../../db.js';

const VERSION = '1.0.0';
const AGENT_ID = 'support';

export class SupportAgent {
  id = AGENT_ID;
  version = VERSION;
  private token: string;
  private startTime = Date.now();
  private health_: AgentHealth = {
    agentId: AGENT_ID, status: 'online', lastTick: null,
    lastError: null, tasksCompleted: 0, tasksFailed: 0,
    queueLength: 0, uptimeSeconds: 0, version: VERSION,
  };

  constructor(config: { token: string }) {
    this.token = config.token;
  }

  async evaluate(ctx: { now: Date; db: any; events: any[] }) {
    const actions: AgentAction[] = [];
    this.health_.lastTick = ctx.now.toISOString();

    try {
      // Check for unlinked WhatsApp users needing help
      const unlinkedUsers = ctx.db.prepare(
        `SELECT u.id, u.username, u.phone, u.created_at
         FROM users u
         WHERE u.phone IS NOT NULL
         AND u.created_at >= datetime('now', '-24 hours')
         AND NOT EXISTS (
           SELECT 1 FROM admin_logs WHERE admin_id = 'agent:support'
           AND details LIKE '%welcomed%' || u.id || '%'
         )
         LIMIT 5`
      ).all() as any[];

      for (const user of unlinkedUsers) {
        actions.push({
          id: actionId('support', 'welcome', user.id),
          agentId: AGENT_ID,
          type: 'send_message',
          params: {
            userId: user.id,
            rawJid: `${user.phone}@s.whatsapp.net`,
            text: `👋 Welcome to TOSS, *${user.username || 'Player'}*!\n\n` +
              `Here's how to get started:\n` +
              `• Type *register* to join a tournament\n` +
              `• Type *link <token>* to link your account\n` +
              `• Type *help* to see all commands\n\n` +
              `Need help? Just ask!`,
          },
          priority: 'low',
          description: `Welcome new user ${user.id} (${user.username})`,
          requiresConfirmation: false,
        });
      }

      // Check for pending payment queries (payments > 1 hour old, still pending)
      const pendingPayments = ctx.db.prepare(
        `SELECT tp.id, tp.user_id, tp.amount, tp.created_at, u.username, u.phone
         FROM tournament_payments tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.status = 'pending'
         AND tp.created_at <= datetime('now', '-1 hour')
         AND tp.created_at >= datetime('now', '-24 hours')
         LIMIT 5`
      ).all() as any[];

      for (const payment of pendingPayments) {
        const existingHelp = ctx.db.prepare(
          `SELECT id FROM admin_logs
           WHERE admin_id = 'agent:support'
           AND details LIKE '%payment_help%' || ? || '%'`
        ).get(payment.id) as any;

        if (!existingHelp) {
          const phone = payment.phone?.replace(/[^0-9]/g, '');
          if (phone) {
            actions.push({
              id: actionId('support', 'payment_help', payment.id),
              agentId: AGENT_ID,
              type: 'send_message',
              params: {
                rawJid: `${phone}@s.whatsapp.net`,
                text: `⏳ *Payment Pending*\n\nYour payment of KES ${payment.amount} is still being processed.\n\n` +
                  `Make sure you sent the M-Pesa payment to the correct till number and forwarded the confirmation SMS.\n\n` +
                  `If you already did, please wait — verification can take a few minutes.`,
              },
              priority: 'low',
              description: `Payment help for user ${payment.user_id} (KES ${payment.amount})`,
              requiresConfirmation: false,
            });
            this.health_.tasksCompleted++;
          }
        }
      }

    } catch (e: any) {
      this.health_.lastError = e.message;
      this.health_.tasksFailed++;
    }

    return { actions, metrics: { unlinkedUsersCount: 0 } };
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
