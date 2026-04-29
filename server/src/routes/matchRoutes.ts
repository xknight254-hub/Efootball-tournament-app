import { Router } from 'express';
import { 
  getTournamentMatches, 
  getMatchById, 
  submitResult, 
  confirmResult, 
  disputeResult,
  resolveDispute
} from '../controllers/matchController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/tournament/:tournamentId', authenticateToken, getTournamentMatches);
router.get('/:id', authenticateToken, getMatchById);
router.post('/:id/result', authenticateToken, submitResult);
router.post('/:id/confirm', authenticateToken, confirmResult);
router.post('/:id/dispute', authenticateToken, disputeResult);
router.patch('/:id/resolve', authenticateToken, resolveDispute);

export default router;