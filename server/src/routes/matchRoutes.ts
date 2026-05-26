import { Router } from 'express';
import { 
  getTournamentMatches, 
  getMatchById, 
  submitResult, 
  confirmResult, 
  disputeResult,
  resolveDispute
} from '../controllers/matchController.js';
import { ocrScreenshot } from '../services/ocrService.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/tournament/:tournamentId', getTournamentMatches);
router.get('/:id', getMatchById);
router.post('/ocr', authenticateToken, upload.single('screenshot'), ocrScreenshot);
router.post('/:id/result', authenticateToken, submitResult);
router.post('/:id/confirm', authenticateToken, confirmResult);
router.post('/:id/dispute', authenticateToken, disputeResult);
router.patch('/:id/resolve', authenticateToken, resolveDispute);

export default router;
