import { Response } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { generateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

// ─── Telegram initData Validation ──────────────────────────────
// Validates that the data actually came from Telegram using HMAC-SHA256.
// See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
  added_to_attachment_menu?: boolean;
  is_bot?: boolean;
}

interface ValidatedTelegramData {
  user: TelegramUser;
  auth_date: number;
  query_id?: string;
  start_param?: string;
  chat_type?: string;
}

/**
 * Validate Telegram WebApp initData
 * 
 * Algorithm:
 * 1. Parse the initData query string
 * 2. Extract the hash field
 * 3. Sort remaining fields alphabetically
 * 4. Build data_check_string: key\nvalue\nkey\nvalue...
 * 5. Compute HMAC-SHA256 with secret = HMAC-SHA256(bot_token, "WebAppData")
 * 6. Compare computed hash with received hash
 */
export function validateTelegramInitData(initData: string, botToken: string): ValidatedTelegramData | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    
    if (!hash) {
      console.error('[TelegramAuth] No hash in initData');
      return null;
    }

    // Remove hash from params for validation
    params.delete('hash');

    // Build data_check_string: sorted key=value pairs separated by \n
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Compute secret key: HMAC-SHA256(bot_token, "WebAppData")
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Compute hash: HMAC-SHA256(data_check_string, secret_key)
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) {
      console.error('[TelegramAuth] Hash mismatch — data may be tampered');
      return null;
    }

    // Parse user data
    const userJson = params.get('user');
    if (!userJson) {
      console.error('[TelegramAuth] No user data in initData');
      return null;
    }

    const user: TelegramUser = JSON.parse(userJson);
    const authDate = parseInt(params.get('auth_date') || '0');

    // Check auth_date is not too old (24 hours max)
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.error('[TelegramAuth] initData expired (older than 24h)');
      return null;
    }

    return {
      user,
      auth_date: authDate,
      query_id: params.get('query_id') || undefined,
      start_param: params.get('start_param') || undefined,
      chat_type: params.get('chat_type') || undefined,
    };
  } catch (error) {
    console.error('[TelegramAuth] Validation error:', error);
    return null;
  }
}

// ─── Telegram Login Handler ────────────────────────────────────
// POST /api/auth/telegram-login
// Validates initData, finds or creates user, returns JWT

export async function telegramLogin(req: AuthRequest, res: Response) {
  const { initData } = req.body;

  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ error: 'initData is required' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[TelegramAuth] TELEGRAM_BOT_TOKEN not configured');
    return res.status(500).json({ error: 'Telegram integration not configured' });
  }

  // Validate the data came from Telegram
  const validated = validateTelegramInitData(initData, botToken);
  if (!validated) {
    return res.status(401).json({ error: 'Invalid Telegram data' });
  }

  const tgUser = validated.user;
  const telegramId = String(tgUser.id);

  let isNewUser = false;
  try {
    // Check if user already exists by telegram_id
    let user = db.prepare(
      'SELECT * FROM users WHERE telegram_id = ?'
    ).get(telegramId) as any;

    if (user) {
      // Existing user — update Telegram profile data
      db.prepare(`
        UPDATE users SET
          telegram_username = ?,
          telegram_photo_url = ?,
          first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          avatar_url = COALESCE(?, avatar_url)
        WHERE id = ?
      `).run(
        tgUser.username || null,
        tgUser.photo_url || null,
        tgUser.first_name || null,
        tgUser.last_name || null,
        tgUser.photo_url || null,
        user.id
      );

      // Re-fetch updated user
      user = db.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).get(user.id) as any;
    } else {
      // New user — auto-create account from Telegram profile
      isNewUser = true;
      const username = tgUser.username
        ? `tg_${tgUser.username}`
        : `player_${telegramId}`;

      // Ensure username is unique
      let finalUsername = username;
      let counter = 1;
      while (db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername)) {
        finalUsername = `${username}_${counter}`;
        counter++;
      }

      const email = `${telegramId}@telegram.efootball`;

      // First user becomes super admin automatically
      const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any;
      const isFirstUser = existingCount.cnt === 0;

      const result = db.prepare(`
        INSERT INTO users (username, email, password_hash, first_name, last_name, avatar_url, telegram_id, telegram_username, telegram_photo_url, is_admin, is_super_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        finalUsername,
        email,
        'telegram_oauth',
        tgUser.first_name || null,
        tgUser.last_name || null,
        tgUser.photo_url || null,
        telegramId,
        tgUser.username || null,
        tgUser.photo_url || null,
        isFirstUser ? 1 : 0,
        isFirstUser ? 1 : 0
      );

      user = db.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).get(result.lastInsertRowid) as any;
    }

    // Generate JWT
    const token = generateToken(user.id);

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatarUrl: user.avatar_url,
        isAdmin: user.is_admin === 1,
        isSuperAdmin: user.is_super_admin === 1,
        telegramId: user.telegram_id,
        telegramUsername: user.telegram_username,
        isPremium: tgUser.is_premium || false,
      },
      token,
      isNewUser,
    });
  } catch (error: any) {
    console.error('[TelegramAuth] Login error:', error);
    return res.status(500).json({ error: 'Telegram login failed', details: error.message });
  }
}

// ─── Link Telegram to Existing Account ─────────────────────────
// POST /api/auth/link-telegram
// For users who registered normally and want to link their Telegram

export async function linkTelegram(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { initData } = req.body;

  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ error: 'initData is required' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Telegram integration not configured' });
  }

  const validated = validateTelegramInitData(initData, botToken);
  if (!validated) {
    return res.status(401).json({ error: 'Invalid Telegram data' });
  }

  const tgUser = validated.user;
  const telegramId = String(tgUser.id);

  // Check if this telegram_id is already linked to another account
  const existing = db.prepare('SELECT id FROM users WHERE telegram_id = ? AND id != ?').get(telegramId, req.user.id);
  if (existing) {
    return res.status(400).json({ error: 'This Telegram account is already linked to another user' });
  }

  // Link Telegram to current user
  db.prepare(`
    UPDATE users SET
      telegram_id = ?,
      telegram_username = ?,
      telegram_photo_url = ?
    WHERE id = ?
  `).run(telegramId, tgUser.username || null, tgUser.photo_url || null, req.user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;

  return res.json({
    success: true,
    user: {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      avatarUrl: updated.avatar_url,
      isAdmin: updated.is_admin === 1,
      isSuperAdmin: updated.is_super_admin === 1,
      telegramId: updated.telegram_id,
      telegramUsername: updated.telegram_username,
    },
  });
}

// ─── Unlink Telegram ───────────────────────────────────────────
// DELETE /api/auth/unlink-telegram

export async function unlinkTelegram(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  db.prepare(`
    UPDATE users SET
      telegram_id = NULL,
      telegram_username = NULL,
      telegram_photo_url = NULL
    WHERE id = ?
  `).run(req.user.id);

  return res.json({ success: true, message: 'Telegram account unlinked' });
}
