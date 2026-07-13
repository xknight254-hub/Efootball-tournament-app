import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { generateToken } from '../middleware/auth.js';
import { sanitizeUsername, sanitizeEmail } from '../utils/sanitize.js';
export async function register(req, res) {
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
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
        return res.status(400).json({ error: 'Username or email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // Check if this is the first user — make them SUPER admin
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const isFirstUser = userCount === 0;
    const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, first_name, last_name, is_admin, is_super_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(username, email.toLowerCase(), passwordHash, firstName || null, lastName || null, isFirstUser ? 1 : 0, isFirstUser ? 1 : 0);
    const user = db.prepare('SELECT id, username, email, first_name, last_name, is_admin, is_super_admin, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user.id);
    res.status(201).json({
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            isAdmin: user.is_admin === 1,
            isSuperAdmin: user.is_super_admin === 1
        },
        token
    });
}
export async function login(req, res) {
    const rawUsername = req.body.username;
    const password = req.body.password;
    const username = sanitizeUsername(rawUsername);
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username.toLowerCase());
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
            isAdmin: user.is_admin === 1,
            isSuperAdmin: user.is_super_admin === 1
        },
        token
    });
}
export function getMe(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        firstName: req.user.first_name || null,
        lastName: req.user.last_name || null,
        avatarUrl: req.user.avatar_url || null,
        isAdmin: req.user.is_admin === 1,
        isSuperAdmin: req.user.is_super_admin === 1,
        isOrganizer: req.user.is_organizer === 1,
        registrationPaid: req.user.registration_paid === 1,
        telegramId: req.user.telegram_id || null,
    });
}
export function getUserById(req, res) {
    const { id } = req.params;
    const userId = parseInt(id);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    const user = db.prepare('SELECT id, username, email, first_name, last_name, avatar_url, is_admin, created_at FROM users WHERE id = ?').get(userId);
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
export function updateProfile(req, res) {
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
  `).run(username || null, email ? email.toLowerCase() : null, firstName || null, lastName || null, avatarUrl || null, req.user.id);
    const updated = db.prepare('SELECT id, username, email, first_name, last_name, avatar_url, is_admin FROM users WHERE id = ?').get(req.user.id);
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
// ─── USER PREFERENCES ──────────────────────────────────────────
export function getPreferences(req, res) {
    if (!req.user)
        return res.status(401).json({ error: 'Not authenticated' });
    const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(req.user.id);
    let prefs = {};
    try {
        prefs = JSON.parse(row?.preferences || '{}');
    }
    catch { /* ignore */ }
    res.json({ preferences: prefs });
}
export function updatePreferences(req, res) {
    if (!req.user)
        return res.status(401).json({ error: 'Not authenticated' });
    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({ error: 'Preferences must be a JSON object' });
    }
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(preferences), req.user.id);
    res.json({ preferences });
}
export function logout(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const token = req.headers['authorization']?.replace('Bearer ', '') ||
        req.headers['x-auth-token'];
    if (token) {
        db.prepare('INSERT INTO token_blacklist (token, expires_at) VALUES (?, datetime("now", "+7 days"))').run(token);
    }
    res.json({ message: 'Logged out successfully' });
}
// ─── ACCOUNT DELETION ─────────────────────────────────────────
export function deleteAccount(req, res) {
    if (!req.user)
        return res.status(401).json({ error: 'Not authenticated' });
    const userId = req.user.id;
    try {
        // Remove user data from related tables
        db.prepare('DELETE FROM participants WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM paynecta_payments WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM token_blacklist WHERE token IN (SELECT token FROM token_blacklist)').run();
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        res.json({ message: 'Account deleted permanently' });
    }
    catch (err) {
        console.error('[Auth] Delete account error:', err.message);
        res.status(500).json({ error: 'Failed to delete account' });
    }
}
// ─── USER STATS ───
export function getUserStats(req, res) {
    const { id } = req.params;
    const userId = parseInt(id);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    // Count completed matches where user participated
    const matchesPlayed = db.prepare(`
    SELECT COUNT(*) as count FROM matches
    WHERE (player1_id = ? OR player2_id = ?)
    AND status = 'completed'
  `).get(userId, userId)?.count || 0;
    // Count wins
    const wins = db.prepare(`
    SELECT COUNT(*) as count FROM matches
    WHERE winner_id = ? AND status = 'completed'
  `).get(userId)?.count || 0;
    const losses = matchesPlayed - wins;
    const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;
    // Count tournaments won (tournaments where winner_id = userId)
    const tournamentsWon = db.prepare(`
    SELECT COUNT(*) as count FROM tournaments
    WHERE winner_id = ?
  `).get(userId)?.count || 0;
    res.json({
        matchesPlayed,
        wins,
        losses,
        winRate,
        tournamentsWon,
    });
}
// ─── Token Refresh ─────────────────────────────────────────────
// For Telegram sessions where the JWT might expire but the Telegram session is still valid.
// Accepts current valid token, issues a new one.
export async function refreshToken(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const token = generateToken(req.user.id);
    res.json({ token });
}
// ─── Password Reset (no email — Telegram-based) ───
export async function forgotPassword(req, res) {
    const { username } = req.body;
    if (!username)
        return res.status(400).json({ error: "Username or email required" });
    const user = db.prepare("SELECT id, username, email FROM users WHERE username = ? OR email = ?")
        .get(username.toLowerCase(), username.toLowerCase());
    if (!user) {
        // Don't reveal if user exists
        return res.json({ message: "If an account exists, a reset link has been sent" });
    }
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    // Store hash with expiry (1 hour)
    db.prepare(`CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`).run();
    db.prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))")
        .run(user.id, resetHash);
    // Return token — in production this would be sent via Telegram/email
    // For Telegram Mini App users, the bot sends it directly
    res.json({
        message: "Password reset initiated",
        resetToken, // In production: only send via secure channel
        expiresIn: "1 hour"
    });
}
export async function resetPassword(req, res) {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
        return res.status(400).json({ error: "Reset token and new password required" });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!/[A-Z]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain an uppercase letter" });
    }
    if (!/[a-z]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain a lowercase letter" });
    }
    if (!/[0-9]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain a number" });
    }
    // Hash the token and look it up
    const resetHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const reset = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')").get(resetHash);
    if (!reset) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, reset.user_id);
    // Mark token as used
    db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(reset.id);
    res.json({ message: "Password reset successful" });
}
// ─── Phone OTP Auth ────────────────────────────────────────────
// Simple phone-based auth for users without Telegram or password.
// OTP is generated server-side and "sent" (in production via SMS gateway).
// For now, we generate it and return it in the response (dev mode).
const otpStore = new Map();
function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
function normalizePhone(phone) {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0'))
        p = '254' + p.slice(1);
    if (p.startsWith('2540'))
        p = '254' + p.slice(4);
    return p;
}
export async function sendOTP(req, res) {
    const { phone } = req.body;
    if (!phone)
        return res.status(400).json({ error: 'Phone number required' });
    const normalized = normalizePhone(phone);
    if (!normalized.match(/^2547\d{8}$/)) {
        return res.status(400).json({ error: 'Valid Kenyan number required (e.g., 0712345678)' });
    }
    // Rate limit: max 3 OTPs per phone per 5 minutes
    const recent = db.prepare(`
    SELECT COUNT(*) as count FROM admin_logs
    WHERE action = 'otp_send' AND details LIKE ? AND created_at > datetime('now', '-5 minutes')
  `).get(`%${normalized}%`);
    if (recent.count >= 3) {
        return res.status(429).json({ error: 'Too many requests. Wait 5 minutes.' });
    }
    const code = generateOTP();
    otpStore.set(normalized, { code, expires: Date.now() + 5 * 60 * 1000, attempts: 0 });
    // Log for audit
    db.prepare("INSERT INTO admin_logs (admin_id, action, details) VALUES (?, 'otp_send', ?)")
        .run('system', `OTP sent to ${normalized}`);
    // In production: send via SMS gateway (Africa's Talking, Twilio, etc.)
    // For dev: return the code in response
    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
        message: 'OTP sent',
        ...(isDev ? { code } : {}), // Only in dev!
        expiresIn: '5 minutes',
    });
}
export async function verifyOTP(req, res) {
    const { phone, code } = req.body;
    if (!phone || !code)
        return res.status(400).json({ error: 'Phone and code required' });
    const normalized = normalizePhone(phone);
    const stored = otpStore.get(normalized);
    if (!stored) {
        return res.status(400).json({ error: 'No OTP found. Request a new one.' });
    }
    if (Date.now() > stored.expires) {
        otpStore.delete(normalized);
        return res.status(400).json({ error: 'OTP expired. Request a new one.' });
    }
    if (stored.attempts >= 5) {
        otpStore.delete(normalized);
        return res.status(400).json({ error: 'Too many attempts. Request a new one.' });
    }
    if (stored.code !== code.trim()) {
        stored.attempts++;
        return res.status(400).json({ error: 'Invalid code' });
    }
    // OTP valid — find or create user
    otpStore.delete(normalized);
    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normalized);
    if (!user) {
        // Auto-create account
        const username = `p_${normalized.slice(-8)}`;
        const email = `${normalized}@phone.efootball`;
        let finalUsername = username;
        let counter = 1;
        while (db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername)) {
            finalUsername = `${username}_${counter}`;
            counter++;
        }
        const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
        const isFirstUser = existingCount.cnt === 0;
        const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, phone, is_admin, is_super_admin)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(finalUsername, email, 'phone_auth', normalized, isFirstUser ? 1 : 0, isFirstUser ? 1 : 0);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
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
            isAdmin: user.is_admin === 1,
            isSuperAdmin: user.is_super_admin === 1,
            phone: user.phone,
        },
        token,
    });
}
//# sourceMappingURL=authController.js.map