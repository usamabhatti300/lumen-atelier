import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeImage, setRange, waitForRender } from './helpers.ts';

type Region = { x: number; y: number; w: number; h: number };

/** Mean RGB of regions (fractions of the image) of an encoded image. */
async function regionMeans(page: Page, bytes: Buffer, regions: Region[]) {
  return page.evaluate(
    async ({ b64, regions }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return {
        width: bmp.width,
        height: bmp.height,
        means: regions.map((r) => {
          const d = ctx.getImageData(Math.round(r.x * bmp.width), Math.round(r.y * bmp.height), Math.max(1, Math.round(r.w * bmp.width)), Math.max(1, Math.round(r.h * bmp.height))).data;
          const m = [0, 0, 0];
          for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k];
          return m.map((v) => v / (d.length / 4));
        }),
      };
    },
    { b64: bytes.toString('base64'), regions },
  );
}

const LEFT = { x: 0.02, y: 0.1, w: 0.2, h: 0.5 };
const RIGHT = { x: 0.78, y: 0.1, w: 0.2, h: 0.5 };
const CENTRE = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
const CORNER = { x: 0, y: 0, w: 0.12, h: 0.12 };

const shot = (page: Page) => page.locator('canvas.editor-canvas').screenshot();
async function settle(page: Page) {
  await page.waitForTimeout(900);
}

test.describe('effects', () => {
  test('each effect changes the photo, is the original again at 0, undoes and exports', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'fx.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
    await waitForRender(page);
    await page.getByRole('tab', { name: 'Effects' }).click();
    for (const name of ['Light leak', 'Lens flare', 'Bloom', 'Halation', 'Flash', 'Dreamy blur', 'Colour fringe', 'Dust & scratches']) {
      await expect(page.getByRole('slider', { name, exact: true })).toHaveValue('0');
    }
    await settle(page);
    const original = await shot(page);

    // Every effect changes the render on its own.
    for (const name of ['Light leak', 'Lens flare', 'Bloom', 'Halation', 'Flash', 'Dreamy blur', 'Colour fringe', 'Dust & scratches']) {
      await setRange(page, name, 100);
      await settle(page);
      expect(Buffer.compare(await shot(page), original), name).not.toBe(0);
      await setRange(page, name, 0);
    }
    // ...and with all back at 0 the photo is exactly as before.
    await settle(page);
    expect(Buffer.compare(await shot(page), original)).toBe(0);

    // Light leak warms the right edge, not the left.
    const base = await regionMeans(page, original, [LEFT, RIGHT, CENTRE, CORNER]);
    await setRange(page, 'Light leak', 100);
    await settle(page);
    const leak = await regionMeans(page, await shot(page), [LEFT, RIGHT, CENTRE, CORNER]);
    expect(leak.means[1][0] - base.means[1][0]).toBeGreaterThan(15);
    expect(leak.means[1][0] - base.means[1][0]).toBeGreaterThan(leak.means[1][2] - base.means[1][2]);
    expect(Math.abs(leak.means[0][0] - base.means[0][0])).toBeLessThan(6);
    await setRange(page, 'Light leak', 0);

    // Flash: a brighter centre, darker corners.
    await setRange(page, 'Flash', 100);
    await settle(page);
    const flash = await regionMeans(page, await shot(page), [LEFT, RIGHT, CENTRE, CORNER]);
    expect(flash.means[2][1]).toBeGreaterThan(base.means[2][1] + 10);
    expect(flash.means[3][1]).toBeLessThan(base.means[3][1]);

    // The section's reset puts the light effects back.
    await page.getByRole('button', { name: /reset light/i }).click();
    await expect(page.getByRole('slider', { name: 'Flash', exact: true })).toHaveValue('0');

    // Effects are part of the edit: undo and redo.
    await setRange(page, 'Bloom', 60);
    await setRange(page, 'Dust & scratches', 70);
    await setRange(page, 'Colour fringe', 50);
    await settle(page);
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('slider', { name: 'Colour fringe', exact: true })).toHaveValue('0');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByRole('slider', { name: 'Colour fringe', exact: true })).toHaveValue('50');

    // Export renders them (tiled full-resolution path).
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-start').click();
    const file = readFileSync((await (await dl).path())!);
    const out = await regionMeans(page, file, [LEFT, RIGHT, CENTRE, CORNER]);
    expect(out.width).toBe(900);
    expect(out.height).toBe(600);
    // Bloom lifts the bright sky a little; the export is not the untouched photo.
    const plain = base.means.flat().reduce((a, b) => a + b, 0);
    expect(Math.abs(out.means.flat().reduce((a, b) => a + b, 0) - plain)).toBeGreaterThan(1);
  });
});
