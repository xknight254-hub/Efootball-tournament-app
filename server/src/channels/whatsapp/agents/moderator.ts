/**
 * Moderator Agent — spam detection & player moderation.
 *
 * Monitors group messages, join events, and fraud alerts for abusive,
 * spammy, or suspicious behaviour. Applies progressive moderation:
 * warn → mute → ban.
 *
 * Detection strategies:
 *   • Rate limiting        — messages / sliding window per user
 *   • Duplicate flood      — same text repeated N times in a window
 *   • Suspicious links     — known spam domains / shorteners
 *   • Scam / fraud phrases — keyword heuristics
 *   • Join surge           — mass account creation / group join
 *   • Phone number scraping — patterns matching phone-harvesting
 */

import type { AgentModule, AgentAction, AgentContext, AgentHealth, ActionType } from './agentTypes.js';
import { agentApi, actionId } from './agentApi.js';
import { emitEvent } from './eventBus.js';
import { whatsappConfig } from '../config.js';

// ─── Module identity ─────────────────────────────────────────────

const MODULE_ID = 'moderator' as const;
const VERSION = '1.0.0';

// ─── Health tracker ──────────────────────────────────────────────

let startedAt = Date.now();
let tickCount = 0;
let tasksCompleted = 0;
let tasksFailed = 0;
let lastTick: string | null = null;
let lastError: string | null = null;

function resetHealth(): void {
  startedAt = Date.now();
  tickCount = 0;
  tasksCompleted = 0;
  tasksFailed = 0;
  lastTick = null;
  lastError = null;
}

// ─── Configuration (tunable via ctx.config) ──────────────────────

interface ModeratorConfig {
  /** Max messages per user within the rate window before action. */
  rateLimitPerWindow: number;
  /** Sliding window for rate tracking (ms). */
  rateWindowMs: number;
  /** Duplicate flood: max times same text allowed in window. */
  maxDuplicateText: number;
  /** Duplicate flood window (ms). */
  duplicateWindowMs: number;
  /** Spam link detection on/off. */
  checkSuspiciousLinks: boolean;
  /** Scam phrase detection on/off. */
  checkScamPhrases: boolean;
  /** Max new players joining in the window before a broadcast alert. */
  joinSurgeThreshold: number;
  /** Join surge window (ms). */
  joinSurgeWindowMs: number;
  /** Mute duration in hours for spam offences. */
  muteHours: number;
  /** After this many warnings, escalate to mute. */
  warnLimit: number;
  /** After this many mutes, escalate to ban. */
  muteLimit: number;
}

const DEFAULTS: ModeratorConfig = {
  rateLimitPerWindow: 5,
  rateWindowMs: 10_000,
  maxDuplicateText: 3,
  duplicateWindowMs: 30_000,
  checkSuspiciousLinks: true,
  checkScamPhrases: true,
  joinSurgeThreshold: 5,
  joinSurgeWindowMs: 60_000,
  muteHours: 6,
  warnLimit: 2,
  muteLimit: 3,
};

function resolveConfig(cfg: Record<string, any> | undefined): ModeratorConfig {
  if (!cfg || !cfg.moderator) return DEFAULTS;
  return { ...DEFAULTS, ...cfg.moderator };
}

// ─── In-memory state ─────────────────────────────────────────────

interface MessageRecord {
  phone: string;
  text: string;
  jid: string;
  timestamp: number;
}

interface UserRecord {
  phone: string;
  jid: string;
  timestamps: number[];            // message timestamps
  texts: { text: string; ts: number }[];
  warnings: number;                // total warns issued
  mutes: number;                   // total mutes issued
  flagged: boolean;
}

const userMap = new Map<string, UserRecord>();
const joinTimestamps: number[] = [];

// Suspicious link domains (shorteners + known spam)
const SUSPICIOUS_DOMAINS = [
  'bit.ly', 'tinyurl.com', 'shorturl.at', 't.co', 'ow.ly',
  'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorte.st',
  'adf.ly', 'bc.vc', 'linktr.ee',
  // Known scam/spam
  'free-efootball', 'efootball-free', 'hack-efootball',
  'coins-generator', 'diamond-generator',
];

// Scam / fraud trigger phrases (case-insensitive check)
const SCAM_PHRASES = [
  'free coins', 'free diamonds', 'free account',
  'hack link', 'generator', 'free money',
  'click here to win', 'you have won', 'congratulations you won',
  'send money', 'send mpesa', 'send airtime',
  'admin please', 'admin add me', 'group admin',
  'earn money', 'make money fast', 'get rich',
  'verify now', 'account suspended', 'urgent action',
];

// Phone-number-like patterns (scraping attempts)
const PHONE_PATTERN = /\b0[17]\d{8}\b/g;

// ─── Helper: get or create user record ──────────────────────────

function getUser(phone: string, jid: string): UserRecord {
  let u = userMap.get(phone);
  if (!u) {
    u = { phone, jid, timestamps: [], texts: [], warnings: 0, mutes: 0, flagged: false };
    userMap.set(phone, u);
  }
  // Update JID if it changed
  if (jid && u.jid !== jid) u.jid = jid;
  return u;
}

// ─── Helper: prune stale state ───────────────────────────────────

const PRUNE_INTERVAL_MS = 5 * 60_000; // every 5 minutes
let lastPrune = Date.now();

function pruneStaleState(now: number): void {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;

  const cutoff = now - 120_000; // 2 minute idle
  for (const [phone, u] of Array.from(userMap)) {
    // Purge users with no recent messages
    const recent = u.timestamps.filter(t => t > cutoff);
    if (recent.length === 0) {
      userMap.delete(phone);
    } else {
      u.timestamps = recent;
      u.texts = u.texts.filter(t => t.ts > cutoff);
    }
  }

  // Prune join timestamps
  const joinCutoff = now - 120_000;
  while (joinTimestamps.length > 0 && joinTimestamps[0] < joinCutoff) {
    joinTimestamps.shift();
  }
}

// ─── Detection helpers ───────────────────────────────────────────

function checkRateLimit(u: UserRecord, config: ModeratorConfig, now: number): boolean {
  const window = now - config.rateWindowMs;
  const recent = u.timestamps.filter(t => t > window);
  return recent.length > config.rateLimitPerWindow;
}

function checkDuplicateFlood(u: UserRecord, text: string, config: ModeratorConfig, now: number): boolean {
  const window = now - config.duplicateWindowMs;
  const recentTexts = u.texts.filter(t => t.ts > window);
  const sameCount = recentTexts.filter(t => t.text === text).length;
  return sameCount >= config.maxDuplicateText;
}

function checkSuspiciousLinks(text: string): string | null {
  const lower = text.toLowerCase();
  for (const domain of SUSPICIOUS_DOMAINS) {
    if (lower.includes(domain)) return domain;
  }
  // Also catch any raw IP-based links (common in phishing)
  const ipLink = /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g;
  if (ipLink.test(lower)) return 'ip-link';
  return null;
}

function checkScamPhrases(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of SCAM_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

function checkPhoneScraping(text: string): number {
  const matches = text.match(PHONE_PATTERN);
  if (!matches) return 0;
  // More than 3 phone numbers in a single message = scraping attempt
  return matches.length;
}

// ─── Evaluate ────────────────────────────────────────────────────

export async function evaluate(ctx: AgentContext): Promise<{ actions: AgentAction[]; metrics?: Record<string, any> }> {
  const now = Date.now();
  tickCount++;
  lastTick = new Date().toISOString();

  const config = resolveConfig(ctx.config);
  const actions: AgentAction[] = [];

  // Prune stale state periodically
  pruneStaleState(now);

  // Get the admin token from context
  const token = ctx.adminToken;

  // 1. Process unprocessed events relevant to moderator
  const events = ctx.pendingEvents || [];

  for (const event of events) {
    try {
      switch (event.type) {
        // ── Group message received ──────────────────────────────
        case 'group_message_received': {
          const { phone, jid, text } = event.payload as {
            phone?: string;
            jid?: string;
            text?: string;
          };
          if (!phone || !text) break;

          const user = getUser(phone, jid || '');
          const nowMs = Date.now();

          // Record activity
          user.timestamps.push(nowMs);
          user.texts.push({ text, ts: nowMs });

          // ── Check 1: Rate limiting ──────────────────────────
          if (checkRateLimit(user, config, nowMs)) {
            if (user.warnings < config.warnLimit) {
              actions.push({
                id: actionId(MODULE_ID, 'warn_player', phone, 'rate-limit'),
                agentId: MODULE_ID,
                type: 'warn_player',
                params: { reason: `Rate limit exceeded: ${config.rateLimitPerWindow} messages in ${config.rateWindowMs / 1000}s`, jid, phone },
                priority: 'high',
                description: `Rate limit warning for ${phone}`,
                requiresConfirmation: false,
              });
              user.warnings++;
            } else if (user.mutes < config.muteLimit) {
              actions.push({
                id: actionId(MODULE_ID, 'mute_player', phone, 'rate-limit'),
                agentId: MODULE_ID,
                type: 'mute_player',
                params: { reason: `Repeated rate limit violations after ${config.warnLimit} warnings`, hours: config.muteHours, jid, phone },
                priority: 'high',
                description: `Mute ${phone} for rate limit abuse`,
                requiresConfirmation: false,
              });
              user.mutes++;
              user.warnings = 0; // reset after escalation
            } else {
              actions.push({
                id: actionId(MODULE_ID, 'ban_player', phone, 'rate-limit'),
                agentId: MODULE_ID,
                type: 'ban_player',
                params: { reason: `Persistent rate limit abuse after ${config.muteLimit} mutes`, jid, phone },
                priority: 'critical',
                description: `Ban ${phone} for persistent rate limit abuse`,
                requiresConfirmation: true, // ban requires human approval
              });
            }
          }

          // ── Check 2: Duplicate flood ────────────────────────
          if (checkDuplicateFlood(user, text, config, nowMs)) {
            if (user.warnings < config.warnLimit) {
              actions.push({
                id: actionId(MODULE_ID, 'warn_player', phone, 'duplicate'),
                agentId: MODULE_ID,
                type: 'warn_player',
                params: { reason: 'Duplicate message flood detected', jid, phone },
                priority: 'high',
                description: `Duplicate flood warning for ${phone}`,
                requiresConfirmation: false,
              });
              user.warnings++;
            } else {
              actions.push({
                id: actionId(MODULE_ID, 'mute_player', phone, 'duplicate'),
                agentId: MODULE_ID,
                type: 'mute_player',
                params: { reason: 'Repeated duplicate message flooding', hours: config.muteHours, jid, phone },
                priority: 'high',
                description: `Mute ${phone} for duplicate flooding`,
                requiresConfirmation: false,
              });
              user.mutes++;
              user.warnings = 0;
            }
          }

          // ── Check 3: Suspicious links ────────────────────────
          if (config.checkSuspiciousLinks) {
            const matchedDomain = checkSuspiciousLinks(text);
            if (matchedDomain) {
              actions.push({
                id: actionId(MODULE_ID, 'warn_player', phone, 'spam-link', matchedDomain),
                agentId: MODULE_ID,
                type: 'warn_player',
                params: { reason: `Suspicious link detected: ${matchedDomain}`, jid, phone },
                priority: 'normal',
                description: `Suspicious link (${matchedDomain}) from ${phone}`,
                requiresConfirmation: false,
              });
              user.warnings++;

              // Emit a fraud alert for the suspicious link
              emitEvent('fraud_alert', {
                type: 'suspicious_link',
                phone,
                jid,
                domain: matchedDomain,
                text,
              });
            }
          }

          // ── Check 4: Scam phrases ────────────────────────────
          if (config.checkScamPhrases) {
            const matchedPhrase = checkScamPhrases(text);
            if (matchedPhrase) {
              actions.push({
                id: actionId(MODULE_ID, 'warn_player', phone, 'scam', matchedPhrase.replace(/\s+/g, '-')),
                agentId: MODULE_ID,
                type: 'warn_player',
                params: { reason: `Potential scam phrase detected: "${matchedPhrase}"`, jid, phone },
                priority: 'high',
                description: `Scam phrase match ("${matchedPhrase}") from ${phone}`,
                requiresConfirmation: false,
              });
              user.warnings++;

              emitEvent('fraud_alert', {
                type: 'scam_phrase',
                phone,
                jid,
                phrase: matchedPhrase,
                text,
              });
            }
          }

          // ── Check 5: Phone number scraping ───────────────────
          const phoneCount = checkPhoneScraping(text);
          if (phoneCount >= 3) {
            actions.push({
              id: actionId(MODULE_ID, 'warn_player', phone, 'phone-scrape'),
              agentId: MODULE_ID,
              type: 'warn_player',
              params: { reason: `Possible phone number scraping (${phoneCount} numbers in single message)`, jid, phone },
              priority: 'high',
              description: `Phone scraping attempt from ${phone}`,
              requiresConfirmation: false,
            });
            user.warnings++;

            emitEvent('fraud_alert', {
              type: 'phone_scraping',
              phone,
              jid,
              count: phoneCount,
              text,
            });
          }

          break;
        }

        // ── Player joined group ─────────────────────────────────
        case 'player_joined_group': {
          const { phone, jid: joinJid } = event.payload as {
            phone?: string;
            jid?: string;
          };
          if (!phone) break;

          const nowMs = Date.now();
          joinTimestamps.push(nowMs);

          // Check join surge
          const window = nowMs - config.joinSurgeWindowMs;
          const recentJoins = joinTimestamps.filter(t => t > window);

          if (recentJoins.length >= config.joinSurgeThreshold) {
            actions.push({
              id: actionId(MODULE_ID, 'send_broadcast', 'join-surge'),
              agentId: MODULE_ID,
              type: 'send_broadcast',
              params: {
                text: `⚠️ *Join Surge Alert*: ${recentJoins.length} players joined in the last ${config.joinSurgeWindowMs / 1000}s. Possible spam accounts.`,
              },
              priority: 'high',
              description: `Join surge detected: ${recentJoins.length} joins in window`,
              requiresConfirmation: false,
            });

            emitEvent('fraud_alert', {
              type: 'join_surge',
              count: recentJoins.length,
              windowMs: config.joinSurgeWindowMs,
            });
          }

          break;
        }

        // ── Fraud alert (from other agents) ─────────────────────
        case 'fraud_alert': {
          const { phone: fraudPhone, jid: fraudJid } = event.payload as {
            phone?: string;
            jid?: string;
            [key: string]: any;
          };

          // If another agent flagged this user, escalate moderation
          if (fraudPhone) {
            const user = getUser(fraudPhone, fraudJid || '');

            if (user.mutes < config.muteLimit) {
              actions.push({
                id: actionId(MODULE_ID, 'mute_player', fraudPhone, 'fraud-alert'),
                agentId: MODULE_ID,
                type: 'mute_player',
                params: { reason: 'Flagged by fraud alert from another agent', hours: config.muteHours * 2, jid: fraudJid, phone: fraudPhone },
                priority: 'critical',
                description: `Mute ${fraudPhone} due to cross-agent fraud alert`,
                requiresConfirmation: true,
              });
              user.mutes++;
            } else {
              actions.push({
                id: actionId(MODULE_ID, 'ban_player', fraudPhone, 'fraud-alert'),
                agentId: MODULE_ID,
                type: 'ban_player',
                params: { reason: 'Repeated cross-agent fraud alerts', jid: fraudJid, phone: fraudPhone },
                priority: 'critical',
                description: `Ban ${fraudPhone} after repeated fraud alerts`,
                requiresConfirmation: true,
              });
            }

            user.flagged = true;
          }

          break;
        }

        default:
          // Not relevant to moderator
          break;
      }
    } catch (err: any) {
      lastError = err.message || String(err);
      tasksFailed++;
      emitEvent('agent_error', {
        agentId: MODULE_ID,
        error: lastError,
        eventType: event.type,
      });
    }
  }

  // ── Periodic: clean up very old state ─────────────────────
  if (tickCount % 60 === 0) {
    // Full prune every ~60 ticks
    const cutoff = Date.now() - 300_000; // 5 min
    for (const [phone, u] of Array.from(userMap)) {
      u.timestamps = u.timestamps.filter(t => t > cutoff);
      u.texts = u.texts.filter(t => t.ts > cutoff);
      if (u.timestamps.length === 0 && !u.flagged) {
        userMap.delete(phone);
      }
    }
  }

  tasksCompleted += actions.length;
  return { actions };
}

// ─── Execute ──────────────────────────────────────────────────────

export async function execute(action: AgentAction): Promise<{ ok: boolean; error?: string }> {
  try {
    const api = agentApi(/* token injected by automation engine at runtime */ '');

    switch (action.type) {
      case 'warn_player': {
        // The actual token is set by the automation engine — we use the
        // params passthrough. The action will be dispatched by whoever
        // calls execute with a proper token.
        const { reason, phone } = action.params as { reason: string; phone?: string; jid?: string };
        if (!reason) return { ok: false, error: 'Missing reason for warn' };
        // We don't have userId here yet — the automation engine or a
        // wrapper should resolve phone → userId before calling this.
        // For now, emit an action event to be picked up.
        emitEvent('agent_action', {
          agentId: MODULE_ID,
          type: 'warn_player',
          params: action.params,
        });
        tasksCompleted++;
        return { ok: true };
      }

      case 'mute_player': {
        const { reason, hours, phone } = action.params as { reason: string; hours?: number; phone?: string; jid?: string };
        if (!reason) return { ok: false, error: 'Missing reason for mute' };
        emitEvent('agent_action', {
          agentId: MODULE_ID,
          type: 'mute_player',
          params: action.params,
        });
        tasksCompleted++;
        return { ok: true };
      }

      case 'ban_player': {
        const { reason, phone } = action.params as { reason: string; phone?: string; jid?: string };
        if (!reason) return { ok: false, error: 'Missing reason for ban' };
        emitEvent('agent_action', {
          agentId: MODULE_ID,
          type: 'ban_player',
          params: action.params,
        });
        tasksCompleted++;
        return { ok: true };
      }

      case 'send_broadcast': {
        const { text } = action.params as { text: string };
        if (!text) return { ok: false, error: 'Missing broadcast text' };
        emitEvent('agent_action', {
          agentId: MODULE_ID,
          type: 'send_broadcast',
          params: action.params,
        });
        tasksCompleted++;
        return { ok: true };
      }

      default:
        return { ok: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err: any) {
    tasksFailed++;
    lastError = err.message || String(err);
    emitEvent('agent_error', {
      agentId: MODULE_ID,
      error: lastError,
      actionType: action.type,
    });
    return { ok: false, error: lastError || undefined };
  }
}

// ─── Health ──────────────────────────────────────────────────────

export function health(): import('./agentTypes.js').AgentHealth {
  return {
    agentId: MODULE_ID,
    status: lastError ? 'error' : 'online',
    lastTick,
    lastError: lastError ? String(lastError) : null,
    tasksCompleted,
    tasksFailed,
    queueLength: userMap.size,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: VERSION,
  };
}

// ─── Module export (satisfies AgentModule) ───────────────────────

const moderatorModule: AgentModule = {
  id: MODULE_ID,
  version: VERSION,
  evaluate,
  execute,
  health,
};

export default moderatorModule;
