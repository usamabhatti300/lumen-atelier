import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeImage, setRange, waitForRender } from './helpers.ts';

/** Mean RGB of a rectangle (fractions of the image) in encoded image bytes. */
async function regionMean(page: Page, bytes: Buffer, r: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(
    async ({ b64, r }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const x = Math.round(r.x * bmp.width);
      const y = Math.round(r.y * bmp.height);
      const d = ctx.getImageData(x, y, Math.max(1, Math.round(r.w * bmp.width)), Math.max(1, Math.round(r.h * bmp.height))).data;
      const m = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k];
      return { width: bmp.width, height: bmp.height, mean: m.map((v) => v / (d.length / 4)) };
    },
    { b64: bytes.toString('base64'), r },
  );
}

const blueness = (s: { mean: number[] }) => s.mean[2] - s.mean[0];

// The fixture's skin-coloured block sits alone on the sky at x 0.10–0.25, y 0.20–0.45.
const SKIN = { x: 0.14, y: 0.27, w: 0.07, h: 0.1 };

/** Paints a vertical Remove stroke over the block. */
async function paintOverBlock(page: Page) {
  const canvas = (await page.locator('canvas.editor-canvas').boundingBox())!;
  const at = (fx: number, fy: number) => [canvas.x + fx * canvas.width, canvas.y + fy * canvas.height] as const;
  await page.mouse.move(...at(0.175, 0.22));
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(...at(0.175, 0.22 + (0.21 * i) / 8));
  await page.mouse.up();
}

/** Waits until every removal is filled in the preview. */
async function waitForRemovals(page: Page) {
  await expect(page.getByTestId('removal-item').first()).toBeVisible();
  await expect(page.getByText(/filling…|not applied/)).toHaveCount(0, { timeout: 180_000 });
  await expect(page.getByTestId('remove-status')).toHaveCount(0);
}

test('remove: painting erases an object, undo restores it, export contains the removal', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'scene.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  const canvas = page.locator('canvas.editor-canvas');
  const before = await regionMean(page, await canvas.screenshot(), SKIN);
  // Skin tone: much more red than blue. Sky: more blue than red.
  expect(blueness(before)).toBeLessThan(-50);

  await page.locator('#tab-remove').click();
  await expect(page.getByRole('button', { name: 'Remove brush on' })).toBeVisible();
  await setRange(page, 'Brush size', 18);
  await paintOverBlock(page);
  await waitForRemovals(page);
  await page.waitForTimeout(500);

  const removed = await regionMean(page, await canvas.screenshot(), SKIN);
  // The block is replaced by sky.
  expect(blueness(removed)).toBeGreaterThan(20);

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('removal-item')).toHaveCount(0);
  await page.waitForTimeout(800);
  const undone = await regionMean(page, await canvas.screenshot(), SKIN);
  expect(Math.abs(undone.mean[0] - before.mean[0])).toBeLessThan(6);

  await page.keyboard.press('Control+Shift+z');
  await waitForRemovals(page);
  await page.waitForTimeout(800);
  const redone = await regionMean(page, await canvas.screenshot(), SKIN);
  expect(blueness(redone)).toBeGreaterThan(20);

  // Hiding the removal shows the object again without deleting it.
  await page.getByRole('button', { name: 'Hide removal 1' }).click();
  await page.waitForTimeout(800);
  expect(blueness(await regionMean(page, await canvas.screenshot(), SKIN))).toBeLessThan(-50);
  await page.getByRole('button', { name: 'Show removal 1' }).click();
  await waitForRemovals(page);

  // Full-resolution export re-runs the removal on the original.
  await page.getByTestId('export-open').click();
  const dl = page.waitForEvent('download', { timeout: 240_000 });
  await page.getByTestId('export-start').click();
  const file = readFileSync((await (await dl).path())!);
  const out = await regionMean(page, file, SKIN);
  expect([out.width, out.height]).toEqual([900, 600]);
  expect(blueness(out)).toBeGreaterThan(20);
  // Far from the removal the export is the untouched photo (green field stays green).
  const field = await regionMean(page, file, { x: 0.4, y: 0.6, w: 0.1, h: 0.1 });
  expect(field.mean[1]).toBeGreaterThan(field.mean[0] + 30);
});
