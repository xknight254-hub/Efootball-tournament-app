import { Response } from 'express';
import { createWorker, Worker } from 'tesseract.js';
import type { AuthRequest } from '../middleware/auth.js';

// ─── Worker Pool ───────────────────────────────────────────────
// Tesseract.js worker is expensive to init (~2s). Keep a singleton.

let worker: Worker | null = null;

export async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('eng', 1, {
      logger: () => {}, // silence tesseract logs
    });
  }
  return worker;
}

// ─── eFootball Screen Recognition Engine ───────────────────────
// eFootball (formerly PES) result screens have a consistent layout:
//
//   ┌──────────────────────────────────────────┐
//   │           COMPETITION NAME                │  ← top center
//   │                                          │
//   │  PLAYER 1        2  -  1       PLAYER 2  │  ← names on sides, score center
//   │  TEAM LOGO                    TEAM LOGO  │
//   │                                          │
//   │  POSSESSION     55%  -  45%   POSSESSION  │  ← stats row
//   │  SHOTS           12  -   8     SHOTS      │
//   │  FOULS            3  -   5     FOULS      │
//   │                                          │
//   │           FULL TIME  90:00               │  ← time at bottom
//   └──────────────────────────────────────────┘
//
// We use multiple strategies to extract data reliably.

export interface EFOTBOCRResult {
  player1Name: string | null;
  player2Name: string | null;
  player1Score: number | null;
  player2Score: number | null;
  matchTime: string | null;
  competition: string | null;
  stats: {
    possession: [number, number] | null;
    shots: [number, number] | null;
    fouls: [number, number] | null;
  };
  confidence: number;
  rawText: string;
  orientation: 'result_screen' | 'live_score' | 'unknown';
}

/**
 * Detect if this is an eFootball/PES result screen vs random image
 */
function detectOrientation(text: string): 'result_screen' | 'live_score' | 'unknown' {
  const upper = text.toUpperCase();
  const resultIndicators = ['FULL TIME', 'HALF TIME', 'FT', 'RESULT', 'FINAL', 'WHISTLE', 'GAME OVER'];
  const liveIndicators = ['LIVE', 'MINUTE', "ON AIR", 'PLAYING'];

  const resultScore = resultIndicators.filter(w => upper.includes(w)).length;
  const liveScore = liveIndicators.filter(w => upper.includes(w)).length;

  if (resultScore >= 1) return 'result_screen';
  if (liveScore >= 1) return 'live_score';
  return 'unknown';
}

/**
 * Extract player names using position-aware heuristics.
 * In eFootball, names appear adjacent to scores.
 */
function extractPlayerNames(text: string, lines: string[]): [string | null, string | null] {
  const names: string[] = [];

  // Strategy 1: Names on same line as score, on either side
  // Pattern: "NAME  2 - 1  NAME"
  const scoreLinePattern = /([A-Za-zÀ-ÿ0-9._\-']{2,18})\s+\d+\s*[-–—:]\s*\d+\s+([A-Za-zÀ-ÿ0-9._\-']{2,18})/;
  for (const line of lines) {
    const m = line.match(scoreLinePattern);
    if (m && m[1] && m[2]) {
      names.push(m[1].trim(), m[2].trim());
      return [names[0], names[1]];
    }
  }

  // Strategy 2: Names on separate lines above/below score
  // Find score line, look at line above for player 1, line below for player 2
  let scoreLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\d+\s*[-–—:]\s*\d+/.test(lines[i])) {
      scoreLineIdx = i;
      break;
    }
  }

  if (scoreLineIdx > 0 && scoreLineIdx < lines.length - 1) {
    const prev = lines[scoreLineIdx - 1].trim();
    const next = lines[scoreLineIdx + 1].trim();

    // Validate they look like names (not stats)
    const isName = (s: string) =>
      /^[A-Za-zÀ-ÿ0-9._\-']{2,18}$/.test(s) &&
      !/^(POSSESSION|SHOTS|FOULS|CORNERS|OFFSIDE|CARDS|YELLOW|RED|TIME|MIN|HALF|FULL|SCORE|GAME|RESULT|STATS|HOME|AWAY|TEAM|VS)$/i.test(s);

    if (isName(prev) && isName(next)) return [prev, next];
    if (isName(prev) && !isName(next)) return [prev, null];
  }

  // Strategy 3: Collect all plausible names, take first two
  const namePattern = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9._\-']{1,17}$/;
  const skipWords = new Set([
    'MATCH', 'RESULT', 'GAME', 'SCORE', 'FINAL', 'HALF', 'TIME', 'EFOTBALL', 'PES',
    'POSSESSION', 'SHOTS', 'FOULS', 'CORNERS', 'OFFSIDE', 'CARDS', 'YELLOW', 'RED',
    'STATS', 'HOME', 'AWAY', 'TEAM', 'VS', 'FULL', 'TOTAL', 'OVER', 'UNDER',
    'WIN', 'LOSE', 'DRAW', 'PLAYED', 'DURATION', 'MINUTE', 'GOALS',
  ]);

  for (const line of lines) {
    const trimmed = line.trim();
    if (namePattern.test(trimmed) && !skipWords.has(trimmed.toUpperCase())) {
      names.push(trimmed);
    }
    if (names.length >= 2) break;
  }

  return [names[0] || null, names[1] || null];
}

/**
 * Extract the match score from parsed text.
 */
function extractScore(text: string): [number | null, number | null] {
  // Pattern: "2 - 1", "2–1", "2:1", "2 — 1"
  const patterns = [
    // Names embedded: "PLAYER 2 - 1 PLAYER"
    /\d+\s*[-–—:]\s*\d+/,
    // Standalone score line
    /(?:SCORE|RESULT|FT)?\s*(\d+)\s*[-–—:]\s*(\d+)/,
    // Two large numbers near each other
    /\|\s*(\d+)\s*[-–—:]\s*(\d+)\s*\|/,
    // Box-drawing characters: "│ 2 : 1 │"
    /[│|]\s*(\d+)\s*[-–—:]\s*(\d+)\s*[│|]/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const s1 = parseInt(match[1]);
      const s2 = parseInt(match[2]);
      if (!isNaN(s1) && !isNaN(s2) && s1 >= 0 && s2 >= 0 && s1 <= 99 && s2 <= 99) {
        return [s1, s2];
      }
    }
  }

  return [null, null];
}

/**
 * Extract match stats (possession, shots, fouls).
 */
function extractStats(text: string): EFOTBOCRResult['stats'] {
  const stats = { possession: null as [number, number] | null, shots: null as [number, number] | null, fouls: null as [number, number] | null };

  // Possession: "55%" and "45%" near each other, or "POSSESSION 55% 45%"
  const possMatch = text.match(/(?:POSSESSION\s+)?(\d{1,3})%?\s*[-–—/]\s*(\d{1,3})%?/i);
  if (possMatch) {
    const p1 = parseInt(possMatch[1]);
    const p2 = parseInt(possMatch[2]);
    if (p1 + p2 === 100 || (p1 + p2 >= 95 && p1 + p2 <= 105)) {
      stats.possession = [p1, p2];
    }
  }

  // Shots: two numbers near "SHOTS"
  const shotsMatch = text.match(/SHOTS\s+(\d+)\s*[-–—/]\s*(\d+)/i);
  if (shotsMatch) stats.shots = [parseInt(shotsMatch[1]), parseInt(shotsMatch[2])];

  // Fouls: two numbers near "FOULS"
  const foulsMatch = text.match(/FOULS\s+(\d+)\s*[-–—/]\s*(\d+)/i);
  if (foulsMatch) stats.fouls = [parseInt(foulsMatch[1]), parseInt(foulsMatch[2])];

  return stats;
}

/**
 * Extract match time.
 */
function extractMatchTime(text: string): string | null {
  const patterns = [
    /(\d{1,3})\s*:\s*(\d{2})\s*(?:FULL|FT|HALF|HT)?/,
    /(?:TIME|MIN)\s*[:\s]?(\d{1,3})\s*[:']?\s*(\d{2})?/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return `${m[1]}:${m[2] || '00'}`;
  }
  return null;
}

/**
 * Extract competition name.
 */
function extractCompetition(text: string): string | null {
  const upper = text.toUpperCase();
  const competitions: Record<string, string[]> = {
    'Premier League': ['PREMIER LEAGUE', 'PREMIER', 'EPL'],
    'La Liga': ['LA LIGA', 'LALIGA', 'LIGA'],
    'Serie A': ['SERIE A', 'SERIEA'],
    'Bundesliga': ['BUNDESLIGA'],
    'Ligue 1': ['LIGUE 1', 'LIGUE1'],
    'Champions League': ['CHAMPIONS LEAGUE', 'UCL', 'CHAMPIONS'],
    'Europa League': ['EUROPA LEAGUE', 'EUROPA'],
    'Liga MX': ['LIGA MX', 'LIGAMX'],
    'World Cup': ['WORLD CUP', 'WORLDCUP'],
    'eFootball League': ['EFB', 'EFB OPEN', 'EFB CHAMPIONSHIP'],
  };

  for (const [name, keywords] of Object.entries(competitions)) {
    if (keywords.some(kw => upper.includes(kw))) return name;
  }

  // Try to extract any tournament-like text from top lines
  for (const line of text.split('\n').slice(0, 3)) {
    const trimmed = line.trim();
    if (/^[A-Z][A-Z\s]{4,30}$/.test(trimmed) && !/^\d/.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

// ─── Main Parser ───────────────────────────────────────────────

export function parseEFOTBScreenshot(text: string): EFOTBOCRResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const orientation = detectOrientation(text);
  const [player1Score, player2Score] = extractScore(text);
  const [player1Name, player2Name] = extractPlayerNames(text, lines);
  const stats = extractStats(text);
  const matchTime = extractMatchTime(text);
  const competition = extractCompetition(text);

  // Confidence scoring
  let confidence = 0;
  if (player1Score !== null && player2Score !== null) confidence += 45;
  if (player1Name && player2Name) confidence += 25;
  if (orientation !== 'unknown') confidence += 15;
  if (stats.possession || stats.shots) confidence += 10;
  if (matchTime) confidence += 5;

  return {
    player1Name,
    player2Name,
    player1Score,
    player2Score,
    matchTime,
    competition,
    stats,
    confidence: Math.min(confidence, 100),
    rawText: text,
    orientation,
  };
}

// ─── Express Route Handlers ────────────────────────────────────

/**
 * POST /api/ocr/screenshot
 * Accepts: multipart/form-data with `image` field OR base64 JSON body
 * Returns: parsed match data from eFootball screenshot
 */
export async function ocrScreenshot(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    let imageBuffer: Buffer;

    if (req.file?.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.body.image) {
      const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ error: 'No image provided. Upload a file or send base64.' });
    }

    if (imageBuffer.length === 0) {
      return res.status(400).json({ error: 'Empty image' });
    }

    if (imageBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 10MB)' });
    }

    // Preprocess: get worker and recognize
    const w = await getWorker();

    // Set Tesseract parameters for better game screen recognition
    await w.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 _-.%/:()\'àáâãäåèéêëìíîïòóôõöùúûüýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝ',
    } as any);

    const { data: { text, confidence } } = await w.recognize(imageBuffer);

    if (!text || text.trim().length < 3) {
      return res.status(422).json({
        error: 'Could not extract text from image',
        suggestion: 'Ensure the screenshot is clear and shows the match result screen'
      });
    }

    const parsed = parseEFOTBScreenshot(text);

    res.json({
      success: true,
      parsed,
      ocr: {
        text,
        confidence: confidence / 100,
      },
      suggestions: {
        autoFill: parsed.player1Score !== null && parsed.player2Score !== null,
        orientation: parsed.orientation,
        players: parsed.player1Name && parsed.player2Name
          ? [parsed.player1Name, parsed.player2Name]
          : [],
      }
    });
  } catch (error: any) {
    console.error('[OCR] Error:', error);
    res.status(500).json({ error: 'OCR processing failed', details: error.message });
  }
}

/**
 * POST /api/ocr/submit-result
 * Auto-submit result from OCR: takes matchId + OCR data, validates against match players, submits.
 * Shortcut for: upload screenshot → OCR → confirm → submit in one step.
 */
export async function ocrAutoSubmit(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { matchId, player1Score, player2Score, screenshotBase64 } = req.body;

  if (!matchId || player1Score === undefined || player2Score === undefined) {
    return res.status(400).json({ error: 'matchId and scores required' });
  }

  // Validate scores are numbers in reasonable range
  if (typeof player1Score !== 'number' || typeof player2Score !== 'number' ||
      player1Score < 0 || player2Score < 0 || player1Score > 99 || player2Score > 99) {
    return res.status(400).json({ error: 'Invalid scores (must be 0-99)' });
  }

  if (!isFinite(player1Score) || !isFinite(player2Score)) {
    return res.status(400).json({ error: 'Invalid score values' });
  }

  // Import the submitResult handler dynamically to avoid circular deps
  try {
    const { submitResult } = await import('../controllers/matchController.js');
    req.body = {
      player1Score: Math.round(player1Score),
      player2Score: Math.round(player2Score),
      screenshotUrl: screenshotBase64 || null,
    };
    return submitResult(req, res);
  } catch (error: any) {
    console.error('[OCR Submit] Error:', error);
    res.status(500).json({ error: 'Failed to submit result', details: error.message });
  }
}
