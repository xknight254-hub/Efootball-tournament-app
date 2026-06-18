import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { getIO } from '../socket/index.js';

interface Match {
  id: number;
  tournament_id: number;
  player1_id: number;
  player2_id: number;
  round: number;
  match_number: number;
  player1_score: number | null;
  player2_score: number | null;
  winner_id: number | null;
  status: string;
  confirmation_status: string;
  submitted_by: number | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  screenshot_url: string | null;
  opponent_screenshot_url: string | null;
  created_at: string;
}

export async function getTournamentMatches(req: AuthRequest, res: Response) {
  const { tournamentId } = req.params;
  const tid = parseInt(tournamentId);

  if (isNaN(tid)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const matches = db.prepare(`
    SELECT m.*, 
           p1.username as player1_username,
           p2.username as player2_username,
           w.username as winner_username
    FROM matches m
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    LEFT JOIN users w ON m.winner_id = w.id
    WHERE m.tournament_id = ?
    ORDER BY m.round, m.match_number
  `).all(tid) as any[];

  res.json({
    matches: matches.map(m => ({
      id: m.id,
      round: m.round,
      matchNumber: m.match_number,
      player1: m.player1_id ? { id: m.player1_id, username: m.player1_username, team: m.player1_team } : null,
      player2: m.player2_id ? { id: m.player2_id, username: m.player2_username, team: m.player2_team } : null,
      player1Team: m.player1_team,
      player2Team: m.player2_team,
      player1Score: m.player1_score,
      player2Score: m.player2_score,
      winner: m.winner_id ? { id: m.winner_id, username: m.winner_username } : null,
      status: m.status,
      confirmationStatus: m.confirmation_status,
      verificationStatus: m.verification_status || 'none',
      submittedBy: m.submitted_by,
      submittedAt: m.submitted_at,
      confirmedAt: m.confirmed_at,
      screenshotUrl: m.screenshot_url,
      opponentScreenshotUrl: m.opponent_screenshot_url,
      createdAt: m.created_at
    }))
  });
}

export async function getMatchById(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const matchId = parseInt(id);

  if (isNaN(matchId)) {
    return res.status(400).json({ error: 'Invalid match ID' });
  }

  const match = db.prepare(`
    SELECT m.*, 
           p1.username as player1_username,
           p2.username as player2_username,
           w.username as winner_username,
           sub.username as submitted_by_username
    FROM matches m
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    LEFT JOIN users w ON m.winner_id = w.id
    LEFT JOIN users sub ON m.submitted_by = sub.id
    WHERE m.id = ?
  `).get(matchId) as any;

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  res.json({
    id: match.id,
    tournamentId: match.tournament_id,
    round: match.round,
    matchNumber: match.match_number,
    player1: match.player1_id ? { id: match.player1_id, username: match.player1_username, team: match.player1_team } : null,
    player2: match.player2_id ? { id: match.player2_id, username: match.player2_username, team: match.player2_team } : null,
    player1Team: match.player1_team,
    player2Team: match.player2_team,
    player1Score: match.player1_score,
    player2Score: match.player2_score,
    winner: match.winner_id ? { id: match.winner_id, username: match.winner_username } : null,
    status: match.status,
    confirmationStatus: match.confirmation_status,
    verificationStatus: match.verification_status || 'none',
    submittedBy: match.submitted_by ? { id: match.submitted_by, username: match.submitted_by_username } : null,
    submittedAt: match.submitted_at,
    confirmedAt: match.confirmed_at,
    screenshotUrl: match.screenshot_url,
    opponentScreenshotUrl: match.opponent_screenshot_url,
    createdAt: match.created_at
  });
}

export async function submitResult(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const matchId = parseInt(id);

  if (isNaN(matchId)) {
    return res.status(400).json({ error: 'Invalid match ID' });
  }

  const { player1Score, player2Score, screenshotUrl } = req.body;

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match | undefined;

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (match.status === 'completed') {
    return res.status(400).json({ error: 'Match is already completed' });
  }

  const isPlayer1 = match.player1_id === req.user.id;
  const isPlayer2 = match.player2_id === req.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return res.status(403).json({ error: 'You are not a participant in this match' });
  }

  const score1 = isPlayer1 ? player1Score : match.player1_score;
  const score2 = isPlayer2 ? player2Score : match.player2_score;
  const screenshot = isPlayer1 ? screenshotUrl : match.screenshot_url;
  const opponentScreenshot = isPlayer1 ? match.opponent_screenshot_url : screenshotUrl;

  if (score1 === undefined || score2 === undefined) {
    return res.status(400).json({ error: 'Both scores are required' });
  }

  db.prepare(`
    UPDATE matches SET
      player1_score = ?,
      player2_score = ?,
      submitted_by = ?,
      submitted_at = CURRENT_TIMESTAMP,
      screenshot_url = ?,
      opponent_screenshot_url = ?,
      status = 'playing'
    WHERE id = ?
  `).run(
    isPlayer1 ? player1Score : match.player1_score,
    isPlayer2 ? player2Score : match.player2_score,
    req.user.id,
    screenshot,
    opponentScreenshot,
    matchId
  );

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match;

  const bothSubmitted = updated.player1_score !== null && updated.player2_score !== null;
  
  if (bothSubmitted && updated.player1_score !== null && updated.player2_score !== null) {
    const p1Wins = updated.player1_score > updated.player2_score;
    const p2Wins = updated.player2_score > updated.player1_score;

    if (p1Wins && !p2Wins) {
      db.prepare(`
        UPDATE matches SET 
          winner_id = player1_id,
          status = 'completed',
          confirmation_status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(matchId);
    } else if (p2Wins && !p1Wins) {
      db.prepare(`
        UPDATE matches SET 
          winner_id = player2_id,
          status = 'completed',
          confirmation_status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(matchId);
    } else {
      db.prepare(`
        UPDATE matches SET confirmation_status = 'disputed' WHERE id = ?
      `).run(matchId);
    }
  }

  const result = db.prepare(`
    SELECT m.*, 
           p1.username as player1_username,
           p2.username as player2_username,
           w.username as winner_username
    FROM matches m
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    LEFT JOIN users w ON m.winner_id = w.id
    WHERE m.id = ?
  `).get(matchId) as any;

  // Real-time: notify match and tournament rooms
  try {
    const matchRoom = `match:${matchId}`;
    const tournamentRoom = `tournament:${result.tournament_id}`;
    const payload = {
      id: result.id,
      tournamentId: result.tournament_id,
      round: result.round,
      matchNumber: result.match_number,
      player1: { id: result.player1_id, username: result.player1_username },
      player2: { id: result.player2_id, username: result.player2_username },
      player1Score: result.player1_score,
      player2Score: result.player2_score,
      winner: result.winner_id ? { id: result.winner_id, username: result.winner_username } : null,
      status: result.status,
      confirmationStatus: result.confirmation_status,
    };
    getIO().to(matchRoom).to(tournamentRoom).emit('match:update', payload);
  } catch { /* socket not initialized */ }

  res.json({
    id: result.id,
    round: result.round,
    matchNumber: result.match_number,
    player1: { id: result.player1_id, username: result.player1_username },
    player2: { id: result.player2_id, username: result.player2_username },
    player1Score: result.player1_score,
    player2Score: result.player2_score,
    winner: result.winner_id ? { id: result.winner_id, username: result.winner_username } : null,
    status: result.status,
    confirmationStatus: result.confirmation_status,
    submittedAt: result.submitted_at,
    confirmedAt: result.confirmed_at
  });
}

export async function confirmResult(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const matchId = parseInt(id);

  if (isNaN(matchId)) {
    return res.status(400).json({ error: 'Invalid match ID' });
  }

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match | undefined;

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const isPlayer1 = match.player1_id === req.user.id;
  const isPlayer2 = match.player2_id === req.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return res.status(403).json({ error: 'You are not a participant in this match' });
  }

  if (match.confirmation_status === 'confirmed') {
    return res.status(400).json({ error: 'Result already confirmed' });
  }

  if (!match.player1_score || !match.player2_score) {
    return res.status(400).json({ error: 'Scores not submitted yet' });
  }

  const p1Wins = match.player1_score > match.player2_score;
  const p2Wins = match.player2_score > match.player1_score;

  if (p1Wins && !p2Wins) {
    db.prepare(`
      UPDATE matches SET 
        winner_id = player1_id,
        status = 'completed',
        confirmation_status = 'confirmed',
        confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(matchId);
  } else if (p2Wins && !p1Wins) {
    db.prepare(`
      UPDATE matches SET 
        winner_id = player2_id,
        status = 'completed',
        confirmation_status = 'confirmed',
        confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(matchId);
  }

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match;

  // Real-time: notify match and tournament rooms
  try {
    const tournamentId = match.tournament_id;
    getIO().to(`match:${matchId}`).to(`tournament:${tournamentId}`).emit('match:update', {
      id: matchId,
      tournamentId,
      status: updated.status,
      confirmationStatus: updated.confirmation_status,
      winnerId: updated.winner_id,
    });
  } catch { /* socket not initialized */ }

  res.json({
    id: updated.id,
    status: updated.status,
    confirmationStatus: updated.confirmation_status,
    winnerId: updated.winner_id,
    confirmedAt: updated.confirmed_at
  });
}

export async function disputeResult(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const matchId = parseInt(id);

  if (isNaN(matchId)) {
    return res.status(400).json({ error: 'Invalid match ID' });
  }

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match | undefined;

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const isPlayer1 = match.player1_id === req.user.id;
  const isPlayer2 = match.player2_id === req.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return res.status(403).json({ error: 'You are not a participant in this match' });
  }

  db.prepare(`
    UPDATE matches SET 
      confirmation_status = 'disputed',
      status = 'disputed'
    WHERE id = ?
  `).run(matchId);

  // Real-time: notify match and tournament rooms
  try {
    getIO().to(`match:${matchId}`).to(`tournament:${match.tournament_id}`).emit('match:update', {
      id: matchId,
      tournamentId: match.tournament_id,
      status: 'disputed',
      confirmationStatus: 'disputed',
    });
  } catch { /* socket not initialized */ }

  res.json({ message: 'Match disputed. Organizer will review.' });
}

export async function resolveDispute(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const matchId = parseInt(id);

  if (isNaN(matchId)) {
    return res.status(400).json({ error: 'Invalid match ID' });
  }

  const { winnerId } = req.body;

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match | undefined;

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (match.confirmation_status !== 'disputed') {
    return res.status(400).json({ error: 'Match is not disputed' });
  }

  const validWinner = winnerId === match.player1_id || winnerId === match.player2_id;
  if (!validWinner) {
    return res.status(400).json({ error: 'Winner must be one of the players' });
  }

  db.prepare(`
    UPDATE matches SET 
      winner_id = ?,
      status = 'completed',
      confirmation_status = 'confirmed',
      confirmed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(winnerId, matchId);

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match;

  res.json({
    id: updated.id,
    winnerId: updated.winner_id,
    status: updated.status,
    confirmationStatus: updated.confirmation_status,
    confirmedAt: updated.confirmed_at
  });
}