import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dbPath = join(__dirname, '..', '..', 'data', 'efootball.db');

async function main() {
  const SQL = await initSqlJs({
    locateFile: (file: string) => join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
  });

  const buffer = readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(buffer));

  // Count before
  const beforeUsers = db.prepare('SELECT COUNT(*) as c FROM users').get() as any;
  const beforeTournaments = db.prepare('SELECT COUNT(*) as c FROM tournaments').get() as any;
  const beforeMatches = db.prepare('SELECT COUNT(*) as c FROM matches').get() as any;
  const beforeParticipants = db.prepare('SELECT COUNT(*) as c FROM participants').get() as any;
  
  console.log(`Before: ${beforeUsers.c} users, ${beforeTournaments.c} tournaments, ${beforeMatches.c} matches, ${beforeParticipants.c} participants`);

  // Wipe all data (keep table structure)
  db.run('DELETE FROM matches');
  db.run('DELETE FROM participants');
  db.run('DELETE FROM tournaments');
  db.run('DELETE FROM users');
  db.run('DELETE FROM admin_codes');
  db.run('DELETE FROM admin_logs');
  db.run('DELETE FROM token_blacklist');

  // Reset auto-increment counters
  for (const table of ['matches', 'participants', 'tournaments', 'users', 'admin_codes', 'admin_logs', 'token_blacklist']) {
    try {
      db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
    } catch { /* ignore */ }
  }

  // Count after
  const afterUsers = db.prepare('SELECT COUNT(*) as c FROM users').get() as any;
  const afterTournaments = db.prepare('SELECT COUNT(*) as c FROM tournaments').get() as any;
  
  console.log(`After: ${afterUsers.c} users, ${afterTournaments.c} tournaments`);

  // Save
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
  console.log('✓ Database wiped clean. Next user to register becomes Super Admin.');
}

main().catch(console.error);
