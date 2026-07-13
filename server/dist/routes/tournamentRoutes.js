import { Router } from 'express';
import { createTournament, getTournaments, getTournamentById, updateTournament, updateTournamentStatus, deleteTournament, joinTournament, withdrawFromTournament, joinWaitingList, getParticipants, getStandings } from '../controllers/tournamentController.js';
import { getTournamentByToken, quickJoinByToken } from '../controllers/deepLinkController.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();
router.post('/', authenticateToken, createTournament);
router.get('/', getTournaments);
router.get('/:id', getTournamentById);
router.get('/:id/participants', getParticipants);
router.get('/:id/standings', getStandings);
router.put('/:id/status', authenticateToken, updateTournamentStatus);
router.put('/:id', authenticateToken, updateTournament);
router.delete('/:id', authenticateToken, deleteTournament);
router.post('/:id/join', authenticateToken, joinTournament);
router.post('/:id/withdraw', authenticateToken, withdrawFromTournament);
router.post('/:id/waiting-list', authenticateToken, joinWaitingList);
// ─── Deep link token-based access (no auth required) ───
router.get('/by-token/:token', getTournamentByToken);
router.post('/by-token/:token/join', quickJoinByToken);
export default router;
//# sourceMappingURL=tournamentRoutes.js.map