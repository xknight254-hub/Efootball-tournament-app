import { Response } from 'express';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';

const SUPER_ADMIN_TELEGRAM_ID = '8258021755';
const GRACE_PERIOD_HOURS = 24;
const PAYMENT_LINK_CODE = process.env.PAYNECTA_PAYMENT_LINK_CODE || 'toss-tournaments';
const APP_URL = process.env.APP_URL || 'https://xtournament.duckdns.org';

// ─── Helper: Check if user is super admin ───
function isSuperAdmin(user: any): boolean {
  return user?.is_super_admin === 1 || String(user?.telegram_id) === SUPER_ADMIN_TELEGRAM_ID;
}

// ─── Helper: Get active subscription for admin ───
function getActiveSubscription(adminId: number): any {
  const sub = db.prepare(`
    SELECT s.*, t.name as tier_name, t.price_kes, t.tournament_limit, t.has_sub_admin
    FROM admin_subscriptions s
    JOIN subscription_tiers t ON s.tier_id = t.id
    WHERE s.admin_id = ? AND s.status IN ('active', 'grace_period')
    ORDER BY s.created_at DESC
    LIMIT 1
  `).get(adminId);
  return sub || null;
}

// ─── Helper: Calculate price with billing cycle discount ───
function calculatePrice(basePrice: number, billingCycle: string): { amount: number; label: string } {
  switch (billingCycle) {
    case 'quarterly':
      return { amount: Math.round(basePrice * 3 * 0.7), label: '3 months (30% off)' };
    case 'yearly':
      return { amount: Math.round(basePrice * 12 * 0.7), label: '12 months (30% off)' };
    default:
      return { amount: basePrice, label: 'Monthly' };
  }
}

// ─── Helper: Calculate expiry date ───
function calculateExpiry(billingCycle: string): Date {
  const now = new Date();
  switch (billingCycle) {
    case 'quarterly':
      now.setMonth(now.getMonth() + 3);
      break;
    case 'yearly':
      now.setFullYear(now.getFullYear() + 1);
      break;
    default:
      now.setMonth(now.getMonth() + 1);
  }
  return now;
}

// ═══════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════

/**
 * GET /api/subscription-tiers
 * List all active subscription tiers (public)
 */
export function listTiers(req: AuthRequest, res: Response) {
  const tiers = db.prepare(
    'SELECT * FROM subscription_tiers WHERE is_active = 1 ORDER BY sort_order'
  ).all();

  res.json({ tiers });
}

/**
 * POST /api/subscriptions/subscribe
 * Subscribe to a tier — creates Paynecta hosted payment link
 */
export function subscribe(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  // Super admin bypass — auto-approve Enterprise
  if (isSuperAdmin(req.user)) {
    const enterpriseTier = db.prepare("SELECT * FROM subscription_tiers WHERE name = 'Enterprise'").get() as any;
    if (enterpriseTier) {
      const existing = getActiveSubscription(req.user.id);
      if (existing) {
        return res.json({ message: 'Already have active subscription', subscription: existing, bypass: true });
      }
      const now = new Date();
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 100);
      db.prepare(`
        INSERT INTO admin_subscriptions (admin_id, tier_id, status, amount_paid, billing_cycle, started_at, expires_at)
        VALUES (?, ?, 'active', 0, 'yearly', ?, ?)
      `).run(req.user.id, enterpriseTier.id, now.toISOString().split('.')[0], expiry.toISOString().split('.')[0]);
      const sub = getActiveSubscription(req.user.id);
      return res.json({ message: 'Enterprise access granted (super admin)', subscription: sub, bypass: true });
    }
  }

  const { tierId, billingCycle = 'monthly' } = req.body;

  if (!tierId) return res.status(400).json({ error: 'tierId required' });
  if (!['monthly', 'quarterly', 'yearly'].includes(billingCycle)) {
    return res.status(400).json({ error: 'Invalid billing cycle' });
  }

  const tier = db.prepare('SELECT * FROM subscription_tiers WHERE id = ? AND is_active = 1').get(tierId) as any;
  if (!tier) return res.status(404).json({ error: 'Tier not found' });

  // Check if already has active subscription
  const existing = getActiveSubscription(req.user.id);
  if (existing) {
    return res.status(400).json({ error: 'You already have an active subscription', subscription: existing });
  }

  const { amount, label } = calculatePrice(tier.price_kes, billingCycle);
  const reference = `subscription_${req.user.id}_${Date.now()}`;

  // Enterprise tier requires manual approval
  const status = tier.name === 'Enterprise' ? 'pending_approval' : 'pending';

  // Create subscription record
  const result = db.prepare(`
    INSERT INTO admin_subscriptions (admin_id, tier_id, status, amount_paid, payment_reference, billing_cycle)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, tierId, status, amount, reference, billingCycle);

  // Create payment record
  db.prepare(`
    INSERT INTO paynecta_payments (user_id, subscription_id, amount, reference, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(req.user.id, result.lastInsertRowid, amount, reference);

  // Build Paynecta hosted payment link
  const paymentUrl = `https://paynecta.co.ke/pay/${PAYMENT_LINK_CODE}?amount=${amount}&reference=${reference}&callback=${encodeURIComponent(`${APP_URL}/api/subscriptions/callback?ref=${reference}`)}`;

  res.json({
    subscriptionId: result.lastInsertRowid,
    tier: { name: tier.name, price: tier.price_kes },
    billing: { cycle: billingCycle, label, amount },
    paymentUrl,
    status,
    message: tier.name === 'Enterprise'
      ? 'Enterprise tier requires manual approval. Payment link will be activated after approval.'
      : 'Complete payment to activate your subscription.',
  });
}

/**
 * GET /api/subscriptions/callback?ref=xxx
* Paynecta redirects here after payment
*/
export function paymentCallback(req: AuthRequest, res: Response) {
  const { ref } = req.query;
  if (!ref || typeof ref !== 'string') {
    return res.redirect('/subscribe?error=invalid_reference');
  }

  const payment = db.prepare('SELECT * FROM paynecta_payments WHERE reference = ?').get(ref) as any;
  if (!payment) {
    return res.redirect('/subscribe?error=payment_not_found');
  }

  // Update payment status
  db.prepare("UPDATE paynecta_payments SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(payment.id);

  // Activate subscription
  const now = new Date();
  const cycle = db.prepare('SELECT billing_cycle FROM admin_subscriptions WHERE id = ?').get(payment.subscription_id) as any;
  const expiry = calculateExpiry(cycle?.billing_cycle || 'monthly');
  const graceEnd = new Date(expiry.getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);

  db.prepare(`
    UPDATE admin_subscriptions
    SET status = 'active', started_at = ?, expires_at = ?, grace_period_end = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(now.toISOString().split('.')[0], expiry.toISOString().split('.')[0], graceEnd.toISOString().split('.')[0], payment.subscription_id);

  res.redirect('/subscribe?success=true');
}

/**
 * POST /api/subscriptions/verify
 * Verify payment status (polling from frontend)
 */
export function verifyPayment(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'reference required' });

  const payment = db.prepare('SELECT * FROM paynecta_payments WHERE reference = ? AND user_id = ?').get(reference, req.user.id) as any;
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const subscription = db.prepare(`
    SELECT s.*, t.name as tier_name, t.price_kes, t.tournament_limit, t.has_sub_admin
    FROM admin_subscriptions s
    JOIN subscription_tiers t ON s.tier_id = t.id
    WHERE s.id = ?
  `).get(payment.subscription_id) as any;

  res.json({
    paymentStatus: payment.status,
    subscription,
  });
}

/**
 * GET /api/subscriptions/my
 * Get current user's subscription status
 */
export function mySubscription(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  // Super admin always has Enterprise
  if (isSuperAdmin(req.user)) {
    return res.json({
      subscription: {
        status: 'active',
        tier_name: 'Enterprise',
        tournament_limit: -1,
        has_sub_admin: 1,
        expires_at: '2099-12-31',
        isSuperAdmin: true,
      },
      hasAccess: true,
    });
  }

  const sub = getActiveSubscription(req.user.id);

  if (!sub) {
    return res.json({ subscription: null, hasAccess: false });
  }

  // Check if expired → grace period
  const now = new Date();
  const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
  const graceEnd = sub.grace_period_end ? new Date(sub.grace_period_end) : null;

  let status = sub.status;

  if (expiresAt && now > expiresAt) {
    if (graceEnd && now <= graceEnd) {
      // In grace period
      if (sub.status !== 'grace_period') {
        db.prepare("UPDATE admin_subscriptions SET status = 'grace_period', updated_at = datetime('now') WHERE id = ?").run(sub.id);
        status = 'grace_period';
      }
    } else {
      // Fully expired → locked
      if (sub.status !== 'expired') {
        db.prepare("UPDATE admin_subscriptions SET status = 'expired', updated_at = datetime('now') WHERE id = ?").run(sub.id);
        status = 'expired';
      }
    }
  }

  const hasAccess = status === 'active' || status === 'grace_period';

  res.json({
    subscription: { ...sub, status },
    hasAccess,
    isGracePeriod: status === 'grace_period',
    isExpired: status === 'expired',
  });
}

/**
 * GET /api/subscriptions/status
 * Combined registration + subscription status for paywall check
 */
export function fullStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const user = db.prepare('SELECT registration_paid, is_super_admin, telegram_id FROM users WHERE id = ?').get(req.user.id) as any;

  // Super admin bypass
  if (isSuperAdmin(user)) {
    return res.json({
      registrationPaid: true,
      hasAccess: true,
      isSuperAdmin: true,
      subscription: { status: 'active', tier_name: 'Enterprise', tournament_limit: -1, has_sub_admin: 1 },
    });
  }

  const regPaid = user?.registration_paid === 1;
  const sub = getActiveSubscription(req.user.id);

  let subStatus = 'none';
  let hasAccess = false;

  if (sub) {
    const now = new Date();
    const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
    const graceEnd = sub.grace_period_end ? new Date(sub.grace_period_end) : null;

    if (expiresAt && now > expiresAt && graceEnd && now <= graceEnd) {
      subStatus = 'grace_period';
      hasAccess = true;
    } else if (expiresAt && graceEnd && now > graceEnd) {
      subStatus = 'expired';
      hasAccess = false;
    } else {
      subStatus = sub.status;
      hasAccess = sub.status === 'active';
    }
  }

  res.json({
    registrationPaid: regPaid,
    hasAccess: regPaid && (hasAccess || !sub),
    isSuperAdmin: false,
    subscription: sub ? { ...sub, status: subStatus } : null,
  });
}

/**
 * GET /api/subscriptions/all
 * Super admin: list all subscriptions with revenue
 */
export function listAllSubscriptions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!isSuperAdmin(req.user) && req.user.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Super admin required' });
  }

  const subscriptions = db.prepare(`
    SELECT s.*, t.name as tier_name, t.price_kes, t.tournament_limit, t.has_sub_admin,
           u.username as admin_name, u.email as admin_email,
           sub_u.username as sub_admin_name
    FROM admin_subscriptions s
    JOIN subscription_tiers t ON s.tier_id = t.id
    JOIN users u ON s.admin_id = u.id
    LEFT JOIN users sub_u ON s.sub_admin_user_id = sub_u.id
    ORDER BY s.created_at DESC
    LIMIT 100
  `).all();

  // Revenue stats
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount_paid), 0) as total FROM admin_subscriptions WHERE status IN ('active','grace_period')").get() as any;
  const monthlyRevenue = db.prepare("SELECT COALESCE(SUM(amount_paid), 0) as total FROM admin_subscriptions WHERE status IN ('active','grace_period') AND billing_cycle = 'monthly'").get() as any;
  const quarterlyRevenue = db.prepare("SELECT COALESCE(SUM(amount_paid), 0) as total FROM admin_subscriptions WHERE status IN ('active','grace_period') AND billing_cycle = 'quarterly'").get() as any;
  const yearlyRevenue = db.prepare("SELECT COALESCE(SUM(amount_paid), 0) as total FROM admin_subscriptions WHERE status IN ('active','grace_period') AND billing_cycle = 'yearly'").get() as any;

  const tierBreakdown = db.prepare(`
    SELECT t.name, COUNT(s.id) as count, SUM(s.amount_paid) as revenue
    FROM admin_subscriptions s
    JOIN subscription_tiers t ON s.tier_id = t.id
    WHERE s.status IN ('active','grace_period')
    GROUP BY t.id
  `).all();

  const pendingApprovals = (subscriptions as any[]).filter(s => s.status === 'pending_approval');

  res.json({
    subscriptions,
    stats: {
      totalRevenue: totalRevenue.total,
      monthly: monthlyRevenue.total,
      quarterly: quarterlyRevenue.total,
      yearly: yearlyRevenue.total,
      tierBreakdown,
      pendingApprovals: pendingApprovals.length,
    },
    pendingApprovals,
  });
}

/**
 * PUT /api/subscriptions/:id/approve
 * Super admin: approve Enterprise subscription
 */
export function approveSubscription(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!isSuperAdmin(req.user) && req.user.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Super admin required' });
  }

  const { id } = req.params;
  const sub = db.prepare('SELECT * FROM admin_subscriptions WHERE id = ?').get(parseInt(id)) as any;
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });
  if (sub.status !== 'pending_approval') {
    return res.status(400).json({ error: 'Subscription is not pending approval' });
  }

  const now = new Date();
  const cycle = sub.billing_cycle || 'monthly';
  const expiry = calculateExpiry(cycle);
  const graceEnd = new Date(expiry.getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);

  db.prepare(`
    UPDATE admin_subscriptions
    SET status = 'active', approved_by = ?, approved_at = datetime('now'),
        started_at = ?, expires_at = ?, grace_period_end = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, now.toISOString().split('.')[0], expiry.toISOString().split('.')[0], graceEnd.toISOString().split('.')[0], parseInt(id));

  // Activate payment record
  db.prepare("UPDATE paynecta_payments SET status = 'completed', completed_at = datetime('now') WHERE subscription_id = ?").run(parseInt(id));

  const updated = getActiveSubscription(sub.admin_id);
  res.json({ message: 'Subscription approved', subscription: updated });
}

/**
 * PUT /api/subscriptions/:id/reject
 * Super admin: reject Enterprise subscription
 */
export function rejectSubscription(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!isSuperAdmin(req.user) && req.user.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Super admin required' });
  }

  const { id } = req.params;
  const { reason } = req.body;

  db.prepare(`
    UPDATE admin_subscriptions
    SET status = 'rejected', rejected_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(reason || 'Rejected by admin', parseInt(id));

  res.json({ message: 'Subscription rejected' });
}

/**
 * POST /api/subscriptions/assign-sub-admin
 * Assign a sub-admin (Scale/Enterprise tiers only)
 */
export function assignSubAdmin(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { subAdminUsername } = req.body;
  if (!subAdminUsername) return res.status(400).json({ error: 'subAdminUsername required' });

  // Get current subscription
  const sub = getActiveSubscription(req.user.id);
  if (!sub) return res.status(403).json({ error: 'No active subscription' });
  if (!sub.has_sub_admin) {
    return res.status(403).json({ error: 'Your tier does not include sub-admin access' });
  }
  if (sub.sub_admin_user_id) {
    return res.status(400).json({ error: 'Sub-admin already assigned. Remove current first.' });
  }

  // Find the user to promote
  const subAdminUser = db.prepare('SELECT id, username FROM users WHERE username = ?').get(subAdminUsername) as any;
  if (!subAdminUser) return res.status(404).json({ error: 'User not found' });
  if (subAdminUser.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot assign yourself as sub-admin' });
  }

  db.prepare(`
    UPDATE admin_subscriptions
    SET sub_admin_user_id = ?, sub_admin_assigned_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(subAdminUser.id, sub.id);

  // Give the sub-admin admin rights
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(subAdminUser.id);

  res.json({
    message: `${subAdminUsername} is now your sub-admin`,
    subAdmin: { id: subAdminUser.id, username: subAdminUser.username },
  });
}

/**
 * DELETE /api/subscriptions/remove-sub-admin
 * Remove assigned sub-admin
 */
export function removeSubAdmin(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const sub = getActiveSubscription(req.user.id);
  if (!sub) return res.status(403).json({ error: 'No active subscription' });
  if (!sub.sub_admin_user_id) {
    return res.status(400).json({ error: 'No sub-admin assigned' });
  }

  const subAdminId = sub.sub_admin_user_id;

  db.prepare(`
    UPDATE admin_subscriptions
    SET sub_admin_user_id = NULL, sub_admin_assigned_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(sub.id);

  // Revoke admin rights (only if they aren't admin from another source)
  const otherSub = db.prepare('SELECT id FROM admin_subscriptions WHERE sub_admin_user_id = ? AND id != ?').get(subAdminId, sub.id);
  if (!otherSub) {
    db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(subAdminId);
  }

  res.json({ message: 'Sub-admin removed' });
}

/**
 * GET /api/subscriptions/check-limits
 * Check if admin can create more tournaments
 */
export function checkLimits(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  // Super admin has no limits
  if (isSuperAdmin(req.user)) {
    return res.json({ canCreate: true, limit: -1, used: 0, remaining: -1 });
  }

  const sub = getActiveSubscription(req.user.id);
  if (!sub) {
    return res.json({ canCreate: false, reason: 'no_subscription', limit: 0, used: 0, remaining: 0 });
  }

  if (sub.status !== 'active' && sub.status !== 'grace_period') {
    return res.json({ canCreate: false, reason: 'subscription_' + sub.status, limit: 0, used: 0, remaining: 0 });
  }

  // Count tournaments created by this admin
  const count = db.prepare('SELECT COUNT(*) as c FROM tournaments WHERE owner_id = ?').get(req.user.id) as any;
  const used = count.c;
  const limit = sub.tournament_limit;

  // -1 = unlimited
  if (limit === -1) {
    return res.json({ canCreate: true, limit: -1, used, remaining: -1 });
  }

  const remaining = Math.max(0, limit - used);
  res.json({ canCreate: remaining > 0, limit, used, remaining });
}

/**
 * POST /api/subscriptions/increment-tournament-count
 * Call when admin creates a tournament
 */
export function incrementTournamentCount(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const sub = getActiveSubscription(req.user.id);
  if (!sub) return res.status(403).json({ error: 'No active subscription' });

  db.prepare(`
    UPDATE admin_subscriptions
    SET tournaments_created = tournaments_created + 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(sub.id);

  res.json({ success: true, tournamentsCreated: sub.tournaments_created + 1 });
}

export { isSuperAdmin, getActiveSubscription };
