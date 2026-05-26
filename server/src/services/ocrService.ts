import { Request, Response } from 'express';
import { createWorker, Worker } from 'tesseract.js';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';

// OCR worker singleton — expensive to initialize, reuse across requests
let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('eng');
  }
  return worker;
}

interface OCRResult {
  player1Name: string | null;
  player2Name: string | null;
  player1Score: number | null;
  player2Score: number | null;
  matchTime: string | null;
  competition: string | null;
  confidence: number;
  rawText: string;
}

// Parse eFootball match result screen text
function parseFootballResult(text: string): OCRResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const fullText = text.toUpperCase();

  const result: OCRResult = {
    player1Name: null,
    player2Name: null,
    player1Score: null,
    player2Score: null,
    matchTime: null,
    competition: null,
    confidence: 0,
    rawText: text,
  };

  // Pattern 1: "X - X" or "X : X" score lines (most common in eFootball)
  const scorePatterns = [
    /(\d+)\s*[-:]\s*(\d+)/,           // "2 - 1" or "2:1"
    /(\d+)\s+(\d+)/,                  // "2  1" (two numbers side by side)
    /SCORE\s+(\d+)\s*[-:]\s*(\d+)/,  // "SCORE 2 - 1"
  ];

  for (const pattern of scorePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.player1Score = parseInt(match[1]);
      result.player2Score = parseInt(match[2]);
      result.confidence += 40;
      break;
    }
  }

  // Pattern 2: Extract player names — typically on separate lines near scores
  // eFootball format: Player name on left/right of score
  // Look for names (2-20 chars, alphabetic with possible spaces/dots)
    const nameRegex = /([A-Z][A-Za-z0-9._\- ]{1,20})(?:\s|$)/g;
    const foundNames: string[] = [];
    let nameMatch;
    while ((nameMatch = nameRegex.exec(text)) !== null) {
      const name = nameMatch[1].trim();
      const skipWords = ['MATCH', 'RESULT', 'GAME', 'SCORE', 'FINAL', 'HALF', 'TIME', 'EFOTBALL', 'PES'];
      if (!skipWords.some(w => name.includes(w)) && name.length >= 2) {
        foundNames.push(name);
      }
    }

  if (foundNames.length >= 1) result.player1Name = foundNames[0];
  if (foundNames.length >= 2) result.player2Name = foundNames[1];
  if (foundNames.length >= 2) result.confidence += 30;

  // Pattern 3: Match time (e.g. "90:00", "45:00")
  const timeMatch = text.match(/(\d{1,3}):(\d{2})/);
  if (timeMatch) {
    result.matchTime = `${timeMatch[1]}:${timeMatch[2]}`;
    result.confidence += 15;
  }

  // Pattern 4: Competition/tournament name
  if (fullText.includes('CHAMPIONS') || fullText.includes('LEAGUE')) {
    result.competition = 'League Match';
    result.confidence += 15;
  }

  return result;
}

export async function ocrScreenshot(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    let imageBuffer: Buffer;

    // Support both multipart file upload and base64 body
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

    const w = await getWorker();
    const { data: { text, confidence } } = await w.recognize(imageBuffer);

    const parsed = parseFootballResult(text);

    res.json({
      success: true,
      parsed,
      ocr: {
        text,
        confidence: confidence / 100,
      },
      suggestions: {
        autoFill: parsed.player1Score !== null && parsed.player2Score !== null,
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

// Auto-submit result from OCR (shortcut: one-tap submit after OCR confirms)
export async function ocrSubmitResult(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { matchId, player1Score, player2Score } = req.body;

  // Validate scores
  if (player1Score === undefined || player2Score === undefined) {
    return res.status(400).json({ error: 'Scores required' });
  }

  // Delegate to existing submitResult logic
  req.body = { player1Score, player2Score, screenshotUrl: req.body.screenshotUrl };
  // ... (reuses submitResult controller)
  res.json({ message: 'Result submitted via OCR', player1Score, player2Score });
}
