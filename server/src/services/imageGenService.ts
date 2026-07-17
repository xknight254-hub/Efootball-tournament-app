/**
 * Image generation service for the marketing agent.
 *
 * Uses Pollinations (keyless, OpenAI-compatible image endpoint) to generate a
 * banner image from a text prompt, downloads it, and stores it under
 * client/public/tournament-images so it is served at /tournament-images/<file>.
 *
 * No API key required. Fails gracefully: returns null on any error so callers
 * can fall back to a text-only status.
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// server/client/public/tournament-images  (matches imageRoutes.ts layout)
const IMAGE_DIR = join(__dirname, '..', '..', 'client', 'public', 'tournament-images');

function ensureDir() {
  if (!existsSync(IMAGE_DIR)) mkdirSync(IMAGE_DIR, { recursive: true });
}

export interface GenerateImageOpts {
  width?: number;
  height?: number;
  nologo?: boolean;
  model?: string;
}

/**
 * Generate an image from a prompt.
 * @returns the served URL (e.g. /tournament-images/agent_xxxx.png) or null on failure.
 */
export async function generateImage(
  prompt: string,
  opts: GenerateImageOpts = {}
): Promise<string | null> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const nologo = opts.nologo ?? true;
  const safePrompt = (prompt || '').slice(0, 1000).trim() || 'abstract banner';
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}` +
    `?width=${width}&height=${height}&nologo=${nologo}` +
    (opts.model ? `&model=${encodeURIComponent(opts.model)}` : '');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  // Pollinations' legacy endpoint occasionally returns 500 "Queue full".
  // One retry absorbs the transient overload; still falls back to null on hard failure.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (res.status >= 500) {
        console.warn(`[imageGen] Pollinations ${res.status}, retry ${attempt + 1}/2`);
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        console.error('[imageGen] Pollinations HTTP', res.status);
        return null;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('image')) {
        console.error('[imageGen] Non-image response:', contentType);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) {
        console.error('[imageGen] Image too small, likely an error page:', buf.length);
        return null;
      }
      ensureDir();
      const filename = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      writeFileSync(join(IMAGE_DIR, filename), buf);
      return `/tournament-images/${filename}`;
    } catch (e: any) {
      if (attempt === 1) {
        console.error('[imageGen] Generation failed:', e?.message);
        return null;
      }
      console.warn('[imageGen] fetch error, retry 1/2:', e?.message);
    }
  }
  clearTimeout(timer);
  return null;
}
