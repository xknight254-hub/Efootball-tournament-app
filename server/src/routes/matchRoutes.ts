import { Router } from 'express';
import { 
  getTournamentMatches, 
  getMatchById, 
  submitResult, 
  confirmResult, 
  disputeResult,
  resolveDispute
} from '../controllers/matchController.js';
import { ocrScreenshot, ocrAutoSubmit } from '../services/ocrService.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import {
  verifyResult,
  ocrOnly,
  confirmSubmission,
  disputeSubmission,
  resolveDispute,
  getSubmissions,
  getVerificationQueue,
  getFraudLogs,
  verificationUpload,
} from '../controllers/verificationController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/tournament/:tournamentId', getTournamentMatches);
router.get('/:id', getMatchById);
router.post('/ocr', authenticateToken, upload.single('screenshot'), ocrScreenshot);
router.post('/ocr/submit', authenticateToken, ocrAutoSubmit);
router.post('/:id/result', authenticateToken, submitResult);
router.post('/:id/confirm', authenticateToken, confirmResult);
router.post('/:id/dispute', authenticateToken, disputeResult);
router.patch('/:id/resolve', authenticateToken, resolveDispute);

// ─── Verification routes (OCR-based result verification) ───────
router.post('/:id/verify', authenticateToken, verificationUpload.single('screenshot'), verifyResult);
router.post('/:id/ocr-only', authenticateToken, verificationUpload.single('screenshot'), ocrOnly);
router.post('/:id/confirm-submission', authenticateToken, confirmSubmission);
router.post('/:id/dispute-submission', authenticateToken, disputeSubmission);
router.get('/:id/submissions', authenticateToken, getSubmissions);

// ─── Admin verification endpoints ──────────────────────────────
router.get('/admin/verification-queue', authenticateToken, requireAdmin, getVerificationQueue);
router.get('/admin/fraud-logs', authenticateToken, requireAdmin, getFraudLogs);

export default router;
