import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { logAdminAction } from './tournamentController.js';

// GET /api/admin/stats - Dashboard statistics
export function getStats(req: AuthRequest, res: Response) {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  const tournamentCount = (db.prepare('SELECT COUNT(*) as count FROM tournaments').get() as any).count;
  const matchCount = (db.prepare('SELECT COUNT(*) as count FROM matches').get() as any).count;
  const participantCount = (db.prepare('SELECT COUNT(*) as count FROM participants').get() as any).count;

  const tournamentsByStatus = db.prepare(
    'SELECT status, COUNT(*) as count FROM tournaments GROUP BY status'
  ).all();

  const recentUsers = db.prepare(
    'SELECT id, username, email, is_admin, created_at FROM users ORDER BY created_at DESC LIMIT 10'
  ).all();

  const recentTournaments = db.prepare(
    `SELECT t.*, u.username as owner_name, 
      (SELECT COUNT(*) FROM participants WHERE tournament_id = t.id) as participant_count
     FROM tournaments t 
     JOIN users u ON t.owner_id = u.id 
     ORDER BY t.created_at DESC LIMIT 10`
  ).all();

  res.json({
    stats: { userCount, tournamentCount, matchCount, participantCount },
    tournamentsByStatus,
    recentUsers,
    recentTournaments
  });
}

// GET /api/admin/users - List all users
export function listUsers(req: AuthRequest, res: Response) {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const search = (req.query.search as string) || '';

  let users;
  let total;

  if (search) {
    const pattern = `%${search}%`;
    users = db.prepare(
      `SELECT id, username, email, first_name, last_name, is_admin, is_organizer, created_at 
       FROM users 
       WHERE username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(pattern, pattern, pattern, pattern, limit, offset);
    total = (db.prepare(
      `SELECT COUNT(*) as count FROM users 
       WHERE username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?`
    ).get(pattern, pattern, pattern, pattern) as any).count;
  } else {
    users = db.prepare(
      `SELECT id, username, email, first_name, last_name, is_admin, is_organizer, created_at 
       FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset);
    total = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  }

  res.json({ users, total, limit, offset });
}

// PUT /api/admin/users/:id - Update user (promote/demote admin, etc.)
export function updateUser(req: AuthRequest, res: Response) {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  const { isAdmin, username, email, firstName, lastName } = req.body;

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Prevent self-demotion
  if (userId === req.user!.id && isAdmin === false) {
    return res.status(400).json({ error: 'You cannot demote yourself' });
  }

  db.prepare(`
    UPDATE users SET
      is_admin = COALESCE(?, is_admin),
      username = COALESCE(?, username),
      email = COALESCE(?, email),
      first_name = COALESCE(?, first_name),
      last_name = COALESCE(?, last_name)
    WHERE id = ?
  `).run(
    isAdmin !== undefined ? (isAdmin ? 1 : 0) : null,
    username || null,
    email ? email.toLowerCase() : null,
    firstName || null,
    lastName || null,
    userId
  );

  const updated = db.prepare(
    'SELECT id, username, email, first_name, last_name, is_admin, created_at FROM users WHERE id = ?'
  ).get(userId) as any;

  logAdminAction(req.user!.id, 'update_user', `Updated user ${userId}`);

  res.json({
    id: updated.id,
    username: updated.username,
    email: updated.email,
    firstName: updated.first_name,
    lastName: updated.last_name,
    isAdmin: updated.is_admin === 1,
    createdAt: updated.created_at
  });
}

// DELETE /api/admin/users/:id - Delete a user
export function deleteUser(req: AuthRequest, res: Response) {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  if (userId === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete yourself' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!existing) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  logAdminAction(req.user!.id, 'delete_user', `Deleted user ${userId}`);

  res.json({ message: 'User deleted' });
}

// GET /api/admin/tournaments - List all tournaments (admin view)
export function listAllTournaments(req: AuthRequest, res: Response) {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const tournaments = db.prepare(
    `SELECT t.*, u.username as owner_name,
      (SELECT COUNT(*) FROM participants WHERE tournament_id = t.id) as participant_count
     FROM tournaments t
     JOIN users u ON t.owner_id = u.id
     ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);

  const total = (db.prepare('SELECT COUNT(*) as count FROM tournaments').get() as any).count;

  res.json({ tournaments, total, limit, offset });
}

// DELETE /api/admin/tournaments/:id - Delete any tournament
export function deleteTournament(req: AuthRequest, res: Response) {
  const tournamentId = parseInt(req.params.id);
  if (isNaN(tournamentId)) return res.status(400).json({ error: 'Invalid tournament ID' });

  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!existing) return res.status(404).json({ error: 'Tournament not found' });

  db.prepare('DELETE FROM tournaments WHERE id = ?').run(tournamentId);
  logAdminAction(req.user!.id, 'delete_tournament', `Deleted tournament ${tournamentId}`);

  res.json({ message: 'Tournament deleted' });
}

// GET /api/admin/logs - Admin action logs
export function getLogs(req: AuthRequest, res: Response) {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const logs = db.prepare(
    `SELECT l.*, u.username as admin_name 
     FROM admin_logs l
     LEFT JOIN users u ON l.admin_id = u.id
     ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);

  const total = (db.prepare('SELECT COUNT(*) as count FROM admin_logs').get() as any).count;

  res.json({ logs, total, limit, offset });
}

// GET /api/admin/disputes - List disputed matches and wagers
export function getDisputes(req: AuthRequest, res: Response) {
  // Get disputed matches
  const disputedMatches = db.prepare(`
    SELECT m.*, t.name as tournament_name,
      p1.username as player1_name, p2.username as player2_name
    FROM matches m
    JOIN tournaments t ON m.tournament_id = t.id
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    WHERE m.status = 'disputed'
    ORDER BY m.created_at DESC
    LIMIT 50
  `).all();

  // Get disputed wagers
  const disputedWagers = db.prepare(`
    SELECT wc.*, c.username as creator_name, ch.username as challenger_name
    FROM wager_challenges wc
    JOIN users c ON wc.creator_id = c.id
    LEFT JOIN users ch ON wc.challenger_id = ch.id
    WHERE wc.status = 'disputed'
    ORDER BY wc.created_at DESC
    LIMIT 50
  `).all();

  res.json({ disputedMatches, disputedWagers });
}

// GET /api/admin/analytics - Real analytics from DB
export function getAnalytics(req: AuthRequest, res: Response) {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  const tournamentCount = (db.prepare('SELECT COUNT(*) as count FROM tournaments').get() as any).count;
  const matchCount = (db.prepare('SELECT COUNT(*) as count FROM matches').get() as any).count;
  const completedMatches = (db.prepare("SELECT COUNT(*) as count FROM matches WHERE status = 'completed'").get() as any).count;
  const disputedMatches = (db.prepare("SELECT COUNT(*) as count FROM matches WHERE status = 'disputed'").get() as any).count;

  const wagerCount = (db.prepare('SELECT COUNT(*) as count FROM wager_challenges').get() as any).count;
  const completedWagers = (db.prepare("SELECT COUNT(*) as count FROM wager_challenges WHERE status = 'completed'").get() as any).count;
  const totalWagerPot = (db.prepare("SELECT COALESCE(SUM(stake_amount * 2), 0) as total FROM wager_challenges WHERE status = 'completed'").get() as any).total;
  const totalCommission = (db.prepare("SELECT COALESCE(SUM(commission), 0) as total FROM wager_challenges WHERE status = 'completed'").get() as any).total;

  // Top tournaments by participant count
  const topTournaments = db.prepare(`
    SELECT t.id, t.name, t.format, t.status, t.prize_pool,
      COUNT(p.id) as participant_count
    FROM tournaments t
    LEFT JOIN participants p ON t.id = p.tournament_id
    GROUP BY t.id
    ORDER BY participant_count DESC
    LIMIT 5
  `).all();

  // Recent registrations per day (last 7 days)
  const registrationsByDay = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM users
    WHERE created_at >= DATE('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY date
  `).all();

  res.json({
    kpis: {
      userCount,
      tournamentCount,
      matchCount,
      completedMatches,
      disputedMatches,
      wagerCount,
      completedWagers,
      totalWagerPot,
      totalCommission,
    },
    topTournaments,
    registrationsByDay,
  });
}
