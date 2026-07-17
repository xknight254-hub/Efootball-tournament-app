// ─────────────────────────────────────────────────────────────────────────
// TOSS Multi-Layout Template System
//
// A layout is a parameterized preset. Families (registration-open, champion…)
// are mapped to a small set of flexible "shells" (hero / split / card /
// magazine / minimal / esports). Each family generates 200+ layouts by
// combining shell × heroPos × textPos × cardStyle × ctaStyle × bg, each with
// machine-readable metadata. A Layout Selector picks the best one from
//  campaign type, platform, orientation, available assets, and a rotation
//  tracker that avoids repetition.
//
// Brand consistency is preserved because every layout reuses the SAME design
// system (design-system.css): colors, fonts, components, shadows, radius,
// CTA — only the LAYOUT varies.
// ─────────────────────────────────────────────────────────────────────────

export type Platform = 'instagram' | 'whatsapp' | 'facebook' | 'telegram' | 'twitter' | 'generic';
export type HeroPos = 'full' | 'left' | 'right' | 'top' | 'bottom' | 'bg';
export type TextPos = 'bl' | 'br' | 'bc' | 'cl' | 'cr' | 'tl' | 'tr' | 'cc';
export type CardStyle = 'glass' | 'solid' | 'outline' | 'gradient' | 'tiles' | 'strip' | 'panel';
export type CtaStyle = 'gradient' | 'full' | 'outline' | 'glass' | 'pill';
export type ShellId = 'hero' | 'split' | 'card' | 'magazine' | 'minimal' | 'esports' | 'premium';

export interface Layout {
  id: string;
  family: string;
  shell: ShellId;
  heroPos: HeroPos;
  textPos: TextPos;
  cardStyle: CardStyle;
  ctaStyle: CtaStyle;
  bg: string;
  overlay: string;
  orientation: string;
  supportsAnimation: boolean;
  priority: number;
  tags: string[];
}

// ─── Shells: every family maps to the full flexible shell set.
// Order = priority bias for auto-selection (first = most representative). ──
export const SHELLS: ShellId[] = ['hero', 'split', 'card', 'magazine', 'minimal', 'esports', 'premium'];
// Which physical template file each shell renders with.
export const SHELL_FILE: Record<ShellId, string> = {
  hero: 'shell-hero.html',
  premium: 'shell-hero.html',   // premium = hero shell + premium bg/card styling
  split: 'shell-split.html',
  card: 'shell-card.html',
  magazine: 'shell-magazine.html',
  minimal: 'shell-minimal.html',
  esports: 'shell-esports.html',
};

// Every family exposes the full layout vocabulary (hero/split/card/magazine/
// minimal/esports/premium). Primary shell listed first biases selection.
const FAMILY_SHELLS: Record<string, ShellId[]> = {
  'registration-open':   ['hero', 'split', 'card', 'premium', 'minimal', 'esports', 'magazine'],
  'registration-closing':['hero', 'card', 'premium', 'minimal', 'split', 'magazine', 'esports'],
  champion:             ['hero', 'magazine', 'split', 'premium', 'minimal', 'esports', 'card'],
  'match-result':       ['split', 'card', 'hero', 'magazine', 'premium', 'minimal', 'esports'],
  'leaderboard':        ['card', 'magazine', 'minimal', 'hero', 'premium', 'split', 'esports'],
  'player-of-the-match':['hero', 'split', 'magazine', 'premium', 'card', 'minimal', 'esports'],
  fixture:              ['card', 'split', 'minimal', 'hero', 'premium', 'magazine', 'esports'],
  announcement:         ['hero', 'magazine', 'minimal', 'esports', 'premium', 'card', 'split'],
  promotion:            ['hero', 'card', 'esports', 'magazine', 'premium', 'split', 'minimal'],
  maintenance:          ['minimal', 'card', 'hero', 'premium', 'split', 'magazine', 'esports'],
};

// ─── Option pools ────────────────────────────────────────────────────────
const HERO_POS: HeroPos[] = ['full', 'left', 'right', 'top', 'bottom', 'bg'];
const TEXT_POS: TextPos[] = ['bl', 'br', 'bc', 'cl', 'cr', 'tl', 'tr', 'cc'];
// cardStyle is paired to shell below; not all combos are valid.
const CTA_STYLE: CtaStyle[] = ['gradient', 'full', 'outline', 'glass', 'pill'];
const BG = ['bg-arena', 'bg-stadium', 'bg-flood', 'bg-mesh', 'bg-esports', 'bg-orange', 'bg-premium', 'bg-neon', 'bg-abstract', 'bg-smoke', 'bg-black'];
const OVERLAY = ['ov-bottom', 'ov-top', 'ov-left', 'ov-right', 'ov-full', 'ov-orange', 'ov-glow', 'ov-blur'];

// Card style per shell (each shell only supports a sensible subset).
const SHELL_CARDS: Record<ShellId, CardStyle[]> = {
  hero: ['glass', 'gradient', 'outline', 'solid'],
  premium: ['gradient', 'glass', 'solid'],
  split: ['panel', 'glass', 'solid'],
  card: ['glass', 'tiles', 'strip', 'gradient'],
  magazine: ['glass', 'solid', 'outline'],
  minimal: ['strip', 'glass'],
  esports: ['solid', 'glass', 'gradient'],
};

// Orientation preference by platform (for selection).
const PLATFORM_ORIENTATION: Record<Platform, string> = {
  instagram: '1080x1350',
  whatsapp: '1080x1920',
  facebook: '1200x628',
  telegram: '1080x1350',
  twitter: '1200x628',
  generic: '1080x1350',
};

// ─── Generate the full layout catalog (200+) ─────────────────────────────
function buildCatalog(): Layout[] {
  const out: Layout[] = [];
  const families = Object.keys(FAMILY_SHELLS);
  for (const fam of families) {
    const shells = FAMILY_SHELLS[fam];
    const vcount: Record<string, number> = {}; // per-shell counter -> "v1","v2"...
    for (const shell of shells) {
      const cards = SHELL_CARDS[shell];
      vcount[shell] = 0;
      for (const heroPos of HERO_POS) {
        for (const textPos of TEXT_POS) {
          for (const cardStyle of cards) {
            for (const ctaStyle of CTA_STYLE) {
              for (const bg of BG) {
                const overlay = (heroPos === 'full' || heroPos === 'bg') ? 'ov-bottom' : OVERLAY[(HERO_POS.indexOf(heroPos) + TEXT_POS.indexOf(textPos)) % OVERLAY.length];
                const id = `${fam}:${shell}-v${++vcount[shell]}`;
                out.push({
                  id,
                  family: fam,
                  shell,
                  heroPos,
                  textPos,
                  cardStyle,
                  ctaStyle,
                  bg,
                  overlay,
                  orientation: '1080x1350',
                  supportsAnimation: true,
                  priority:
                    (shells.indexOf(shell) === 0 ? 10 : 6) +            // primary shell = higher
                    (heroPos === 'full' ? 2 : 0) +
                    (cardStyle === 'glass' ? 1 : 0) +
                    (bg === 'bg-arena' || bg === 'bg-esports' ? 1 : 0),
                  tags: [fam, shell, cardStyle, ctaStyle],
                });
              }
            }
          }
        }
      }
    }
  }
  // Sort by priority (best-first) and cap to a curated, varied set that
  // preserves SHELL DIVERSITY: keep up to SHELL_QUOTA layouts per (family,shell)
  // until the per-family cap is reached. This guarantees every campaign type
  // exposes hero/split/card/magazine/minimal/esports/premium variations while
  // staying fast and exceeding the "200+ reusable layouts" goal (~250 total).
  out.sort((a, b) => b.priority - a.priority);
  const SHELL_QUOTA = 4;
  const FAMILY_CAP = 25;
  const perShell: Record<string, number> = {};
  const perFam: Record<string, number> = {};
  const capped: Layout[] = [];
  for (const l of out) {
    const pf = perFam[l.family] || 0;
    if (pf >= FAMILY_CAP) continue;
    const key = `${l.family}:${l.shell}`;
    const ps = perShell[key] || 0;
    if (ps >= SHELL_QUOTA) continue;
    perShell[key] = ps + 1;
    perFam[l.family] = pf + 1;
    capped.push(l);
  }
  // Renumber v{n} per (family,shell) in the final capped set so the first
  // surviving layout of each shell is always "*-v1" (stable, predictable names).
  const vn: Record<string, number> = {};
  for (const fam of Object.keys(FAMILY_SHELLS)) {
    for (const sh of FAMILY_SHELLS[fam]) {
      for (const l of capped) {
        if (l.family === fam && l.shell === sh) {
          vn[fam + sh] = (vn[fam + sh] || 0) + 1;
          l.id = `${fam}:${sh}-v${vn[fam + sh]}`;
        }
      }
    }
  }
  return capped;
}

export const CATALOG: Layout[] = buildCatalog();

// Quick family→layout lookup.
export function layoutsForFamily(family: string): Layout[] {
  return CATALOG.filter((l) => l.family === family);
}

// ─── Rotation tracker (in-memory; one per process) ───────────────────────
const recent: Record<string, string[]> = {}; // key: family -> last used layout ids
const RECENT_WINDOW = 8;

function recordUsage(family: string, id: string) {
  if (!recent[family]) recent[family] = [];
  recent[family].unshift(id);
  recent[family] = recent[family].slice(0, RECENT_WINDOW);
}

export function resetRotation(family?: string) {
  if (family) delete recent[family];
  else for (const k of Object.keys(recent)) delete recent[k];
}

// ─── Selection engine ─────────────────────────────────────────────────────
export interface SelectInput {
  family: string;
  platform?: Platform;
  orientation?: string;        // e.g. "1080x1350"
  hasHero?: boolean;           // does the campaign have a hero image?
  rotate?: boolean;            // avoid recently used?
  preferredLayout?: string;    // explicit id/name override (e.g. "hero-v2")
}

/**
 * Pick the best layout for a campaign.
 * 1. If preferredLayout given, resolve it.
 * 2. Filter by family + (optional) platform orientation + asset availability.
 * 3. If rotate: penalize recently used; pick highest priority among survivors.
 * 4. Tie-break by score variety.
 */
export function selectLayout(input: SelectInput): Layout {
  const fam = input.family;
  let pool = layoutsForFamily(fam);
  if (!pool.length) {
    // Unknown family → fall back to a generic hero layout.
    pool = CATALOG.filter((l) => l.shell === 'hero' && l.heroPos === 'full');
  }

  // Explicit layout preference (accepts "...hero-v2" or "registration-open:hero-v2").
  // Search the full catalog so a named layout resolves regardless of family.
  if (input.preferredLayout) {
    const want = input.preferredLayout;
    const hit = CATALOG.find((l) => l.id === want || l.id.endsWith(':' + want) || l.id.split(':')[1] === want);
    if (hit) { recordUsage(hit.family, hit.id); return hit; }
  }

  const orientation = input.orientation || PLATFORM_ORIENTATION[input.platform || 'generic'];
  const used = recent[fam] || [];

  // Score each candidate.
  const scored = pool.map((l) => {
    let s = l.priority;
    // Prefer orientations that match the platform (informational; all render fine).
    if (l.orientation === orientation) s += 2;
    // If no hero image, avoid hero-pos full/bg (would look empty).
    if (input.hasHero === false && (l.heroPos === 'full' || l.heroPos === 'bg')) s -= 6;
    // Rotation: penalize recently used (strongly for the most recent).
    const ru = used.indexOf(l.id);
    if (ru >= 0) s -= (RECENT_WINDOW - ru) * 2;
    return { l, s };
  });

  scored.sort((a, b) => b.s - a.s);
  const best = scored[0].l;
  recordUsage(fam, best.id);
  return best;
}

// ─── Map a Layout → render tokens the shells consume ──────────────────────
export interface LayoutTokens {
  SHELL: string;          // shell id
  FILE: string;           // physical template file to load
  HERO_POS: string;       // class for .stage
  TEXT_POS: string;       // class for .content
  CARD_STYLE: string;     // class applied to card container
  CTA_STYLE: string;      // class applied to .cta
  BG: string;
  OVERLAY: string;
  HERO_MODE: string;      // extra hero-media class (cutout/edge)
}

export function layoutTokens(l: Layout): LayoutTokens {
  const heroClass =
    l.heroPos === 'left' ? 'hero-pos-left' :
    l.heroPos === 'right' ? 'hero-pos-right' :
    l.heroPos === 'top' ? 'hero-pos-top' :
    l.heroPos === 'bottom' ? 'hero-pos-bottom' :
    l.heroPos === 'bg' ? 'hero-pos-bg' : '';
  const textClass = `text-pos-${l.textPos}`;
  const heroMode = l.heroPos === 'bg' ? 'edge' : 'cutout';
  return {
    SHELL: l.shell,
    FILE: SHELL_FILE[l.shell],
    HERO_POS: heroClass,
    TEXT_POS: textClass,
    CARD_STYLE: l.cardStyle,
    CTA_STYLE: l.ctaStyle,
    BG: l.bg,
    OVERLAY: l.overlay,
    HERO_MODE: heroMode,
  };
}

export { PLATFORM_ORIENTATION };
