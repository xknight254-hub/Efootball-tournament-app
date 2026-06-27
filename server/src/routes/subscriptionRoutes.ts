import { Router } from 'express';
import { authenticateToken, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import {
  listTiers,
  subscribe,
  paymentCallback,
  verifyPayment,
  mySubscription,
  fullStatus,
  listAllSubscriptions,
  approveSubscription,
  rejectSubscription,
  assignSubAdmin,
  removeSubAdmin,
  checkLimits,
  incrementTournamentCount,
} from '../controllers/subscriptionController.js';

const router = Router();

// Public: list tiers
router.get('/tiers', listTiers);

// Paynecta callback (no auth — redirect from payment gateway)
router.get('/callback', paymentCallback);

// Authenticated: subscription management
router.post('/subscribe', authenticateToken, subscribe);
router.post('/verify', authenticateToken, verifyPayment);
router.get('/my', authenticateToken, mySubscription);
router.get('/status', authenticateToken, fullStatus);
router.get('/check-limits', authenticateToken, checkLimits);
router.post('/increment-tournament-count', authenticateToken, incrementTournamentCount);

// Sub-admin management
router.post('/assign-sub-admin', authenticateToken, assignSubAdmin);
router.delete('/remove-sub-admin', authenticateToken, removeSubAdmin);

// Super admin: view all subscriptions & approve/reject
router.get('/all', authenticateToken, requireSuperAdmin, listAllSubscriptions);
router.put('/:id/approve', authenticateToken, requireSuperAdmin, approveSubscription);
router.put('/:id/reject', authenticateToken, requireSuperAdmin, rejectSubscription);

export default router;
