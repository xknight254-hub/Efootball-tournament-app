import { Router } from 'express';
import { 
  createTournament, 
  getTournaments, 
  getTournamentById, 
  updateTournament, 
  deleteTournament,
  joinTournament,
  getParticipants,
  getStandings
} from '../controllers/tournamentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticateToken, createTournament);
router.get('/', getTournaments);
router.get('/:id', getTournamentById);
router.get('/:id/participants', getParticipants);
router.get('/:id/standings', getStandings);
router.put('/:id', authenticateToken, updateTournament);
router.delete('/:id', authenticateToken, deleteTournament);
router.post('/:id/join', authenticateToken, joinTournament);

export default router;