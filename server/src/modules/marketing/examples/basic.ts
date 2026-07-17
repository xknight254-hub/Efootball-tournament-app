// Example: render one campaign per supported template + size.
// Run: npx tsx src/modules/marketing/examples/basic.ts
import { renderCampaign } from '../services/renderService.js';
import type { Campaign } from '../types/index.js';

const campaigns: Campaign[] = [
  {
    template: 'tournament-announcement',
    title: 'Weekend Cup',
    subtitle: '32 Players · Knockout',
    prize: 'KES 5,000',
    date: 'Saturday 8PM',
    registrationDeadline: 'Fri 11:59PM',
    cta: 'Register Now',
    tournamentCode: 'TOSS-7F3A',
    accent: 'gold',
    size: '1080x1080',
    aiRecommendation: 'AI Pick: High turnout expected',
  },
  {
    template: 'champion',
    title: 'Weekend Cup',
    subtitle: 'xKnight',
    prize: 'KES 5,000',
    players: '32',
    accent: 'gold',
    size: '1080x1350',
    featuredPlayer: { name: 'xKnight', team: 'TOSS Elite', stat: 'MVP' },
  },
  {
    template: 'live-now',
    title: 'Weekend Cup · Final',
    subtitle: 'Best of 3',
    teamA: 'xKnight',
    teamB: 'ShadowFC',
    countdown: '02:14:55',
    accent: 'live',
    size: '1920x1080',
  },
];

let ok = 0;
for (const c of campaigns) {
  try {
    const r = await renderCampaign(c);
    console.log(`✓ ${c.template} [${r.width}x${r.height}] -> ${r.url}  (${r.renderTimeMs}ms)`);
    ok++;
  } catch (e: any) {
    console.error(`✗ ${c.template}: ${e.message}`);
  }
}
console.log(`\n${ok}/${campaigns.length} rendered.`);
process.exit(ok === campaigns.length ? 0 : 1);
