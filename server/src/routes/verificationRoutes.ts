import { Router } from 'express';
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
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// ─── Player-facing verification endpoints ──────────────────────

// Upload screenshot + OCR + validate + submit (full pipeline)
router.post('/:id/verify', authenticateToken, verificationUpload.single('screenshot'), verifyResult);

// OCR-only: extract data without submitting (for preview before submit)
router.post('/:id/ocr-only', authenticateToken, verificationUpload.single('screenshot'), ocrOnly);

// Opponent confirms a submitted result
router.post('/:id/confirm', authenticateToken, confirmSubmission);

// Opponent disputes a submitted result
router.post('/:id/dispute', authenticateToken, disputeSubmission);

// Get all submissions for a match
router.get('/:id/submissions', authenticateToken, getSubmissions);

// ─── Admin endpoints ───────────────────────────────────────────

// Admin resolves a dispute
router.patch('/:id/resolve', authenticateToken, requireAdmin, resolveDispute);

// Admin verification queue
router.get('/admin/verification-queue', authenticateToken, requireAdmin, getVerificationQueue);

// Admin fraud logs
router.get('/admin/fraud-logs', authenticateToken, requireAdmin, getFraudLogs);

export default router;
