import { Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { generateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import type { User } from '../types.js';
import { sanitizeString, sanitizeUsername, sanitizeEmail } from '../utils/sanitize.js';

export async function register(req: AuthRequest, res: Response) {
  const rawUsername = req.body.username;
  const rawEmail = req.body.email;
  const password = req.body.password;
  const firstName = req.body.firstName;
  const lastName = req.body.lastName;

  const username = sanitizeUsername(rawUsername);
  const email = sanitizeEmail(rawEmail);

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
  }

  if (!/[a-z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
  }

  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one number' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email) as { id: number } | undefined;
  if (existingUser) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, first_name, last_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, email.toLowerCase(), passwordHash, firstName || null, lastName || null);

  const user = db.prepare('SELECT id, username, email, first_name, last_name, is_admin, created_at FROM users WHERE id = ?').get(result.lastInsertRowid) as any;

  const token = generateToken(user.id);

  res.status(201).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isAdmin: user.is_admin === 1
    },
    token
  });
}

export async function login(req: AuthRequest, res: Response) {
  const rawUsername = req.body.username;
  const password = req.body.password;

  const username = sanitizeUsername(rawUsername);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username.toLowerCase()) as User | undefined;
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user.id);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      avatarUrl: user.avatar_url,
      isAdmin: user.is_admin === 1
    },
    token
  });
}

export function getMe(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    isAdmin: req.user.is_admin === 1
  });
}

export function getUserById(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const user = db.prepare('SELECT id, username, email, first_name, last_name, avatar_url, is_admin, created_at FROM users WHERE id = ?').get(userId) as any;

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    avatarUrl: user.avatar_url,
    isAdmin: user.is_admin === 1,
    createdAt: user.created_at
  });
}

export function updateProfile(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { username, email, firstName, lastName, avatarUrl } = req.body;

  if (username && username !== req.user.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }
  }

  if (email && email !== req.user.email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'Email already taken' });
    }
  }

  db.prepare(`
    UPDATE users SET 
      username = COALESCE(?, username),
      email = COALESCE(?, email),
      first_name = COALESCE(?, first_name),
      last_name = COALESCE(?, last_name),
      avatar_url = COALESCE(?, avatar_url)
    WHERE id = ?
  `).run(
    username || null,
    email ? email.toLowerCase() : null,
    firstName || null,
    lastName || null,
    avatarUrl || null,
    req.user.id
  );

  const updated = db.prepare('SELECT id, username, email, first_name, last_name, avatar_url, is_admin FROM users WHERE id = ?').get(req.user.id) as any;

  res.json({
    id: updated.id,
    username: updated.username,
    email: updated.email,
    firstName: updated.first_name,
    lastName: updated.last_name,
    avatarUrl: updated.avatar_url,
    isAdmin: updated.is_admin === 1
  });
}

export function logout(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = req.headers['authorization']?.replace('Bearer ', '') || 
                req.headers['x-auth-token'] as string;

  if (token) {
    db.prepare('INSERT INTO token_blacklist (token, expires_at) VALUES (?, datetime("now", "+7 days"))').run(token);
  }

  res.json({ message: 'Logged out successfully' });
}