import { renderCampaign as _render, closeRenderer, type RenderOpts } from '../renderer/index.js';
import type { Campaign, RenderResult } from '../types/index.js';

/** Public facade used by agents, admin tools, and notification services. */
export async function renderCampaign(c: Campaign, opts?: RenderOpts): Promise<RenderResult> {
  return _render(c, opts);
}

export { closeRenderer };
export type { Campaign, RenderResult, RenderOpts };
