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
};
