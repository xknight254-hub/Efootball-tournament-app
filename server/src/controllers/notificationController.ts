import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';

export function getNotifications(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const notifications = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(userId);
  res.json({ notifications });
}

export function markAsRead(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { id } = req.params;
  const result = db.prepare(
    'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?'
  ).run(Number(id), userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  res.json({ message: 'Marked as read' });
}

export function getUnreadCount(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
  ).get(userId) as { count: number };
  res.json({ count: row.count });
}
