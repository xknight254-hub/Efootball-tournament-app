import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import type { Server as SocketIOServer } from 'socket.io';
import { whatsappConfig } from './config.js';
import { handleCommand } from './commands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// One Baileys session for the TOSS product (separate number/process from
// any BusinessOS Baileys instance). In-process: reads the same DB and the
// in-process io — no self-HTTP, no second service.
export async function startWhatsAppChannel(io: SocketIOServer): Promise<void> {
  if (!whatsappConfig.enabled) {
    console.log('[WhatsApp] channel disabled (WHATSAPP_ENABLED != true)');
    return;
  }

  const logger = pino({ level: whatsappConfig.logLevel });
  const authDir = join(whatsappConfig.dataDir, 'auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: logger as any,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) logger.info('Scan the QR above to pair WhatsApp');
    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        logger.warn('WhatsApp disconnected, retrying...');
        startWhatsAppChannel(io).catch((e) =>
          logger.error({ err: e.message }, 'reconnect failed')
        );
      } else {
        logger.error('WhatsApp logged out — re-pair required');
      }
    } else if (connection === 'open') {
      logger.info('WhatsApp channel connected');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0] as WAMessage | undefined;
    if (!m || m.key.fromMe || !m.message) return;
    const remoteJid = m.key.remoteJid || '';
    // Phase 1: handle direct messages only (user@s.whatsapp.net).
    if (!remoteJid.endsWith('@s.whatsapp.net')) return;
    const text =
      (m.message.conversation as string) ||
      (m.message.extendedTextMessage?.text as string) ||
      '';
    if (!text) return;
    const phone = remoteJid.split('@')[0];
    try {
      const reply = await handleCommand(text, { phone });
      await sock.sendMessage(remoteJid, { text: reply });
    } catch (e: any) {
      logger.error({ err: e?.message }, 'command handling failed');
    }
  });

  // ─── Real-time backend broadcasts (global socket events) ───
  const broadcast = async (msg: string) => {
    const jid = whatsappConfig.broadcastGroupJid;
    if (!jid) {
      logger.warn('No WHATSAPP_BROADCAST_GROUP_JID set; skipping broadcast');
      return;
    }
    try {
      await sock.sendMessage(jid, { text: msg });
    } catch (e: any) {
      logger.error({ err: e?.message }, 'broadcast failed');
    }
  };

  io.on('tournament:created', (d: any) =>
    broadcast(`🆕 New tournament: *${d.name}* (#${d.id}, ${d.format})`)
  );
  io.on('tournament:update', (d: any) =>
    broadcast(`🔄 Tournament updated: *${d.name}* (#${d.id}) — ${d.status}`)
  );
  io.on('tournament:deleted', (d: any) =>
    broadcast(`🗑️ Tournament #${d.id} deleted`)
  );
  io.on('match:update', (d: any) =>
    broadcast(`⚽ Match #${d.id} → ${d.status}`)
  );
  io.on('participant:joined', (d: any) =>
    broadcast(`👥 New participant in tournament #${d.tournamentId}`)
  );

  logger.info('WhatsApp channel initialized (events subscribed)');
}
