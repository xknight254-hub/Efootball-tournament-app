import { Response } from 'express';
import multer from 'multer';
import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import crypto from 'crypto';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import { getWorker, parseEFOTBScreenshot } from '../services/ocrService.js';
import {
  processVerification,
  handleOpponentResponse,
  adminResolveDispute,
  validateTeams,
} from '../services/verificationService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

// ─── Helpers ───────────────────────────────────────────────────

function saveScreenshot(buffer: Buffer, matchId: number): string {
  const dir = join(process.cwd(), 'server', 'client', 'public', 'screenshots', String(matchId));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ext = buffer[0] === 0x89 ? 'png' : buffer[0] === 0xFF ? 'jpg' : 'webp';
  const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  writeFileSync(join(dir, filename), buffer);
  return `/screenshots/${matchId}/${filename}`;
}

// ─── POST /api/matches/:id/verify ──────────────────────────────
// Full verification flow: upload screenshot → OCR → validate → submit
export async function verifyResult(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'Screenshot required' });
  }

  try {
    const buffer = req.file.buffer;

    // 1. Run OCR
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 _-.%/:()\'àáâãäåèéêëìíîïòóôõöùúûüýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝ',
    } as any);

    const { data: { text, confidence: ocrRawConfidence } } = await worker.recognize(buffer);

    if (!text || text.trim().length < 3) {
      return res.status(422).json({
        error: 'Could not extract text from image',
        suggestion: 'Ensure the screenshot is clear and shows the match result screen',
      });
    }

    // 2. Parse eFootball data from OCR text
    const parsed = parseEFOTBScreenshot(text);

    // 3. Build OCR teams object
    const ocrTeams = {
      leftTeam: parsed.player1Name,
      rightTeam: parsed.player2Name,
      leftScore: parsed.player1Score,
      rightScore: parsed.player2Score,
      matchTime: parsed.matchTime,
      rawText: text,
      ocrConfidence: (ocrRawConfidence || 0) / 100 * 100,
    };

    // 4. Save screenshot
    const screenshotUrl = saveScreenshot(buffer, matchId);

    // 5. Run full verification pipeline
    const result = await processVerification(
      matchId,
      req.user.id,
      screenshotUrl,
      buffer,
      ocrTeams
    );

    res.json({
      success: true,
      verification: {
        submissionId: result.submissionId,
        status: result.status,
        confidence: result.overallConfidence,
        teamMatch: result.teamValidation.match,
        teamMatchConfidence: result.teamValidation.confidence,
        teamDetails: result.teamValidation.details,
        fraudScore: result.fraudCheck.score,
        fraudFlags: result.fraudCheck.flags,
        mappedScores: result.player1Score !== null ? {
          player1: result.player1Score,
          player2: result.player2Score,
        } : null,
        mappedWinner: result.mappedWinner,
      },
      ocr: {
        raw: text,
        parsed: {
          leftTeam: parsed.player1Name,
          rightTeam: parsed.player2Name,
          leftScore: parsed.player1Score,
          rightScore: parsed.player2Score,
          matchTime: parsed.matchTime,
          orientation: parsed.orientation,
        },
      },
      message: result.status === 'auto_approved'
        ? 'Result auto-approved and match completed!'
        : result.status === 'opponent_review'
          ? 'Result submitted. Waiting for opponent confirmation.'
          : result.status === 'rejected'
            ? 'Result rejected due to fraud detection.'
            : 'Result submitted for admin review.',
    });
  } catch (error: any) {
    console.error('[Verify] Error:', error);
    res.status(500).json({ error: 'Verification failed', details: error.message });
  }
}

// ─── POST /api/matches/:id/ocr-only ────────────────────────────
// OCR-only endpoint: extract data without submitting (for preview)
export async function ocrOnly(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'Screenshot required' });
  }

  try {
    const buffer = req.file.buffer;
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 _-.%/:()\'àáâãäåèéêëìíîïòóôõöùúûüýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝ',
    } as any);

    const { data: { text, confidence: ocrRawConfidence } } = await worker.recognize(buffer);

    if (!text || text.trim().length < 3) {
      return res.status(422).json({ error: 'Could not extract text from image' });
    }

    const parsed = parseEFOTBScreenshot(text);

    // Get fixture data for team validation preview
    const fixture = db.prepare(`
      SELECT id, player1_id, player2_id, player1_team, player2_team
      FROM matches WHERE id = ?
    `).get(matchId) as any;

    let teamValidation = null;
    if (fixture && fixture.player1_team && fixture.player2_team) {
      teamValidation = validateTeams(
        parsed.player1Name,
        parsed.player2Name,
        fixture.player1_team,
        fixture.player2_team
      );
    }

    res.json({
      success: true,
      ocr: {
        raw: text,
        parsed: {
          leftTeam: parsed.player1Name,
          rightTeam: parsed.player2Name,
          leftScore: parsed.player1Score,
          rightScore: parsed.player2Score,
          matchTime: parsed.matchTime,
          orientation: parsed.orientation,
        },
        confidence: (ocrRawConfidence || 0) / 100 * 100,
      },
      teamValidation: teamValidation ? {
        match: teamValidation.match,
        confidence: teamValidation.confidence,
        details: teamValidation.details,
        leftPlayer: teamValidation.leftPlayer,
        rightPlayer: teamValidation.rightPlayer,
      } : null,
      fixture: fixture ? {
        player1Team: fixture.player1_team,
        player2Team: fixture.player2_team,
      } : null,
    });
  } catch (error: any) {
    console.error('[OCR Only] Error:', error);
    res.status(500).json({ error: 'OCR failed', details: error.message });
  }
}

// ─── POST /api/matches/:id/confirm ─────────────────────────────
// Opponent confirms a submitted result
export async function confirmSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

  const result = handleOpponentResponse(matchId, req.user.id, 'confirm');

  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  res.json({
    success: true,
    message: result.message,
    match: result.match ? {
      id: result.match.id,
      player1Score: result.match.player1_score,
      player2Score: result.match.player2_score,
      winner: result.match.winner_id ? { id: result.match.winner_id, username: result.match.winner_username } : null,
      status: result.match.status,
    } : null,
  });
}

// ─── POST /api/matches/:id/dispute ─────────────────────────────
// Opponent disputes a submitted result
export async function disputeSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

  const { reason } = req.body;

  const result = handleOpponentResponse(matchId, req.user.id, 'dispute');

  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  // Log dispute reason if provided
  if (reason) {
    db.prepare(`
      INSERT INTO fraud_logs (user_id, match_id, detection_type, severity, details)
      VALUES (?, ?, ?, 'medium', ?)
    `).run(req.user.id, matchId, 'opponent_dispute', `Dispute reason: ${reason.slice(0, 500)}`);
  }

  res.json({ success: true, message: result.message });
}

// ─── PATCH /api/matches/:id/resolve ────────────────────────────
// Admin resolves a dispute
export async function resolveDispute(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

  const { winnerId, player1Score, player2Score } = req.body;

  if (!winnerId || player1Score === undefined || player2Score === undefined) {
    return res.status(400).json({ error: 'winnerId, player1Score, and player2Score required' });
  }

  const result = adminResolveDispute(matchId, req.user.id, winnerId, player1Score, player2Score);

  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  res.json({ success: true, message: result.message });
}

// ─── GET /api/matches/:id/submissions ──────────────────────────
// Get all submissions for a match
export async function getSubmissions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

  const submissions = db.prepare(`
    SELECT rs.*, u.username as uploader_username
    FROM result_submissions rs
    JOIN users u ON rs.uploader_id = u.id
    WHERE rs.match_id = ?
    ORDER BY rs.created_at DESC
  `).all(matchId) as any[];

  res.json({
    submissions: submissions.map(s => ({
      id: s.id,
      uploader: { id: s.uploader_id, username: s.uploader_username },
      screenshotUrl: s.screenshot_url,
      ocrTeamLeft: s.ocr_team_left,
      ocrTeamRight: s.ocr_team_right,
      ocrScoreLeft: s.ocr_score_left,
      ocrScoreRight: s.ocr_score_right,
      ocrConfidence: s.ocr_confidence,
      verificationConfidence: s.verification_confidence,
      teamMatchResult: s.team_match_result,
      fraudScore: s.fraud_score,
      fraudFlags: s.fraud_flags ? JSON.parse(s.fraud_flags) : [],
      verificationStatus: s.verification_status,
      createdAt: s.created_at,
      reviewedAt: s.reviewed_at,
    })),
  });
}

// ─── GET /api/admin/verification-queue ─────────────────────────
// Admin: get all submissions requiring review
export async function getVerificationQueue(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { status = 'admin_review', limit = 50, offset = 0 } = req.query;

  const validStatuses = ['admin_review', 'opponent_review', 'disputed', 'pending', 'all'];
  const statusFilter = validStatuses.includes(status as string) ? status as string : 'admin_review';

  let query = `
    SELECT rs.*, u.username as uploader_username,
           m.tournament_id, m.player1_id, m.player2_id,
           m.player1_team, m.player2_team,
           t.name as tournament_name
    FROM result_submissions rs
    JOIN users u ON rs.uploader_id = u.id
    JOIN matches m ON rs.match_id = m.id
    JOIN tournaments t ON m.tournament_id = t.id
  `;
  const params: any[] = [];

  if (statusFilter !== 'all') {
    query += ' WHERE rs.verification_status = ?';
    params.push(statusFilter);
  }

  query += ' ORDER BY rs.fraud_score DESC, rs.created_at ASC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const submissions = db.prepare(query).all(...params) as any[];

  const totalQuery = statusFilter !== 'all'
    ? 'SELECT COUNT(*) as count FROM result_submissions WHERE verification_status = ?'
    : 'SELECT COUNT(*) as count FROM result_submissions';
  const totalParams = statusFilter !== 'all' ? [statusFilter] : [];
  const total = db.prepare(totalQuery).get(...totalParams) as any;

  res.json({
    submissions: submissions.map(s => ({
      id: s.id,
      matchId: s.match_id,
      tournament: { id: s.tournament_id, name: s.tournament_name },
      uploader: { id: s.uploader_id, username: s.uploader_username },
      fixture: {
        player1Id: s.player1_id,
        player2Id: s.player2_id,
        player1Team: s.player1_team,
        player2Team: s.player2_team,
      },
      ocr: {
        leftTeam: s.ocr_team_left,
        rightTeam: s.ocr_team_right,
        leftScore: s.ocr_score_left,
        rightScore: s.ocr_score_right,
      },
      confidence: s.verification_confidence,
      teamMatch: s.team_match_result,
      fraudScore: s.fraud_score,
      fraudFlags: s.fraud_flags ? JSON.parse(s.fraud_flags) : [],
      status: s.verification_status,
      screenshotUrl: s.screenshot_url,
      createdAt: s.created_at,
    })),
    total: total.count,
    limit: Number(limit),
    offset: Number(offset),
  });
}

// ─── GET /api/admin/fraud-logs ─────────────────────────────────
// Admin: get fraud detection logs
export async function getFraudLogs(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { severity, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT fl.*, u.username, m.tournament_id
    FROM fraud_logs fl
    JOIN users u ON fl.user_id = u.id
    JOIN matches m ON fl.match_id = m.id
  `;
  const params: any[] = [];

  if (severity) {
    query += ' WHERE fl.severity = ?';
    params.push(severity);
  }

  query += ' ORDER BY fl.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const logs = db.prepare(query).all(...params) as any[];

  res.json({
    logs: logs.map(l => ({
      id: l.id,
      submissionId: l.submission_id,
      userId: l.user_id,
      username: l.username,
      matchId: l.match_id,
      detectionType: l.detection_type,
      severity: l.severity,
      details: l.details,
      createdAt: l.created_at,
    })),
  });
}

// ─── Export multer middleware ──────────────────────────────────
export { upload as verificationUpload };
