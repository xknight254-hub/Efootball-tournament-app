import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import type { Brand, Campaign, RenderSize } from '../types/index.js';
import { loadBrand } from '../engine/brand.js';
import {
  TEMPLATES, RENDER_SIZES, getBrowser, loadTemplate, inject, tokensFor,
} from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', '..', '..', 'client', 'public', 'marketing-out');

/**
 * Keyframe CSS injected only when a campaign requests animation.
 * Subtle, brand-tinted motion: accent glow pulse + gentle content float.
 */
const ANIM_CSS = `
@keyframes tossPulse { 0%,100% { opacity:.28; transform:scale(1) } 50% { opacity:.5; transform:scale(1.08) } }
body::before { animation: tossPulse 2.4s ease-in-out infinite !important; }
@keyframes tossFloat { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-2.2%) } }
.hero, .media { animation: tossFloat 3s ease-in-out infinite !important; }
@keyframes tossGlow { 0%,100% { filter:drop-shadow(0 0 0 transparent) } 50% { filter:drop-shadow(0 0 18px var(--c-accent)) } }
.cta, .tag { animation: tossGlow 2s ease-in-out infinite !important; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important } }
`;

export interface GifOpts {
  frames?: number;   // number of frames to capture (default 24)
  fps?: number;      // playback fps (default 12)
  size?: RenderSize;
}

/**
 * Render a campaign as an animated GIF by capturing Playwright frames while
 * the injected CSS animation plays, then encoding with gifenc (no ffmpeg).
 */
export async function renderCampaignGif(c: Campaign, opts: GifOpts = {}): Promise<{ url: string; frames: number; width: number; height: number }> {
  const frames = opts.frames || 24;
  const fps = opts.fps || 12;
  const sizeKey: RenderSize = opts.size || (c.size as RenderSize) || '1080x1080';
  const dim = RENDER_SIZES[sizeKey];
  if (!dim) throw new Error(`Unknown size: ${sizeKey}`);
  if (!TEMPLATES[c.template]) throw new Error(`Unknown template: ${c.template}`);

  const brand: Brand = loadBrand();
  const html = inject(loadTemplate(c.template), tokensFor(brand, c))
    .replace('</head>', `<style>${ANIM_CSS}</style></head>`);

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: dim.w, height: dim.h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });

  const gif = GIFEncoder({ repeat: 0 });
  const frameGapMs = Math.round(1000 / fps);
  const width = dim.w, height = dim.h;

  for (let i = 0; i < frames; i++) {
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const { data } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const px = new Uint8Array(data);
    const palette = quantize(px, 256);
    const index = applyPalette(px, palette);
    gif.writeFrame(index, width, height, { palette, delay: frameGapMs, transparent: false });
    // let the CSS animation advance before the next capture
    if (i < frames - 1) await page.waitForTimeout(frameGapMs);
  }
  await page.close();
  gif.finish();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const fname = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.gif`;
  writeFileSync(join(OUT_DIR, fname), Buffer.from(gif.bytes()));
  return { url: `/marketing-out/${fname}`, frames, width, height };
}
