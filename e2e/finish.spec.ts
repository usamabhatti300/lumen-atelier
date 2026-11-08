import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/**
 * Counts stamp-orange pixels (#f2994a and its bleed) in a region of an image, given as fractions of
 * its size. The test photo has no orange anywhere, so any hit is the stamp.
 */
async function orangeIn(page: Page, bytes: Buffer, region: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(
    async ({ b64, region }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const x = Math.round(region.x * bmp.width);
      const y = Math.round(region.y * bmp.height);
      const d = ctx.getImageData(x, y, Math.round(region.w * bmp.width), Math.round(region.h * bmp.height)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 110 && d[i + 1] < 185 && d[i + 2] < 105) n++;
      const corner = ctx.getImageData(4, 4, 1, 1).data;
      return { n, width: bmp.width, height: bmp.height, corner: [corner[0], corner[1], corner[2]] };
    },
    { b64: bytes.toString('base64'), region },
  );
}

const BOTTOM_LEFT = { x: 0, y: 0.8, w: 0.35, h: 0.2 };
const BOTTOM_RIGHT = { x: 0.65, y: 0.8, w: 0.35, h: 0.2 };

async function exportPng(page: Page) {
  await page.getByRole('radio', { name: 'PNG' }).click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-start').click();
  const download = await dl;
  return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

test.describe('finish', () => {
  test('date stamp: off by default, previewed, and burned into the chosen corner', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'day.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
    await waitForRender(page);

    // Without the stamp, nothing orange is added.
    await page.getByTestId('export-open').click();
    await expect(page.getByTestId('finish')).toBeVisible();
    const stampSwitch = page.getByRole('switch', { name: /Date stamp/ });
    await expect(stampSwitch).not.toBeChecked();
    const plain = await exportPng(page);
    expect((await orangeIn(page, plain.bytes, { x: 0, y: 0, w: 1, h: 1 })).n).toBe(0);
    await page.getByRole('button', { name: 'Done' }).click();

    // With it: a chosen date, bottom left.
    await page.getByTestId('export-open').click();
    await page.getByRole('switch', { name: /Date stamp/ }).check({ force: true });
    const date = page.getByLabel('Stamp date');
    // A photo with no capture date defaults to today.
    await expect(date).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await date.fill('2024-05-01');
    await page.getByRole('radio', { name: 'Bottom left' }).click();

    // The preview shows the stamp where the export will put it.
    await expect
      .poll(() =>
        page.getByTestId('finish-preview').evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const d = c.getContext('2d')!.getImageData(0, Math.round(c.height * 0.8), Math.round(c.width * 0.35), Math.round(c.height * 0.2)).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 110 && d[i + 1] < 185 && d[i + 2] < 105) n++;
          return n;
        }),
      )
      .toBeGreaterThan(10);

    const stamped = await exportPng(page);
    expect(stamped.name).toBe('day-edited.png');
    const left = await orangeIn(page, stamped.bytes, BOTTOM_LEFT);
    const right = await orangeIn(page, stamped.bytes, BOTTOM_RIGHT);
    expect([left.width, left.height]).toEqual([900, 600]);
    expect(left.n).toBeGreaterThan(40);
    expect(right.n).toBe(0);
  });

  test('contact sheet: chosen frames as one numbered, dated image', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles([
      { name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) },
      { name: 'b.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'reference', 600, 900) },
      { name: 'c.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 800, 800) },
    ]);
    await waitForRender(page);

    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'Contact sheet' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Export contact sheet' })).toBeVisible();
    await expect(page.getByText('frames · 3 of 3')).toBeVisible();
    await page.getByRole('button', { name: 'Leave out b.jpg' }).click();
    await expect(page.getByText('frames · 2 of 3')).toBeVisible();
    await page.getByRole('radio', { name: '9:16' }).click();
    await expect(page.getByTestId('export-size')).toContainText('2160 × 3840px');
    // AI upscale and output size don't apply to a sheet.
    await expect(page.getByRole('radiogroup', { name: 'AI upscale' })).toHaveCount(0);
    await page.getByRole('switch', { name: /Date stamp/ }).check({ force: true });

    const sheet = await exportPng(page);
    expect(sheet.name).toMatch(/contact sheet\.png$/);
    const s = await orangeIn(page, sheet.bytes, { x: 0, y: 0, w: 1, h: 1 });
    expect([s.width, s.height]).toEqual([2160, 3840]);
    // Night-black sheet, with one stamp per frame.
    expect(s.corner).toEqual([13, 12, 16]);
    expect(s.n).toBeGreaterThan(80);
  });
});
