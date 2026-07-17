// Copies non-TS Brand Rendering Engine assets into dist/ so the compiled
// server can read brand.json, templates, logos, and fonts at runtime.
import { cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '..', 'src', 'modules', 'marketing');
const dst = join(__dirname, '..', 'dist', 'modules', 'marketing');

const dirs = ['templates', 'assets', 'fonts'];
mkdirSync(dst, { recursive: true });
cpSync(join(src, 'brand.json'), join(dst, 'brand.json'));
for (const d of dirs) {
  const from = join(src, d);
  if (existsSync(from)) cpSync(from, join(dst, d), { recursive: true });
}
console.log('[copy-marketing-assets] brand.json + templates/assets/fonts -> dist/modules/marketing');
