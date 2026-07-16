// Dynamic Baileys import — loaded only when WhatsApp is enabled.
// Prevents the whole backend from crashing if @whiskeysockets/baileys
// fails to load or has a native dependency issue at boot time.
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { rmSync, existsSync } from 'fs';
import pino from 'pino';
import type { Server as SocketIOServer } from 'socket.io';
import { whatsappConfig } from './config.js';
import { handleCommand, handleResultScreenshot, getCreate, handleCreateImage } from './commands.js';
import { isAdminPhone } from '../../db.js';
import { setConnectionState, getConnectionState } from './whatsappSettings.js';
import { getWorker, parseEFOTBScreenshot } from '../../services/ocrService.js';
import { processVerification } from '../../services/verificationService.js';
import db from '../../db.js';
import { linkStore } from './linkStore.js';
import { getSettings } from './whatsappSettings.js';
import { publishStatus, startReminderScheduler, runReminderCheck } from './whatsappNotify.js';
import { getIO } from '../../socket/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, '..', '..', '..', 'client', 'public', 'screenshots', 'whatsapp');

// Live Baileys socket, set once connected. Lets the admin API publish Status
// updates and trigger reminders without a second socket.
let whatsappSock: any = null;
export function getWhatsAppSock(): any { return whatsappSock; }
// Raw socket ref — set as soon as makeWASocket returns (before auth).
// Used by pairWithPhone() so the user can pair during the QR phase.
let _rawSocket: any = null;

// In-memory QR string (set by connection.update). Read by admin API.
let _qrCode = '';
export function getQrCode(): string { return _qrCode; }
// In-memory pairing code (set after requestPairingCode).
let _pairingCode = '';
export function getPairingCode(): string { return _pairingCode; }

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

/** Stop the current WhatsApp socket cleanly. */
export async function stopWhatsAppChannel(): Promise<void> {
  if (whatsappSock) {
    try { whatsappSock.end(); } catch {}
    try { whatsappSock.removeAllListeners(); } catch {}
    whatsappSock = null;
  }
  if (_rawSocket) {
    try { _rawSocket.end(); } catch {}
    _rawSocket = null;
  }
  _qrCode = '';
  _pairingCode = '';
  setConnectionState('disconnected');
}

/** Pair using a phone number (code-based pairing). Returns the pairing code. */
export async function pairWithPhone(phone: string): Promise<string> {
  const sock = _rawSocket || whatsappSock;
  if (!sock) throw new Error('WhatsApp channel not started');
  const code = await sock.requestPairingCode(phone);
  _pairingCode = code;
  setConnectionState('pairing_code');
  return code;
}

/** Logout: stop the channel, delete the saved auth session,
 *  then restart so a fresh QR code appears immediately. */
export async function logoutWhatsApp(): Promise<void> {
  await stopWhatsAppChannel();
  const authDir = join(whatsappConfig.dataDir, 'auth');
  if (existsSync(authDir)) {
    rmSync(authDir, { recursive: true, force: true });
    console.log('[WhatsApp] auth session deleted');
  }
  // Auto-restart so the admin sees a fresh QR right away.
  startWhatsAppChannel(getIO()).catch((e) =>
    console.error('[WhatsApp] restart after logout failed:', e.message)
  );
}

// One Baileys session for the TOSS product (separate number/process from
// any BusinessOS Baileys instance). In-process: reads the same DB and the
// in-process io — no self-HTTP, no second service.
export async function startWhatsAppChannel(io: SocketIOServer): Promise<void> {
  if (!whatsappConfig.enabled) {
    console.log('[WhatsApp] channel disabled (WHATSAPP_ENABLED != true)');
    return;
  }

  // Let the UI know we're starting up — QR/pairing will follow.
  setConnectionState('connecting');

  // Dynamic Baileys import — isolated from boot-time module resolution.
  // If @whiskeysockets/baileys has issues, only the WhatsApp feature fails,
  // not the whole backend.
  let makeWASocket: any, useMultiFileAuthState: any, fetchLatestBaileysVersion: any;
  let DisconnectReason: any, downloadContentFromMessage: any;
  try {
    const baileys = await import('@whiskeysockets/baileys');
    makeWASocket = baileys.default || baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    DisconnectReason = baileys.DisconnectReason;
    downloadContentFromMessage = baileys.downloadContentFromMessage;
  } catch (e: any) {
    console.error('[WhatsApp] Baileys import failed — WhatsApp channel unavailable:', e?.message);
    setConnectionState('error');
    return;
  }

  // Custom logger: Baileys internally logs benign boot noise as ERROR
  // ("init queries" Timed Out during reconnect, "No matching sessions"
  // for the bot's own echoed fromMe messages). Downgrade those to debug
  // so the channel reads clean while real errors still surface.
  const baseLogger = pino({ level: whatsappConfig.logLevel });
  const logger = {
    ...baseLogger,
    error: (obj: any, msg?: string) => {
      const s = typeof obj === 'string' ? obj : msg || JSON.stringify(obj || {});
      const str = typeof s === 'string' ? s : JSON.stringify(s);
      if (
        /init queries/i.test(str) ||
        /No matching sessions found for message/i.test(str) ||
        /unexpected error in 'init queries'/i.test(str)
      ) {
        baseLogger.debug(obj, msg);
        return;
      }
      baseLogger.error(obj, msg as any);
    },
  };
  const { join } = await import('path');
  const { mkdirSync, writeFileSync } = await import('fs');
  const { fileURLToPath } = await import('url');
  const { dirname } = await import('path');
  const { createHash } = await import('crypto');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const authDir = join(whatsappConfig.dataDir, 'auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: logger as any,
  });
  _rawSocket = sock; // make available for requestPairingCode immediately

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update: any) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      _qrCode = qr;
      _pairingCode = ''; // clear any previous pairing code
      logger.info('QR code received — scan to pair');
      setConnectionState('qr');
    }
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

  sock.ev.on('messages.upsert', async ({ messages }: { messages: any[] }) => {
    const m = messages[0] as any;
    logger.info({ fromMe: m?.key?.fromMe, hasMsg: !!m?.message, jid: m?.key?.remoteJid }, 'incoming message');
    if (!m || m.key.fromMe || !m.message) return;
    const remoteJid = m.key.remoteJid || '';
    // Phase 1: handle direct messages only (user@s.whatsapp.net or @lid).
    if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid')) {
      logger.info('skipping non-DM jid: ' + remoteJid);
      return;
    }
    const phone = remoteJid.split('@')[0];
    const text =
      (m.message.conversation as string) ||
      (m.message.extendedTextMessage?.text as string) ||
      '';
    const imageMsg = m.message.imageMessage;
    if (imageMsg) {
      // Admin mid-creation? Route the photo to the tournament-create flow.
      if (isAdminPhone(phone) && getCreate(phone)?.step === 'await_image') {
        try {
          const reply = await handleCreateImage(sock, remoteJid, phone, m.message);
          if (reply) await sock.sendMessage(remoteJid, { text: reply });
        } catch (e: any) {
          logger.error({ err: e?.message }, 'create-image handling failed');
        }
      } else {
        try {
          const reply = await handleResultScreenshot(sock, remoteJid, phone, m.message, text);
          if (reply) await sock.sendMessage(remoteJid, { text: reply });
        } catch (e: any) {
          logger.error({ err: e?.message }, 'screenshot handling failed');
        }
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
