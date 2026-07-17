import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadBrand, assetPath } from '../engine/brand.js';
import { brandCss } from '../engine/brandCss.js';
import { TEMPLATES } from '../renderer/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMPL = join(__dirname, '..', 'templates');
const fs = await import('fs');
const brand = loadBrand();
const logoBuf = fs.readFileSync(assetPath(brand.logo.path));
const logoDataUri = `data:image/svg+xml;base64,${logoBuf.toString('base64')}`;
const c: any = {
  template: 'tournament-announcement', title: 'Weekend Cup', subtitle: '32 Players', prize: 'KES 5,000',
  date: 'Saturday 8PM', registrationDeadline: 'Fri 11:59PM', cta: 'Register Now', tournamentCode: 'TOSS-7F3A',
  accent: 'gold', featuredPlayer: { name: 'xKnight', team: 'TOSS Elite', stat: 'MVP' }, aiRecommendation: 'AI Pick',
};
const htmlRaw = readFileSync(join(TMPL, TEMPLATES[c.template]), 'utf8');
const data: Record<string, string> = {
  BRAND_CSS: brandCss(brand, c), LOGO: logoDataUri, WATERMARK: brand.watermark.text,
  TITLE: c.title, SUBTITLE: c.subtitle, PRIZE: c.prize, DATE: c.date, DEADLINE: c.registrationDeadline,
  CTA: c.cta, TOURNAMENT_CODE: c.tournamentCode,
  COUNTDOWN: '', AI_BADGE: `<div class="aibadge">✦ ${c.aiRecommendation}</div>`,
  PLAYER: `<div class="player"><div><div class="pn">${c.featuredPlayer.name}</div><div class="ps">${c.featuredPlayer.team} · ${c.featuredPlayer.stat}</div></div></div>`,
};
const html = htmlRaw.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, k: string) => data[k] ?? '');
console.log('LEFTOVER_TOKENS:', (html.match(/\{\{[A-Z0-9_]+\}\}/g) || []).join(',') || 'NONE');

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await page.setContent(html, { waitUntil: 'networkidle' });
const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const logoOk = await page.evaluate(() => { const i = document.querySelector('img'); return !!i && i.complete && i.naturalWidth > 0; });
console.log('LOGO_RENDRED:', logoOk);
console.log('VISILE_TEXT:', txt.slice(0, 200));
await browser.close();
console.log('OK');
