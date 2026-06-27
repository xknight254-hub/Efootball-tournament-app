import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import * as crypto from 'crypto';

/**
 * Redeem Code System
 * 
 * Super admins generate codes that grant users full app access
 * (bypassing the 100 KES registration paywall).
 * 
 * Codes can be:
 * - Permanent (never expire) or time-limited
 * - Single-use or multi-use (configurable max_uses)
 */

function generateRedeemCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

/**
 * POST /api/admin/redeem-codes/generate
 * Generate one or more redeem codes (super admin only)
 * 
 * Body: { count?, length?, expiresInDays?, isPermanent?, maxUses?, note? }
 */
export function generateRedeemCodes(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const {
    count = 1,
    length = 8,
    expiresInDays = null,
    isPermanent = false,
    maxUses = 1,
    note = ''
  } = req.body;

  const numCount = Math.min(Math.max(parseInt(count) || 1, 1), 50);
  const codeLen = Math.min(Math.max(parseInt(length) || 8, 4), 12);
  const maxUseCount = Math.min(Math.max(parseInt(maxUses) || 1, 1), 1000);

  if (note && typeof note === 'string' && note.length > 200) {
    return res.status(400).json({ error: 'Note too long (max 200 chars)' });
  }

  const codes: { code: string; id: number }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < numCount; i++) {
    let code = generateRedeemCode(codeLen);
    let attempts = 0;

    while (attempts < 50) {
      const existing = db.prepare('SELECT id FROM redeem_codes WHERE code = ?').get(code);
      if (!existing) break;
      code = generateRedeemCode(codeLen);
      attempts++;
    }

    if (attempts >= 50) {
      errors.push(`Failed to generate unique code (attempt ${i + 1})`);
      continue;
    }

    try {
      let expiresAt = null;
      if (!isPermanent && expiresInDays) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(expiresInDays));
        expiresAt = d.toISOString();
      }

      const result = db.prepare(`
        INSERT INTO redeem_codes (code, created_by, expires_at, is_permanent, max_uses, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(code, req.user.id, expiresAt ? expiresAt.replace('T', '00:00:00.000Z').split('.')[0] : null, isPermanent ? 1 : 0, maxUseCount, note || null);

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
 * GET /api/admin/redeem-codes
 * List all redeem codes with usage info (super admin only)
 */
export function listRedeemCodes(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const codes = db.prepare(`
    SELECT rc.id, rc.code, rc.is_active, rc.expires_at, rc.is_permanent,
           rc.max_uses, rc.use_count, rc.note, rc.created_at, rc.used_at,
           creator.username as created_by_name,
           used_by.username as used_by_name
    FROM redeem_codes rc
    LEFT JOIN users creator ON rc.created_by = creator.id
    LEFT JOIN users used_by ON rc.used_by = used_by.id
    ORDER BY rc.created_at DESC
  `).all();

  const stats = {
    total: codes.length,
    active: (codes as any[]).filter((c: any) => c.is_active === 1).length,
    used: (codes as any[]).filter((c: any) => c.used_by_name).length,
    expired: (codes as any[]).filter((c: any) => c.expires_at && new Date(c.expires_at) < new Date()).length,
    permanent: (codes as any[]).filter((c: any) => c.is_permanent === 1).length,
  };

  res.json({ codes, stats });
}

/**
 * DELETE /api/admin/redeem-codes/:id
 * Revoke/deactivate a redeem code (super admin only)
 */
export function revokeRedeemCode(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { id } = req.params;
  const codeId = parseInt(id);

  if (isNaN(codeId)) {
    return res.status(400).json({ error: 'Invalid code ID' });
  }

  const code = db.prepare('SELECT * FROM redeem_codes WHERE id = ?').get(codeId) as any;
  if (!code) {
    return res.status(404).json({ error: 'Code not found' });
  }

  db.prepare('UPDATE redeem_codes SET is_active = 0 WHERE id = ?').run(codeId);

  res.json({ success: true, message: 'Code revoked' });
}

/**
 * POST /api/auth/redeem-code
 * Redeem a code to get full app access (any authenticated user)
 * 
 * Body: { code: string }
 */
export function redeemCode(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  const normalizedCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (normalizedCode.length < 4 || normalizedCode.length > 12) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  // Find the code
  const codeRecord = db.prepare(`
    SELECT * FROM redeem_codes
    WHERE code = ? AND is_active = 1
  `).get(normalizedCode) as any;

  if (!codeRecord) {
    return res.status(400).json({ error: 'Invalid or inactive code' });
  }

  // Check expiry
  if (!codeRecord.is_permanent && codeRecord.expires_at) {
    const now = new Date();
    const expiry = new Date(codeRecord.expires_at);
    if (now > expiry) {
      return res.status(400).json({ error: 'This code has expired' });
    }
  }

  // Check max uses
  if (codeRecord.use_count >= codeRecord.max_uses) {
    return res.status(400).json({ error: 'This code has reached its maximum uses' });
  }

  // Check if user already has registration_paid
  const user = db.prepare('SELECT registration_paid FROM users WHERE id = ?').get(req.user.id) as any;
  if (user && user.registration_paid === 1) {
    return res.status(400).json({ error: 'You already have full access' });
  }

  // Redeem: mark user as paid, increment use count
  db.prepare('UPDATE users SET registration_paid = 1 WHERE id = ?').run(req.user.id);
  db.prepare(`
    UPDATE redeem_codes
    SET use_count = use_count + 1,
        used_by = CASE WHEN used_by IS NULL THEN ? ELSE used_by END,
        used_at = CASE WHEN used_at IS NULL THEN datetime('now') ELSE used_at END
    WHERE id = ?
  `).run(req.user.id, codeRecord.id);

  // If max uses reached, mark as fully used
  if (codeRecord.use_count + 1 >= codeRecord.max_uses) {
    db.prepare('UPDATE redeem_codes SET is_active = 0 WHERE id = ?').run(codeRecord.id);
  }

  // Log
  db.prepare(`
    INSERT INTO admin_logs (admin_id, action, details)
    VALUES (?, 'REDEEM_CODE_USED', ?)
  `).run(req.user.id, JSON.stringify({ code: normalizedCode, codeId: codeRecord.id }));

  const updatedUser = db.prepare(
    'SELECT id, username, email, is_admin, is_super_admin, registration_paid FROM users WHERE id = ?'
  ).get(req.user.id) as any;

  res.json({
    success: true,
    message: 'Code redeemed successfully! You now have full access.',
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      isAdmin: updatedUser.is_admin === 1,
      isSuperAdmin: updatedUser.is_super_admin === 1,
      registrationPaid: updatedUser.registration_paid === 1,
    }
  });
}

/**
 * POST /api/auth/initiate-registration-payment
 * Initiate 100 KES STK Push for registration fee
 */
export async function initiateRegistrationPayment(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { phone } = req.body;
  let phoneNormalized = (phone || '').replace(/\D/g, '');
  if (phoneNormalized.startsWith('0')) phoneNormalized = '254' + phoneNormalized.slice(1);
  if (!phoneNormalized.match(/^2547\d{8}$/)) {
    return res.status(400).json({ error: 'Valid Safaricom number required (e.g. 0712345678)' });
  }

  const PAYNECTA_LINK_CODE = process.env.PAYNECTA_PAYMENT_LINK_CODE || '';
  if (!PAYNECTA_LINK_CODE) {
    return res.status(500).json({ error: 'Paynecta payment link not configured.' });
  }

  // Dynamically import paynecta service
  const paynectaService = (await import('../services/paynectaService.js')).default;
  const paymentResult = await paynectaService.initializePayment(PAYNECTA_LINK_CODE, phoneNormalized, 100);

  if (!paymentResult.success && !paymentResult.transactionReference) {
    return res.status(502).json({ error: paymentResult.message || 'Payment initiation failed.' });
  }

  // Store pending payment reference on user record (in a simple way)
  db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phoneNormalized, req.user.id);

  res.json({
    message: 'STK Push sent. Complete payment on your phone.',
    checkoutId: paymentResult.transactionReference,
  });
}

/**
 * GET /api/auth/registration-payment-status?checkoutId=xxx
 * Check if registration payment completed (polls via Paynecta)
 */
export async function checkRegistrationPaymentStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { checkoutId } = req.query;
  if (!checkoutId || typeof checkoutId !== 'string') {
    return res.status(400).json({ error: 'checkoutId required' });
  }

  // Check if user already marked as paid
  const user = db.prepare('SELECT registration_paid FROM users WHERE id = ?').get(req.user.id) as any;
  if (user?.registration_paid === 1) {
    return res.json({ status: 'completed' });
  }

  // Query Paynecta for status
  try {
    const paynectaService = (await import('../services/paynectaService.js')).default;
    const result = await paynectaService.queryPaymentStatus(checkoutId);

    if (result.success && (result.status === 'completed' || result.status === 'success')) {
      // Mark user as paid
      db.prepare('UPDATE users SET registration_paid = 1 WHERE id = ?').run(req.user.id);
      return res.json({ status: 'completed' });
    }

    return res.json({ status: result.status || 'pending' });
  } catch {
    return res.json({ status: 'pending' });
  }
}

/**
 * GET /api/auth/registration-status
 * Check if the current user has paid registration (for paywall check)
 */
export function registrationStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const user = db.prepare(
    'SELECT registration_paid, is_super_admin, telegram_id FROM users WHERE id = ?'
  ).get(req.user.id) as any;

  if (!user) return res.status(404).json({ error: 'User not found' });

  // Super admin (Telegram ID 8258021755) always bypasses
  const isSuperAdminTelegram = String(user.telegram_id) === '8258021755';
  const hasAccess = user.registration_paid === 1 || user.is_super_admin === 1 || isSuperAdminTelegram;

  res.json({
    registrationPaid: user.registration_paid === 1,
    hasAccess,
    isSuperAdmin: user.is_super_admin === 1 || isSuperAdminTelegram,
  });
}
