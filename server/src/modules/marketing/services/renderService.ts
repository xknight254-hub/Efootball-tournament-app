import { renderCampaign as _render, closeRenderer, type RenderOpts } from '../renderer/index.js';
import { renderCampaignGif as _renderGif, type GifOpts } from '../renderer/animation.js';
import type { Campaign, RenderResult } from '../types/index.js';

/** Public facade used by agents, admin tools, and notification services. */
export async function renderCampaign(c: Campaign, opts?: RenderOpts): Promise<RenderResult> {
  return _render(c, opts);
}

/** Render a campaign as an animated GIF (ffmpeg-free, gifenc + Playwright). */
export async function renderCampaignGif(c: Campaign, opts?: GifOpts): Promise<{ url: string; frames: number; width: number; height: number }> {
  return _renderGif(c, opts);
}

export { closeRenderer };
export type { Campaign, RenderResult, RenderOpts };
