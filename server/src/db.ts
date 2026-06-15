/* eslint-disable @typescript-eslint/no-explicit-any */
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbDir = join(__dirname, '..', '..', 'data');
const dbPath = join(dbDir, 'efootball.db');

let sqlDb: SqlJsDatabase | null = null;
let initialized = false;

function saveDb() {
  if (!sqlDb) return;
  try {
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    const data = sqlDb.export();
    writeFileSync(dbPath, Buffer.from(data));
  } catch (e) {
    console.error('[DB] Save failed:', e);
  }
}

async function initDBInternal(): Promise<SqlJsDatabase> {
  if (sqlDb && initialized) return sqlDb;
  
  const SQL = await initSqlJs({
    locateFile: (file: string) => join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
  });
  
  // Try to load existing DB from file
  if (existsSync(dbPath)) {
    try {
      const buffer = readFileSync(dbPath);
      sqlDb = new SQL.Database(new Uint8Array(buffer));
      console.log('[DB] Loaded from file');
    } catch (e) {
      console.error('[DB] Failed to load file, creating new:', e);
      sqlDb = new SQL.Database();
    }
  } else {
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
  `);
  
  // Migrate existing tables with new columns
  try { sqlDb.run('ALTER TABLE tournaments ADD COLUMN group_count INTEGER DEFAULT 0'); } catch { /* column exists */ }
  try { sqlDb.run('ALTER TABLE tournaments ADD COLUMN bracket_type TEXT DEFAULT \'single\''); } catch { /* column exists */ }
  try { sqlDb.run('ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0'); } catch { /* column exists */ }
  try { sqlDb.run('ALTER TABLE users ADD COLUMN telegram_id TEXT'); } catch { /* column exists */ }
  try { sqlDb.run('ALTER TABLE users ADD COLUMN telegram_username TEXT'); } catch { /* column exists */ }
  try { sqlDb.run('ALTER TABLE users ADD COLUMN telegram_photo_url TEXT'); } catch { /* column exists */ }
  try { sqlDb.run('ALTER TABLE tournaments ADD COLUMN image_url TEXT'); } catch { /* column exists */ }

  // Auto-save every 30 seconds and on exit
  setInterval(saveDb, 30000);
  process.on('exit', saveDb);
  process.on('SIGINT', () => { saveDb(); process.exit(0); });
  process.on('SIGTERM', () => { saveDb(); process.exit(0); });
  
  console.log('[DB] Database initialized');
  return sqlDb;
}

let initPromise: Promise<SqlJsDatabase> | null = null;

export async function initDB(): Promise<SqlJsDatabase> {
  if (!initPromise) {
    initPromise = initDBInternal();
  }
  return initPromise;
}

export function initializeDatabase() {
  initDB().catch(console.error);
}

function getDb(): SqlJsDatabase {
  if (!sqlDb) throw new Error('Database not initialized');
  return sqlDb;
}

export const db: any = {
  prepare: (sql: string) => ({
    run: (...params: any[]) => {
      getDb().run(sql, params);
      const result = getDb().exec("SELECT last_insert_rowid() as id");
      saveDb(); // Persist after writes
      return { lastInsertRowid: result[0]?.values[0]?.[0] };
    },
    get: (...params: any[]) => {
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
    all: (...params: any[]) => {
      const results: any[] = [];
      const stmt = getDb().prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    }
  }),
  exec: (sql: string) => { getDb().run(sql); saveDb(); }
};

export default db;
