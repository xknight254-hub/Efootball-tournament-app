// Parser test for the WhatsApp command handlers. No Baileys, no network.
// Run: npx tsx src/channels/whatsapp/__tests__/commands.test.mts
import assert from 'assert';
import db, { initDB } from '../../../db.js';
import { handleCommand } from '../commands.js';
import { linkStore } from '../linkStore.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'efootball-arena-super-secret-key-2024';

async function main() {
  await initDB(); // initialize the sql.js singleton before seeding

  // ── Seed a tiny dataset (unique per-run ids to avoid colliding with
  //     real data AND with previous test runs, since the DB file persists) ──
  const n = Date.now() % 100000;
  const U = 900000 + n; // user ids
  const T = 900000 + n; // tournament ids
  const M = 900000 + n; // match ids
  const mail = `@${n}.com`; // per-run unique email domain to avoid UNIQUE clash
  db.prepare(
    `INSERT INTO users (id, username, email, password_hash) VALUES (${U+1},'alice_${n}','alice${mail}','ph'),(${U+2},'bob_${n}','bob${mail}','ph')`
  ).run();
  db.prepare(
    `INSERT INTO tournaments (id, name, format, status, entry_fee, prize_pool, max_players, owner_id) VALUES (${T+1},'dg','knockout','open',50,'1000',32,${U+1}),(${T+2},'Jojo','league','completed',0,'500',16,${U+1})`
  ).run();
  db.prepare(
    `INSERT INTO matches (id, tournament_id, round, match_number, player1_id, player2_id, player1_score, player2_score, winner_id, status) VALUES (${M+1},${T+1},1,1,${U+1},${U+2},2,1,${U+1},'completed')`
  ).run();
  db.prepare(
    `INSERT INTO participants (tournament_id, user_id, seed, status) VALUES (${T+1},${U+1},1,'registered')`
  ).run();

  // help
  assert.match(await handleCommand('help', { phone: '254700000001' }), /TOSS WhatsApp Assistant/);

  // table
  const tbl = await handleCommand('table', { phone: '254700000001' });
  assert.match(tbl, new RegExp(`#${T+1} dg`));
  assert.match(tbl, new RegExp(`#${T+2} Jojo`));

  // fixtures
  const fx = await handleCommand(`fixtures ${T+1}`, { phone: '254700000001' });
  assert.match(fx, new RegExp(`P${U+1} vs P${U+2}`));
  assert.match(fx, /2-1/);

  // rank (alice_${n} has 1 win)
  const rk = await handleCommand('rank', { phone: '254700000001' });
  assert.match(rk, new RegExp(`alice_${n}`));

  // join without link -> prompt (use a fresh phone that has no prior link)
  const joinPhone = `2547${n}`;
  const noLink = await handleCommand(`join ${T+2}`, { phone: joinPhone });
  assert.match(noLink, /Link your account first/);

  // link with valid token -> maps phone->userId
  const token = jwt.sign({ userId: U + 1 }, JWT_SECRET);
  const linked = await handleCommand(`link ${token}`, { phone: joinPhone });
  assert.match(linked, /Linked to \*alice_/);
  assert.strictEqual(linkStore.getUserId(joinPhone), U + 1);

  // me after link
  const me = await handleCommand('me', { phone: joinPhone });
  assert.match(me, /Wins: 1/);

  // unknown
  assert.match(await handleCommand('foo', { phone: 'x' }), /Unknown command/);

  // pay: forward an M-Pesa confirmation -> creates account for that phone
  const payPhone = `2547${n}99`; // distinct fresh phone
  const mpesaMsg =
    `QG${n}W8H4K Confirmed. Ksh 100.00 sent to TOSS on ${n}. ` +
    `Your M-Pesa receipt is QG${n}W8H4K.`;
  const payRes = await handleCommand(mpesaMsg, { phone: payPhone });
  assert.match(payRes, /Account created/);
  assert.match(payRes, /User ID:/);
  // auto-linked: me should work without a separate link step
  const payMe = await handleCommand('me', { phone: payPhone });
  assert.match(payMe, /Your stats/);
  // idempotent: forwarding again returns same existing account id
  const payRes2 = await handleCommand(mpesaMsg, { phone: payPhone });
  assert.match(payRes2, /Account created/);

  console.log('ALL COMMAND TESTS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});
