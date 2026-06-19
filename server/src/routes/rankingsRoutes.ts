import { Router } from 'express';
import { getRankings } from '../controllers/rankingsController.js';

const router = Router();

router.get('/', getRankings);

export default router;
