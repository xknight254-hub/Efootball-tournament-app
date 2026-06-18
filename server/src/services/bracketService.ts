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
 * Generate standard single-elimination knockout bracket.
 * Seeds are placed so top seeds can't meet early.
 * Standard seeding: 1v16, 2v15, 3v14, etc. for 16 players.
 */
function generateKnockoutBracket(participants: Participant[], tournamentId: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const n = participants.length;
  const rounds = Math.log2(n);
  let matchCounter = 1;

  // Generate standard tournament seeding positions
  // For 16 players: positions are [1,16,8,9,5,12,4,13,6,11,3,14,7,10,2,15]
  const positions = generateSeedingPositions(n);

  // Round 1: pair positions
  for (let i = 0; i < n; i += 2) {
    const p1Idx = positions[i] - 1;  // convert 1-based seed to 0-based index
    const p2Idx = positions[i + 1] - 1;
    matches.push({
      round: 1,
      matchNumber: matchCounter++,
      player1_id: participants[p1Idx]?.user_id ?? null,
      player2_id: participants[p2Idx]?.user_id ?? null,
    });
  }

  // Future rounds: placeholders (TBD vs TBD)
  for (let r = 2; r <= rounds; r++) {
    const matchesInRound = n / Math.pow(2, r);
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
 * Generate standard seeding positions for knockout bracket.
 * Uses the standard single-elimination seeding algorithm.
 */
function generateSeedingPositions(n: number): number[] {
  if (n === 2) return [1, 2];

  // Build positions recursively
  // Start with [1, 2] then interleave: for each pair (a,b), produce (a, n+1-a, b, n+1-b)
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
 * Generate round-robin league bracket.
 * Every player plays every other player once.
 */
function generateLeagueBracket(participants: Participant[], tournamentId: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let matchCounter = 1;
  const n = participants.length;

  // Round-robin: each player plays every other player
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
 * Players are split into groups, play round-robin within group.
 * Top 2 from each group advance to knockout.
 */
function generateMultiBracket(participants: Participant[], tournamentId: number, groupCount: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let matchCounter = 1;
  const n = participants.length;
  const playersPerGroup = Math.ceil(n / groupCount);

  // Split into groups
  const groups: Participant[][] = [];
  for (let g = 0; g < groupCount; g++) {
    const start = g * playersPerGroup;
    const end = Math.min(start + playersPerGroup, n);
    groups.push(participants.slice(start, end));
  }

  // Group stage: round-robin within each group
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

  // Knockout stage: top 2 from each group = groupCount * 2 players (or less if not enough)
  const koPlayers = Math.min(groupCount * 2, n);
  const koRounds = Math.log2(koPlayers);
  const koGroupRound = groupCount + 1; // KO starts after group rounds

  if (koPlayers >= 2) {
    // Generate KO pairings (seeded: group winners vs runners-up from other groups)
    for (let i = 0; i < koPlayers; i += 2) {
      matches.push({
        round: koGroupRound,
        matchNumber: matchCounter++,
        player1_id: null, // TBD after group stage
        player2_id: null,
      });
    }

    // Future KO rounds
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
 * Players are paired by score in each round. N-1 rounds for N players (even).
 */
function generateSwissBracket(participants: Participant[], tournamentId: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let matchCounter = 1;
  const n = participants.length;
  const rounds = n % 2 === 0 ? n - 1 : n; // N-1 rounds for even N

  // First round: seeded pairings (1 vs N/2+1, 2 vs N/2+2, etc.)
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    matches.push({
      round: 1,
      matchNumber: matchCounter++,
      player1_id: participants[i]?.user_id ?? null,
      player2_id: participants[i + half]?.user_id ?? null,
    });
  }

  // Future rounds: TBD pairings (will be filled by bracket progression logic)
  for (let r = 2; r <= Math.min(rounds, 5); r++) { // Cap at 5 rounds for practicality
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
      throw new Error(`Unknown tournament format: ${tournament.format}`);
  }

  // Persist matches to database — include team names from participant registration
  const insertMatch = db.prepare(`
    INSERT INTO matches (tournament_id, round, match_number, player1_id, player2_id, player1_team, player2_team, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `);

  // Pre-fetch all participant team data
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
      match.player2_id ? teamMap.get(match.player2_id) || null : null
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

  // Only auto-start if still open/registration_open
  if (tournament.status !== 'open' && tournament.status !== 'registration_open') return false;

  const participantCount = db.prepare(
    'SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?'
  ).get(tournamentId) as { count: number };

  if (participantCount.count < tournament.max_players) return false;

  // All slots filled — generate bracket and update status!
  console.log(`[Bracket] Tournament ${tournamentId} is full (${participantCount.count}/${tournament.max_players}). Generating bracket...`);

  const matches = generateBracket(tournamentId);

  // Update tournament status
  db.prepare("UPDATE tournaments SET status = 'check_in' WHERE id = ?").run(tournamentId);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;

  console.log(`[Bracket] Generated ${matches.length} matches. Status → check_in`);

  // Notify all participants via socket
  try {
    emitTournamentUpdate(String(tournamentId), {
      type: 'tournament_starting',
      tournamentId,
      status: updated.status,
      message: `🔥 Tournament "${tournament.name}" is FULL! Check in for your matches.`,
      matchCount: matches.length,
    });

    // Also emit individual notifications
    const participantUsers = db.prepare(
      'SELECT user_id FROM participants WHERE tournament_id = ?'
    ).all(tournamentId) as { user_id: number }[];

    for (const p of participantUsers) {
      emitNotification(String(p.user_id), {
        type: 'tournament_starting',
        title: 'Tournament Starting!',
        message: `✅ You're in! "${tournament.name}" is full. Check in now.`,
        tournamentId,
      });
    }
  } catch (e) {
    console.error('[Bracket] Failed to emit notifications:', e);
  }

  return true;
}
