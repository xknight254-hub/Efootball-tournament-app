/**
 * Shared types for all AI agents.
 *
 * Every agent follows the same interface:
 *   1. evaluate(context) — check conditions, return actions to take
 *   2. execute(action) — perform the action via backend API
 *   3. report() — return health/status for the admin dashboard
 */

// ─── Agent identity ─────────────────────────────────────────────
export type AgentId =
  | 'tournament_ops'
  | 'conversation'
  | 'support'
  | 'finance'
  | 'moderator'
  | 'notification'
  | 'marketing'
  | 'analytics'
  | 'coach';

// ─── Agent health status ────────────────────────────────────────
export interface AgentHealth {
  agentId: AgentId;
  status: 'online' | 'offline' | 'error';
  lastTick: string | null;        // ISO timestamp
  lastError: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  queueLength: number;
  uptimeSeconds: number;
  version: string;
}

// ─── Action an agent wants to take ──────────────────────────────
export interface AgentAction {
  id: string;                      // idempotency key
  agentId: AgentId;
  type: ActionType;
  params: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  description: string;
  requiresConfirmation: boolean;    // true = needs human approval
}

export type ActionType =
  | 'advance_tournament'
  | 'close_tournament'
  | 'create_fixtures'
  | 'send_reminder'
  | 'send_broadcast'
  | 'warn_player'
  | 'mute_player'
  | 'ban_player'
  | 'verify_payment'
  | 'flag_payment'
  | 'approve_result'
  | 'reject_result'
  | 'escalate_result'
  | 'send_message'
  | 'publish_status'
  | 'generate_report'
  | 'update_settings'
  | 'reschedule_match'
  | 'recommend_walkover'
  | 'award_winner'
  | 'other';

// ─── Evaluation context passed to agents ─────────────────────────
export interface AgentContext {
  now: Date;
  pendingEvents: import('./eventBus.js').AgentEvent[];
  db: any; // BetterDatabase instance (read-only queries)
  apiBaseUrl: string;
  adminToken: string;
  config: Record<string, any>;
}

// ─── Agent module interface ─────────────────────────────────────
export interface AgentModule {
  id: AgentId;
  version: string;
  /** Called every tick. Returns actions the agent recommends. */
  evaluate(ctx: AgentContext): Promise<{ actions: AgentAction[]; metrics?: Record<string, any> }>;
  /** Called to execute an action this agent proposed. */
  execute(action: AgentAction): Promise<{ ok: boolean; error?: string }>;
  /** Return current health. */
  health(): AgentHealth;
}
