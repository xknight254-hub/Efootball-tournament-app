import db from '../db.js';
import { emitTournamentUpdate, emitNotification } from './socketService.js';

export interface Participant {
  id: number;
  user_id: number;
  username: string;
  seed: number;
}

export interface BracketMatch {
  round: number;
  matchNumber: number;
  player1_id: number | null;
  player2_id: number | null;
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Compute the next power of 2 >= n.
 */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate standard seeding positions for knockout bracket.
 * Uses the standard single-elimination seeding algorithm.
 */
function generateSeedingPositions(n: number): number[] {
  if (n === 2) return [1, 2];

  let positions = [1, 2];

  while (positions.length < n) {
    const next: number[] = [];
    const total = positions.length * 2;
    for (const p of positions) {
      next.push(p);
      next.push(total + 1 - p);
    }
    positions = next;
  }

  return positions;
}

/**
 * Generate standard single-elimination knockout bracket with bye handling.
 *
 * For non-power-of-2 participant counts, top seeds receive byes in round 1.
 * Byes are handled by advancing the player automatically to the next round.
 */
function generateKnockoutBracket(participants: Participant[], tournamentId: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const n = participants.length;
  const bracketSize = nextPowerOf2(n);    // e.g., 10 → 16
  const rounds = Math.log2(bracketSize);  // e.g., 16 → 4
  const byeCount = bracketSize - n;       // e.g., 16 - 10 = 6 byes
  let matchCounter = 1;

  // Generate seeding positions for the full bracket size
  const positions = generateSeedingPositions(bracketSize);

  // Round 1: pair positions, but top seeds get byes
  // Standard: first `byeCount * 2` seeds get byes (they sit out round 1)
  // We handle byes by putting a null opponent — the player auto-advances
  for (let i = 0; i < bracketSize; i += 2) {
    const p1Pos = positions[i] - 1;
    const p2Pos = positions[i + 1] - 1;

    const p1Id = p1Pos < n ? participants[p1Pos].user_id : null;
    const p2Id = p2Pos < n ? participants[p2Pos].user_id : null;

    // If both are null, this match never happens (shouldn't occur with correct seeding)
    if (p1Id === null && p2Id === null) continue;

    // If one is null, it's a bye — the real player advances automatically
    // Store a placeholder match where the non-null player is player1
    matches.push({
      round: 1,
      matchNumber: matchCounter++,
      player1_id: p1Id,
      player2_id: p2Id,
    });
  }

  // Future rounds: placeholders (TBD vs TBD)
  // With byes, the number of round-2 matches = bracketSize / 2 - Math.floor(byeCount / 2)
  // But simpler: just use bracketSize / 2 for round 1, then halve each round
  for (let r = 2; r <= rounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r);
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        round: r,
        matchNumber: matchCounter++,
        player1_id: null,
        player2_id: null,
      });
    }
  }

  return matches;
}

/**
 * Generate round-robin league bracket.
 */
function generateLeagueBracket(participants: Participant[], tournamentId: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let matchCounter = 1;
  const n = participants.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({
        round: 1,
        matchNumber: matchCounter++,
        player1_id: participants[i].user_id,
        player2_id: participants[j].user_id,
      });
    }
  }

  return matches;
}

/**
 * Generate multi-bracket: group stage then knockout.
 */
function generateMultiBracket(participants: Participant[], tournamentId: number, groupCount: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let matchCounter = 1;
  const n = participants.length;
  const playersPerGroup = Math.ceil(n / groupCount);

  const groups: Participant[][] = [];
  for (let g = 0; g < groupCount; g++) {
    const start = g * playersPerGroup;
    const end = Math.min(start + playersPerGroup, n);
    groups.push(participants.slice(start, end));
  }

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        matches.push({
          round: g + 1,
          matchNumber: matchCounter++,
          player1_id: group[i].user_id,
          player2_id: group[j].user_id,
        });
      }
    }
  }

  const koPlayers = Math.min(groupCount * 2, n);
  const koRounds = Math.log2(nextPowerOf2(koPlayers));
  const koGroupRound = groupCount + 1;

  if (koPlayers >= 2) {
    for (let i = 0; i < koPlayers; i += 2) {
      matches.push({
        round: koGroupRound,
        matchNumber: matchCounter++,
        player1_id: null,
        player2_id: null,
      });
    }

    for (let r = 1; r < koRounds; r++) {
      const matchesInRound = koPlayers / Math.pow(2, r + 1);
      for (let m = 0; m < matchesInRound; m++) {
        matches.push({
          round: koGroupRound + r,
          matchNumber: matchCounter++,
          player1_id: null,
          player2_id: null,
        });
      }
    }
  }

  return matches;
}

/**
 * Generate Swiss-system bracket.
 */
function generateSwissBracket(participants: Participant[], tournamentId: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let matchCounter = 1;
  const n = participants.length;
  const rounds = n % 2 === 0 ? n - 1 : n;

  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    matches.push({
      round: 1,
      matchNumber: matchCounter++,
      player1_id: participants[i]?.user_id ?? null,
      player2_id: participants[i + half]?.user_id ?? null,
    });
  }

  for (let r = 2; r <= Math.min(rounds, 5); r++) {
    const matchesInRound = Math.floor(n / 2);
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        round: r,
        matchNumber: matchCounter++,
        player1_id: null,
        player2_id: null,
      });
    }
  }

  return matches;
}

/**
 * Main bracket generation entry point.
 * Generates matches based on tournament format and persists them.
 */
export function generateBracket(tournamentId: number): BracketMatch[] {
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) throw new Error('Tournament not found');

  // Compute match deadline: created_at + result_deadline_hours
  const deadlineHours = tournament.result_deadline_hours || 24;
  const deadlineDate = new Date();
  deadlineDate.setHours(deadlineDate.getHours() + deadlineHours);
  const deadlineStr = deadlineDate.toISOString().replace('T', ' ').split('.')[0];

  const participants = db.prepare(`
    SELECT p.id, p.user_id, p.seed, u.username
    FROM participants p
    JOIN users u ON p.user_id = u.id
    WHERE p.tournament_id = ?
    ORDER BY p.seed ASC
  `).all(tournamentId) as Participant[];

  if (participants.length === 0) {
    throw new Error('No participants in tournament');
  }

  let matches: BracketMatch[];

  switch (tournament.format) {
    case 'knockout':
      matches = generateKnockoutBracket(participants, tournamentId);
      break;
    case 'league':
      matches = generateLeagueBracket(participants, tournamentId);
      break;
    case 'multi_bracket':
      matches = generateMultiBracket(participants, tournamentId, tournament.group_count || 2);
      break;
    case 'swiss':
      matches = generateSwissBracket(participants, tournamentId);
      break;
    default:
      throw new Error('Unknown tournament format: ' + tournament.format);
  }

  const insertMatch = db.prepare(`
    INSERT INTO matches (tournament_id, round, match_number, player1_id, player2_id, player1_team, player2_team, status, deadline_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  const participantTeams = db.prepare(`
    SELECT user_id, team_name FROM participants WHERE tournament_id = ?
  `).all(tournamentId) as { user_id: number; team_name: string | null }[];

  const teamMap = new Map(participantTeams.map(p => [p.user_id, p.team_name]));

  for (const match of matches) {
    insertMatch.run(
      tournamentId,
      match.round,
      match.matchNumber,
      match.player1_id,
      match.player2_id,
      match.player1_id ? teamMap.get(match.player1_id) || null : null,
      match.player2_id ? teamMap.get(match.player2_id) || null : null,
      deadlineStr
    );
  }

  return matches;
}

/**
 * Auto-start tournament when all slots are filled.
 * Called from joinTournament after successful join.
 */
export function checkAndStartTournament(tournamentId: number): boolean {
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) return false;

  if (tournament.status !== 'open' && tournament.status !== 'registration_open') return false;

  const participantCount = db.prepare(
    'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
  ).get(tournamentId) as { count: number };

  if (participantCount.count < tournament.max_players) return false;

  console.log('[Bracket] Tournament ' + tournamentId + ' is full (' + participantCount.count + '/' + tournament.max_players + '). Generating bracket...');

  const matches = generateBracket(tournamentId);

  db.prepare("UPDATE tournaments SET status = 'check_in' WHERE id = ?").run(tournamentId);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;

  console.log('[Bracket] Generated ' + matches.length + ' matches. Status check_in');

  try {
    emitTournamentUpdate(String(tournamentId), {
      type: 'tournament_starting',
      tournamentId,
      status: updated.status,
      message: 'Tournament "' + tournament.name + '" is FULL! Check in for your matches.',
      matchCount: matches.length,
    });

    const participantUsers = db.prepare(
      'SELECT user_id FROM participants WHERE tournament_id = ?'
    ).all(tournamentId) as { user_id: number }[];

    for (const p of participantUsers) {
      emitNotification(String(p.user_id), {
        type: 'tournament_starting',
        title: 'Tournament Starting!',
        message: 'You\'re in! "' + tournament.name + '" is full. Check in now.',
        tournamentId,
      });
    }
  } catch (e) {
    console.error('[Bracket] Failed to emit notifications:', e);
  }

  return true;
}