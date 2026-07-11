import { Router } from 'express';
import { authenticateToken, requireOrganizer } from '../middleware/auth.js';
import { getOrganizerTournaments, getOrganizerStats } from '../controllers/organizerController.js';
import { getOrganizerDisputes, resolveOrganizerDispute } from '../controllers/organizerController.js';

const router = Router();

router.use(authenticateToken, requireOrganizer);

router.get('/tournaments', getOrganizerTournaments);
router.get('/stats', getOrganizerStats);
router.get('/disputes', getOrganizerDisputes);
router.post('/disputes/:id/resolve', resolveOrganizerDispute);

export default router;
