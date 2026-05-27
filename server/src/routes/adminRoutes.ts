import { Router } from 'express';
import { authenticateToken, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import {
  getStats,
  listUsers,
  updateUser,
  deleteUser,
  listAllTournaments,
  deleteTournament,
  getLogs
} from '../controllers/adminController.js';
import {
  generateAdminCodes,
  listAdminCodes,
  revokeAdminCode
} from '../controllers/adminCodeController.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticateToken, requireAdmin);

// Dashboard stats
router.get('/stats', getStats);

// User management
router.get('/users', listUsers);
router.put('/users/:id', requireSuperAdmin, updateUser);
router.delete('/users/:id', requireSuperAdmin, deleteUser);

// Tournament management
router.get('/tournaments', listAllTournaments);
router.delete('/tournaments/:id', deleteTournament);

// Admin logs
router.get('/logs', getLogs);

// ─── SUPER ADMIN ONLY: Admin Code Management ───
router.get('/codes', requireSuperAdmin, listAdminCodes);
router.post('/codes/generate', requireSuperAdmin, generateAdminCodes);
router.delete('/codes/:id', requireSuperAdmin, revokeAdminCode);

export default router;
