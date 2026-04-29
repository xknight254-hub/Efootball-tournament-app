import Database, { Database as DatabaseType } from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'data', 'efootball.db');
export const db: DatabaseType = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      avatar_url TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      platform TEXT DEFAULT 'efootball',
      format TEXT NOT NULL CHECK(format IN ('knockout', 'league')),
      max_players INTEGER NOT NULL CHECK(max_players IN (2, 4, 8, 16)),
      best_of INTEGER DEFAULT 1,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'check_in', 'fixtures_ready', 'in_progress', 'completed')),
      owner_id INTEGER NOT NULL,
      winner_id INTEGER,
      prize_pool TEXT,
      registration_deadline DATETIME,
      result_deadline_hours INTEGER DEFAULT 24,
      rules TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (winner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tournament_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'registered' CHECK(status IN ('registered', 'checked_in', 'ready', 'eliminated', 'winner', 'runner_up')),
      seed INTEGER,
      checked_in_at DATETIME,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(tournament_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      player1_id INTEGER NOT NULL,
      player2_id INTEGER,
      round INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      player1_score INTEGER,
      player2_score INTEGER,
      winner_id INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'playing', 'completed', 'disputed')),
      confirmation_status TEXT DEFAULT 'pending' CHECK(confirmation_status IN ('pending', 'confirmed', 'disputed')),
      submitted_by INTEGER,
      submitted_at DATETIME,
      confirmed_at DATETIME,
      screenshot_url TEXT,
      opponent_screenshot_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (player1_id) REFERENCES users(id),
      FOREIGN KEY (player2_id) REFERENCES users(id),
      FOREIGN KEY (winner_id) REFERENCES users(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS standings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      played INTEGER DEFAULT 0,
      won INTEGER DEFAULT 0,
      drawn INTEGER DEFAULT 0,
      lost INTEGER DEFAULT 0,
      gf INTEGER DEFAULT 0,
      ga INTEGER DEFAULT 0,
      gd INTEGER DEFAULT 0,
      points INTEGER DEFAULT 0,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      UNIQUE(tournament_id, team_name)
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      processed_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (processed_by) REFERENCES users(id),
      UNIQUE(user_id)
    );
  `);

  console.log('[DB] Database initialized');
}

export default db;