/**
 * Colours burned into exported images (the date stamp, the contact sheet). Canvas pixels can't read
 * CSS variables in a worker or an OffscreenCanvas, so these mirror the role tokens in
 * `src/styles/index.css`; `palette.test.ts` fails if they drift apart.
 */
export const FINISH_COLORS = {
  ground: '#0a090e',
  fg: '#f0ebe1',
  fg3: '#a6a1af',
  accent: '#c8b8ff',
  stamp: '#f2994a',
} as const;

/**
 * Colours of the export overlays (camcorder, viewfinder). Like the orange stamp these are the user's
 * own content burned into their photo, not interface colours, so they mirror no role token: white,
 * its soft dark edge, and one red for the recording dot.
 */
export const OVERLAY_COLORS = {
  ink: '#ffffff',
  edge: 'rgba(0, 0, 0, 0.6)',
  rec: '#e5342b',
} as const;

/** Which CSS token each colour mirrors. */
export const FINISH_TOKENS: Record<keyof typeof FINISH_COLORS, string> = {
  ground: '--color-ground',
  fg: '--color-fg',
  fg3: '--color-fg-3',
  accent: '--color-accent',
  stamp: '--color-stamp',
};
