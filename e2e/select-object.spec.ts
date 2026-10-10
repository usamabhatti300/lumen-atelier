import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeImage, setRange, waitForRender } from './helpers.ts';

/**
 * "Select object" (SlimSAM, on-device): clicking the sky of the generated test
 * scene (sky in the top half, field + grey ramp below) must create a mask that
 * covers the sky, so a mask exposure change darkens the sky only, survives a
 * reload and is applied in the exported file.
 */

/** Mean luma of horizontal bands (fractions of the height) of encoded image bytes. */
async function bandLuma(page: Page, bytes: Buffer, bands: [number, number][]) {
  return page.evaluate(
    async ({ b64, bands }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      return bands.map(([a, b]) => {
        let s = 0;
        let n = 0;
        for (let y = Math.floor(a * height); y < Math.floor(b * height); y++) {
          // Skip the side margins (the test scene has coloured patches in the sky band).
          for (let x = Math.floor(width * 0.3); x < Math.floor(width * 0.5); x += 2) {
            const i = (y * width + x) * 4;
            s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            n++;
          }
        }
        return s / n;
      });
    },
    { b64: bytes.toString('base64'), bands },
  );
}

const SKY: [number, number] = [0.04, 0.12];
const FIELD: [number, number] = [0.56, 0.7];

test('Select object: click the sky, darken it, reload and export', async ({ page }) => {
  test.setTimeout(1_200_000); // SAM's image embedding is slow under SwiftShader + a shared CPU
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'scene.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 960, 640) });
  await waitForRender(page);
  const canvas = page.locator('canvas.editor-canvas');
  const original = await canvas.screenshot();

  await page.locator('#tab-masks').click();
  await page.getByRole('button', { name: 'New mask' }).click();
  await page.getByRole('button', { name: /Select object/ }).click();
  const chip = page.getByTestId('select-object-chip');
  // Real progress: the model download (bytes) and the photo analysis are reported before the first click.
  await expect(chip).toContainText('Click an object', { timeout: 720_000 });

  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.08);
  await expect(page.getByRole('list', { name: 'Mask shapes' }).getByText('Selected object (1 point)')).toBeVisible();
  await expect(page.getByTestId('object-point-include')).toHaveCount(1);
  await expect(chip).toContainText('Click an object', { timeout: 240_000 });

  // The mask overlay is on: the sky turns red-tinted, the field does not.
  await page.waitForTimeout(500);
  const overlay = await canvas.screenshot();
  const [oSky, oField] = await bandLuma(page, overlay, [SKY, FIELD]);
  const [sky0, field0] = await bandLuma(page, original, [SKY, FIELD]);
  expect(Math.abs(oSky - sky0)).toBeGreaterThan(8);
  expect(Math.abs(oField - field0)).toBeLessThan(4);

  // Shift-click adds an inclusion point to the same selection; Alt-click an exclusion point.
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.3);
  await page.keyboard.up('Shift');
  await expect(page.getByText('Selected object (2 points)')).toBeVisible();
  await expect(chip).toContainText('Click an object', { timeout: 240_000 });
  await page.keyboard.down('Alt');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.62);
  await page.keyboard.up('Alt');
  await expect(page.getByText('Selected object (3 points)')).toBeVisible();
  await expect(page.getByTestId('object-point-exclude')).toHaveCount(1);
  await expect(chip).toContainText('Click an object', { timeout: 240_000 });

  await page.getByText('Show mask overlay').click();
  await expect(page.getByRole('switch', { name: 'Show mask overlay' })).not.toBeChecked();
  await setRange(page, 'Exposure', -2);
  await page.waitForTimeout(1200);
  const edited = await canvas.screenshot();
  const [sky1, field1] = await bandLuma(page, edited, [SKY, FIELD]);
  expect(sky1).toBeLessThan(sky0 - 25);
  expect(Math.abs(field1 - field0)).toBeLessThan(4);

  // Reload: the clicked points are in the saved edit; the mask comes back from the local cache.
  await page.waitForTimeout(1500); // autosave
  await page.reload();
  await waitForRender(page);
  // The mask is restored from the local cache (or recomputed from the points if the cache is empty).
  await expect
    .poll(async () => (await bandLuma(page, await canvas.screenshot(), [SKY]))[0], { timeout: 600_000, intervals: [1000, 2000, 5000] })
    .toBeLessThan(sky0 - 25);
  const [, field2] = await bandLuma(page, await canvas.screenshot(), [SKY, FIELD]);
  expect(Math.abs(field2 - field0)).toBeLessThan(4);

  // Export at full resolution uses the mask.
  await page.getByTestId('export-open').click();
  const dl = page.waitForEvent('download', { timeout: 300_000 });
  await page.getByTestId('export-start').click();
  const file = readFileSync((await (await dl).path())!);
  const [skyE, fieldE] = await bandLuma(page, file, [SKY, FIELD]);
  expect(skyE).toBeLessThan(sky0 - 25);
  expect(Math.abs(fieldE - field0)).toBeLessThan(6);
});
