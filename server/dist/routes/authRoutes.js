import { Router } from 'express';
import { register, login, getMe, getUserById, updateProfile, logout, forgotPassword, resetPassword } from '../controllers/authController.js';
import { telegramLogin, linkTelegram, unlinkTelegram } from '../controllers/telegramAuthController.js';
import { authenticateToken } from '../middleware/auth.js';
import { redeemAdminCode } from '../controllers/adminCodeController.js';
const router = Router();
// Standard auth
router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);
router.get('/users/:id', authenticateToken, getUserById);
router.put('/profile', authenticateToken, updateProfile);
router.post('/redeem-code', authenticateToken, redeemAdminCode);
// Password reset
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
// Telegram Mini App auth
router.post('/telegram-login', telegramLogin);
router.post('/link-telegram', authenticateToken, linkTelegram);
router.delete('/unlink-telegram', authenticateToken, unlinkTelegram);
export default router;
//# sourceMappingURL=authRoutes.js.map