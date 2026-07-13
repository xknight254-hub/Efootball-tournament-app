import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const whatsappConfig = {
  // Master on/off. When false the whole channel is inert (no Baileys boot,
  // no socket subscriptions). The live :3002 API is never touched.
  enabled: process.env.WHATSAPP_ENABLED === 'true',
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
  // Phase 2 AI assistant — Omniroute (OpenAI-compatible gateway) model.
  // When `aiEnabled` is true AND a key is present, free-text is routed
  // through the LLM for intent extraction, then executed by the same
  // deterministic handlers (the LLM never returns user-facing data).
  aiEnabled: process.env.WHATSAPP_AI_ENABLED === 'true',
  omnirouteKey: process.env.OMNIROUTE_API_KEY || '',
  omnirouteBase:
    process.env.OMNIROUTE_BASE_URL || 'http://178.105.198.217:20128/api/v1',
  aiModel: process.env.WHATSAPP_AI_MODEL || 'gpt-4o-mini',
};
