import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  getStats,
  listUsers,
  updateUser,
  deleteUser,
  listAllTournaments,
  deleteTournament,
  getLogs
} from '../controllers/adminController.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticateToken, requireAdmin);

// Dashboard stats
router.get('/stats', getStats);

// User management
router.get('/users', listUsers);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Tournament management
router.get('/tournaments', listAllTournaments);
router.delete('/tournaments/:id', deleteTournament);

// Admin logs
router.get('/logs', getLogs);

export default router;
