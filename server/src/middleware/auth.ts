import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from './db.js';

export interface AuthRequest extends Request {
  userId?: number;
  user?: {
    id: number;
    username: string;
    email: string;
    is_admin: number;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || 
                req.headers['x-auth-token'] as string;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    
    const user = db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(decoded.userId) as any;
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || 
                req.headers['x-auth-token'] as string;

  if (!token) {
    return next();
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    
    const user = db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(decoded.userId) as any;
    
    if (user) {
      req.userId = user.id;
      req.user = user;
    }
  } catch (error) {
    // Token invalid, continue without auth
  }
  
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.is_admin !== 1) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function generateToken(userId: number): string {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}