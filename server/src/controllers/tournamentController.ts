import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { sanitizeString, sanitizeHtml } from '../utils/sanitize.js';
import { getIO } from '../socket/index.js';

export function logAdminAction(adminId: number, action: string, details: string) {
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
  group_count: number;
  bracket_type: string;
  image_url: string | null;
  entry_fee: number;
  created_at: string;
}

export async function createTournament(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Only admins and super admins can create tournaments
  if (req.user.is_admin !== 1 && req.user.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Only admins can create tournaments. Request an admin code from an existing admin.' });
  }

  const { name, description, platform, format, maxPlayers, bestOf, prizePool, registrationDeadline, resultDeadlineHours, rules, groupCount, bracketType, imageUrl, entryFee } = req.body;

  if (!name || !format) {
    return res.status(400).json({ error: 'Name and format are required' });
  }

  const validFormats = ['knockout', 'league', 'multi_bracket', 'swiss'];
  if (!validFormats.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Must be knockout, league, multi_bracket, or swiss' });
  }

  const validMaxPlayers = [2, 4, 8, 16, 32];
  const maxPlayersValue = maxPlayers || 16;
  if (!validMaxPlayers.includes(maxPlayersValue)) {
    return res.status(400).json({ error: 'Invalid maxPlayers. Must be 2, 4, 8, 16, or 32' });
  }

  const groupCountValue = format === 'multi_bracket' ? (groupCount || 2) : 0;
  const bracketTypeValue = format === 'multi_bracket' ? (bracketType || 'group_knockout') : 'single';

  const result = db.prepare(`
    INSERT INTO tournaments (name, description, platform, format, max_players, best_of, prize_pool, registration_deadline, result_deadline_hours, rules, owner_id, status, group_count, bracket_type, image_url, entry_fee)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
  `).run(
    name,
    description ? sanitizeHtml(description, 2000) : null,
    sanitizeString(platform || 'efootball', 50),
    format,
    maxPlayersValue,
    bestOf || 1,
    prizePool ? sanitizeString(prizePool, 200) : null,
    registrationDeadline || null,
    resultDeadlineHours || 24,
    rules ? sanitizeHtml(rules, 5000) : null,
    req.user.id,
    groupCountValue,
    bracketTypeValue,
    imageUrl || null,
    entryFee || 0
  );

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.lastInsertRowid) as Tournament;

  // Real-time: notify all connected clients
  try { getIO().emit('tournament:created', {
    id: tournament.id,
    name: tournament.name,
    format: tournament.format,
    maxPlayers: tournament.max_players,
    status: tournament.status,
    imageUrl: tournament.image_url,
    createdAt: tournament.created_at,
  }); } catch { /* socket not initialized */ }

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
    imageUrl: tournament.image_url,
    entryFee: tournament.entry_fee,
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
      imageUrl: t.image_url,
      entryFee: t.entry_fee,
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
    groupCount: tournament.group_count || 0,
    bracketType: tournament.bracket_type || 'single',
    imageUrl: tournament.image_url,
    entryFee: tournament.entry_fee,
    createdAt: tournament.created_at
  });
}

export async function getParticipants(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const tournamentId = parseInt(id);

  if (isNaN(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Tournament | undefined;
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const participants = db.prepare(`
    SELECT p.id, p.user_id, p.seed, p.status as participant_status, p.joined_at, u.username
    FROM participants p
    JOIN users u ON p.user_id = u.id
    WHERE p.tournament_id = ?
    ORDER BY p.seed ASC
  `).all(tournamentId) as any[];

  res.json({
    participants: participants.map(p => ({
      id: p.id,
      userId: p.user_id,
      username: p.username,
      seed: p.seed,
      status: p.participant_status,
      joinedAt: p.joined_at
    }))
  });
}

export async function getStandings(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const tournamentId = parseInt(id);

  if (isNaN(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Tournament | undefined;
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  // Get all participants
  const participants = db.prepare(`
    SELECT p.id, p.user_id, p.seed, u.username
    FROM participants p
    JOIN users u ON p.user_id = u.id
    WHERE p.tournament_id = ?
    ORDER BY p.seed ASC
  `).all(tournamentId) as any[];

  // Get all completed matches
  const completedMatches = db.prepare(`
    SELECT * FROM matches 
    WHERE tournament_id = ? AND status = 'completed' AND winner_id IS NOT NULL
  `).all(tournamentId) as any[];

  // Calculate standings per player
  const stats: Record<number, any> = {};
  participants.forEach(p => {
    stats[p.user_id] = {
      userId: p.user_id,
      username: p.username,
      seed: p.seed,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  });

  completedMatches.forEach((m: any) => {
    const p1 = m.player1_id, p2 = m.player2_id;
    const s1 = m.player1_score, s2 = m.player2_score;
    if (!stats[p1] || !stats[p2]) return;
    stats[p1].played++;
    stats[p2].played++;
    stats[p1].goalsFor += s1;
    stats[p1].goalsAgainst += s2;
    stats[p2].goalsFor += s2;
    stats[p2].goalsAgainst += s1;
    if (s1 > s2) { stats[p1].wins++; stats[p1].points += 3; stats[p2].losses++; }
    else if (s2 > s1) { stats[p2].wins++; stats[p2].points += 3; stats[p1].losses++; }
    else { stats[p1].draws++; stats[p2].draws++; stats[p1].points += 1; stats[p2].points += 1; }
  });

  const standings = Object.values(stats).sort((a: any, b: any) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || a.seed - b.seed);

  res.json({ standings, matches: completedMatches.length, tournament: { name: tournament.name, format: tournament.format } });
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

  const { name, description, status, prizePool, registrationDeadline, rules, imageUrl } = req.body;

  db.prepare(`
    UPDATE tournaments SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      prize_pool = COALESCE(?, prize_pool),
      registration_deadline = COALESCE(?, registration_deadline),
      rules = COALESCE(?, rules),
      image_url = COALESCE(?, image_url)
    WHERE id = ?
  `).run(
    name || null,
    description || null,
    status || null,
    prizePool || null,
    registrationDeadline || null,
    rules || null,
    imageUrl !== undefined ? imageUrl : null,
    tournamentId
  );

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Tournament;

  // Real-time: notify tournament room
  try { getIO().to(`tournament:${tournamentId}`).emit('tournament:update', {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    status: updated.status,
    prizePool: updated.prize_pool,
    registrationDeadline: updated.registration_deadline,
    imageUrl: updated.image_url,
  }); } catch { /* socket not initialized */ }

  res.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    status: updated.status,
    prizePool: updated.prize_pool,
    registrationDeadline: updated.registration_deadline,
    imageUrl: updated.image_url
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

  // Real-time: notify all connected clients
  try { getIO().emit('tournament:deleted', { id: tournamentId }); } catch { /* socket not initialized */ }

  res.json({ message: 'Tournament deleted successfully' });
}

export async function joinTournament(req: AuthRequest, res: Response) {
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

  if (tournament.status !== 'registration_open' && tournament.status !== 'open') {
    return res.status(400).json({ error: 'Registration is closed for this tournament' });
  }

  const existingParticipant = db.prepare(
    'SELECT * FROM participants WHERE tournament_id = ? AND user_id = ?'
  ).get(tournamentId, req.user.id);

  if (existingParticipant) {
    return res.status(400).json({ error: 'You are already registered in this tournament' });
  }

  const participantCount = db.prepare(
    'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
  ).get(tournamentId) as { count: number };

  if (participantCount.count >= tournament.max_players) {
    return res.status(400).json({ error: 'Tournament is full' });
  }

  const seed = participantCount.count + 1;
  db.prepare(
    'INSERT INTO participants (tournament_id, user_id, seed, status) VALUES (?, ?, ?, ?)'
  ).run(tournamentId, req.user.id, seed, 'registered');

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id) as { username: string };

  logAdminAction(
    req.user.id,
    'tournament_join',
    `Joined tournament: ${tournament.name} (ID: ${tournamentId})`
  );

  res.json({ 
    message: 'Successfully joined tournament',
    participant: {
      id: Date.now(),
      userId: req.user.id,
      username: user.username,
      seed,
      status: 'registered',
      joinedAt: new Date().toISOString()
    }
  });

  // Real-time: notify tournament room
  try { getIO().to(`tournament:${tournamentId}`).emit('participant:joined', {
    tournamentId,
    participant: {
      userId: req.user.id,
      username: user.username,
      seed,
      status: 'registered',
    }
  }); } catch { /* socket not initialized */ }
}