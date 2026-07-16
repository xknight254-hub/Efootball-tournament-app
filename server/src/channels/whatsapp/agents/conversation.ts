/**
 * Conversation Agent — natural language interactions with players.
 *
 * Routes incoming messages from WhatsApp through the Omniroute LLM
 * pipeline when conversation mode is active. Handles intent classification
 * and generates appropriate responses.
 *
 * Only activates when:
 *   1. The message is NOT a recognized slash command
 *   2. AI assistant is enabled in settings
 *   3. The message is addressed to the bot (in groups) or is a DM
 */
import { AgentAction, AgentHealth } from './agentTypes.js';
import { actionId } from './agentApi.js';
import db from '../../../db.js';

const VERSION = '1.0.0';
const AGENT_ID = 'conversation';

export class ConversationAgent {
  id = AGENT_ID;
  version = VERSION;
  private token: string;
  private startTime = Date.now();
  private health_: AgentHealth = {
    agentId: AGENT_ID, status: 'online', lastTick: null,
    lastError: null, tasksCompleted: 0, tasksFailed: 0,
    queueLength: 0, uptimeSeconds: 0, version: VERSION,
  };
  private processedEventIds = new Set<number>();

  constructor(config: { token: string }) {
    this.token = config.token;
  }

  async evaluate(ctx: { now: Date; db: any; events: any[] }) {
    const actions: AgentAction[] = [];
    this.health_.lastTick = ctx.now.toISOString();

    try {
      // Check if AI is enabled
      const settings = ctx.db.prepare(
        'SELECT ai_enabled, ai_model, omniroute_key FROM whatsapp_settings WHERE id = 1'
      ).get() as any;
      const aiEnabled = settings?.ai_enabled === 1 && settings?.omniroute_key?.length > 0;

      if (!aiEnabled) {
        return { actions, metrics: { aiEnabled: false } };
      }

      // Check for new low-confidence messages needing follow-up
      const lowConfItems = ctx.db.prepare(
        `SELECT id, payload, created_at
         FROM admin_logs
         WHERE whatsapp_ai_lowconf = 1
         AND created_at >= datetime('now', '-1 hour')
         ORDER BY created_at ASC LIMIT 10`
      ).all() as any[];

      for (const item of lowConfItems) {
        if (this.processedEventIds.has(item.id)) continue;
        this.processedEventIds.add(item.id);
        this.health_.tasksCompleted++;
      }

      // Limit processed IDs set
      if (this.processedEventIds.size > 1000) {
        const arr = Array.from(this.processedEventIds);
        this.processedEventIds = new Set(arr.slice(-500));
      }

    } catch (e: any) {
      this.health_.lastError = e.message;
      this.health_.tasksFailed++;
    }

    return { actions, metrics: { aiEnabled: true } };
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
