import { expect, test, type Page } from '@playwright/test';
import { makeImage, setRange, waitForRender } from './helpers.ts';

/** Phase 0 fixes (PRODUCT_STRATEGY.md), desktop. */

/** Mean colour of a part of a screenshot (fractions of its size). */
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
      const d = ctx.getImageData(Math.round(r.x * bmp.width), Math.round(r.y * bmp.height), Math.max(1, Math.round(r.w * bmp.width)), Math.max(1, Math.round(r.h * bmp.height))).data;
      const m = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k];
      return m.map((v) => v / (d.length / 4));
    },
    { b64: bytes.toString('base64'), r },
  );
}
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('heal spots after the 32nd are drawn', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'h.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  await page.locator('#tab-portrait').click();
  await page.getByRole('button', { name: 'Heal spots' }).click();
  await setRange(page, 'Spot size', 6);

  const canvas = page.locator('canvas.editor-canvas');
  const b = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  // 33 spots on the flat green field: they change nothing you can see.
  for (let i = 0; i < 33; i++) await at(0.06 + (i % 11) * 0.085, 0.56 + Math.floor(i / 11) * 0.06);
  await expect(page.getByRole('button', { name: 'Clear 33' })).toBeVisible();
  // Leave the tool so its rings are not in the picture, and keep the picture with 33 spots.
  await page.getByRole('button', { name: 'Healing on' }).click();
  await page.waitForTimeout(1500);
  const with33 = await canvas.screenshot();

  // The 34th on the corner of the skin patch: healing it has to change the picture.
  await page.getByRole('button', { name: 'Heal spots' }).click();
  await at(0.1, 0.2);
  await expect(page.getByRole('button', { name: 'Clear 34' })).toBeVisible();
  await page.getByRole('button', { name: 'Healing on' }).click();
  // The healed corner changes; the sky far from every spot does not.
  const corner = { x: 0.08, y: 0.17, w: 0.04, h: 0.06 };
  const sky = { x: 0.35, y: 0.03, w: 0.1, h: 0.06 };
  const before = await regionMean(page, with33, corner);
  await expect
    .poll(async () => dist(await regionMean(page, await canvas.screenshot(), corner), before), { timeout: 30_000 })
    .toBeGreaterThan(1);
  expect(dist(await regionMean(page, await canvas.screenshot(), sky), await regionMean(page, with33, sky))).toBeLessThan(1);
});
