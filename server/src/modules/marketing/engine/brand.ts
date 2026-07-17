import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Brand } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAND_PATH = join(__dirname, '..', 'brand.json');

let cached: Brand | null = null;

/** Load brand.json (single source of truth). Cached after first read. */
export function loadBrand(): Brand {
  if (cached) return cached;
  const raw = readFileSync(BRAND_PATH, 'utf8');
  cached = JSON.parse(raw) as Brand;
  return cached;
}

/** Absolute path to an asset inside the module's assets/ dir. */
export function assetPath(rel: string): string {
  return join(__dirname, '..', rel);
}

// Resolve an accent preset key to its tokens (falls back to default accent).
export function accentOf(brand: Brand, key?: string) {
  if (key && brand.accentPresets[key]) return brand.accentPresets[key];
  return {
    accent: brand.colors.accent,
    gradient: brand.gradients.accent,
    glow: brand.shadow.accent,
  };
}
