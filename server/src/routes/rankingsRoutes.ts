import { Router } from 'express';
import { getRankings, getMyStats } from '../controllers/rankingsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/me', authenticateToken, getMyStats);
router.get('/', getRankings);

export default router;
