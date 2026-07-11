/**
 * Rankings Controller
 *
 * GET /api/rankings
 * Returns players ranked by wins, points, goal difference.
 */

import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';

export function getMyStats(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const rankings = db.prepare(`
    SELECT
      u.id,
      u.username,
      COUNT(DISTINCT CASE WHEN m.player1_id = u.id OR m.player2_id = u.id THEN m.id END) as matches_played,
      COUNT(DISTINCT CASE WHEN m.winner_id = u.id THEN m.id END) as wins,
      COUNT(DISTINCT CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != u.id AND (m.player1_id = u.id OR m.player2_id = u.id) THEN m.id END) as losses,
      COALESCE(SUM(CASE WHEN w.winner_id = u.id THEN w.total_pot ELSE 0 END), 0) as wager_earnings
    FROM users u
    LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'completed'
    LEFT JOIN wager_challenges w ON w.status = 'completed'
    WHERE u.id = ?
    GROUP BY u.id
  `).all(userId);

  if (rankings.length === 0) {
    res.json({ stats: null });
    return;
  }

  const r: any = rankings[0];

  // Compute rank: count how many users have more wins or (same wins and more wager earnings)
  const rankRow = db.prepare(`
    SELECT COUNT(*) as above FROM (
      SELECT u.id,
        COUNT(DISTINCT CASE WHEN m.winner_id = u.id THEN m.id END) as wins,
        COALESCE(SUM(CASE WHEN w.winner_id = u.id THEN w.total_pot ELSE 0 END), 0) as wager_earnings
      FROM users u
      LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'completed'
      LEFT JOIN wager_challenges w ON w.status = 'completed'
      GROUP BY u.id
      HAVING wins > ? OR (wins = ? AND wager_earnings > ?)
    )
  `).get(r.wins, r.wins, r.wager_earnings) as any;

  const rank = (rankRow?.above || 0) + 1;

  res.json({
    stats: {
      wins: r.wins,
      rank,
      wagerEarnings: r.wager_earnings || 0,
    }
  });
}

export function getRankings(req: AuthRequest, res: Response) {
  // Get all users with their match stats
  const rankings = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.avatar_url,
      u.is_admin,
      COUNT(DISTINCT CASE WHEN m.player1_id = u.id OR m.player2_id = u.id THEN m.id END) as matches_played,
      COUNT(DISTINCT CASE WHEN m.winner_id = u.id THEN m.id END) as wins,
      COUNT(DISTINCT CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != u.id AND (m.player1_id = u.id OR m.player2_id = u.id) THEN m.id END) as losses,
      COALESCE(SUM(CASE WHEN m.player1_id = u.id THEN m.player1_score ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN m.player2_id = u.id THEN m.player2_score ELSE 0 END), 0) as goals_for,
      COALESCE(SUM(CASE WHEN m.player1_id = u.id THEN m.player2_score ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN m.player2_id = u.id THEN m.player1_score ELSE 0 END), 0) as goals_against,
      COUNT(DISTINCT CASE WHEN w.winner_id = u.id THEN w.id END) as wager_wins,
      COALESCE(SUM(CASE WHEN w.winner_id = u.id THEN w.total_pot ELSE 0 END), 0) as wager_earnings
    FROM users u
    LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'completed'
    LEFT JOIN wager_challenges w ON w.status = 'completed'
    GROUP BY u.id
    HAVING matches_played > 0
    ORDER BY
      wager_earnings DESC,
      wins DESC,
      (COALESCE(SUM(CASE WHEN m.player1_id = u.id THEN m.player1_score ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN m.player2_id = u.id THEN m.player2_score ELSE 0 END), 0)) -
      (COALESCE(SUM(CASE WHEN m.player1_id = u.id THEN m.player2_score ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN m.player2_id = u.id THEN m.player1_score ELSE 0 END), 0)) DESC
    LIMIT 100
  `).all();

  const response = rankings.map((r: any, i: number) => ({
    rank: i + 1,
    id: r.id,
    username: r.username,
    avatarUrl: r.avatar_url,
    isAdmin: r.is_admin === 1,
    matchesPlayed: r.matches_played,
    wins: r.wins,
    losses: r.losses,
    goalsFor: r.goals_for,
    goalsAgainst: r.goals_against,
    goalDiff: (r.goals_for || 0) - (r.goals_against || 0),
    winRate: r.matches_played > 0 ? Math.round((r.wins / r.matches_played) * 100) : 0,
    wagerWins: r.wager_wins || 0,
    wagerEarnings: r.wager_earnings || 0,
  }));

  res.json({ rankings: response });
}
