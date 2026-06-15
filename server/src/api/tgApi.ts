import db from '../db.js';
import { generateAccessToken, regenerateAccessToken, slugify } from '../utils/token.js';

/**
 * Internal API for the Telegram bot.
 * These functions are called directly (not via HTTP) — the bot runs in-process.
 */

export const apiWithoutAuth = {
  /**
   * Create a tournament from the bot.
   */
  async createTournament(data: {
    name: string;
    entryFee: number;
    isPrivate: boolean;
    maxPlayers: number;
    format: string;
    platform: string;
    ownerTelegramId: string;
    telegramGroupId: string;
  }) {
    const accessToken = generateAccessToken();
    const isPrivateVal = data.isPrivate ? 1 : 0;

    // Find or create a user for the org based on telegram_id
    let user = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(data.ownerTelegramId) as any;

    if (!user) {
      // Auto-create user from telegram
      const username = `tg_${data.ownerTelegramId}`;
      db.prepare(
        'INSERT INTO users (username, email, password_hash, telegram_id, is_admin) VALUES (?, ?, ?, ?, 1)'
      ).run(username, `${username}@temporary.local`, 'bot-auto', data.ownerTelegramId);
      user = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(data.ownerTelegramId) as any;
    }

    const result = db.prepare(`
      INSERT INTO tournaments (name, description, platform, format, max_players, best_of, owner_id, status, access_token, is_private, entry_fee, telegram_group_id)
      VALUES (?, ?, ?, ?, ?, 1, ?, 'open', ?, ?, ?, ?)
    `).run(
      data.name,
      null,
      data.platform,
      data.format,
      data.maxPlayers,
      user.id,
      accessToken,
      isPrivateVal,
      data.entryFee,
      data.telegramGroupId
    );

    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.lastInsertRowid) as any;

    // Link tg_group
    try {
      db.prepare('INSERT OR REPLACE INTO tg_groups (tournament_id, telegram_group_id) VALUES (?, ?)')
        .run(tournament.id, data.telegramGroupId);
    } catch { /* ignore */ }

    return {
      id: tournament.id,
      name: tournament.name,
      accessToken: tournament.access_token,
      deepLink: `/t/${slugify(tournament.name)}-${tournament.access_token.slice(0, 8)}`,
      isPrivate: true,
      entryFee: tournament.entry_fee,
      status: tournament.status,
    };
  },

  /**
   * Get the most recent active tournament for a telegram group.
   */
  async getTournamentByGroup(telegramGroupId: string) {
    const tournament = db.prepare(`
      SELECT t.* FROM tournaments t
      JOIN tg_groups tg ON tg.tournament_id = t.id
      WHERE tg.telegram_group_id = ?
      ORDER BY t.created_at DESC
      LIMIT 1
    `).get(telegramGroupId) as any;

    if (!tournament) return null;

    const participantCount = db.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
    ).get(tournament.id) as { count: number };

    return {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      format: tournament.format,
      maxPlayers: tournament.max_players,
      participantCount: participantCount.count,
      entryFee: tournament.entry_fee,
    };
  },

  /**
   * Regenerate access token for a group's tournament.
   */
  async regenerateTournamentLink(telegramGroupId: string) {
    const tournament = db.prepare(`
      SELECT t.* FROM tournaments t
      JOIN tg_groups tg ON tg.tournament_id = t.id
      WHERE tg.telegram_group_id = ?
      ORDER BY t.created_at DESC
      LIMIT 1
    `).get(telegramGroupId) as any;

    if (!tournament) return null;

    const newToken = regenerateAccessToken(tournament.id);

    return {
      id: tournament.id,
      name: tournament.name,
      accessToken: newToken,
      deepLink: `/t/${slugify(tournament.name)}-${newToken.slice(0, 8)}`,
    };
  },

  /**
   * Close registration for a group's tournament.
   */
  async closeRegistration(telegramGroupId: string) {
    const tournament = db.prepare(`
      SELECT t.* FROM tournaments t
      JOIN tg_groups tg ON tg.tournament_id = t.id
      WHERE tg.telegram_group_id = ?
      ORDER BY t.created_at DESC
      LIMIT 1
    `).get(telegramGroupId) as any;

    if (!tournament) return null;

    db.prepare("UPDATE tournaments SET status = 'check_in' WHERE id = ?").run(tournament.id);

    const participantCount = db.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
    ).get(tournament.id) as { count: number };

    return {
      id: tournament.id,
      name: tournament.name,
      status: 'check_in',
      participantCount: participantCount.count,
    };
  },
};
