// Runtime, admin-editable settings for the WhatsApp gateway channel.
// These overlay the env-derived defaults in config.ts so the admin console
// can flip the AI on/off, change the till, or swap the model without a
// server restart. Values are cached and refreshed on write.

import db from '../../db.js';
import { whatsappConfig } from './config.js';

export interface WhatsAppSettings {
  enabled: boolean;
  mpesaTill: string;
  aiEnabled: boolean;
  aiModel: string;
  broadcastGroupJid: string | null;
  reminderEnabled: boolean;
  statusEnabled: boolean;
  reminderHours: number;
}

const DEFAULTS: WhatsAppSettings = {
  enabled: process.env.WHATSAPP_ENABLED === 'true',
  mpesaTill: process.env.WHATSAPP_MPESA_TILL || '',
  aiEnabled: process.env.WHATSAPP_AI_ENABLED === 'true',
  aiModel: process.env.WHATSAPP_AI_MODEL || 'oc/deepseek-v4-flash-free',
  broadcastGroupJid: process.env.WHATSAPP_BROADCAST_GROUP_JID || null,
  reminderEnabled: process.env.WHATSAPP_REMINDER_ENABLED !== 'false',
  statusEnabled: process.env.WHATSAPP_STATUS_ENABLED === 'true',
  reminderHours: Number(process.env.WHATSAPP_REMINDER_HOURS || 1),
};

let cache: WhatsAppSettings | null = null;

function ensureRow(): void {
  const row = db.prepare('SELECT * FROM whatsapp_settings WHERE id = 1').get() as any;
  if (!row) {
    db.prepare(
      `INSERT INTO whatsapp_settings (id, enabled, mpesa_till, ai_enabled, ai_model, broadcast_group_jid, reminder_enabled, status_enabled, reminder_hours)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      DEFAULTS.enabled ? 1 : 0,
      DEFAULTS.mpesaTill,
      DEFAULTS.aiEnabled ? 1 : 0,
      DEFAULTS.aiModel,
      DEFAULTS.broadcastGroupJid,
      DEFAULTS.reminderEnabled ? 1 : 0,
      DEFAULTS.statusEnabled ? 1 : 0,
      DEFAULTS.reminderHours
    );
  }
}

export function getSettings(): WhatsAppSettings {
  if (cache) return cache;
  ensureRow();
  const row = db.prepare('SELECT * FROM whatsapp_settings WHERE id = 1').get() as any;
  cache = {
    enabled: !!row.enabled,
    mpesaTill: row.mpesa_till || '',
    aiEnabled: !!row.ai_enabled,
    aiModel: row.ai_model || DEFAULTS.aiModel,
    broadcastGroupJid: row.broadcast_group_jid || null,
    reminderEnabled: row.reminder_enabled ? true : false,
    statusEnabled: row.status_enabled ? true : false,
    reminderHours: Number(row.reminder_hours || 1),
  };
  return cache;
}

export function updateSettings(patch: Partial<WhatsAppSettings>): WhatsAppSettings {
  ensureRow();
  const cur = getSettings();
  const next: WhatsAppSettings = { ...cur, ...patch };
  db.prepare(
    `UPDATE whatsapp_settings
     SET enabled = ?, mpesa_till = ?, ai_enabled = ?, ai_model = ?, broadcast_group_jid = ?, reminder_enabled = ?, status_enabled = ?, reminder_hours = ?
     WHERE id = 1`
  ).run(
    next.enabled ? 1 : 0,
    next.mpesaTill,
    next.aiEnabled ? 1 : 0,
    next.aiModel,
    next.broadcastGroupJid,
    next.reminderEnabled ? 1 : 0,
    next.statusEnabled ? 1 : 0,
    next.reminderHours
  );
  cache = next;
  // Apply to the live config so the channel reacts without a restart.
  whatsappConfig.mpesaTill = next.mpesaTill;
  whatsappConfig.aiEnabled = next.aiEnabled;
  whatsappConfig.aiModel = next.aiModel;
  if (next.broadcastGroupJid != null) whatsappConfig.broadcastGroupJid = next.broadcastGroupJid;
  return next;
}

// Connection status of the in-process Baileys socket (set by bot.ts).
let connectionState = 'unknown';
export function setConnectionState(s: string): void { connectionState = s; }
export function getConnectionState(): string { return connectionState; }

// True when an Omniroute API key is configured (set via OMNIROUTE_API_KEY).
export function hasApiKey(): boolean {
  return (whatsappConfig as any).omnirouteKey.length > 0;
}
