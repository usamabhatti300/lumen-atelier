// Renders the PWA / home-screen icons in public/icons from the Lumen Atelier mark (same artwork as public/favicon.svg).
// Run after changing the mark: `node scripts/generate-icons.mjs` (uses the Playwright Chromium already installed for e2e).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const INK = '#121212';
const CARTON = '#e4a11b';
const BANDS = ['#c8322b', '#e4a11b', '#2f6db5'];

/** The mark (three film-carton bands in an ink-outlined square) centred on a carton-yellow canvas; `scale` is the square's side as a fraction of the canvas. */
function svg({ size, scale, rounded }) {
  const side = size * scale;
  const x = (size - side) / 2;
  const stroke = Math.max(2, size * 0.04);
  const corner = rounded ? size * 0.22 : 0;
  const band = (side - stroke) / 3;
  const bands = BANDS.map((c, i) => `<rect x="${x + stroke / 2 + i * band}" y="${x + stroke / 2}" width="${band + 0.5}" height="${side - stroke}" fill="${c}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${corner}" fill="${CARTON}"/>
  ${bands}
  <rect x="${x + stroke / 2}" y="${x + stroke / 2}" width="${side - stroke}" height="${side - stroke}" rx="${size * 0.03}" fill="none" stroke="${INK}" stroke-width="${stroke}"/>
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
