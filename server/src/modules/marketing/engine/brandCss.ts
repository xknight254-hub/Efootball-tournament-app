import type { Brand, Campaign } from '../types/index.js';
import { accentOf } from './brand.js';

/**
 * Build a <style> block of CSS custom properties from brand.json.
 * Every template reads ONLY these variables — no hardcoded colors.
 * Accent preset from the campaign override the default accent.
 */
export function brandCss(brand: Brand, campaign?: Campaign): string {
  const a = accentOf(brand, campaign?.accent as string | undefined);
  const c = brand.colors;
  const r = brand.radius;
  const s = brand.shadow;
  const f = brand.fonts;
  const fs = brand.fontSizes;
  return `
  :root {
    --c-primary: ${c.primary};
    --c-primary-soft: ${c.primarySoft};
    --c-surface: ${c.surface};
    --c-on-primary: ${c.onPrimary};
    --c-secondary: ${c.secondary};
    --c-secondary-soft: ${c.secondarySoft};
    --c-accent: ${a.accent};
    --c-accent-2: ${c.accentPink};
    --c-gold: ${c.accentGold};
    --c-success: ${c.success};
    --c-warning: ${c.warning};
    --c-danger: ${c.danger};
    --c-muted: ${c.muted};
    --c-line: ${c.line};

    --g-hero: ${brand.gradients.hero};
    --g-accent: ${a.gradient};
    --g-gold: ${brand.gradients.gold};
    --g-surface: ${brand.gradients.surface};
    --g-live: ${brand.gradients.live};

    --f-display: '${f.display}', system-ui, sans-serif;
    --f-headline: '${f.headline}', system-ui, sans-serif;
    --f-body: '${f.body}', system-ui, sans-serif;
    --f-mono: '${f.mono}', ui-monospace, monospace;

    --fs-display: ${fs.display};
    --fs-headline: ${fs.headline};
    --fs-title: ${fs.title};
    --fs-subtitle: ${fs.subtitle};
    --fs-body: ${fs.body};
    --fs-caption: ${fs.caption};
    --fs-micro: ${fs.micro};

    --r-sm: ${r.sm};
    --r-md: ${r.md};
    --r-lg: ${r.lg};
    --r-pill: ${r.pill};

    --sh-card: ${s.card};
    --sh-glow: ${a.glow};
    --sh-accent: ${s.accent};

    --card-pad: ${brand.card.padding};
    --card-bg: ${brand.card.background};
    --card-border: ${brand.card.border};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; }
  body {
    font-family: var(--f-body);
    color: var(--c-on-primary);
    background: var(--c-primary);
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  `;
}
