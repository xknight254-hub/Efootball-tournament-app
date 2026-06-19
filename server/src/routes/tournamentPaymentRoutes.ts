import { Router } from 'express';
import {
  initiateTournamentPayment,
  tournamentPaymentCallback,
  checkTournamentPaymentStatus,
} from '../controllers/tournamentPaymentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// M-Pesa callback (no auth — called by Safaricom)
router.post('/payment-callback', tournamentPaymentCallback);

// Initiate payment for tournament entry
router.post('/:id/pay', authenticateToken, initiateTournamentPayment);

// Check payment status (polling)
router.get('/:id/payment-status/:checkoutId', authenticateToken, checkTournamentPaymentStatus);

export default router;
