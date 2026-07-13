import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  type WAMessage,
  type WAMessageContent,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import type { Server as SocketIOServer } from 'socket.io';
import { whatsappConfig } from './config.js';
import { handleCommand, handleResultScreenshot } from './commands.js';
import { setConnectionState } from './whatsappSettings.js';
import { getWorker, parseEFOTBScreenshot } from '../../services/ocrService.js';
import { processVerification } from '../../services/verificationService.js';
import db from '../../db.js';
import { linkStore } from './linkStore.js';
import { getSettings } from './whatsappSettings.js';
import { publishStatus, startReminderScheduler, runReminderCheck } from './whatsappNotify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, '..', '..', '..', 'client', 'public', 'screenshots', 'whatsapp');

// Live Baileys socket, set once connected. Lets the admin API publish Status
// updates and trigger reminders without a second socket.
let whatsappSock: any = null;
export function getWhatsAppSock(): any { return whatsappSock; }

/** Publish a message to the TOSS WhatsApp Status (admin-triggered). */
export async function publishAdminStatus(text: string): Promise<boolean> {
  if (!whatsappSock) return false;
  return publishStatus(whatsappSock, text);
}

/** Run the reminder sweep immediately (admin-triggered). */
export async function triggerReminders(): Promise<number> {
  if (!whatsappSock) return 0;
  return runReminderCheck(whatsappSock);
}

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
    if (qr) { logger.info('Scan the QR above to pair WhatsApp'); setConnectionState('qr'); }
    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        logger.warn('WhatsApp disconnected, retrying...');
        setConnectionState('disconnected');
        startWhatsAppChannel(io).catch((e) =>
          logger.error({ err: e.message }, 'reconnect failed')
        );
      } else {
        logger.error('WhatsApp logged out — re-pair required');
        setConnectionState('logged_out');
      }
    } else if (connection === 'open') {
      logger.info('WhatsApp channel connected');
      setConnectionState('connected');
      whatsappSock = sock;
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0] as WAMessage | undefined;
    if (!m || m.key.fromMe || !m.message) return;
    const remoteJid = m.key.remoteJid || '';
    // Phase 1: handle direct messages only (user@s.whatsapp.net).
    if (!remoteJid.endsWith('@s.whatsapp.net')) return;
    const phone = remoteJid.split('@')[0];
    const text =
      (m.message.conversation as string) ||
      (m.message.extendedTextMessage?.text as string) ||
      '';
    const imageMsg = m.message.imageMessage;
    if (imageMsg) {
      try {
        const reply = await handleResultScreenshot(sock, remoteJid, phone, m.message, text);
        if (reply) await sock.sendMessage(remoteJid, { text: reply });
      } catch (e: any) {
        logger.error({ err: e?.message }, 'screenshot handling failed');
      }
      return;
    }
    if (!text) return;
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
    // Optionally mirror important announcements to WhatsApp Status.
    if (getSettings().statusEnabled) {
      try { await publishStatus(sock, msg); } catch (e: any) {
        logger.error({ err: e?.message }, 'status publish failed');
      }
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
  startReminderScheduler(sock);
}
