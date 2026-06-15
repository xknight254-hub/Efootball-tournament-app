// ============================================
// TOSS Design Tokens — Single Source of Truth
// Taste Engine v2 — HARD LOCK
// ============================================

export const COLORS = {
  bg: '#0A0A0A',
  card: '#141414',
  surface: '#141414',
  elevated: '#161616',
  primary: '#F97316',
  primaryHover: '#fb923c',
  primaryGlow: 'rgba(249,115,22,0.15)',
  primaryBorder: 'rgba(249,115,22,0.25)',
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  text: '#FAFAFA',
  textSecondary: '#A1A1A1',
  textMuted: '#737373',
  textDim: '#525252',
  border: 'rgba(255,255,255,0.08)',
  borderSubtle: 'rgba(255,255,255,0.04)',
} as const;

export const FONT = {
  display: "'Orbitron', sans-serif",
  body: "'Geist', system-ui, -apple-system, sans-serif",
  mono: "'Geist Mono', monospace",
} as const;

// LOCKED: 8 / 12 / 20 only
export const RADIUS = {
  sm: '8px',
  md: '12px',
  lg: '20px',
  full: '9999px',
} as const;

// LOCKED: 4 / 8 / 12 / 16 / 24 / 32 / 48 only
export const SPACE = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  xxxl: '48px',
} as const;

// ============================================
// Shared Inline Style Objects
// Taste Engine v2 — locked tokens only
// ============================================

export const S = {
  // Layout
  screen: { padding: `${SPACE.lg} ${SPACE.lg} 90px ${SPACE.lg}` } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center' } as React.CSSProperties,
  rowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
  col: { display: 'flex', flexDirection: 'column' } as React.CSSProperties,

  // Card — radius 20 only
  card: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
  } as React.CSSProperties,

  // Text — locked sizes: 10/12/14/16/20, weights: 400/700/800 only
  h1: { fontSize: '20px', fontWeight: 800, color: COLORS.text, fontFamily: FONT.body } as React.CSSProperties,
  h2: { fontSize: '16px', fontWeight: 700, color: COLORS.text } as React.CSSProperties,
  h3: { fontSize: '14px', fontWeight: 700, color: COLORS.text } as React.CSSProperties,
  body: { fontSize: '14px', color: COLORS.textSecondary } as React.CSSProperties,
  caption: { fontSize: '12px', color: COLORS.textMuted } as React.CSSProperties,
  micro: { fontSize: '10px', color: COLORS.textDim } as React.CSSProperties,
  heroNum: { fontSize: '20px', fontWeight: 800, color: COLORS.text, fontFamily: FONT.display } as React.CSSProperties,

  // Button — Primary (pill, radius 12)
  btnPrimary: {
    width: '100%',
    padding: '12px',
    borderRadius: RADIUS.md,
    fontSize: '14px',
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    background: COLORS.primary,
    color: '#0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  } as React.CSSProperties,

  // Button — Secondary (radius 12)
  btnSecondary: {
    width: '100%',
    padding: '12px',
    borderRadius: RADIUS.md,
    fontSize: '14px',
    fontWeight: 700,
    border: `1px solid ${COLORS.border}`,
    background: 'transparent',
    color: COLORS.textMuted,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  } as React.CSSProperties,

  // Button — Ghost (no border)
  btnGhost: {
    width: '100%',
    padding: '12px',
    borderRadius: RADIUS.md,
    fontSize: '14px',
    fontWeight: 700,
    border: 'none',
    background: 'transparent',
    color: COLORS.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  } as React.CSSProperties,

  // Button — Text link
  btnText: {
    fontSize: '12px',
    color: COLORS.primary,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    padding: 0,
  } as React.CSSProperties,

  // Input — radius 12
  input: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.md,
    padding: '12px 16px',
    outline: 'none',
    color: COLORS.text,
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  // Input with icon wrapper
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.md,
    padding: '12px 16px',
  } as React.CSSProperties,

  // Error banner — radius 8
  errorBanner: {
    padding: '12px',
    borderRadius: RADIUS.sm,
    fontSize: '12px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    color: '#f87171',
  } as React.CSSProperties,

  // Success banner — radius 8
  successBanner: {
    padding: '12px',
    borderRadius: RADIUS.sm,
    fontSize: '12px',
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.25)',
    color: '#4ade80',
  } as React.CSSProperties,

  // Chip / filter — radius 8
  chip: (active: boolean) => ({
    padding: '8px 16px',
    borderRadius: RADIUS.sm,
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    background: active ? COLORS.primaryGlow : COLORS.surface,
    color: active ? COLORS.primary : COLORS.textMuted,
    border: active ? `1px solid ${COLORS.primaryBorder}` : `1px solid ${COLORS.border}`,
  } as React.CSSProperties),

  // Status dot
  statusDot: (color: string) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
  } as React.CSSProperties),

  // Badge — radius 8
  badge: (color: string, bgColor: string) => ({
    padding: '4px 12px',
    borderRadius: RADIUS.sm,
    fontSize: '10px',
    fontWeight: 700,
    color: color,
    background: bgColor,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties),
};
