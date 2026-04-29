import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { sanitizeString } from '../utils/sanitize.js';

function logAdminAction(adminId: number, action: string, details: string) {
  db.prepare('INSERT INTO admin_logs (admin_id, action, details) VALUES (?, ?, ?)').run(
    String(adminId),
    action,
    details.slice(0, 1000)
  );
}

interface Tournament {
  id: number;
  name: string;
  description: string | null;
  platform: string;
  format: string;
  max_players: number;
  best_of: number;
  status: string;
  owner_id: number;
  winner_id: number | null;
  prize_pool: string | null;
  registration_deadline: string | null;
  result_deadline_hours: number;
  rules: string | null;
  created_at: string;
}

export async function createTournament(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { name, description, platform, format, maxPlayers, bestOf, prizePool, registrationDeadline, resultDeadlineHours, rules } = req.body;

  if (!name || !format) {
    return res.status(400).json({ error: 'Name and format are required' });
  }

  const validFormats = ['knockout', 'league'];
  if (!validFormats.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Must be knockout or league' });
  }

  const validMaxPlayers = [2, 4, 8, 16];
  const maxPlayersValue = maxPlayers || 16;
  if (!validMaxPlayers.includes(maxPlayersValue)) {
    return res.status(400).json({ error: 'Invalid maxPlayers. Must be 2, 4, 8, or 16' });
  }

  const result = db.prepare(`
    INSERT INTO tournaments (name, description, platform, format, max_players, best_of, prize_pool, registration_deadline, result_deadline_hours, rules, owner_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(
    name,
    description || null,
    platform || 'efootball',
    format,
    maxPlayersValue,
    bestOf || 1,
    prizePool || null,
    registrationDeadline || null,
    resultDeadlineHours || 24,
    rules || null,
    req.user.id
  );

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.lastInsertRowid) as Tournament;

  res.status(201).json({
    id: tournament.id,
    name: tournament.name,
    description: tournament.description,
    platform: tournament.platform,
    format: tournament.format,
    maxPlayers: tournament.max_players,
    bestOf: tournament.best_of,
    status: tournament.status,
    prizePool: tournament.prize_pool,
    registrationDeadline: tournament.registration_deadline,
    createdAt: tournament.created_at
  });
}

export async function getTournaments(req: AuthRequest, res: Response) {
  const { status, platform, search, limit = 20, offset = 0 } = req.query;

  let query = 'SELECT * FROM tournaments WHERE 1=1';
  const params: any[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (platform) {
    query += ' AND platform = ?';
    params.push(platform);
  }

  if (search) {
    const sanitizedSearch = String(search)
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .slice(0, 100);
    query += ' AND (name LIKE ? ESCAPE "\\" OR description LIKE ? ESCAPE "\\")';
    params.push(`%${sanitizedSearch}%`, `%${sanitizedSearch}%`);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const tournaments = db.prepare(query).all(...params) as Tournament[];

  const total = db.prepare('SELECT COUNT(*) as count FROM tournaments WHERE 1=1').get() as { count: number };

  res.json({
    tournaments: tournaments.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      platform: t.platform,
      format: t.format,
      maxPlayers: t.max_players,
      bestOf: t.best_of,
      status: t.status,
      prizePool: t.prize_pool,
      registrationDeadline: t.registration_deadline,
      createdAt: t.created_at
    })),
    total: total.count,
    limit: Number(limit),
    offset: Number(offset)
  });
}

export async function getTournamentById(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const tournamentId = parseInt(id);

  if (isNaN(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Tournament | undefined;

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const participantCount = db.prepare(
    'SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?'
  ).get(tournamentId) as { count: number };

  res.json({
    id: tournament.id,
    name: tournament.name,
    description: tournament.description,
    platform: tournament.platform,
    format: tournament.format,
    maxPlayers: tournament.max_players,
    bestOf: tournament.best_of,
    status: tournament.status,
    prizePool: tournament.prize_pool,
    registrationDeadline: tournament.registration_deadline,
    resultDeadlineHours: tournament.result_deadline_hours,
    rules: tournament.rules,
    ownerId: tournament.owner_id,
    winnerId: tournament.winner_id,
    participantCount: participantCount.count,
    createdAt: tournament.created_at
  });
}

export async function updateTournament(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const tournamentId = parseInt(id);

  if (isNaN(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Tournament | undefined;

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  if (tournament.owner_id !== req.user.id && req.user.is_admin !== 1) {
    return res.status(403).json({ error: 'Not authorized to update this tournament' });
  }

  const { name, description, status, prizePool, registrationDeadline, rules } = req.body;

  db.prepare(`
    UPDATE tournaments SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      prize_pool = COALESCE(?, prize_pool),
      registration_deadline = COALESCE(?, registration_deadline),
      rules = COALESCE(?, rules)
    WHERE id = ?
  `).run(
    name || null,
    description || null,
    status || null,
    prizePool || null,
    registrationDeadline || null,
    rules || null,
    tournamentId
  );

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Tournament;

  res.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    status: updated.status,
    prizePool: updated.prize_pool,
    registrationDeadline: updated.registration_deadline
  });
}

export async function deleteTournament(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const tournamentId = parseInt(id);

  if (isNaN(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Tournament | undefined;

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  if (tournament.owner_id !== req.user.id && req.user.is_admin !== 1) {
    return res.status(403).json({ error: 'Not authorized to delete this tournament' });
  }

  logAdminAction(
    req.user.id,
    'tournament_delete',
    `Deleted tournament: ${tournament.name} (ID: ${tournamentId})`
  );

  db.prepare('DELETE FROM tournaments WHERE id = ?').run(tournamentId);

  res.json({ message: 'Tournament deleted successfully' });
}