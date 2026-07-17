// Example: render every template with sample data. Proves the engine covers
// the full brand system. Run: npx tsx src/modules/marketing/examples/basic.ts
import { renderCampaign } from '../services/renderService.js';
import type { Campaign } from '../types/index.js';

const row = (pos: number | string, name: string, val: string, top = false) =>
  `<div class="row${top ? ' top' : ''}"><div class="pos">${pos}</div><div class="name">${name}</div><div class="val">${val}</div></div>`;

const campaigns: Campaign[] = [
  { template: 'tournament-announcement', title: 'Weekend Cup', subtitle: '32 Players', prize: 'KES 5,000', date: 'Sat 8PM', registrationDeadline: 'Fri 11:59PM', cta: 'Register Now', tournamentCode: 'TOSS-7F3A', accent: 'gold', size: '1080x1080', aiRecommendation: 'AI Pick' },
  { template: 'registration-open', title: 'Friday Frenzy', subtitle: '16 Players · KO Bracket', prize: 'KES 2,000', date: 'Fri 9PM', registrationDeadline: 'Fri 8:30PM', cta: 'Join Now', tournamentCode: 'TOSS-9B2', accent: 'teal', footer: 'Tap to register' },
  { template: 'fixture', title: 'Semi Final A', teamA: 'xKnight', teamB: 'ShadowFC', round: 'Semi Final', date: 'Sat 8:00PM', stage: 'Knockouts', tournamentCode: 'TOSS-7F3A', accent: 'gold', size: '1200x628' },
  { template: 'match-reminder', title: 'Final vs ShadowFC', teamA: 'xKnight', teamB: 'ShadowFC', date: 'Sat 9:30PM', round: 'Grand Final', cta: 'Set Reminder', accent: 'pink', countdown: '00:45:00' },
  { template: 'halftime', title: 'Final', teamA: 'xKnight', teamB: 'ShadowFC', scoreA: 2, scoreB: 1, period: 'Half Time', subtitle: 'xKnight leading', footer: 'Back in 5 min', accent: 'live', size: '1920x1080' },
  { template: 'final-score', title: 'Final', teamA: 'xKnight', teamB: 'ShadowFC', scoreA: 3, scoreB: 2, round: 'Grand Final', footer: 'What a match!', winner: 'A', accent: 'gold' },
  { template: 'standings', title: 'Group A Standings', subtitle: 'After Matchday 3', stage: 'Group Stage', rows: [row(1, 'xKnight', '9', true), row(2, 'ShadowFC', '6'), row(3, 'Elite', '3'), row(4, 'Rookies', '0')], footer: 'Top 2 advance', accent: 'teal', size: '1080x1350' },
  { template: 'top-scorers', title: 'Top Scorers', subtitle: 'This Season', stage: 'Season 4', rows: [row(1, 'xKnight', '24', true), row(2, 'MessiFan', '18'), row(3, 'CR7', '15')], footer: 'Goals', accent: 'gold' },
  { template: 'player-of-the-match', title: 'xKnight', subtitle: 'MVP · 3 Goals · 2 Assists', tournamentCode: 'TOSS-7F3A', featuredPlayer: { name: 'xKnight', team: 'TOSS Elite', stat: 'MVP' }, footer: 'Congrats!', accent: 'gold' },
  { template: 'new-season', title: 'Season 5', subtitle: 'Bigger. Better. Faster.', stage: 'Season 5', body: 'New ranked mode, bigger prizes, and cross-play are here.', cta: 'Play Now', footer: 'Now live', accent: 'teal', size: '1200x628' },
  { template: 'maintenance', title: 'Scheduled Maintenance', subtitle: 'Tonight 2-4 AM', body: 'We are upgrading servers for faster matchmaking. See you soon!', footer: 'Downtime ~2h', accent: 'gold' },
  { template: 'feature-announcement', title: 'Tournament Codes', subtitle: 'Share & join instantly', round: 'New', body: 'Every tournament now has a short code. Share it and friends join in one tap.', cta: 'Try It', footer: 'Rolled out to all users', accent: 'pink' },
  { template: 'champion', title: 'Weekend Cup', subtitle: 'xKnight', prize: 'KES 5,000', players: '32', accent: 'gold', featuredPlayer: { name: 'xKnight', team: 'TOSS Elite', stat: 'MVP' }, size: '1080x1350' },
  { template: 'live-now', title: 'Weekend Cup Final', subtitle: 'LIVE NOW', teamA: 'xKnight', teamB: 'ShadowFC', countdown: '02:14:55', accent: 'live', size: '1920x1080' },
];

let ok = 0, fail = 0;
for (const c of campaigns) {
  try {
    const r = await renderCampaign(c);
    console.log(`✓ ${c.template.padEnd(24)} [${r.width}x${r.height}] -> ${r.url}  (${r.renderTimeMs}ms)`);
    ok++;
  } catch (e: any) {
    console.error(`✗ ${c.template}: ${e.message}`);
    fail++;
  }
}
console.log(`\n${ok}/${campaigns.length} rendered, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
