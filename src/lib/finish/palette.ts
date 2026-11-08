/**
 * Colours burned into exported images (the date stamp, the contact sheet). Canvas pixels can't read
 * CSS variables in a worker or an OffscreenCanvas, so these mirror the role tokens in
 * `src/styles/index.css`; `palette.test.ts` fails if they drift apart.
 */
export const FINISH_COLORS = {
  ground: '#0d0c10',
  fg: '#f0ebe1',
  fg3: '#a6a1af',
  accent: '#c8b8ff',
  stamp: '#f2994a',
} as const;

/** Which CSS token each colour mirrors. */
export const FINISH_TOKENS: Record<keyof typeof FINISH_COLORS, string> = {
  ground: '--color-ground',
  fg: '--color-fg',
  fg3: '--color-fg-3',
  accent: '--color-accent',
  stamp: '--color-stamp',
};
