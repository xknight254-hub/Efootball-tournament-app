import crypto from 'crypto';
import db from '../db.js';
import { getIO } from '../socket/index.js';

// ─── Types ─────────────────────────────────────────────────────

export interface OCRTeams {
  leftTeam: string | null;
  rightTeam: string | null;
  leftScore: number | null;
  rightScore: number | null;
  matchTime: string | null;
  rawText: string;
  ocrConfidence: number;
}

export interface TeamValidationResult {
  match: 'both' | 'one' | 'none';
  leftPlayer: 'player1' | 'player2' | null;
  rightPlayer: 'player1' | 'player2' | null;
  confidence: number;
  details: string[];
}

export interface FraudCheckResult {
  score; // 0 = clean, 100 = certain fraud
  flags: FraudFlag[];
}

export interface FraudFlag {
  type;  // 'duplicate_screenshot' | 'cropped_image' | 'edited_metadata' | 'wrong_teams' | 'impossible_score' | 'reused_screenshot' | 'low_quality' | 'mismatch_fixture'
  severity; // 'low' | 'medium' | 'high' | 'critical'
  detail: string;
}

export interface VerificationSubmission {
  submissionId: number;
  matchId: number;
  uploaderId: number;
  screenshotUrl: string;
  screenshotHash: string;
  ocrTeams: OCRTeams;
  teamValidation: TeamValidationResult;
  fraudCheck: FraudCheckResult;
  overallConfidence: number;
  status: 'auto_approved' | 'opponent_review' | 'admin_review' | 'rejected';
  player1Score: number | null;
  player2Score: null;
  mappedWinner: 'player1' | 'player2' | null;
}

// ─── eFootball Known Teams Database ────────────────────────────
// Normalized aliases for fuzzy matching
const KNOWN_TEAMS: Record<string, string[]> = {
  'barcelona': ['barcelona', 'barca', 'barça', 'fcb', 'fc barcelona'],
  'real madrid': ['real madrid', 'madrid', 'rma'],
  'manchester united': ['manchester united', 'man united', 'man utd', 'mufc'],
  'manchester city': ['manchester city', 'man city', 'mcfc'],
  'liverpool': ['liverpool', 'lfc'],
  'arsenal': ['arsenal', 'afc'],
  'chelsea': ['chelsea', 'cfc'],
  'tottenham': ['tottenham', 'spurs', 'thfc'],
  'bayern munich': ['bayern munich', 'bayern', 'fcb munich'],
  'borussia dortmund': ['dortmund', 'bvb', 'bvb dortmund'],
  'juventus': ['juventus', 'juv', 'juve'],
  'ac milan': ['ac milan', 'milan', 'rossoneri'],
  'inter milan': ['inter milan', 'inter', 'nerazzurri'],
  'paris saint-germain': ['paris saint-germain', 'psg', 'paris sg'],
  'psg': ['psg', 'paris saint-germain'],
  'atletico madrid': ['atletico madrid', 'atletico', 'atm'],
  'sevilla': ['sevilla', 'sevilla fc'],
  'roma': ['roma', 'as roma'],
  'napoli': ['napoli', 'ssc napoli'],
  'ajax': ['ajax', 'ajax amsterdam'],
  'porto': ['porto', 'fc porto'],
  'benfica': ['benfica', 'sl benfica'],
  'celtic': ['celtic', 'celtic fc'],
  'rangers': ['rangers', 'rangers fc'],
  'galatasaray': ['galatasaray', 'gs'],
  'fenerbahce': ['fenerbahce', 'fb'],
  'besiktas': ['besiktas', 'bjk'],
  'al nassr': ['al nassr', 'nassr'],
  'al hilal': ['al hilal', 'hilal'],
  'inter miami': ['inter miami', 'miami'],
  'la galaxy': ['la galaxy', 'galaxy'],
  'new york city': ['new york city', 'nyc', 'nycfc'],
  'al ahly': ['al ahly', 'ahly'],
  'zamalek': ['zamalek'],
  'kaizer chiefs': ['kaizer chiefs', 'chiefs'],
  'orlando pirates': ['orlando pirates', 'pirates'],
  'mamelodi sundowns': ['mamelodi sundowns', 'sundowns'],
  'es tunis': ['es tunis', 'est'],
  'algeria': ['algeria', 'alger'],
  'nigeria': ['nigeria', 'super eagles'],
  'kenya': ['kenya', 'harambee stars'],
  'ghana': ['ghana', 'black stars'],
  'cameroon': ['cameroon', 'indomitable lions'],
  'senegal': ['senegal'],
  'morocco': ['morocco', 'atlas lions'],
  'egypt': ['egypt', 'pharaohs'],
  'brazil': ['brazil', 'brasil'],
  'argentina': ['argentina'],
  'france': ['france'],
  'germany': ['germany', 'deutschland'],
  'england': ['england'],
  'spain': ['spain', 'espana'],
  'italy': ['italy', 'italia'],
  'portugal': ['portugal'],
  'netherlands': ['netherlands', 'holland'],
  'belgium': ['belgium'],
};

/**
 * Normalize a team name for matching
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove special chars
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .trim();
}

/**
 * Match an OCR team name against known team names.
 * Returns the canonical name or null if no match.
 */
export function matchTeamName(ocrName: string): string | null {
  const normalized = normalizeTeamName(ocrName);

  // Direct match against known teams
  for (const [canonical, aliases] of Object.entries(KNOWN_TEAMS)) {
    if (aliases.includes(normalized)) return canonical;
  }

  // Fuzzy: check if normalized name contains any alias
  for (const [canonical, aliases] of Object.entries(KNOWN_TEAMS)) {
    for (const alias of aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        if (alias.length >= 3) return canonical;  // Avoid false positives on short names
      }
    }
  }

  // Return the cleaned original if no known match
  return normalized.length >= 3 ? normalized : null;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio (0-1) between two strings
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// ─── Team Validation Engine ────────────────────────────────────

/**
 * Validate OCR-extracted teams against fixture data from the database.
 * This is the CORE rule: player identity comes from the database, never from OCR.
 */
export function validateTeams(
  ocrLeftTeam: string | null,
  ocrRightTeam: string | null,
  fixturePlayer1Team: string | null,
  fixturePlayer2Team: string | null
): TeamValidationResult {
  const details: string[] = [];

  if (!ocrLeftTeam || !ocrRightTeam) {
    details.push('OCR could not extract both team names');
    return { match: 'none', leftPlayer: null, rightPlayer: null, confidence: 0, details };
  }

  if (!fixturePlayer1Team || !fixturePlayer2Team) {
    details.push('Fixture data missing team assignments');
    return { match: 'none', leftPlayer: null, rightPlayer: null, confidence: 0, details };
  }

  const ocrLeft = normalizeTeamName(ocrLeftTeam);
  const ocrRight = normalizeTeamName(ocrRightTeam);
  const fixP1 = normalizeTeamName(fixturePlayer1Team);
  const fixP2 = normalizeTeamName(fixturePlayer2Team);

  // Try direct matching first
  const directLeftP1 = ocrLeft === fixP1;
  const directLeftP2 = ocrLeft === fixP2;
  const directRightP1 = ocrRight === fixP1;
  const directRightP2 = ocrRight === fixP2;

  // Try fuzzy matching
  const fuzzyLeftP1 = similarity(ocrLeft, fixP1);
  const fuzzyLeftP2 = similarity(ocrLeft, fixP2);
  const fuzzyRightP1 = similarity(ocrRight, fixP1);
  const fuzzyRightP2 = similarity(ocrRight, fixP2);

  // Known team matching
  const knownOcrLeft = matchTeamName(ocrLeftTeam);
  const knownOcrRight = matchTeamName(ocrRightTeam);
  const knownFixP1 = matchTeamName(fixturePlayer1Team);
  const knownFixP2 = matchTeamName(fixturePlayer2Team);

  const knownLeftP1 = knownOcrLeft && knownFixP1 && knownOcrLeft === knownFixP1;
  const knownLeftP2 = knownOcrLeft && knownFixP2 && knownOcrLeft === knownFixP2;
  const knownRightP1 = knownOcrRight && knownFixP1 && knownOcrRight === knownFixP1;
  const knownRightP2 = knownOcrRight && knownFixP2 && knownOcrRight === knownFixP2;

  // Determine mapping with confidence scoring
  let leftPlayer: 'player1' | 'player2' | null = null;
  let rightPlayer: 'player1' | 'player2' | null = null;
  let matchConfidence = 0;

  // Strategy 1: Direct match (highest confidence)
  if (directLeftP1 && directRightP2) {
    leftPlayer = 'player1'; rightPlayer = 'player2';
    matchConfidence = 100;
    details.push(`Direct match: "${ocrLeftTeam}"=Player1, "${ocrRightTeam}"=Player2`);
  } else if (directLeftP2 && directRightP1) {
    leftPlayer = 'player2'; rightPlayer = 'player1';
    matchConfidence = 100;
    details.push(`Direct match (reversed): "${ocrLeftTeam}"=Player2, "${ocrRightTeam}"=Player1`);
  }
  // Strategy 2: Known team canonical match
  else if (knownLeftP1 && knownRightP2) {
    leftPlayer = 'player1'; rightPlayer = 'player2';
    matchConfidence = 95;
    details.push(`Known team match: "${knownOcrLeft}"=Player1, "${knownOcrRight}"=Player2`);
  } else if (knownLeftP2 && knownRightP1) {
    leftPlayer = 'player2'; rightPlayer = 'player1';
    matchConfidence = 95;
    details.push(`Known team match (reversed): "${knownOcrLeft}"=Player2`);
  }
  // Strategy 3: Fuzzy match (threshold 0.75)
  else {
    const bestLeft = Math.max(fuzzyLeftP1, fuzzyLeftP2);
    const bestRight = Math.max(fuzzyRightP1, fuzzyRightP2);

    if (fuzzyLeftP1 >= 0.75 && fuzzyRightP2 >= 0.75 && fuzzyLeftP1 > fuzzyLeftP2 && fuzzyRightP2 > fuzzyRightP1) {
      leftPlayer = 'player1'; rightPlayer = 'player2';
      matchConfidence = Math.round((fuzzyLeftP1 + fuzzyRightP2) / 2 * 100);
      details.push(`Fuzzy match: L→P1(${fuzzyLeftP1.toFixed(2)}), R→P2(${fuzzyRightP2.toFixed(2)})`);
    } else if (fuzzyLeftP2 >= 0.75 && fuzzyRightP1 >= 0.75 && fuzzyLeftP2 > fuzzyLeftP1 && fuzzyRightP1 > fuzzyRightP2) {
      leftPlayer = 'player2'; rightPlayer='player1';
      matchConfidence = Math.round((fuzzyLeftP2 + fuzzyRightP1) / 2 * 100);
      details.push(`Fuzzy match (reversed): L→P2(${fuzzyLeftP2.toFixed(2)}), R→P1(${fuzzyRightP1.toFixed(2)})`);
    } else {
      details.push(`Team mismatch: OCR="${ocrLeft}" vs "${ocrRight}" | Fixture="${fixP1}" vs "${fixP2}"`);
      matchConfidence = 0;
    }
  }

  const match: 'both' | 'one' | 'none' =
    leftPlayer && rightPlayer ? 'both' :
    leftPlayer || rightPlayer ? 'one' : 'none';

  return { match, leftPlayer, rightPlayer, confidence: matchConfidence, details };
}

// ─── Fraud Detection Engine ────────────────────────────────────

/**
 * Detect duplicate/reused screenshots using perceptual hash
 */
function detectDuplicateScreenshot(userId: number, screenshotHash: string): FraudFlag | null {
  const existing = db.prepare(`
    SELECT rs.id, rs.uploader_id, rs.match_id
    FROM result_submissions rs
    WHERE rs.screenshot_hash = ?
    AND rs.created_at > datetime('now', '-7 days')
  `).get(screenshotHash) as any;

  if (!existing) return null;

  // Same user reusing a screenshot
  if (existing.uploader_id === userId) {
    return {
      type: 'reused_screenshot',
      severity: 'high',
      detail: `Identical screenshot previously submitted for match #${existing.match_id}`,
    };
  }

  // Different user submitting same screenshot (possible theft/fabrication)
  return {
    type: 'duplicate_screenshot',
    severity: 'critical',
    detail: `Identical screenshot already submitted by different user for match #${existing.match_id}`,
  };
}

/**
 * Check for impossible scores
 */
function checkImpossibleScores(leftScore: number, rightScore: number): FraudFlag | null {
  // eFootball matches are typically 2-5 minutes per half
  // Scores above 20 are extremely suspicious
  if (leftScore > 20 || rightScore > 20) {
    return {
      type: 'impossible_score',
      severity: 'medium',
      detail: `Score ${leftScore}-${rightScore} seems unusually high for eFootball`,
    };
  }
  return null;
}

/**
 * Run full fraud detection pipeline
 */
export function detectFraud(
  userId: number,
  matchId: number,
  screenshotHash: string,
  teamValidation: TeamValidationResult,
  ocrLeftScore: number | null,
  ocrRightScore: number | null
): FraudCheckResult {
  const flags: FraudFlag[] = [];

  // 1. Duplicate screenshot check
  const dupFlag = detectDuplicateScreenshot(userId, screenshotHash);
  if (dupFlag) flags.push(dupFlag);

  // 2. Team mismatch check
  if (teamValidation.match === 'none') {
    flags.push({
      type: 'wrong_teams',
      severity: 'high',
      detail: `OCR teams do not match fixture teams: ${teamValidation.details.join('; ')}`,
    });
  }

  // 3. Impossible score check
  if (ocrLeftScore !== null && ocrRightScore !== null) {
    const scoreFlag = checkImpossibleScores(ocrLeftScore, ocrRightScore);
    if (scoreFlag) flags.push(scoreFlag);
  }

  // 4. Check submission frequency (rate limiting per user)
  const recentCount = db.prepare(`
    SELECT COUNT(*) as count FROM result_submissions
    WHERE uploader_id = ? AND created_at > datetime('now', '-1 hour')
  `).get(userId) as any;

  if (recentCount.count > 10) {
    flags.push({
      type: 'suspicious_frequency',
      severity: 'medium',
      detail: `${recentCount.count} submissions in the last hour`,
    });
  }

  // Calculate aggregate fraud score
  let fraudScore = 0;
  for (const flag of flags) {
    switch (flag.severity) {
      case 'critical': fraudScore += 40; break;
      case 'high': fraudScore += 25; break;
      case 'medium': fraudScore += 15; break;
      case 'low': fraudScore += 5; break;
    }
  }

  // Log fraud flags to database
  for (const flag of flags) {
    db.prepare(`
      INSERT INTO fraud_logs (submission_id, user_id, match_id, detection_type, severity, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(null, userId, matchId, flag.type, flag.severity, flag.detail);
  }

  return { score: Math.min(fraudScore, 100), flags };
}

// ─── Confidence Scoring Engine ─────────────────────────────────

/**
 * Calculate overall verification confidence score.
 * Weighted combination of multiple signals.
 */
export function calculateConfidence(
  teamValidation: TeamValidationResult,
  ocrConfidence: number,
  fraudCheck: FraudCheckResult,
  hasScore: boolean
): number {
  let score = 0;

  // Team match confidence (40% weight)
  score += teamValidation.confidence * 0.40;

  // OCR text confidence (20% weight)
  score += Math.min(ocrConfidence, 100) * 0.20;

  // Score visibility (20% weight)
  if (hasScore) score += 20;

  // Fraud penalty (up to -20%)
  score -= fraudCheck.score * 0.20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Main Verification Pipeline ────────────────────────────────

/**
 * Process a verification submission end-to-end.
 * This is the main entry point for the verification system.
 */
export async function processVerification(
  matchId: number,
  uploaderId: number,
  screenshotUrl: string,
  screenshotBuffer: Buffer,
  ocrTeams: OCRTeams
): Promise<VerificationSubmission> {
  // 1. Get fixture data (source of truth for player identity)
  const fixture = db.prepare(`
    SELECT id, player1_id, player2_id, player1_team, player2_team, status
    FROM matches WHERE id = ?
  `).get(matchId) as any;

  if (!fixture) throw new Error('Match not found');
  if (fixture.status === 'completed') throw new Error('Match already completed');

  // Verify uploader is a participant
  if (fixture.player1_id !== uploaderId && fixture.player2_id !== uploaderId) {
    throw new Error('You are not a participant in this match');
  }

  // 2. Generate screenshot hash for duplicate detection
  const screenshotHash = crypto.createHash('sha256').update(screenshotBuffer).digest('hex');

  // 3. Validate teams against fixture data
  const teamValidation = validateTeams(
    ocrTeams.leftTeam,
    ocrTeams.rightTeam,
    fixture.player1_team,
    fixture.player2_team
  );

  // 4. Run fraud detection
  const fraudCheck = detectFraud(
    uploaderId, matchId, screenshotHash, teamValidation,
    ocrTeams.leftScore, ocrTeams.rightScore
  );

  // 5. Calculate overall confidence
  const hasScore = ocrTeams.leftScore !== null && ocrTeams.rightScore !== null;
  const overallConfidence = calculateConfidence(teamValidation, ocrTeams.ocrConfidence, fraudCheck, hasScore);

  // 6. Determine mapped scores (player identity from fixture, NOT OCR position)
  let player1Score: number | null = null;
  let player2Score: number | null = null;

  if (hasScore && teamValidation.match === 'both') {
    if (teamValidation.leftPlayer === 'player1') {
      player1Score = ocrTeams.leftScore;
      player2Score = ocrTeams.rightScore;
    } else {
      player1Score = ocrTeams.rightScore;
      player2Score = ocrTeams.leftScore;
    }
  }

  // 7. Determine mapped winner (from fixture data + mapped scores)
  let mappedWinner: 'player1' | 'player2' | null = null;
  if (player1Score !== null && player2Score !== null) {
    if (player1Score > player2Score) mappedWinner = 'player1';
    else if (player2Score > player1Score) mappedWinner = 'player2';
  }

  // 8. Determine verification status based on confidence + fraud
  let status: VerificationSubmission['status'];
  if (fraudCheck.score >= 60) {
    status = 'rejected';
  } else if (overallConfidence >= 90 && fraudCheck.score < 20) {
    status = 'auto_approved';
  } else if (overallConfidence >= 70 && fraudCheck.score < 40) {
    status = 'opponent_review';
  } else {
    status = 'admin_review';
  }

  // 9. Store submission
  const result = db.prepare(`
    INSERT INTO result_submissions (
      match_id, uploader_id, screenshot_url, screenshot_hash,
      ocr_team_left, ocr_team_right, ocr_score_left, ocr_score_right,
      ocr_match_time, ocr_raw_text, ocr_confidence, verification_confidence,
      team_match_result, fraud_score, fraud_flags, verification_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    matchId, uploaderId, screenshotUrl, screenshotHash,
    ocrTeams.leftTeam, ocrTeams.rightTeam, ocrTeams.leftScore, ocrTeams.rightScore,
    ocrTeams.matchTime, ocrTeams.rawText, ocrTeams.ocrConfidence, overallConfidence,
    teamValidation.match, fraudCheck.score,
    JSON.stringify(fraudCheck.flags.map(f => f.type)), status
  );

  const submissionId = result.lastInsertRowid as number;

  // 10. Update fraud log entries with submission ID
  db.prepare(`
    UPDATE fraud_logs SET submission_id = ? WHERE match_id = ? AND user_id = ? AND submission_id IS NULL
  `).run(submissionId, matchId, uploaderId);

  // 11. Auto-approve if high confidence
  if (status === 'auto_approved' && mappedWinner) {
    const winnerId = mappedWinner === 'player1' ? fixture.player1_id : fixture.player2_id;
    db.prepare(`
      UPDATE matches SET
        player1_score = ?, player2_score = ?,
        winner_id = ?, status = 'completed',
        confirmation_status = 'confirmed',
        submitted_by = ?, screenshot_url = ?,
        submitted_at = CURRENT_TIMESTAMP,
        confirmed_at = CURRENT_TIMESTAMP,
        verification_status = 'verified'
      WHERE id = ?
    `).run(player1Score, player2Score, winnerId, uploaderId, screenshotUrl, matchId);
  }

  // 12. Emit real-time notifications
  try {
    const notificationRecipient = uploaderId === fixture.player1_id ? fixture.player2_id : fixture.player1_id;

    if (status === 'opponent_review' && notificationRecipient) {
      // Notify opponent to confirm
      getIO().to(`user:${notificationRecipient}`).emit('notification:new', {
        type: 'result_submission',
        title: 'Match Result Submitted',
        body: `Your opponent submitted a result. Please confirm or dispute.`,
        matchId,
        submissionId,
        requiresAction: 'confirm_result',
      });

      // Also persist notification
      db.prepare(`
        INSERT INTO notifications (user_id, title, body, type)
        VALUES (?, ?, ?, 'result_submission')
      `).run(
        notificationRecipient,
        'Match Result Submitted',
        `Your opponent submitted a result for match #${matchId}. Please confirm or dispute.`
      );
    }

    if (status === 'admin_review' || status === 'rejected') {
      // Notify admins
      getIO().emit('notification:new', {
        type: 'admin_review_required',
        title: 'Verification Requires Review',
        body: `Match #${matchId} submission flagged for admin review (confidence: ${overallConfidence}%)`,
        matchId,
        submissionId,
        requiresAction: 'admin_review',
      });
    }

    // Update match room
    getIO().to(`match:${matchId}`).emit('match:update', {
      matchId,
      status: status === 'auto_approved' ? 'completed' : 'pending_confirmation',
      verificationStatus: status,
    });

    getIO().to(`user:${uploaderId}`).emit('notification:new', {
      type: 'submission_received',
      title: 'Result Received',
      body: status === 'auto_approved'
        ? 'Your result was auto-approved!'
        : status === 'opponent_review'
          ? 'Waiting for opponent confirmation.'
          : 'Your result is under review.',
      matchId,
      verificationStatus: status,
    });
  } catch (e) {
    console.error('[Verification] Socket emit failed:', e);
  }

  return {
    submissionId,
    matchId,
    uploaderId,
    screenshotUrl,
    screenshotHash,
    ocrTeams,
    teamValidation,
    fraudCheck,
    overallConfidence,
    status,
    player1Score,
    player2Score,
    mappedWinner,
  };
}

/**
 * Opponent confirms or disputes a submitted result
 */
export function handleOpponentResponse(
  matchId: number,
  opponentId: number,
  action: 'confirm' | 'dispute'
): { success: boolean; message: string; match?: any } {
  const fixture = db.prepare(`
    SELECT id, player1_id, player2_id, player1_team, player2_team, status
    FROM matches WHERE id = ?
  `).get(matchId) as any;

  if (!fixture) return { success: false, message: 'Match not found' };
  if (fixture.player1_id !== opponentId && fixture.player2_id !== opponentId) {
    return { success: false, message: 'Not a participant' };
  }

  // Get latest submission for this match
  const submission = db.prepare(`
    SELECT * FROM result_submissions
    WHERE match_id = ? AND verification_status IN ('opponent_review', 'pending')
    ORDER BY created_at DESC LIMIT 1
  `).get(matchId) as any;

  if (!submission) return { success: false, message: 'No pending submission found' };

  if (action === 'confirm') {
    // Parse the submission scores
    // We stored player1/player2 mapped scores, but the submission has OCR teams
    // The match record already has the scores from auto_approved path, but for opponent_review
    // we need to reconstruct from the submission's team mapping
    const teamResult = submission.team_match_result;

    if (teamResult !== 'both') {
      return { success: false, message: 'Cannot confirm: team mapping incomplete' };
    }

    // Get the fixture to map scores correctly
    const ocrLeftScore = submission.ocr_score_left;
    const ocrRightScore = submission.ocr_score_right;

    // We need to re-derive player1/player2 scores from the team validation
    // The submission stores OCR left/right teams, not player mapping
    // So we re-run validation to get the mapping
    const teamVal = validateTeams(
      submission.ocr_team_left,
      submission.ocr_team_right,
      fixture.player1_team,
      fixture.player2_team
    );

    let p1Score: number | null = null;
    let p2Score: number | null = null;

    if (teamVal.leftPlayer === 'player1') {
      p1Score = ocrLeftScore;
      p2Score = ocrRightScore;
    } else {
      p1Score = ocrRightScore;
      p2Score = ocrLeftScore;
    }

    let winnerId = null;
    if (p1Score !== null && p2Score !== null) {
      if (p1Score > p2Score) winnerId = fixture.player1_id;
      else if (p2Score > p1Score) winnerId = fixture.player2_id;
    }

    // All draws just finalize without winner (or could extend — scope: confirm/draw)
    db.prepare(`
      UPDATE matches SET
        player1_score = ?, player2_score = ?,
        winner_id = ?, status = 'completed',
        confirmation_status = 'confirmed',
        confirmed_at = CURRENT_TIMESTAMP,
        verification_status = 'verified'
      WHERE id = ?
    `).run(p1Score, p2Score, winnerId, matchId);

    db.prepare(`
      UPDATE result_submissions SET verification_status = 'confirmed', reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(submission.id);

    const updated = db.prepare(`
      SELECT m.*, p1.username as player1_username, p2.username as player2_username, w.username as winner_username
      FROM matches m
      LEFT JOIN users p1 ON m.player1_id = p1.id
      LEFT JOIN users p2 ON m.player2_id = p2.id
      LEFT JOIN users w ON m.winner_id = w.id
      WHERE m.id = ?
    `).get(matchId) as any;

    // Notify both players
    try {
      getIO().to(`match:${matchId}`).emit('match:update', {
        matchId, status: 'completed', confirmationStatus: 'confirmed', winnerId,
      });
      getIO().to(`user:${fixture.player1_id}`).to(`user:${fixture.player2_id}`).emit('notification:new', {
        type: 'match_completed',
        title: 'Match Confirmed',
        body: `Result confirmed: ${p1Score}-${p2Score}`,
        matchId,
      });
    } catch { /* socket not initialized */ }

    return { success: true, message: 'Result confirmed', match: updated };

  } else {
    // Dispute
    db.prepare(`
      UPDATE matches SET
        confirmation_status = 'disputed',
        status = 'disputed'
      WHERE id = ?
    `).run(matchId);

    db.prepare(`
      UPDATE result_submissions SET verification_status = 'disputed', reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(submission.id);

    // Create dispute record
    db.prepare(`
      INSERT INTO fraud_logs (submission_id, user_id, match_id, detection_type, severity, details)
      VALUES (?, ?, ?, ?, 'high', 'Opponent disputed result')
    `).run(submission.id, opponentId, matchId);

    // Notify admins
    try {
      getIO().to(`match:${matchId}`).emit('match:update', {
        matchId, status: 'disputed', confirmationStatus: 'disputed',
      });
      getIO().emit('notification:new', {
        type: 'dispute_created',
        title: 'Match Disputed',
        body: `Match #${matchId} disputed by opponent. Admin review required.`,
        matchId,
        requiresAction: 'admin_review',
      });
    } catch { /* socket not initialized */ }

    return { success: true, message: 'Dispute created. Admin will review.' };
  }
}

/**
 * Admin resolves a dispute
 */
export function adminResolveDispute(
  matchId: number,
  adminId: number,
  winnerId: number,
  player1Score: number,
  player2Score: number
): { success: boolean; message: string } {
  const fixture = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as any;
  if (!fixture) return { success: false, message: 'Match not found' };
  if (fixture.status !== 'disputed' && fixture.confirmation_status !== 'disputed') {
    return { success: false, message: 'Match is not disputed' };
  }

  if (winnerId !== fixture.player1_id && winnerId !== fixture.player2_id) {
    return { success: false, message: 'Winner must be a match participant' };
  }

  db.prepare(`
    UPDATE matches SET
      player1_score = ?, player2_score = ?,
      winner_id = ?, status = 'completed',
      confirmation_status = 'admin_resolved',
      confirmed_at = CURRENT_TIMESTAMP,
      verification_status = 'admin_verified'
    WHERE id = ?
  `).run(player1Score, player2Score, winnerId, matchId);

  db.prepare(`
    UPDATE result_submissions SET
      verification_status = 'admin_resolved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
    WHERE match_id = ? AND verification_status IN ('opponent_review', 'disputed', 'admin_review')
  `).run(adminId, matchId);

  db.prepare(`
    INSERT INTO admin_logs (admin_id, action, details)
    VALUES (?, 'dispute_resolve', ?)
  `).run(adminId, `Resolved match #${matchId}: ${player1Score}-${player2Score}, winner=user#${winnerId}`);

  try {
    getIO().to(`match:${matchId}`).emit('match:update', {
      matchId, status: 'completed', confirmationStatus: 'admin_resolved', winnerId,
    });
  } catch { /* socket not initialized */ }

  return { success: true, message: 'Dispute resolved' };
}
