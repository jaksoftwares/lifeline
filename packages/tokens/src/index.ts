/**
 * Lifeline design tokens, from lifeline-brand-guidelines.md sections 4, 6 and 11.
 * theme.css exposes the same values to Tailwind; a test keeps the two in step.
 * Do not add colours or type styles here without updating the brand guidelines.
 */
export const colors = {
  navy: '#12304A',
  teal: '#0F8B8D',
  tealDeep: '#086B70',
  tealSoft: '#DDF3F1',

  ink: '#172B3A',
  slate: '#526575',
  muted: '#718391',
  border: '#D9E2E8',
  borderStrong: '#B9C8D2',
  surface: '#FFFFFF',
  surfaceSubtle: '#F5F8FA',
  surfaceBlue: '#EAF1F6',
  surfaceDark: '#0B1F30',

  success: '#23845B',
  warning: '#B7791F',
  critical: '#C43D4B',
  info: '#2866A6',
  neutral: '#647887',
} as const;

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  pill: '999px',
} as const;

/** 4px base scale. Key is the step number used in the brand guidelines (space-1 … space-12). */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const fonts = {
  body: 'Inter',
  display: 'Manrope',
} as const;

export const layout = {
  contentMaxWidth: 1440,
  sidebarWidth: 256,
  topbarHeight: 64,
} as const;

export type ColorToken = keyof typeof colors;
