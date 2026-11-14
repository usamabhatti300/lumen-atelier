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

/**
 * Counts overlay pixels in a region (fractions of the image): the recording dot's red and the
 * overlay's white. The test photo has neither in its top-left (sky) or bottom-left (dark ramp).
 */
async function overlayInk(page: Page, bytes: Buffer, region: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(
    async ({ b64, region }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(
        Math.round(region.x * bmp.width),
        Math.round(region.y * bmp.height),
        Math.round(region.w * bmp.width),
        Math.round(region.h * bmp.height),
      ).data;
      let red = 0;
      let white = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 190 && d[i + 1] < 90 && d[i + 2] < 90) red++;
        else if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++;
      }
      return { red, white };
    },
    { b64: bytes.toString('base64'), region },
  );
}

const TOP_LEFT = { x: 0, y: 0, w: 0.3, h: 0.18 };
const TOP_RIGHT = { x: 0.7, y: 0, w: 0.3, h: 0.11 };
const BOTTOM_LEFT ={ x: 0, y: 0.8, w: 0.35, h: 0.2 };
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

  test('overlay: none by default; camcorder burns REC, a battery and one date into the export', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'day.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
    await waitForRender(page);

    // None: nothing red or white is added.
    await page.getByTestId('export-open').click();
    const none = page.getByRole('radiogroup', { name: 'Overlay' }).getByRole('radio', { name: 'None' });
    await expect(none).toHaveAttribute('aria-checked', 'true');
    const plain = await exportPng(page);
    expect(await overlayInk(page, plain.bytes, TOP_LEFT)).toEqual({ red: 0, white: 0 });
    expect(await overlayInk(page, plain.bytes, BOTTOM_LEFT)).toEqual({ red: 0, white: 0 });
    await page.getByRole('button', { name: 'Done' }).click();

    // Camcorder, with the date stamp switched on first: the camcorder's date takes its place.
    await page.getByTestId('export-open').click();
    await page.getByRole('switch', { name: /Date stamp/ }).check({ force: true });
    await page.getByRole('radio', { name: 'Camcorder' }).click();
    await expect(page.getByRole('switch', { name: /Date stamp/ })).toBeDisabled();
    await expect(page.getByText('The camcorder overlay shows the date itself.')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Stamp placement' })).toHaveCount(0);
    // The date stays editable; this photo has no capture date, so it starts as today.
    await expect(page.getByLabel('Stamp date')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await page.getByLabel('Stamp date').fill('2024-05-01');

    // The preview shows the recording dot where the export will put it.
    await expect
      .poll(() =>
        page.getByTestId('finish-preview').evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const d = c.getContext('2d')!.getImageData(0, 0, Math.round(c.width * 0.3), Math.round(c.height * 0.18)).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 90 && d[i + 2] < 90) n++;
          return n;
        }),
      )
      .toBeGreaterThan(10);

    const cam = await exportPng(page);
    const topLeft = await overlayInk(page, cam.bytes, TOP_LEFT);
    expect(topLeft.red).toBeGreaterThan(100); // the dot
    expect(topLeft.white).toBeGreaterThan(40); // REC
    expect((await overlayInk(page, cam.bytes, TOP_RIGHT)).white).toBeGreaterThan(40); // the battery
    const bottomLeft = await overlayInk(page, cam.bytes, BOTTOM_LEFT);
    expect(bottomLeft.white).toBeGreaterThan(60); // the date
    expect(bottomLeft.red).toBe(0);
    // One date: no orange stamp anywhere, and the size is unchanged.
    const orange = await orangeIn(page, cam.bytes, { x: 0, y: 0, w: 1, h: 1 });
    expect(orange.n).toBe(0);
    expect([orange.width, orange.height]).toEqual([900, 600]);
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
    await expect(page.getByRole('radiogroup', { name: 'Overlay' })).toHaveCount(0);
    await page.getByRole('switch', { name: /Date stamp/ }).check({ force: true });

    const sheet = await exportPng(page);
    expect(sheet.name).toMatch(/contact sheet\.png$/);
    const s = await orangeIn(page, sheet.bytes, { x: 0, y: 0, w: 1, h: 1 });
    expect([s.width, s.height]).toEqual([2160, 3840]);
    // Night-black sheet, with one stamp per frame.
    expect(s.corner).toEqual([10, 9, 14]); // --color-ground #0a090e (mirrored in src/lib/finish/palette.ts)
    expect(s.n).toBeGreaterThan(80);
  });
});
