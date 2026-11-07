// Renders the PWA / home-screen icons in public/icons from the Lumen Atelier mark (same artwork as public/favicon.svg and src/components/Wordmark.tsx).
// Run after changing the mark: `node scripts/generate-icons.mjs` (uses the Playwright Chromium already installed for e2e).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const GROUND = '#0e0e10';
const LIME = '#d4ff3f';
const SPECTRUM = ['#ff5c7a', '#ffb547', '#d4ff3f', '#3fe0ff', '#8f7dff'];

/** The mark (a ring of split light around a lime point) centred on the graphite ground; `scale` is the ring's outer diameter as a fraction of the canvas. */
function svg({ size, scale, rounded }) {
  const c = size / 2;
  const stroke = size * scale * 0.18;
  const r = (size * scale - stroke) / 2;
  const corner = rounded ? size * 0.22 : 0;
  const stops = SPECTRUM.map((col, i) => `<stop offset="${i / (SPECTRUM.length - 1)}" stop-color="${col}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${corner}" fill="${GROUND}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#g)" stroke-width="${stroke}"/>
  <circle cx="${c}" cy="${c}" r="${size * scale * 0.155}" fill="${LIME}"/>
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
