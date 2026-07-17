import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser } from 'playwright-core';
import sharp from 'sharp';
import QRCode from 'qrcode';
import type { Brand, Campaign, RenderResult, RenderSize, QualityIssue } from '../types/index.js';
import { loadBrand, assetPath } from '../engine/brand.js';
import { brandCss } from '../engine/brandCss.js';
import { RENDER_SIZES } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMPL_DIR = join(__dirname, '..', 'templates');
const OUT_DIR = join(__dirname, '..', '..', '..', '..', 'client', 'public', 'marketing-out');
const CHROMIUM = process.env.TOSS_CHROMIUM_PATH || '/usr/bin/chromium-browser';

let browserSingleton: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserSingleton && browserSingleton.isConnected()) return browserSingleton;
  browserSingleton = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
  return browserSingleton;
}

/** Template registry. Add entries here as new templates ship. */
export const TEMPLATES: Record<string, string> = {
  'tournament-announcement': 'tournament-announcement.html',
  champion: 'champion.html',
  'live-now': 'live-now.html',
  'registration-open': 'registration-open.html',
  fixture: 'fixture.html',
  'match-reminder': 'match-reminder.html',
  'halftime': 'halftime.html',
  'final-score': 'final-score.html',
  standings: 'standings.html',
  'top-scorers': 'top-scorers.html',
  'player-of-the-match': 'player-of-the-match.html',
  'new-season': 'new-season.html',
  maintenance: 'maintenance.html',
  'feature-announcement': 'feature-announcement.html',
};

function loadTemplate(id: string): string {
  const file = TEMPLATES[id];
  if (!file) throw new Error(`Unknown template: ${id}`);
  const p = join(TMPL_DIR, file);
  if (!existsSync(p)) throw new Error(`Template file missing: ${file}`);
  return readFileSync(p, 'utf8');
}

/** Replace {{TOKEN}} placeholders. Unknown tokens become empty. */
function inject(html: string, data: Record<string, string>): string {
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, k: string) =>
    data[k] !== undefined ? data[k] : ''
  );
}

/** Read an asset file and return an inline base64 data URI (works under setContent). */
function inlineAsset(rel: string): string | null {
  try {
    const buf = readFileSync(assetPath(rel));
    const ext = rel.split('.').pop()?.toLowerCase() || 'png';
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Generate a QR code data-URI from text/URL. */
async function qrDataUri(text: string): Promise<string> {
  const buf = await QRCode.toBuffer(text, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** Normalize a campaign into flat token map for the chosen template. */
function tokensFor(brand: Brand, c: Campaign, qr?: string): Record<string, string> {
  const a = brand.accentPresets[c.accent as string] ? c.accent as string : undefined;
  const logo = inlineAsset(brand.logo.path) || '';
  const map: Record<string, string> = {
    BRAND_CSS: brandCss(brand, c),
    LOGO: logo,
    WATERMARK: brand.watermark.text,
    TITLE: (c.title as string) || '',
    SUBTITLE: (c.subtitle as string) || '',
    PRIZE: (c.prizeBadge as string) || (c.prize as string) || '',
    DATE: (c.date as string) || '',
    DEADLINE: (c.registrationDeadline as string) || '',
    CTA: (c.cta as string) || brand.cta.label,
    TOURNAMENT_CODE: (c.tournamentCode as string) || '',
    COUNTDOWN: c.countdown ? `<div class="countdown">⏱ ${c.countdown}</div>` : '',
    AI_BADGE: c.aiRecommendation ? `<div class="aibadge">✦ ${c.aiRecommendation}</div>` : '',
    PLAYERS: (c.players as string) || '',
    TEAM_A: (c.teamA as string) || '',
    TEAM_B: (c.teamB as string) || '',
    SCORE_A: (c.scoreA !== undefined ? `${c.scoreA}` : ''),
    SCORE_B: (c.scoreB !== undefined ? `${c.scoreB}` : ''),
    ROUND: (c.round as string) || '',
    STAGE: (c.stage as string) || '',
    PERIOD: (c.period as string) || '',
    BODY: (c.body as string) || '',
    FOOTER: (c.footer as string) || '',
    QR: qr ? `<img class="qr" src="${qr}" alt="QR" />` : '',
    SPONSOR: c.sponsorLogoUrl
      ? `<img class="sponsor" src="${c.sponsorLogoUrl}" alt="sponsor" />`
      : (c.sponsorLogo ? (inlineAsset(c.sponsorLogo as string) ? `<img class="sponsor" src="${inlineAsset(c.sponsorLogo as string)}" alt="sponsor" />` : '') : ''),
    ROWS: (c.rows && Array.isArray(c.rows) && c.rows.length) ? c.rows.join('') : '',
    WIN_A: (c as any).winner === 'A' ? 'win' : '',
    WIN_B: (c as any).winner === 'B' ? 'win' : '',
  };
  map.HERO_IMAGE_MEDIA = map.HERO_IMAGE ? `<img class="hero-img" src="${map.HERO_IMAGE}" alt="" />` : '';
  if (c.featuredPlayer) {
    const fp = c.featuredPlayer as { name: string; team?: string; stat?: string };
    const hero = c.heroImage ? inlineAsset(c.heroImage as string) : null;
    map.PLAYER = `<div class="player">${hero ? `<img src="${hero}" alt=""/>` : '🏅'}
      <div><div class="pn">${fp.name}</div><div class="ps">${fp.team || ''}${fp.stat ? ` · ${fp.stat}` : ''}</div></div></div>`;
  } else {
    map.PLAYER = '';
  }
  if (c.heroImage) {
    const h = inlineAsset(c.heroImage as string);
    if (h) map.HERO_IMAGE = h;
  }
  if (c.heroImageUrl) map.HERO_IMAGE = c.heroImageUrl as string;
  return map;
}

/** Quality gate. Returns issues; empty array = pass. */
export function qualityCheck(brand: Brand, c: Campaign, html: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!c.title) issues.push({ rule: 'missing-title', detail: 'Campaign has no title' });
  if (html.includes('{{LOGO}}')) issues.push({ rule: 'asset-missing', detail: 'Logo token not replaced' });
  if (html.includes('{{TITLE}}')) issues.push({ rule: 'missing-title', detail: 'Title token not replaced' });
  // Required tokens per template
  const need: Record<string, string[]> = {
    champion: ['TITLE', 'SUBTITLE', 'PRIZE'],
    'live-now': ['TITLE', 'TEAM_A', 'TEAM_B'],
    'tournament-announcement': ['TITLE'],
    'registration-open': ['TITLE'],
    fixture: ['TITLE', 'TEAM_A', 'TEAM_B'],
    'match-reminder': ['TITLE', 'TEAM_A', 'TEAM_B'],
    halftime: ['TITLE', 'TEAM_A', 'TEAM_B'],
    'final-score': ['TITLE', 'TEAM_A', 'TEAM_B'],
    standings: ['TITLE', 'ROWS'],
    'top-scorers': ['TITLE', 'ROWS'],
    'player-of-the-match': ['TITLE', 'SUBTITLE'],
    'new-season': ['TITLE'],
    maintenance: ['TITLE'],
    'feature-announcement': ['TITLE'],
  };
  for (const k of need[c.template] || []) {
    if (html.includes(`{{${k}}}`)) issues.push({ rule: 'missing-data', detail: `Required token ${k} not filled for ${c.template}` });
  }
  return issues;
}

export interface RenderOpts {
  size?: RenderSize;
  format?: 'png' | 'jpeg';
  quality?: number;
}

/**
 * Render a campaign into a branded image.
 * Pipeline: validate -> load template -> inject brand+data -> screenshot -> sharp -> store.
 */
export async function renderCampaign(c: Campaign, opts: RenderOpts = {}): Promise<RenderResult> {
  const t0 = Date.now();
  const brand = loadBrand();
  if (!TEMPLATES[c.template]) throw new Error(`Unknown template: ${c.template}`);

  const sizeKey: RenderSize = opts.size || (c.size as RenderSize) || '1080x1080';
  const dim = RENDER_SIZES[sizeKey];
  if (!dim) throw new Error(`Unknown size: ${sizeKey}`);

  // Optional QR code: generate from qrText (or reuse a pre-supplied qrCode data-uri).
  let qr: string | undefined;
  if (c.qrText) qr = await qrDataUri(String(c.qrText));
  else if ((c as any).qrCode) qr = (c as any).qrCode as string;

  const html = inject(loadTemplate(c.template), tokensFor(brand, c, qr));
  const issues = qualityCheck(brand, c, html);
  if (issues.length) {
    throw new Error(`Quality check failed: ${issues.map(i => `${i.rule} (${i.detail})`).join('; ')}`);
  }

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: dim.w, height: dim.h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const buf = await page.screenshot({ type: opts.format || 'png', quality: opts.format === 'jpeg' ? (opts.quality || 88) : undefined, fullPage: false });
  await page.close();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const ext = opts.format === 'jpeg' ? 'jpg' : 'png';
  const fname = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const abs = join(OUT_DIR, fname);
  // Optimize via sharp (re-encode, strip metadata).
  const optimized = await sharp(buf)
    [opts.format === 'jpeg' ? 'jpeg' : 'png']({ quality: opts.quality || 88, compressionLevel: 9 } as any)
    .toBuffer();
  writeFileSync(abs, optimized);

  return {
    imagePath: abs,
    url: `/marketing-out/${fname}`,
    width: dim.w,
    height: dim.h,
    template: c.template,
    renderTimeMs: Date.now() - t0,
  };
}

/** Close the shared browser (call on shutdown). */
export async function closeRenderer(): Promise<void> {
  if (browserSingleton) { await browserSingleton.close(); browserSingleton = null; }
}
