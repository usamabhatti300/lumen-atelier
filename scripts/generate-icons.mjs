// Renders the PWA / home-screen icons in public/icons and public/favicon.svg from the Lumen Atelier
// mark ("Afterimage": a lowercase "lu" monogram in Martian Mono with a hard lilac offset behind it,
// the same idea as src/components/Wordmark.tsx).
// Run after changing the mark: `node scripts/generate-icons.mjs` (uses the Playwright Chromium already installed for e2e).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const faviconPath = fileURLToPath(new URL('../public/favicon.svg', import.meta.url));
mkdirSync(outDir, { recursive: true });

const GROUND = '#0d0c10';
const IVORY = '#f0ebe1';
const LILAC = 'rgb(200 184 255 / 0.62)';
const font = readFileSync(
  fileURLToPath(new URL('../node_modules/@fontsource-variable/martian-mono/files/martian-mono-latin-wdth-normal.woff2', import.meta.url)),
).toString('base64');

/** The monogram centred on the night ground; `scale` is the letters' size as a fraction of the tile. */
function html({ size, scale, rounded }) {
  const fs = size * scale;
  const off = Math.max(1.5, size * 0.03);
  return `<html><head><style>
    @font-face { font-family: 'Martian Mono'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 800; font-stretch: 75% 112.5%; }
    body { margin: 0; background: transparent; }
    #t { width: ${size}px; height: ${size}px; border-radius: ${rounded ? size * 0.22 : 0}px; background: ${GROUND};
         display: grid; place-items: center; overflow: hidden; }
    #t span { font: 400 ${fs}px/1 'Martian Mono'; font-stretch: 100%; letter-spacing: -0.08em; color: ${IVORY};
              text-shadow: ${off}px ${off}px 0 ${LILAC}; transform: translate(${-off / 2}px, ${-off / 2}px); }
  </style></head><body><div id="t"><span>lu</span></div></body></html>`;
}

const ICONS = [
  // "any" purpose: rounded tile, like the favicon.
  { file: 'icon-192.png', size: 192, scale: 0.4, rounded: true },
  { file: 'icon-512.png', size: 512, scale: 0.4, rounded: true },
  // Maskable: full bleed, mark inside the 80% safe zone so any launcher mask keeps it whole.
  { file: 'maskable-192.png', size: 192, scale: 0.32, rounded: false },
  { file: 'maskable-512.png', size: 512, scale: 0.32, rounded: false },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.38, rounded: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(icon) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(html(icon));
  await page.evaluate(() => document.fonts.ready);
  return page.locator('#t').screenshot({ omitBackground: true });
}
for (const icon of ICONS) {
  writeFileSync(`${outDir}${icon.file}`, await render(icon));
  console.log('wrote', icon.file);
}
// The favicon: a 64 px render of the rounded tile, wrapped in SVG so the existing /favicon.svg link keeps working.
const fav = (await render({ size: 64, scale: 0.42, rounded: true })).toString('base64');
writeFileSync(
  faviconPath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${fav}"/></svg>\n`,
);
console.log('wrote favicon.svg');
await browser.close();
