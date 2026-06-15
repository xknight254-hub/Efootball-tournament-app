import crypto from 'crypto';
import db from '../db.js';

/**
 * Generate a cryptographically secure 24-character access token.
 * Used for deep links — embedded in URL, silently validated server-side.
 * User never sees or types this.
 */
export function generateAccessToken(): string {
  return crypto.randomBytes(12).toString('hex'); // 24 hex chars
}

/**
 * Validate an access_token against a tournament.
 * Returns the tournament row if valid, undefined otherwise.
 */
export function validateAccessToken(token: string) {
  return db.prepare(
    'SELECT * FROM tournaments WHERE access_token = ?'
  ).get(token as any);
}

/**
 * Regenerate access token (org uses /newlink or revokes old link).
 * Returns the new token.
 */
export function regenerateAccessToken(tournamentId: number): string {
  const newToken = generateAccessToken();
  db.prepare('UPDATE tournaments SET access_token = ? WHERE id = ?').run(newToken, tournamentId);
  return newToken;
}

/**
 * URL-safe slug from tournament name.
 * "Friday Night Cup" → "friday-night-cup"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')  // remove special chars
    .replace(/[\s]+/g, '-')         // spaces → hyphens
    .replace(/-+/g, '-')            // collapse hyphens
    .slice(0, 40);                   // cap length
}
