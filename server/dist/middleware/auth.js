import jwt from 'jsonwebtoken';
import db from '../db.js';
export function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '') ||
        req.headers['x-auth-token'];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const blacklisted = db.prepare('SELECT id FROM token_blacklist WHERE token = ? AND expires_at > datetime("now")').get(token);
        if (blacklisted) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }
        const JWT_SECRET = process.env.JWT_SECRET || 'efootball-arena-super-secret-key-2024';
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        req.userId = user.id;
        req.user = user;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
export function optionalAuth(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '') ||
        req.headers['x-auth-token'];
    if (!token) {
        return next();
    }
    try {
        const JWT_SECRET = process.env.JWT_SECRET || 'efootball-arena-super-secret-key-2024';
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(decoded.userId);
        if (user) {
            req.userId = user.id;
            req.user = user;
        }
    }
    catch (error) {
        // Token invalid, continue without auth
    }
    next();
}
export function requireAdmin(req, res, next) {
    if (!req.user || req.user.is_admin !== 1) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}
export function generateToken(userId) {
    const JWT_SECRET = process.env.JWT_SECRET || 'efootball-arena-super-secret-key-2024';
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
//# sourceMappingURL=auth.js.map