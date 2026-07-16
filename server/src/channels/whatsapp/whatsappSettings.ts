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
  aiProvider: string;
  aiBaseUrl: string;
  aiApiKey: string;
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
  aiProvider: process.env.WHATSAPP_AI_PROVIDER || 'omniroute',
  aiBaseUrl: process.env.OMNIROUTE_BASE_URL || 'http://178.105.198.217:20128/api/v1',
  aiApiKey: process.env.OMNIROUTE_API_KEY || '',
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
      `INSERT INTO whatsapp_settings (id, enabled, mpesa_till, ai_enabled, ai_model, ai_provider, ai_base_url, ai_api_key, broadcast_group_jid, reminder_enabled, status_enabled, reminder_hours)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      DEFAULTS.enabled ? 1 : 0,
      DEFAULTS.mpesaTill,
      DEFAULTS.aiEnabled ? 1 : 0,
      DEFAULTS.aiModel,
      DEFAULTS.aiProvider,
      DEFAULTS.aiBaseUrl,
      DEFAULTS.aiApiKey,
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
    aiProvider: row.ai_provider || DEFAULTS.aiProvider,
    aiBaseUrl: row.ai_base_url || DEFAULTS.aiBaseUrl,
    aiApiKey: row.ai_api_key || DEFAULTS.aiApiKey,
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
     SET enabled = ?, mpesa_till = ?, ai_enabled = ?, ai_model = ?, ai_provider = ?, ai_base_url = ?, ai_api_key = ?, broadcast_group_jid = ?, reminder_enabled = ?, status_enabled = ?, reminder_hours = ?
     WHERE id = 1`
  ).run(
    next.enabled ? 1 : 0,
    next.mpesaTill,
    next.aiEnabled ? 1 : 0,
    next.aiModel,
    next.aiProvider,
    next.aiBaseUrl,
    next.aiApiKey,
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
  whatsappConfig.aiProvider = next.aiProvider;
  whatsappConfig.aiBaseUrl = next.aiBaseUrl;
  whatsappConfig.aiApiKey = next.aiApiKey;
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

// ─── AI Provider switching (admin console: Gateway tab) ──────────
// Providers the admin can pick in the mini-app UI. Omniroute is the
// self-hosted gateway; OpenRouter/custom let the admin point elsewhere.
export interface AIProviderPreset {
  id: string;
  label: string;
  defaultBaseUrl: string;
  models?: string[];
}

export const AI_PROVIDERS: AIProviderPreset[] = [
  {
    id: 'omniroute',
    label: 'Omniroute (self-hosted)',
    defaultBaseUrl: 'http://178.105.198.217:20128/api/v1',
    models: ['nvidia/nvidia/nemotron-3-super-120b-a12b', 'oc/deepseek-v4-flash-free'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-flash-1.5'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
  { id: 'custom', label: 'Custom', defaultBaseUrl: '', models: [] },
];

// Resolved LLM connection the chat path uses. Per-provider base/key
// override the env defaults when the admin has set them in the UI.
export function getLLMConfig(): {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
} {
  const s = getSettings();
  const provider = s.aiProvider || whatsappConfig.aiProvider || 'omniroute';
  const preset = AI_PROVIDERS.find((p) => p.id === provider);
  const baseUrl =
    s.aiBaseUrl || whatsappConfig.aiBaseUrl || preset?.defaultBaseUrl || whatsappConfig.omnirouteBase;
  const apiKey = s.aiApiKey || whatsappConfig.aiApiKey || whatsappConfig.omnirouteKey;
  const model = s.aiModel || whatsappConfig.aiModel;
  return { baseUrl, apiKey, model, provider };
}
