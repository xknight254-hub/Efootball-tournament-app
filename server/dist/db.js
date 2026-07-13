/* eslint-disable @typescript-eslint/no-explicit-any */
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbDir = join(__dirname, '..', '..', 'data');
const dbPath = join(dbDir, 'efootball.db');
let sqlDb = null;
let initialized = false;
function saveDb() {
    if (!sqlDb)
        return;
    try {
        if (!existsSync(dbDir))
            mkdirSync(dbDir, { recursive: true });
        const data = sqlDb.export();
        writeFileSync(dbPath, Buffer.from(data));
    }
    catch (e) {
        console.error('[DB] Save failed:', e);
    }
}
async function initDBInternal() {
    if (sqlDb && initialized)
        return sqlDb;
    const SQL = await initSqlJs({
        locateFile: (file) => join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
    });
    // Try to load existing DB from file
    if (existsSync(dbPath)) {
        try {
            const buffer = readFileSync(dbPath);
            sqlDb = new SQL.Database(new Uint8Array(buffer));
            console.log('[DB] Loaded from file');
        }
        catch (e) {
            console.error('[DB] Failed to load file, creating new:', e);
            sqlDb = new SQL.Database();
        }
    }
    else {
        sqlDb = new SQL.Database();
    }
    initialized = true;
    // Create tables if they don't exist
    sqlDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      avatar_url TEXT,
      is_admin INTEGER DEFAULT 0,
      is_super_admin INTEGER DEFAULT 0,
      is_organizer INTEGER DEFAULT 0,
      preferences TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      used_by INTEGER,
      used_at DATETIME,
      is_active INTEGER DEFAULT 1,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (used_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      used_by INTEGER,
      used_at DATETIME,
      is_active INTEGER DEFAULT 1,
      expires_at DATETIME,
      is_permanent INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT 1,
      use_count INTEGER DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (used_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS subscription_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      price_kes INTEGER NOT NULL,
      tournament_limit INTEGER NOT NULL,
      has_sub_admin INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS admin_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      tier_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      amount_paid INTEGER DEFAULT 0,
      payment_reference TEXT,
      payment_method TEXT DEFAULT 'paynecta',
      billing_cycle TEXT DEFAULT 'monthly',
      started_at DATETIME,
      expires_at DATETIME,
      grace_period_end DATETIME,
      tournaments_created INTEGER DEFAULT 0,
      sub_admin_user_id INTEGER,
      sub_admin_assigned_at DATETIME,
      approved_by INTEGER,
      approved_at DATETIME,
      rejected_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users(id),
      FOREIGN KEY (tier_id) REFERENCES subscription_tiers(id),
      FOREIGN KEY (sub_admin_user_id) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS paynecta_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subscription_id INTEGER,
      amount INTEGER NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      paynecta_transaction_ref TEXT,
      callback_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (subscription_id) REFERENCES admin_subscriptions(id)
    );

    CREATE TABLE IF NOT EXISTS tournament_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tournament_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      receipt_code TEXT,
      till TEXT,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      UNIQUE (user_id, tournament_id)
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      platform TEXT DEFAULT 'efootball',
      format TEXT NOT NULL,
      max_players INTEGER NOT NULL,
      best_of INTEGER DEFAULT 1,
      status TEXT DEFAULT 'registration_open',
      owner_id INTEGER NOT NULL,
      winner_id INTEGER,
      prize_pool TEXT,
      registration_deadline DATETIME,
      result_deadline_hours INTEGER DEFAULT 24,
      rules TEXT,
      group_count INTEGER DEFAULT 0,
      bracket_type TEXT DEFAULT 'single',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'registered',
      seed INTEGER,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      player1_id INTEGER,
      player2_id INTEGER,
      player1_score INTEGER,
      player2_score INTEGER,
      winner_id INTEGER,
      status TEXT DEFAULT 'pending',
      confirmation_status TEXT DEFAULT 'pending',
      submitted_by INTEGER,
      submitted_at DATETIME,
      confirmed_at DATETIME,
      screenshot_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS token_blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS whatsapp_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER DEFAULT 0,
      mpesa_till TEXT DEFAULT '',
      ai_enabled INTEGER DEFAULT 0,
      ai_model TEXT DEFAULT 'oc/deepseek-v4-flash-free',
      broadcast_group_jid TEXT
    );

    CREATE TABLE IF NOT EXISTS wager_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL,
      challenger_id INTEGER,
      stake_amount INTEGER NOT NULL,
      commission INTEGER DEFAULT 0,
      total_pot INTEGER NOT NULL,
      match_code TEXT UNIQUE NOT NULL,
      creator_telegram_id TEXT,
      challenger_telegram_id TEXT,
      status TEXT DEFAULT 'awaiting_payment',
      winner_id INTEGER,
      creator_confirmed INTEGER DEFAULT 0,
      challenger_confirmed INTEGER DEFAULT 0,
      creator_winner_choice TEXT,
      challenger_winner_choice TEXT,
      dispute_reason TEXT,
      resolved_by INTEGER,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS wager_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      payer_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      paynecta_transaction_ref TEXT,
      mpesa_receipt TEXT,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (challenge_id) REFERENCES wager_challenges(id),
      FOREIGN KEY (payer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
    sqlDb.run(`
    CREATE TABLE IF NOT EXISTS waiting_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
    // ─── Verification tables ───────────────────────────────────────
    sqlDb.run(`
    CREATE TABLE IF NOT EXISTS result_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      uploader_id INTEGER NOT NULL,
      screenshot_url TEXT,
      screenshot_hash TEXT,
      ocr_team_left TEXT,
      ocr_team_right TEXT,
      ocr_score_left INTEGER,
      ocr_score_right INTEGER,
      ocr_match_time TEXT,
      ocr_raw_text TEXT,
      ocr_confidence REAL DEFAULT 0,
      verification_confidence REAL DEFAULT 0,
      team_match_result TEXT DEFAULT 'pending',
      fraud_score REAL DEFAULT 0,
      fraud_flags TEXT,
      verification_status TEXT DEFAULT 'pending',
      admin_review_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      reviewed_by INTEGER,
      FOREIGN KEY (match_id) REFERENCES matches(id),
      FOREIGN KEY (uploader_id) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );
  `);
    sqlDb.run(`
    CREATE TABLE IF NOT EXISTS fraud_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      detection_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submission_id) REFERENCES result_submissions(id)
    );
  `);
    // Migrate existing tables with new columns
    try {
        sqlDb.run('ALTER TABLE tournaments ADD COLUMN group_count INTEGER DEFAULT 0');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE tournaments ADD COLUMN bracket_type TEXT DEFAULT \'single\'');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN telegram_id TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN telegram_username TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN telegram_photo_url TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE tournaments ADD COLUMN image_url TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE tournaments ADD COLUMN entry_fee INTEGER DEFAULT 0');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE tournaments ADD COLUMN access_token TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE tournaments ADD COLUMN is_private INTEGER DEFAULT 0');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE participants ADD COLUMN team_name TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE participants ADD COLUMN team_logo_url TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE matches ADD COLUMN player1_team TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE matches ADD COLUMN player2_team TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE matches ADD COLUMN opponent_screenshot_url TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE matches ADD COLUMN verification_status TEXT DEFAULT \'none\'');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE matches ADD COLUMN deadline_at DATETIME');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN phone TEXT');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN registration_paid INTEGER DEFAULT 0');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN is_organizer INTEGER DEFAULT 0');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE matches ADD COLUMN scheduled_time DATETIME');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE whatsapp_settings ADD COLUMN reminder_enabled INTEGER DEFAULT 1');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE whatsapp_settings ADD COLUMN status_enabled INTEGER DEFAULT 0');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE whatsapp_settings ADD COLUMN reminder_hours INTEGER DEFAULT 1');
    }
    catch { /* column exists */ }
    try {
        sqlDb.run('ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT \'{}\'');
    }
    catch { /* column exists */ }
    // ─── WhatsApp admin-console support (Phase 2 review queues) ───
    try {
        sqlDb.run('ALTER TABLE admin_logs ADD COLUMN whatsapp_ai_lowconf INTEGER DEFAULT 0');
    }
    catch { /* exists */ }
    try {
        sqlDb.run('ALTER TABLE admin_logs ADD COLUMN whatsapp_pay_review INTEGER DEFAULT 0');
    }
    catch { /* exists */ }
    try {
        sqlDb.run('ALTER TABLE admin_logs ADD COLUMN payload TEXT');
    }
    catch { /* exists */ }
    try {
        sqlDb.run('ALTER TABLE tournament_payments ADD COLUMN checkout_request_id TEXT');
    }
    catch { /* exists */ }
    try {
        sqlDb.run("ALTER TABLE tournament_payments ADD COLUMN source TEXT DEFAULT 'mpesa_stk'");
    }
    catch { /* exists */ }
    try {
        sqlDb.run('ALTER TABLE tournament_payments ADD COLUMN verified_by INTEGER');
    }
    catch { /* exists */ }
    try {
        sqlDb.run('ALTER TABLE tournament_payments ADD COLUMN verified_at DATETIME');
    }
    catch { /* exists */ }
    try {
        sqlDb.run('ALTER TABLE tournament_payments ADD COLUMN review_note TEXT');
    }
    catch { /* exists */ }
    // Seed default subscription tiers
    const tierCount = sqlDb.exec("SELECT COUNT(*) as c FROM subscription_tiers")[0]?.values[0]?.[0] || 0;
    if (Number(tierCount) === 0) {
        sqlDb.run("INSERT INTO subscription_tiers (name, price_kes, tournament_limit, has_sub_admin, sort_order) VALUES ('Rookie', 250, 5, 0, 1)");
        sqlDb.run("INSERT INTO subscription_tiers (name, price_kes, tournament_limit, has_sub_admin, sort_order) VALUES ('Growth', 500, 15, 0, 2)");
        sqlDb.run("INSERT INTO subscription_tiers (name, price_kes, tournament_limit, has_sub_admin, sort_order) VALUES ('Scale', 1000, 50, 1, 3)");
        sqlDb.run("INSERT INTO subscription_tiers (name, price_kes, tournament_limit, has_sub_admin, sort_order) VALUES ('Enterprise', 5000, -1, 1, 4)");
    }
    // Auto-save every 30 seconds and on exit
    setInterval(saveDb, 30000);
    process.on('exit', saveDb);
    process.on('SIGINT', () => { saveDb(); process.exit(0); });
    process.on('SIGTERM', () => { saveDb(); process.exit(0); });
    console.log('[DB] Database initialized');
    return sqlDb;
}
let initPromise = null;
export async function initDB() {
    if (!initPromise) {
        initPromise = initDBInternal();
    }
    return initPromise;
}
export function initializeDatabase() {
    initDB().catch(console.error);
}
function getDb() {
    if (!sqlDb)
        throw new Error('Database not initialized');
    return sqlDb;
}
export const db = {
    prepare: (sql) => ({
        run: (...params) => {
            getDb().run(sql, params);
            const result = getDb().exec("SELECT last_insert_rowid() as id");
            saveDb(); // Persist after writes
            return { lastInsertRowid: result[0]?.values[0]?.[0] };
        },
        get: (...params) => {
            const stmt = getDb().prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row;
            }
            stmt.free();
            return undefined;
        },
        all: (...params) => {
            const results = [];
            const stmt = getDb().prepare(sql);
            stmt.bind(params);
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        }
    }),
    exec: (sql) => { getDb().run(sql); saveDb(); }
};
export default db;
//# sourceMappingURL=db.js.map