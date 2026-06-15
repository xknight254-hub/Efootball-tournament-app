import { Router } from 'express';
import {
  createWager,
  listOpenWagers,
  getWager,
  getWagerByCode,
  acceptWager,
  confirmResult,
  disputeWager,
  cancelWager,
  myWagers,
  adminWagerStats,
  resolveDispute,
} from '../controllers/wagerController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ─── Public ───
router.get('/', listOpenWagers);
router.get('/by-code/:matchCode', getWagerByCode);
router.get('/my', authenticateToken, myWagers);
router.get('/:id', getWager);

// ─── Authenticated ───
router.post('/', authenticateToken, createWager);
router.post('/:id/accept', authenticateToken, acceptWager);
router.post('/:id/confirm', authenticateToken, confirmResult);
router.post('/:id/dispute', authenticateToken, disputeWager);
router.delete('/:id', authenticateToken, cancelWager);

// ─── Admin ───
router.get('/admin/stats', authenticateToken, requireAdmin, adminWagerStats);
router.put('/admin/:id/resolve', authenticateToken, requireAdmin, resolveDispute);

export default router;
