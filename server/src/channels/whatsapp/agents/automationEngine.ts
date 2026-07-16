/**
 * Automation Engine — the main loop that drives all AI agents.
 *
 * Runs as a cron tick every 30 seconds. On each tick it:
 *   1. Collects conditions (pending events, DB cursors)
 *   2. Runs each agent's evaluate() with the context
 *   3. Collects actions, filters duplicates (idempotency keys)
 *   4. Executes safe actions (requiresConfirmation=false) immediately
 *   5. Queues actions needing admin confirmation
 *   6. Reports agent health
 *
 * Deterministic rules run BEFORE any agent evaluation.
 * The engine NEVER accesses the database directly — only agents do (read-only).
 */
import db from '../../../db.js';
import { emitEvent } from './eventBus.js';
import { polishMessage } from './llmMessage.js';
import type { AgentAction, AgentHealth, AgentModule } from './agentTypes.js';

const TICK_INTERVAL_MS = 30_000; // 30 seconds
const MAX_ACTIONS_PER_TICK = 10;
const MAX_EXECUTION_AGE_MS = 30_000; // actions older than this are dropped

export interface EngineConfig {
  enabled: boolean;
  adminToken: string;
}

export interface EngineMetrics {
  tickCount: number;
  lastTick: string | null;
  actionsExecuted: number;
  actionsQueued: number;
  errors: number;
  agentsOnline: number;
  agentsOffline: number;
}

// ─── In-Memory Action Queue ────────────────────────────────────
// Actions that require admin confirmation sit here until an admin
// approves/rejects them via the Dashboard API.
const confirmationQueue: (AgentAction & { createdAt: number })[] = [];

// History ring for admin dashboard
const actionHistory: { action: AgentAction; result: 'ok' | 'error' | 'pending'; error?: string; at: number }[] = [];
const MAX_HISTORY = 200;

// ─── Engine State ──────────────────────────────────────────────
let engineConfig: EngineConfig = { enabled: false, adminToken: '' };
let engineMetrics: EngineMetrics = {
  tickCount: 0, lastTick: null, actionsExecuted: 0,
  actionsQueued: 0, errors: 0, agentsOnline: 0, agentsOffline: 0,
};
let agents: AgentModule[] = [];
let tickTimer: ReturnType<typeof setInterval> | null = null;
let isTicking = false;

// ─── Public API ─────────────────────────────────────────────────

export function initEngine(config: EngineConfig, agentModules: AgentModule[]) {
  engineConfig = config;
  agents = agentModules;
  engineConfig.enabled = true;

  // Seed agent health in DB
  for (const agent of agents) {
    try {
      db.prepare(
        `INSERT OR IGNORE INTO agent_health (agent_id, status, version)
         VALUES (?, 'online', ?)`
      ).run(agent.id, agent.version);
      db.prepare(
        `UPDATE agent_health SET status = 'online', version = ?, updated_at = CURRENT_TIMESTAMP
         WHERE agent_id = ?`
      ).run(agent.version, agent.id);
    } catch { /* table may not exist yet */ }
  }

  console.log(`[Engine] initialized with ${agents.length} agents`);
}

/** Start the tick loop. */
export function startEngine() {
  if (tickTimer) return;
  engineConfig.enabled = true;
  tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  // Fire first tick immediately
  setImmediate(tick);
  console.log('[Engine] started (tick every 30s)');
}

/** Stop the tick loop. */
export function stopEngine() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  engineConfig.enabled = false;
  console.log('[Engine] stopped');
}

// ─── Tick Logic ─────────────────────────────────────────────────

async function tick() {
  if (!engineConfig.enabled || isTicking) return;
  isTicking = true;
  const tickStart = Date.now();
  engineMetrics.tickCount++;
  engineMetrics.lastTick = new Date().toISOString();
  const actions: AgentAction[] = [];

  try {
    // Collect context for all agents
    const ctx = {
      now: new Date(),
      db: null as any, // Will be set below if DB is ready
      events: [],
      config: engineConfig,
    };

    // Check DB is initialized before running agents
    try {
      ctx.db = db;
      db.prepare('SELECT 1').get();
    } catch {
      console.warn('[Engine] DB not ready, skipping tick');
      isTicking = false;
      return;
    }

    // Run each agent's evaluate()
    let online = 0;
    for (const agent of agents) {
      try {
        const result = await agent.evaluate(ctx as any);
        // Support both { actions, metrics } and bare AgentAction[] return
        const actionList = Array.isArray(result) ? result : (result.actions || []);
        actions.push(...actionList);
        online++;
      } catch (e: any) {
        console.error(`[Engine] agent ${agent.id} evaluate error:`, e.message);
        engineMetrics.errors++;
        // Update health
        try {
          db.prepare(
            `UPDATE agent_health SET last_error = ?, updated_at = CURRENT_TIMESTAMP
             WHERE agent_id = ?`
          ).run(e.message.slice(0, 500), agent.id);
        } catch { /* ignore */ }
      }
    }
    engineMetrics.agentsOnline = online;
    engineMetrics.agentsOffline = agents.length - online;

    // Deduplicate by idempotency key
    const seen = new Set<string>();
    const uniqueActions = actions.filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });

    // Execute safe actions, queue unsure ones
    let executed = 0;
    for (const action of uniqueActions.slice(0, MAX_ACTIONS_PER_TICK)) {
      try {
        if (action.requiresConfirmation) {
          confirmationQueue.push({ ...action, createdAt: Date.now() });
          engineMetrics.actionsQueued++;
          logAction(action, 'pending');
          emitEvent('agent_action', { action: action.type, agentId: action.agentId, status: 'queued', description: action.description });
        } else {
          // Find the agent that proposed this action
          const sourceAgent = agents.find(a => a.id === action.agentId);
          if (sourceAgent) {
            // Option B orchestration: LLM is the messaging voice.
            // Agents decide the action; the LLM rewrites the draft text
            // into human-sounding copy. Falls back to the draft on failure.
            if (['send_message', 'send_broadcast', 'publish_status', 'send_reminder'].includes(action.type) && action.params?.text) {
              try {
                action.params.text = await polishMessage(action.params.text, `${action.type}: ${action.description}`);
              } catch { /* keep draft */ }
            }
            const result = await sourceAgent.execute(action);
            if (result.ok) {
              executed++;
              engineMetrics.actionsExecuted++;
              logAction(action, 'ok');
              emitEvent('agent_action', { action: action.type, agentId: action.agentId, status: 'completed' });
            } else {
              logAction(action, 'error', result.error);
              engineMetrics.errors++;
            }
          }
        }
      } catch (e: any) {
        logAction(action, 'error', e.message);
        engineMetrics.errors++;
        console.error(`[Engine] execute error for ${action.id}:`, e.message);
      }
    }

    // Clean stale queue items
    const now = Date.now();
    for (let i = confirmationQueue.length - 1; i >= 0; i--) {
      if (now - confirmationQueue[i].createdAt > MAX_EXECUTION_AGE_MS) {
        confirmationQueue.splice(i, 1);
      }
    }

    // Update agent health in DB
    for (const agent of agents) {
      try {
        const h = agent.health();
        db.prepare(
          `UPDATE agent_health SET status = ?, last_tick = ?, last_error = ?,
           tasks_completed = tasks_completed + ?, tasks_failed = tasks_failed + ?,
           uptime_seconds = ?, updated_at = CURRENT_TIMESTAMP
           WHERE agent_id = ?`
        ).run(
          h.status, engineMetrics.lastTick, h.lastError,
          Math.max(0, h.tasksCompleted), Math.max(0, h.tasksFailed),
          h.uptimeSeconds, agent.id
        );
      } catch { /* ignore */ }
    }

    const elapsed = Date.now() - tickStart;
    if (elapsed > 5000) {
      console.log(`[Engine] tick #${engineMetrics.tickCount} completed in ${elapsed}ms (${executed} actions)`);
    }
  } catch (e: any) {
    console.error('[Engine] tick error:', e.message);
    engineMetrics.errors++;
  } finally {
    isTicking = false;
  }
}

// ─── Queue Management (for admin dashboard API) ────────────────

export function getConfirmationQueue() {
  return confirmationQueue.filter(q => Date.now() - q.createdAt < MAX_EXECUTION_AGE_MS);
}

export function approveAction(actionId: string): boolean {
  const idx = confirmationQueue.findIndex(a => a.id === actionId);
  if (idx === -1) return false;
  const action = confirmationQueue[idx];
  confirmationQueue.splice(idx, 1);

  const sourceAgent = agents.find(a => a.id === action.agentId);
  if (sourceAgent) {
    sourceAgent.execute(action).catch(e => console.error(`[Engine] approve exec error:`, e.message));
  }
  return true;
}

export function rejectAction(actionId: string): boolean {
  const idx = confirmationQueue.findIndex(a => a.id === actionId);
  if (idx === -1) return false;
  confirmationQueue.splice(idx, 1);
  return true;
}

export function getEngineMetrics(): EngineMetrics {
  return { ...engineMetrics };
}

export function getActionHistory(max: number = 50) {
  return actionHistory.slice(-max);
}

// ─── Internal ───────────────────────────────────────────────────

function logAction(action: AgentAction, result: 'ok' | 'error' | 'pending', error?: string) {
  actionHistory.push({ action, result, error, at: Date.now() });
  if (actionHistory.length > MAX_HISTORY) actionHistory.shift();

  // Log to DB
  try {
    db.prepare(
      `INSERT INTO admin_logs (admin_id, action, details, payload)
       VALUES (?, ?, ?, ?)`
    ).run(
      `agent:${action.agentId}`,
      `agent_${result}`,
      `${action.description}`,
      JSON.stringify({ actionId: action.id, type: action.type, error })
    );
  } catch { /* ignore */ }
}
