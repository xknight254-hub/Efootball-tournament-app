import { Router } from 'express';
import {
  generateRedeemCodes,
  listRedeemCodes,
  revokeRedeemCode,
  redeemCode,
  registrationStatus,
} from '../controllers/redeemCodeController.js';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

// ─── Super Admin: Code Management ───
router.post('/generate', authenticateToken, requireSuperAdmin, generateRedeemCodes);
router.get('/', authenticateToken, requireSuperAdmin, listRedeemCodes);
router.delete('/:id', authenticateToken, requireSuperAdmin, revokeRedeemCode);

export default router;
