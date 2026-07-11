import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';

export function getOrganizerTournaments(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const tournaments = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM participants WHERE tournament_id = t.id) as participant_count,
      (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id AND status = 'completed') as completed_matches,
      (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id AND status = 'disputed') as disputed_matches,
      (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id) as total_matches
    FROM tournaments t
    WHERE t.owner_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(req.user.id);

  res.json({ tournaments });
}

export function getOrganizerStats(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.user.id;

  const tournamentCount = (db.prepare('SELECT COUNT(*) as count FROM tournaments WHERE owner_id = ?').get(userId) as any).count;
  const totalParticipants = (db.prepare(
    'SELECT COUNT(*) as count FROM participants p JOIN tournaments t ON p.tournament_id = t.id WHERE t.owner_id = ?'
  ).get(userId) as any).count;
  const completedCount = (db.prepare(
    "SELECT COUNT(*) as count FROM tournaments WHERE owner_id = ? AND status = 'completed'"
  ).get(userId) as any).count;
  const liveCount = (db.prepare(
    "SELECT COUNT(*) as count FROM tournaments WHERE owner_id = ? AND status = 'live'"
  ).get(userId) as any).count;
  const openCount = (db.prepare(
    "SELECT COUNT(*) as count FROM tournaments WHERE owner_id = ? AND (status = 'open' OR status = 'registration_open')"
  ).get(userId) as any).count;

  // Match completion rate across all tournaments
  const matchStats = db.prepare(`
    SELECT
      COUNT(*) as total_matches,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_matches,
      SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed_matches
    FROM matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE owner_id = ?)
  `).get(userId) as any;
  const totalMatches = matchStats?.total_matches || 0;
  const completedMatches = matchStats?.completed_matches || 0;
  const disputedMatches = matchStats?.disputed_matches || 0;
  const matchCompletionRate = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  // Average participants per tournament
  const avgParticipants = tournamentCount > 0 ? Math.round(totalParticipants / tournamentCount) : 0;

  // Total entry fees collected (only paid tournaments)
  const totalEntryFees = (db.prepare(
    'SELECT COALESCE(SUM(t.entry_fee), 0) as total FROM tournaments t WHERE t.owner_id = ? AND t.entry_fee > 0'
  ).get(userId) as any).total;

  // Prize pool total
  const totalPrizePool = (db.prepare(
    "SELECT COALESCE(SUM(CAST(t.prize_pool AS INTEGER)), 0) as total FROM tournaments t WHERE t.owner_id = ? AND t.prize_pool IS NOT NULL AND t.prize_pool != ''"
  ).get(userId) as any).total;

  res.json({
    stats: {
      tournamentCount,
      totalParticipants,
      avgParticipants,
      completedCount,
      liveCount,
      openCount,
      totalMatches,
      completedMatches,
      disputedMatches,
      matchCompletionRate,
      totalEntryFees,
      totalPrizePool,
    },
  });
}

export function getOrganizerDisputes(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.user.id;

  const disputedMatches = db.prepare(`
    SELECT m.*, t.name as tournament_name,
      p1.username as player1_name, p2.username as player2_name
    FROM matches m
    JOIN tournaments t ON m.tournament_id = t.id
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    WHERE m.status = 'disputed' AND t.owner_id = ?
    ORDER BY m.created_at DESC
    LIMIT 20
  `).all(userId);

  res.json({ disputedMatches });
}

export function resolveOrganizerDispute(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  const matchId = parseInt(id);
  if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

  const { winnerId } = req.body;
  if (!winnerId) return res.status(400).json({ error: 'winnerId required' });

  const match = db.prepare(`
    SELECT m.*, t.owner_id FROM matches m
    JOIN tournaments t ON m.tournament_id = t.id
    WHERE m.id = ?
  `).get(matchId) as any;

  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.owner_id !== req.user.id && req.user.is_admin !== 1 && req.user.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Not your tournament' });
  }
  if (match.status !== 'disputed') return res.status(400).json({ error: 'Match is not disputed' });

  db.prepare(`
    UPDATE matches SET
      winner_id = ?, status = 'completed', confirmation_status = 'confirmed',
      confirmed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(winnerId, matchId);

  db.prepare('INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, ?)').run(
    match.player1_id, 'Dispute Resolved', 'An admin resolved the dispute in your match.', 'result'
  );
  if (match.player2_id !== match.player1_id) {
    db.prepare('INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, ?)').run(
      match.player2_id, 'Dispute Resolved', 'An admin resolved the dispute in your match.', 'result'
    );
  }

  res.json({ message: 'Dispute resolved', matchId, winnerId });
}
