/**
 * Event Bus — simple typed pub/sub for agent events.
 *
 * Every important backend action emits an event. Agents subscribe
 * to event types and react when the Automation Engine ticks.
 *
 * Events are stored in memory (ring buffer, last 500) so the
 * Automation Engine can process them in order without hammering
 * the DB. Recent history is also persisted to agent_events table
 * for audit and replay.
 */
import db from '../../../db.js';

export interface AgentEvent {
  id: number;
  type: EventType;
  payload: Record<string, any>;
  timestamp: Date;
  processed: boolean;
}

export type EventType =
  | 'payment_received'
  | 'player_registered'
  | 'player_linked'
  | 'result_submitted'
  | 'result_verified'
  | 'match_started'
  | 'match_finished'
  | 'tournament_created'
  | 'tournament_completed'
  | 'tournament_status_changed'
  | 'player_inactive'
  | 'player_joined_group'
  | 'player_left_group'
  | 'group_message_received'
  | 'low_confidence_message'
  | 'fraud_alert'
  | 'reminder_sent'
  | 'agent_action'
  | 'agent_error'
  | 'system_tick';

const MAX_MEMORY_EVENTS = 500;

// ─── In-memory ring buffer ──────────────────────────────────────
let eventCounter = 0;
const events: AgentEvent[] = [];
const listeners = new Map<EventType, Set<(e: AgentEvent) => void>>();
const allListeners = new Set<(e: AgentEvent) => void>();

// ─── Public API ─────────────────────────────────────────────────

/** Emit an event. Returns the event id for tracking. */
export function emitEvent(type: EventType, payload: Record<string, any> = {}): number {
  eventCounter++;
  const event: AgentEvent = {
    id: eventCounter,
    type,
    payload,
    timestamp: new Date(),
    processed: false,
  };

  // Memory ring
  events.push(event);
  if (events.length > MAX_MEMORY_EVENTS) events.shift();

  // Persist to DB (fire-and-forget)
  try {
    db.prepare(
      `INSERT INTO agent_events (event_type, payload, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`
    ).run(type, JSON.stringify(payload));
  } catch (e) {
    // Table might not exist yet — ignore
  }

  // Notify listeners
  const specific = listeners.get(type);
  if (specific) specific.forEach(fn => setImmediate(() => fn(event)));
  allListeners.forEach(fn => setImmediate(() => fn(event)));

  return event.id;
}

/** Subscribe to a specific event type. */
export function onEvent(type: EventType, fn: (e: AgentEvent) => void): () => void {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(fn);
  return () => { listeners.get(type)?.delete(fn); };
}

/** Subscribe to ALL events. */
export function onAnyEvent(fn: (e: AgentEvent) => void): () => void {
  allListeners.add(fn);
  return () => { allListeners.delete(fn); };
}

/** Get recent events from memory (for the Automation Engine). */
export function getRecentEvents(sinceId: number = 0, limit: number = 50): AgentEvent[] {
  return events.filter(e => e.id > sinceId).slice(-limit);
}

/** Get all unprocessed events (processed=false in memory). */
export function getUnprocessedEvents(): AgentEvent[] {
  return events.filter(e => !e.processed);
}

/** Mark an event as processed. */
export function markProcessed(eventId: number): void {
  const e = events.find(e => e.id === eventId);
  if (e) e.processed = true;
}

/** Get pending events from the DB (for replay after restart). */
export function getPendingDbEvents(limit: number = 100): any[] {
  try {
    return db.prepare(
      `SELECT id, event_type, payload, created_at, processed
       FROM agent_events
       WHERE processed = 0
       ORDER BY id ASC LIMIT ?`
    ).all(limit) as any[];
  } catch {
    return [];
  }
}

/** Mark an event as processed in the DB. */
export function markDbEventProcessed(eventId: number): void {
  try {
    db.prepare('UPDATE agent_events SET processed = 1 WHERE id = ?').run(eventId);
  } catch {
    // ignore
  }
}

/** Get event statistics (for analytics agent / admin dashboard). */
export function getEventStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const e of events) {
    stats[e.type] = (stats[e.type] || 0) + 1;
  }
  return stats;
}
