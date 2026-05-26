import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';

/* ============================================
   ADMIN CODE SYSTEM
   ============================================
   Only super admins can generate codes.
   Regular users can redeem a code to become admin.
   Codes are 1-8 alphanumeric characters.
   ============================================ */

function generateCode(length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 (confusing)
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * POST /api/admin/codes/generate
 * Generate one or more admin codes (super admin only)
 */
export function generateAdminCodes(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { count = 1, length = 6, note = '' } = req.body;

  // Validate
  const numCount = Math.min(Math.max(parseInt(count) || 1, 1), 20); // Max 20 at once
  const codeLen = Math.min(Math.max(parseInt(length) || 6, 1), 8); // 1-8 chars

  if (note && typeof note === 'string' && note.length > 100) {
    return res.status(400).json({ error: 'Note too long (max 100 chars)' });
  }

  const codes: { code: string; id: number }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < numCount; i++) {
    let code = generateCode(codeLen);
    let attempts = 0;

    // Ensure unique code
    while (attempts < 50) {
      const existing = db.prepare('SELECT id FROM admin_codes WHERE code = ?').get(code);
      if (!existing) break;
      code = generateCode(codeLen);
      attempts++;
    }

    if (attempts >= 50) {
      errors.push(`Failed to generate unique code (attempt ${i + 1})`);
      continue;
    }

    try {
      const result = db.prepare(`
        INSERT INTO admin_codes (code, created_by, note)
        VALUES (?, ?, ?)
      `).run(code, req.user.id, note || null);

      codes.push({ code, id: result.lastInsertRowid as number });
    } catch (e: any) {
      errors.push(`Failed to insert code: ${e.message}`);
    }
  }

  res.json({
    success: true,
    generated: codes,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * GET /api/admin/codes
 * List all admin codes with usage info (super admin only)
 */
export function listAdminCodes(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const codes = db.prepare(`
    SELECT ac.id, ac.code, ac.is_active, ac.note, ac.created_at, ac.used_at,
           creator.username as created_by_name,
           used_by.username as used_by_name
    FROM admin_codes ac
    LEFT JOIN users creator ON ac.created_by = creator.id
    LEFT JOIN users used_by ON ac.used_by = used_by.id
    ORDER BY ac.created_at DESC
  `).all();

  const stats = {
    total: codes.length,
    active: (codes as any[]).filter((c: any) => c.is_active === 1 && !c.used_by_name).length,
    used: (codes as any[]).filter((c: any) => c.used_by_name).length,
    deactivated: (codes as any[]).filter((c: any) => c.is_active === 0).length,
  };

  res.json({ codes, stats });
}

/**
 * DELETE /api/admin/codes/:id
 * Deactivate/revoke a code (super admin only)
 */
export function revokeAdminCode(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { id } = req.params;
  const codeId = parseInt(id);

  if (isNaN(codeId)) {
    return res.status(400).json({ error: 'Invalid code ID' });
  }

  const code = db.prepare('SELECT * FROM admin_codes WHERE id = ?').get(codeId) as any;
  if (!code) {
    return res.status(404).json({ error: 'Code not found' });
  }

  if (code.used_by) {
    return res.status(400).json({ error: 'Cannot revoke a code that has already been used' });
  }

  db.prepare('UPDATE admin_codes SET is_active = 0 WHERE id = ?').run(codeId);

  res.json({ success: true, message: 'Code revoked' });
}

/**
 * POST /api/auth/redeem-code
 * Redeem an admin code to become an admin (any authenticated user)
 */
export function redeemAdminCode(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  const normalizedCode = code.trim().toUpperCase();

  if (normalizedCode.length < 1 || normalizedCode.length > 8) {
    return res.status(400).json({ error: 'Invalid code format (1-8 characters)' });
  }

  // Check if user is already admin
  if (req.user.is_admin === 1 || req.user.is_super_admin === 1) {
    return res.status(400).json({ error: 'You are already an admin' });
  }

  // Find the code
  const codeRecord = db.prepare(`
    SELECT * FROM admin_codes WHERE code = ? AND is_active = 1
  `).get(normalizedCode) as any;

  if (!codeRecord) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  if (codeRecord.used_by) {
    return res.status(400).json({ error: 'This code has already been used' });
  }

  // Redeem: set user as admin, mark code as used
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(req.user.id);
  db.prepare(`
    UPDATE admin_codes SET used_by = ?, used_at = datetime('now') WHERE id = ?
  `).run(req.user.id, codeRecord.id);

  // Log
  db.prepare(`
    INSERT INTO admin_logs (admin_id, action, details)
    VALUES (?, 'CODE_REDEEMED', ?)
  `).run(req.user.id, JSON.stringify({ code: normalizedCode, codeId: codeRecord.id }));

  const updatedUser = db.prepare(
    'SELECT id, username, email, is_admin, is_super_admin FROM users WHERE id = ?'
  ).get(req.user.id) as any;

  res.json({
    success: true,
    message: 'Congratulations! You are now an admin.',
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      isAdmin: updatedUser.is_admin === 1,
      isSuperAdmin: updatedUser.is_super_admin === 1,
    }
  });
}
