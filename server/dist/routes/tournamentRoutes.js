import { Router } from 'express';
import { createTournament, getTournaments, getTournamentById, updateTournament, deleteTournament } from '../controllers/tournamentController.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();
router.post('/', authenticateToken, createTournament);
router.get('/', getTournaments);
router.get('/:id', authenticateToken, getTournamentById);
router.put('/:id', authenticateToken, updateTournament);
router.delete('/:id', authenticateToken, deleteTournament);
export default router;
//# sourceMappingURL=tournamentRoutes.js.map