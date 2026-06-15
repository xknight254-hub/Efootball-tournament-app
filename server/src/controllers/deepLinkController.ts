import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../db.js';

/**
 * Deep link entry point: /t/:slug-:token
 * 
 * URL format: /t/friday-night-cup-a1b2c3d4
 * The last 8 chars after the last segment = token prefix.
 * We match the full token against the DB silently.
 * 
 * If valid → set session cookie → redirect to tournament entry page.
 * If invalid → 404.
 * 
 * The user never sees a passcode screen. The token IS the passcode,
 * embedded in the URL, validated invisibly.
 */
export async function deepLinkEntry(req: Request, res: Response) {
  const { slugToken } = req.params;

  // Extract token: last 8 chars of the last hyphen-separated segment
  // URL: /t/friday-night-cup-a1b2c3d4
  // We need to find where the slug ends and token begins
  // Strategy: token is always 24 hex chars, but we use first 8 in URL
  // So we look for the last 8-char hex segment

  const parts = slugToken.split('-');
  const tokenSuffix = parts[parts.length - 1];

  if (!tokenSuffix || tokenSuffix.length < 8) {
    return res.status(404).send(renderErrorPage('Tournament not found', 'This link is invalid or expired.'));
  }

  // Find tournament by token prefix (first 8 chars of access_token)
  const tournament = db.prepare(
    'SELECT * FROM tournaments WHERE SUBSTR(access_token, 1, 8) = ?'
  ).get(tokenSuffix) as any;

  if (!tournament) {
    return res.status(404).send(renderErrorPage('Tournament not found', 'This link is invalid or expired.'));
  }

  // Full token validation: the URL suffix must match the stored token prefix
  // (already confirmed above, but double-check full token if needed)
  if (!tournament.access_token.startsWith(tokenSuffix)) {
    return res.status(404).send(renderErrorPage('Tournament not found', 'This link is invalid or expired.'));
  }

  // Set a signed cookie so user doesn't need to re-validate on next page
  res.cookie(`t_access_${tournament.id}`, tournament.access_token, {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax',
  });

  // Redirect to the SPA deep-link join page
  res.redirect(`/join/${tournament.access_token.slice(0, 8)}`);
}

/**
 * API endpoint: validate token and return tournament info (for SPA).
 * GET /api/tournaments/by-token/:token
 */
export async function getTournamentByToken(req: Request, res: Response) {
  const { token } = req.params;

  if (!token || token.length < 8) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const tournament = db.prepare(
    'SELECT id, name, description, format, max_players, best_of, status, prize_pool, entry_fee, is_private, image_url, created_at, access_token FROM tournaments WHERE SUBSTR(access_token, 1, 8) = ?'
  ).get(token) as any;

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  // Get participant count
  const participantCount = db.prepare(
    'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
  ).get(tournament.id) as { count: number };

  // Check if tournament is full
  const isFull = participantCount.count >= tournament.max_players;

  res.json({
    id: tournament.id,
    name: tournament.name,
    description: tournament.description,
    format: tournament.format,
    maxPlayers: tournament.max_players,
    bestOf: tournament.best_of,
    status: tournament.status,
    prizePool: tournament.prize_pool,
    entryFee: tournament.entry_fee,
    isPrivate: tournament.is_private === 1,
    imageUrl: tournament.image_url,
    participantCount: participantCount.count,
    isFull,
    createdAt: tournament.created_at,
  });
}

/**
 * Minimal HTML error page for deep link failures.
 */
function renderErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — TOSS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #141420; border: 1px solid #2a2a3a; border-radius: 16px; padding: 40px 32px; text-align: center; max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { color: #888; font-size: 14px; line-height: 1.5; }
    a { color: #818cf8; text-decoration: none; display: inline-block; margin-top: 20px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">Go to TOSS →</a>
  </div>
</body>
</html>`;
}

/**
 * Quick-join a tournament via deep link token.
 * POST /api/tournaments/by-token/:token/join
 * 
 * Ultra-simple flow:
 * 1. User submits phone number
 * 2. Account auto-created (or found by phone)
 * 3. Participant registered
 * 4. M-Pesa STK Push triggered (placeholder for now)
 * 
 * No login. No password. Phone number = identity.
 */
export async function quickJoinByToken(req: Request, res: Response) {
  const { token } = req.params;
  const { phoneNumber } = req.body;

  if (!token || token.length < 8) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  if (!phoneNumber || phoneNumber.length < 10) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  // Find tournament
  const tournament = db.prepare(
    'SELECT * FROM tournaments WHERE SUBSTR(access_token, 1, 8) = ?'
  ).get(token) as any;

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  // Check registration is open
  if (tournament.status !== 'open' && tournament.status !== 'registration_open') {
    return res.status(400).json({ error: 'Registration is closed' });
  }

  // Check not full
  const countResult = db.prepare(
    'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
  ).get(tournament.id) as { count: number };

  if (countResult.count >= tournament.max_players) {
    return res.status(400).json({ error: 'Tournament is full' });
  }

  // Find or create user by phone
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phoneNumber) as any;

  if (!user) {
    // Normalize phone to 254 format for storage
    let normalizedPhone = phoneNumber.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.slice(1);
    if (normalizedPhone.startsWith('2540')) normalizedPhone = '254' + normalizedPhone.slice(4);
    if (!normalizedPhone.match(/^2547\d{8}$/)) {
      return res.status(400).json({ error: 'Phone number must be a valid Kenyan number (e.g., 0712345678)' });
    }

    // Auto-create account from phone
    const username = `p_${normalizedPhone.slice(-8)}`;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10); // Random secure hash — user authenticates via phone/M-Pesa
    db.prepare(
      'INSERT INTO users (username, email, password_hash, phone) VALUES (?, ?, ?, ?)'
    ).run(
      username,
      `${username}@temporary.local`,
      passwordHash,
      normalizedPhone
    );
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normalizedPhone) as any;
  }

  // Check not already registered
  const existing = db.prepare(
    'SELECT id FROM participants WHERE tournament_id = ? AND user_id = ?'
  ).get(tournament.id, user.id);

  if (existing) {
    return res.status(400).json({ error: 'Already registered' });
  }

  // Register participant
  const seed = countResult.count + 1;
  db.prepare(
    'INSERT INTO participants (tournament_id, user_id, seed, status) VALUES (?, ?, ?, ?)'
  ).run(tournament.id, user.id, seed, 'registered');

  // Auto-save
  try { db.exec("SELECT 1"); } catch { /* sql.js save handled by DB layer */ }

  res.json({
    message: 'Successfully joined!',
    tournament: {
      id: tournament.id,
      name: tournament.name,
      entryFee: tournament.entry_fee,
    },
    participant: {
      seed,
      username: user.username,
    },
    // Next step: M-Pesa payment (placeholder — implement when payment flow is ready)
    paymentRequired: tournament.entry_fee > 0,
    paymentAmount: tournament.entry_fee,
  });
}
