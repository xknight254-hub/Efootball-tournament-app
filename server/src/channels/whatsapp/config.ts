import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const whatsappConfig = {
  // Master on/off. When false the whole channel is inert (no Baileys boot,
  // no socket subscriptions). The live :3002 API is never touched.
  // Defaults to true so the QR/pairing UI is available immediately on boot.
  // The admin console can toggle it off at runtime.
  enabled: true,
  // JID of the WhatsApp group that receives global backend broadcasts.
  broadcastGroupJid: process.env.WHATSAPP_BROADCAST_GROUP_JID || '',
  // Directory for Baileys auth state + link store.
  dataDir:
    process.env.WHATSAPP_DATA_DIR ||
    join(__dirname, '..', '..', 'data', 'whatsapp'),
  maxTournaments: Number(process.env.WHATSAPP_MAX_TOURNAMENTS || 10),
  maxRankings: Number(process.env.WHATSAPP_MAX_RANKINGS || 10),
  logLevel: process.env.WHATSAPP_LOG_LEVEL || 'info',
  // Your M-Pesa Buy-Goods Till number. When set, a forwarded confirmation
  // is only treated as payment when it references this till (so a stranger's
  // random M-Pesa SMS can't mint an account). Empty = accept any till.
  mpesaTill: process.env.WHATSAPP_MPESA_TILL || '',
  // Phase 2 AI assistant — provider-agnostic (OpenAI-compatible gateway).
  // When `aiEnabled` is true AND a key is present, free-text is routed
  // through interpretWithLLM(); otherwise the offline deterministic rules run.
  // Defaults to true so conversational AI works immediately on boot.
  aiEnabled: process.env.WHATSAPP_AI_ENABLED !== 'false',
  omnirouteKey: process.env.OMNIROUTE_API_KEY || '',
  omnirouteBase:
    process.env.OMNIROUTE_BASE_URL || 'http://178.105.198.217:20128/api/v1',
  // Optional secondary providers (env-injected; admin can also set per-settings).
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  // Live provider selection (mirrors whatsapp_settings.ai_provider at runtime).
  aiProvider: process.env.WHATSAPP_AI_PROVIDER || 'omniroute',
  aiBaseUrl: process.env.OMNIROUTE_BASE_URL || 'http://178.105.198.217:20128/api/v1',
  aiApiKey: process.env.OMNIROUTE_API_KEY || '',
  aiModel: process.env.WHATSAPP_AI_MODEL || 'oc/deepseek-v4-flash-free',
  reminderEnabled: process.env.WHATSAPP_REMINDER_ENABLED !== 'false',
  statusEnabled: process.env.WHATSAPP_STATUS_ENABLED === 'true',
  reminderHours: Number(process.env.WHATSAPP_REMINDER_HOURS || 1),
};

// Shared JWT secret (same value used by the WhatsApp link command).
export const JWT_SECRET =
  process.env.JWT_SECRET || 'efootball-arena-super-secret-key-2024';
