// Renders the PWA / home-screen icons in public/icons from the Lumen mark (same artwork as public/favicon.svg).
// Run after changing the mark: `node scripts/generate-icons.mjs` (uses the Playwright Chromium already installed for e2e).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const INK = '#121110';
const AMBER = '#c9a26b';

/** The mark (ring + half disc) centred on a square canvas; `scale` is the ring diameter as a fraction of the canvas. */
function svg({ size, scale, rounded }) {
  const r = (size * scale) / 2;
  const c = size / 2;
  const stroke = Math.max(2, size * 0.045);
  const corner = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${corner}" fill="${INK}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${AMBER}" stroke-width="${stroke}"/>
  <path d="M${c} ${c - r}a${r} ${r} 0 0 1 0 ${2 * r}z" fill="${AMBER}"/>
</svg>`;
}

const ICONS = [
  // "any" purpose: rounded tile, like the favicon.
  { file: 'icon-192.png', size: 192, scale: 0.56, rounded: true },
  { file: 'icon-512.png', size: 512, scale: 0.56, rounded: true },
  // Maskable: full bleed, mark inside the 80% safe zone so any launcher mask keeps it whole.
  { file: 'maskable-192.png', size: 192, scale: 0.46, rounded: false },
  { file: 'maskable-512.png', size: 512, scale: 0.46, rounded: false },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.52, rounded: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(icon)}</body></html>`);
  await page.locator('svg').screenshot({ path: `${outDir}${icon.file}`, omitBackground: true });
  console.log('wrote', icon.file);
}
await browser.close();
