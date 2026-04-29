import { Router } from 'express';
import { register, login, getMe, getUserById, updateProfile, logout } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();
router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);
router.get('/users/:id', authenticateToken, getUserById);
router.put('/profile', authenticateToken, updateProfile);
export default router;
//# sourceMappingURL=authRoutes.js.map