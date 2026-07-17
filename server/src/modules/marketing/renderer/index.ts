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
import { selectLayout, layoutTokens, type Layout } from './layouts.js';
export { RENDER_SIZES };

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMPL_DIR = join(__dirname, '..', 'templates');
const OUT_DIR = join(__dirname, '..', '..', '..', '..', 'client', 'public', 'marketing-out');
const CHROMIUM = process.env.TOSS_CHROMIUM_PATH || '/usr/bin/chromium-browser';

let browserSingleton: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
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

export function loadTemplate(id: string): string {
  const file = TEMPLATES[id];
  if (!file) throw new Error(`Unknown template: ${id}`);
  const p = join(TMPL_DIR, file);
  if (!existsSync(p)) throw new Error(`Template file missing: ${file}`);
  return readFileSync(p, 'utf8');
}

/** Load the shared design-system.css (primitives every template inherits). */
export function loadDesignSystem(): string {
  const p = join(TMPL_DIR, 'design-system.css');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

/** Replace {{TOKEN}} placeholders. Handles both {{X}} and {{{X}}} (Handlebars-style).
 *  Unknown tokens become empty. */
export function inject(html: string, data: Record<string, string>): string {
  // Collapse {{{X}}} -> {{X}} so a stray brace never wraps the whole stylesheet.
  html = html.replace(/\{\{\{([A-Z0-9_]+)\}\}\}/g, '{{$1}}');
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, k: string) =>
    data[k] !== undefined ? data[k] : '',
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

/** Read a public asset (e.g. /marketing-out/uploads/x.jpg) from disk and return a
 *  base64 data URI. Under page.setContent() the document origin is about:blank,
 *  so server-relative URLs never resolve — inlining makes uploads render reliably. */
function inlinePublic(rel: string): string | null {
  if (!rel) return null;
  if (/^data:/i.test(rel)) return rel;
  if (/^https?:\/\//i.test(rel)) return rel; // absolute — browser fetches directly
  try {
    const base = join(__dirname, '..', '..', '..', '..', 'client', 'public');
    const fp = join(base, rel.replace(/^\//, ''));
    return inlineAssetFromPath(fp);
  } catch {
    return null;
  }
}

/** Inline an asset file at an absolute path (used for uploaded media). */
function inlineAssetFromPath(p: string): string | null {
  try {
    const buf = readFileSync(p);
    const ext = p.split('.').pop()?.toLowerCase() || 'png';
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

/* ─── Reusable component builders (design-system primitives) ─── */

/** Status / live / generic badge. tone: solid|glass|outline|live|success|gold */
export function badge(label: string, tone = 'glass', icon?: string): string {
  if (!label) return '';
  const ico = icon ? `<span class="ico">${icon}</span>` : '';
  return `<span class="badge ${tone}">${ico}${label}</span>`;
}

/** Info card (prize / players / date / venue / code). variant: glass|solid|outline|gradient */
export function infoCard(k: string, v: string, variant = 'glass', gold = false): string {
  if (v === '' || v == null) return '';
  return `<div class="info-card glass ${variant}"><span class="k">${k}</span><span class="v${gold ? ' gold' : ''}">${v}</span></div>`;
}

/** CTA button. style: gradient|full|outline|glass|pill (matches layout ctaStyle). */
export function ctaButton(label: string, style = 'gradient'): string {
  const lbl = label || 'Register Now';
  return `<div class="cta ${style}">${lbl}</div>`;
}

/** Background class from a campaign bg hint, defaulting to arena/orange theme. */
export function bgClass(c: Campaign): string {
  const b = (c as any).background as string | undefined;
  const allowed = ['bg-stadium','bg-flood','bg-geo','bg-orange','bg-black','bg-mesh','bg-smoke','bg-arena','bg-min','bg-esports'];
  return allowed.includes(b as string) ? (b as string) : 'bg-arena';
}

/** Overlay class from a campaign overlay hint, defaulting to bottom gradient. */
export function overlayClass(c: Campaign): string {
  const o = (c as any).overlay as string | undefined;
  const allowed = ['ov-bottom','ov-top','ov-left','ov-right','ov-full','ov-glass','ov-blur','ov-orange','ov-glow'];
  return allowed.includes(o as string) ? (o as string) : 'ov-bottom';
}

/** Top brand bar: logo + watermark (safe, always present). */
export function brandBar(logo: string, watermark: string): string {
  return `<div class="brandbar"><div class="logo"><img src="${logo}" alt="TOSS" /></div><div class="wm">${watermark}</div></div>`;
}

/** Bottom branding footer: code + website + optional QR + sponsor. */
export function brandFooter(code: string, website: string, qrHtml = '', sponsorHtml = ''): string {
  return `<div class="foot"><span>${code || ''}</span>${sponsorHtml}<span>${website || ''}</span>${qrHtml}</div>`;
}

/** Normalize a campaign into flat token map for the chosen template. */
export interface TokenOpts { cardStyle?: string; ctaStyle?: string; }
export function tokensFor(brand: Brand, c: Campaign, qr?: string, opts: TokenOpts = {}): Record<string, string> {
  const cardStyle: string = opts.cardStyle && ['glass','solid','outline','gradient'].includes(opts.cardStyle) ? opts.cardStyle : 'glass';
  const ctaStyle: string = opts.ctaStyle && ['gradient','full','outline','glass','pill'].includes(opts.ctaStyle) ? opts.ctaStyle : 'gradient';
  const a = brand.accentPresets[c.accent as string] ? c.accent as string : undefined;
  const logo = inlineAsset(brand.logo.path) || '';
  const map: Record<string, string> = {
    BRAND_CSS: brandCss(brand, c) + '\n' + loadDesignSystem(),
    DESIGN_SYSTEM: loadDesignSystem(),
    LOGO: logo,
    WATERMARK: brand.watermark.text,
    BG_CLASS: bgClass(c),
    OVERLAY_CLASS: overlayClass(c),
    WEBSITE: brand.social?.website || 'toss.gg',
    TITLE: (c.title as string) || '',
    SUBTITLE: (c.subtitle as string) || '',
    PRIZE: (c.prizeBadge as string) || (c.prize as string) || '',
    DATE: (c.date as string) || '',
    DEADLINE: (c.registrationDeadline as string) || '',
    CTA: (c.cta as string) || brand.cta.label,
    CTA_HTML: ctaButton((c.cta as string) || brand.cta.label, ctaStyle),
    KICKER: (c.kicker as string) || (c.stage as string) || (c.status === 'live' ? 'Live Now' : (c.status ? String(c.status).toUpperCase() : 'TOSS')) || 'TOSS',
    SIDE: (c as any).heroPos === 'right' ? 'right' : '',
    MATCHUP: (c.teamA && c.teamB) ? `<div class="row gap-md" style="align-items:stretch"><span class="team-badge">${c.teamA}</span><span class="t-stat" style="align-self:center">VS</span><span class="team-badge">${c.teamB}</span></div>` : '',
    TOURNAMENT_CODE: (c.tournamentCode as string) || '',
    TOURNAMENT_CODE_BADGE: badge((c.tournamentCode as string) ? `CODE ${c.tournamentCode}` : '', 'glass'),
    STATUS_BADGE: badge(
      (c.status as string) ? String(c.status).toUpperCase() : ((c.stage as string) ? String(c.stage).toUpperCase() : ''),
      (c.status === 'live' || c.live) ? 'live' : 'solid',
    ),
    COUNTDOWN: c.countdown ? badge(`⏱ ${c.countdown}`, 'glass') : '',
    AI_BADGE: c.aiRecommendation ? badge(`✦ ${c.aiRecommendation}`, 'outline') : '',
    PLAYERS: (c.players as string) || '',
    TEAM_A: (c.teamA as string) || '',
    TEAM_B: (c.teamB as string) || '',
    SCORE_A: (c.scoreA !== undefined ? `${c.scoreA}` : ''),
    SCORE_B: (c.scoreB !== undefined ? `${c.scoreB}` : ''),
    ROUND: (c.round as string) || '',
    STAGE: (c.stage as string) || '',
    PERIOD: (c.period as string) || '',
    BODY: (c.body as string) || '',
    BODY_CARD: (c.body as string) ? `<div class="glass" style="max-width:72%"><p class="t-body">${c.body}</p></div>` : '',
    FOOTER: (c.footer as string) || '',
    PRIZE_CARD: infoCard('Prize', (c.prizeBadge as string) || (c.prize as string) || '—', cardStyle as any, true),
    PLAYERS_CARD: infoCard('Players', (c.players as string) || ((c.participantCount != null) ? `${c.participantCount}/${c.maxPlayers || ''}` : '—'), cardStyle as any),
    DATE_CARD: infoCard('Kickoff', (c.date as string) || '—', cardStyle as any),
    DEADLINE_CARD: infoCard('Deadline', (c.registrationDeadline as string) || '—', cardStyle as any),
    VENUE_CARD: infoCard('Venue', (c.venue as string) || '—', cardStyle as any),
    WINNER_CARD: infoCard('Winner', (c.winnerName as string) || (c.teamName as string) || (c.prize as string) || '—', 'gradient'),
    SPONSOR: c.sponsorLogoUrl
      ? `<div class="sponsored"><img class="sponsor" src="${inlinePublic(c.sponsorLogoUrl as string) || c.sponsorLogoUrl}" alt="sponsor" /></div>`
      : (c.sponsorLogo ? (inlineAsset(c.sponsorLogo as string) ? `<div class="sponsored"><img class="sponsor" src="${inlineAsset(c.sponsorLogo as string)}" alt="sponsor" /></div>` : '') : ''),
    ROWS: (c.rows && Array.isArray(c.rows) && c.rows.length) ? c.rows.join('') : '',
    WIN_A: (c as any).winner === 'A' ? 'win' : '',
    WIN_B: (c as any).winner === 'B' ? 'win' : '',
    CHAMPION_RIBBON: (c.ribbon || c.champion) ? `<div class="ribbon">🏆 Champion</div>` : '',
    SEASON_LABEL: (c.season as string) ? `Season ${c.season}` : 'New Season',
    BRAND_BAR: brandBar(logo, brand.watermark.text),
    BRAND_FOOTER: brandFooter((c.tournamentCode as string) || '', brand.social?.website || 'toss.gg', qr ? `<img class="qr" src="${qr}" alt="QR" />` : '', c.sponsorLogoUrl ? `<div class="sponsored"><img class="sponsor" src="${inlinePublic(c.sponsorLogoUrl as string) || c.sponsorLogoUrl}" alt="sponsor" /></div>` : (c.sponsorLogo ? (inlineAsset(c.sponsorLogo as string) ? `<div class="sponsored"><img class="sponsor" src="${inlineAsset(c.sponsorLogo as string)}" alt="sponsor" /></div>` : '') : '')),
  };
  if (c.heroImage) {
    const h = inlineAsset(c.heroImage as string);
    if (h) map.HERO_IMAGE = h;
  }
  if (c.heroImageUrl) map.HERO_IMAGE = inlinePublic(c.heroImageUrl as string) || (c.heroImageUrl as string);
  map.HERO_IMAGE_MEDIA = map.HERO_IMAGE ? `<div class="hero-media ${map.HERO_MODE || ''}"><img src="${map.HERO_IMAGE}" alt="" /></div>` : '';
  return map;
}

/** Quality gate. Returns issues; empty array = pass. */
export function qualityCheck(brand: Brand, c: Campaign, html: string, layout?: Layout): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!c.title) issues.push({ rule: 'missing-title', detail: 'Campaign has no title' });
  // Logo must be present and inlined (data URI) — never a broken/relative URL.
  const logoBroken = html.includes('{{LOGO}}') || /src="\/marketing-out/.test(html);
  if (logoBroken) issues.push({ rule: 'logo-missing', detail: 'Logo token unresolved or not inlined' });
  // CTA must be present and styled (our .cta component) ONLY when the
  // template actually requests one via {{CTA_HTML}}. Templates without a
  // CTA (scoreboards, standings) are valid.
  if (html.includes('{{CTA_HTML}}') && !html.includes('class="cta"')) {
    issues.push({ rule: 'cta-hidden', detail: 'CTA placeholder present but button did not render' });
  }
  // No unresolved tokens of any brace-style may remain (catches template breakage).
  if (/\{\{?\{?[A-Z0-9_]+\}?\}?\}/.test(html)) {
    const leftover = html.match(/\{\{?\{?[A-Z0-9_]+\}?\}?\}/g)?.slice(0, 5).join(', ');
    issues.push({ rule: 'unresolved-token', detail: `Unresolved token(s): ${leftover}` });
  }
  // Family-level required content (replaces per-template; families are broader).
  const need: Record<string, string[]> = {
    champion: ['TITLE', 'SUBTITLE'],
    'match-result': ['TITLE'],
    'leaderboard': ['TITLE'],
    'player-of-the-match': ['TITLE', 'SUBTITLE'],
    fixture: ['TITLE'],
    announcement: ['TITLE'],
    promotion: ['TITLE'],
    maintenance: ['TITLE'],
    'registration-open': ['TITLE'],
    'registration-closing': ['TITLE'],
  };
  const family = layout?.family || (c as any).family || '';
  for (const k of need[family] || []) {
    if (html.includes(`{{${k}}}`) || html.includes(`{{{${k}}}}`)) issues.push({ rule: 'missing-data', detail: `Required token ${k} not filled for ${family}` });
  }
  return issues;
}

export interface RenderOpts {
  size?: RenderSize;
  format?: 'png' | 'jpeg';
  quality?: number;
  layout?: string;       // explicit layout id/name (e.g. "hero-v2")
  platform?: string;     // instagram | whatsapp | facebook | telegram | twitter
  rotate?: boolean;      // avoid recently used layouts
  family?: string;       // override campaign family
}

// Map legacy template ids → new layout families (backward compatible).
const TEMPLATE_TO_FAMILY: Record<string, string> = {
  'tournament-announcement': 'announcement',
  'registration-open': 'registration-open',
  'registration-closing': 'registration-closing',
  'feature-announcement': 'announcement',
  'live-now': 'match-result',
  champion: 'champion',
  'new-season': 'announcement',
  'match-result': 'match-result',
  'final-score': 'match-result',
  'leaderboard': 'leaderboard',
  standings: 'leaderboard',
  'top-scorers': 'leaderboard',
  'player-of-the-match': 'player-of-the-match',
  fixture: 'fixture',
  'match-reminder': 'fixture',
  'halftime': 'match-result',
  promotion: 'promotion',
  maintenance: 'maintenance',
};

/**
 * Render a campaign into a branded image.
 * Pipeline: validate -> select layout -> load shell -> inject brand+data -> screenshot -> sharp -> store.
 */
export async function renderCampaign(c: Campaign, opts: RenderOpts = {}): Promise<RenderResult> {
  const t0 = Date.now();
  const brand = loadBrand();
  if (!TEMPLATES[c.template] && !opts.family && !c.family) {
    // still allow legacy template key; family derived below.
  }

  const sizeKey: RenderSize = opts.size || (c.size as RenderSize) || '1080x1350';
  const dim = RENDER_SIZES[sizeKey];
  if (!dim) throw new Error(`Unknown size: ${sizeKey}`);

  // ── Layout selection ──
  const family = opts.family || (c as any).family || TEMPLATE_TO_FAMILY[c.template] || 'announcement';
  const hasHero = !!(c.heroImage || c.heroImageUrl);
  const sel = selectLayout({
    family,
    platform: (opts.platform as any) || (c as any).platform,
    orientation: sizeKey,
    hasHero,
    rotate: opts.rotate ?? true,
    preferredLayout: opts.layout || (c as any).layout,
  });
  const lt = layoutTokens(sel);

  // Optional QR code: generate from qrText (or reuse a pre-supplied qrCode data-uri).
  let qr: string | undefined;
  if (c.qrText) qr = await qrDataUri(String(c.qrText));
  else if ((c as any).qrCode) qr = (c as any).qrCode as string;

  const map = tokensFor(brand, c, qr, { cardStyle: lt.CARD_STYLE, ctaStyle: lt.CTA_STYLE });
  // Overlay layout-driven tokens onto the map.
  map.SHELL = lt.SHELL;
  map.HERO_POS = lt.HERO_POS;
  map.TEXT_POS = lt.TEXT_POS;
  map.CARD_STYLE = lt.CARD_STYLE;
  map.CTA_STYLE = lt.CTA_STYLE;
  map.BG = lt.BG;
  map.OVERLAY = lt.OVERLAY;
  map.HERO_MODE = lt.HERO_MODE;

  const shellFile = lt.FILE;
  const shellPath = join(TMPL_DIR, shellFile);
  if (!existsSync(shellPath)) throw new Error(`Shell template missing: ${shellFile}`);
  const html = inject(readFileSync(shellPath, 'utf8'), map);
  const issues = qualityCheck(brand, c, html, sel);
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
    template: `${family}:${sel.id.split(':')[1]}`,
    layout: sel.id,
    renderTimeMs: Date.now() - t0,
  };
}

/** Close the shared browser (call on shutdown). */
export async function closeRenderer(): Promise<void> {
  if (browserSingleton) { await browserSingleton.close(); browserSingleton = null; }
}
