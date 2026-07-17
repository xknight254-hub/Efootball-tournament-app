// WhatsApp outreach helpers: direct messages, Status publishing, and the
// reminder scheduler. Shared by the bot (live socket) and the admin API
// (manual Status post). All functions are no-ops-safe: they swallow errors
// and never throw into the caller.

import type { WASocket } from '@whiskeysockets/baileys';
import db from '../../db.js';
import { linkStore } from './linkStore.js';
import { getSettings } from './whatsappSettings.js';

const STATUS_JID = 'status@broadcast';

/** Send a 1:1 WhatsApp message to a linked user. Returns true if delivered. */
export async function sendDirectMessage(
  sock: WASocket,
  userId: number,
  text: string
): Promise<boolean> {
  const phone = reverseLookup(userId);
  if (!phone) return false;
  try {
    await sock.sendMessage(`${phone}@s.whatsapp.net`, { text });
    return true;
  } catch (e: any) {
    console.error('[whatsapp] DM failed', e?.message);
    return false;
  }
}

// Optional recipient targeting for a status. When omitted the status is
// broadcast to the account's full contact list (phone-app default).
export interface StatusTarget {
  // Plain phone numbers or full JIDs. Accepts "+15551234567", "15551234567",
  // or "15551234567@s.whatsapp.net". Resolved to JIDs below.
  jidList?: string[];
}

export interface StatusContent {
  text?: string;                 // caption (text status, or caption for media)
  image?: { url: string } | Buffer;  // local path, URL, or raw buffer
  video?: { url: string } | Buffer;
  videoSeconds?: number;         // story duration for video (default 30)
}

/**
 * Publish a WhatsApp Status (broadcast story) on behalf of the connected
 * account. Supports text, image, and video — the full Baileys status surface.
 * `target.jidList` restricts visibility to specific recipients; omit to send
 * to all contacts. No-op-safe: returns false on any failure, never throws.
 */
export async function sendStatus(
  sock: WASocket,
  content: StatusContent,
  target?: StatusTarget
): Promise<boolean> {
  try {
    const message: any = {};
    if (content.image) message.image = content.image;
    if (content.video) {
      message.video = content.video;
      message.seconds = content.videoSeconds ?? 30;
    }
    if (content.text) message.text = content.text;
    if (!message.image && !message.video && !message.text) {
      console.error('[whatsapp] sendStatus: empty content');
      return false;
    }
    const opts: any = {};
    if (target?.jidList && target.jidList.length) {
      opts.statusJidList = target.jidList.map(normalizeStatusJid);
    }
    await sock.sendMessage(STATUS_JID, message, opts);
    return true;
  } catch (e: any) {
    console.error('[whatsapp] Status publish failed', e?.message);
    return false;
  }
}

function normalizeStatusJid(v: string): string {
  if (v.includes('@')) return v;
  const digits = v.replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

/** Publish a text update to the TOSS WhatsApp Status (broadcast story). */
export async function publishStatus(sock: WASocket, text: string): Promise<boolean> {
  return sendStatus(sock, { text });
}

function reverseLookup(userId: number): string | null {
  // linkStore is file-backed phone->userId; scan for the reverse mapping.
  try {
    const map = (linkStore as any).read ? (linkStore as any).read() : {};
    for (const [phone, id] of Object.entries(map)) {
      if (id === userId) return phone;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Reminder sweep: nudge players about matches needing attention.
 *  - matches with status 'playing' and no result submitted for > reminderHours
 *  - matches scheduled to start within the next hour (kickoff reminder)
 * Respects the admin `reminderEnabled` setting.
 */
export async function runReminderCheck(sock: WASocket): Promise<number> {
  const s = getSettings();
  if (!s.reminderEnabled) return 0;
  let sent = 0;

  // 1) Outstanding results (match is 'playing' but no submitted_by yet).
  const pending = db
    .prepare(
      `SELECT id, player1_id, player2_id, tournament_id, submitted_at, created_at
       FROM matches
       WHERE status = 'playing'
         AND submitted_by IS NULL
         AND datetime(created_at) < datetime('now', ? || ' hours')`
    )
    .all(`-${s.reminderHours}`) as any[];

  for (const m of pending) {
    for (const uid of [m.player1_id, m.player2_id]) {
      if (!uid) continue;
      const ok = await sendDirectMessage(
        sock,
        uid,
        `⏰ Reminder: match #${m.id} still needs a result. ` +
          `Send it on WhatsApp: \`result ${m.id} <yourScore>-<oppScore>\` (with a screenshot to auto-verify).`
      );
      if (ok) sent++;
    }
  }

  // 2) Kickoff reminders (scheduled within the next hour, not yet started).
  const upcoming = db
    .prepare(
      `SELECT id, player1_id, player2_id, tournament_id, scheduled_time
       FROM matches
       WHERE status = 'pending'
         AND scheduled_time IS NOT NULL
         AND datetime(scheduled_time) BETWEEN datetime('now') AND datetime('now', '1 hours')`
    )
    .all() as any[];

  for (const m of upcoming) {
    for (const uid of [m.player1_id, m.player2_id]) {
      if (!uid) continue;
      const ok = await sendDirectMessage(
        sock,
        uid,
        `🟢 Kickoff soon! Your match #${m.id} starts at ${m.scheduled_time}. ` +
          `Be ready — submit the result on WhatsApp after the game.`
      );
      if (ok) sent++;
    }
  }

  return sent;
}

/** Start the periodic reminder loop. Returns a stop function. */
export function startReminderScheduler(sock: WASocket): () => void {
  const timer = setInterval(() => {
    runReminderCheck(sock).catch((e) => console.error('[whatsapp] reminder sweep failed', e?.message));
  }, 15 * 60 * 1000); // every 15 minutes
  // Best-effort immediate run shortly after boot.
  setTimeout(() => runReminderCheck(sock).catch(() => {}), 30 * 1000);
  return () => clearInterval(timer);
}
