import db from '../db.js';

type NotificationType = 'result' | 'tournament' | 'payment';

/**
 * Check if a user has opted in for a specific notification type.
 * Defaults to true if no preferences are set.
 */
export function shouldNotify(userId: number, type: NotificationType): boolean {
  try {
    const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    if (!row?.preferences) return true;

    const prefs = JSON.parse(row.preferences);
    if (!prefs || typeof prefs !== 'object') return true;

    // Map notification types to preference keys
    const prefKeyMap: Record<NotificationType, string> = {
      result: 'notifResult',
      tournament: 'notifTournament',
      payment: 'notifPayment',
    };

    const key = prefKeyMap[type];
    if (key && prefs[key] === false) return false;

    // Legacy: if the master toggle is off, respect it
    if (prefs.notifications === false) return false;

    return true;
  } catch {
    return true; // Fail open — if we can't read prefs, notify
  }
}
