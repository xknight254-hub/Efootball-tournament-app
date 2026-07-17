// ─── Brand token types (mirrors brand.json) ───────────────
export interface BrandColors {
  primary: string;
  primarySoft: string;
  surface: string;
  onPrimary: string;
  secondary: string;
  secondarySoft: string;
  accent: string;
  accentGold: string;
  accentGoldSoft: string;
  accentPink: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;
  line: string;
}

export interface Brand {
  name: string;
  version: string;
  logo: { path: string; wordmark: string; lockupHeightPx: number };
  watermark: { text: string; opacity: number; position: string };
  colors: BrandColors;
  gradients: Record<string, string>;
  fonts: { display: string; headline: string; body: string; mono: string };
  fontSizes: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  card: { padding: string; background: string; border: string };
  button: Record<string, string>;
  cta: { bg: string; color: string; radius: string; label: string };
  social: Record<string, string>;
  accentPresets: Record<string, { accent: string; gradient: string; glow: string }>;
}

// ─── Campaign JSON (what the marketing agent emits) ─────────
export interface Campaign {
  template: string;          // template id, e.g. "tournament-announcement"
  title?: string;
  subtitle?: string;
  prize?: string;
  date?: string;
  cta?: string;
  heroImage?: string;        // asset filename in assets/ (e.g. "player23.png")
  accent?: string;            // preset key: gold | teal | pink | live
  // Optional dynamic components
  countdown?: string;         // e.g. "02:14:55" or "3 Days"
  prizeBadge?: string;        // override prize display
  sponsorLogo?: string;       // asset filename
  qrCode?: string;            // URL or payload to embed as QR
  tournamentCode?: string;     // short code, e.g. "TOSS-7F3A"
  registrationDeadline?: string;
  featuredPlayer?: { name: string; team?: string; stat?: string };
  aiRecommendation?: string;   // badge text, e.g. "AI Pick: Underdog"
  // Match / fixture / score components
  teamA?: string;
  teamB?: string;
  scoreA?: string | number;
  scoreB?: string | number;
  round?: string;             // e.g. "Quarter Final", "Matchday 3"
  stage?: string;             // e.g. "Group Stage", "Knockouts"
  period?: string;            // e.g. "1st Half", "90'"
  body?: string;              // supporting paragraph text
  footer?: string;            // footer line (e.g. "Tap to register")
  // Tabular content (standings / top scorers / fixtures list)
  // Each row is a label+value or multi-cell; rendered as prebuilt HTML rows.
  rows?: string[];            // already-formatted HTML row snippets (renderer-safe)
  heroImageUrl?: string;      // direct URL (optional override of heroImage asset)
  // Responsive target size
  size?: RenderSize;
  // Free-form key/value pairs templates may read
  [k: string]: unknown;
}

// ─── Responsive targets ────────────────────────────────────
export type RenderSize = '1080x1080' | '1080x1350' | '1920x1080' | '1080x1920' | '1200x628';

export const RENDER_SIZES: Record<RenderSize, { w: number; h: number; aspect: string }> = {
  '1080x1080': { w: 1080, h: 1080, aspect: '1:1' },
  '1080x1350': { w: 1080, h: 1350, aspect: '4:5' },
  '1920x1080': { w: 1920, h: 1080, aspect: '16:9' },
  '1080x1920': { w: 1080, h: 1920, aspect: '9:16' },
  '1200x628': { w: 1200, h: 628, aspect: '1.91:1' },
};

// ─── Render result ─────────────────────────────────────────
export interface RenderResult {
  imagePath: string;   // absolute on disk
  url: string;          // served URL, e.g. /marketing-out/xxx.png
  width: number;
  height: number;
  template: string;
  renderTimeMs: number;
}

// ─── Quality check failure ──────────────────────────────────
export interface QualityIssue {
  rule: string;
  detail: string;
}
