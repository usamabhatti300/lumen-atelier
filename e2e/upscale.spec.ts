import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/** Decodes an exported file in the page: size, a corner alpha, and edge energy vs. a plain bilinear 2× of `base`. */
async function analyse(page: Page, bytes: Buffer, base?: Buffer) {
  return page.evaluate(
    async ({ b64, base64 }) => {
      const decode = async (s: string) => {
        const bin = atob(s);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return createImageBitmap(new Blob([arr]), { premultiplyAlpha: 'none' });
      };
      const pixels = (bmp: ImageBitmap) => {
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height);
      };
      // Mean absolute Laplacian of luma: higher = crisper edges.
      const energy = (img: ImageData) => {
        const { width: w, height: h, data: d } = img;
        const L = (x: number, y: number) => {
          const i = (y * w + x) * 4;
          return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        };
        let s = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) s += Math.abs(4 * L(x, y) - L(x - 1, y) - L(x + 1, y) - L(x, y - 1) - L(x, y + 1));
        return s / ((w - 2) * (h - 2));
      };
      const bmp = await decode(b64);
      const img = pixels(bmp);
      let bilinear: number | null = null;
      if (base64) {
        const b = await decode(base64);
        const up = await createImageBitmap(b, { resizeWidth: bmp.width, resizeHeight: bmp.height, resizeQuality: 'high' });
        bilinear = energy(pixels(up));
      }
      return { width: bmp.width, height: bmp.height, corner: img.data[3], energy: energy(img), bilinear };
    },
    { b64: bytes.toString('base64'), base64: base?.toString('base64') ?? null },
  );
}

async function exportOnce(page: Page, setup: () => Promise<void>) {
  await page.getByTestId('export-open').click();
  await setup();
  const dl = page.waitForEvent('download', { timeout: 600_000 });
  await page.getByTestId('export-start').click();
  const download = await dl;
  const bytes = readFileSync((await download.path())!);
  await page.getByRole('button', { name: 'Done' }).click({ timeout: 180_000 });
  return { bytes, name: download.suggestedFilename() };
}

test.describe('AI upscale on export', () => {
  test.setTimeout(900_000);
  // Rendering and inference (SwiftShader + WASM) can block the page for a while on a busy machine.
  test.use({ actionTimeout: 180_000 });

  test('2× doubles the dimensions exactly and is sharper than a plain enlargement', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'small.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 240, 160) });
    await waitForRender(page);

    const plain = await exportOnce(page, async () => {});
    const base = await analyse(page, plain.bytes);
    expect([base.width, base.height]).toEqual([240, 160]);

    const ai = await exportOnce(page, async () => {
      await page.getByRole('radiogroup', { name: 'AI upscale' }).getByRole('radio', { name: '2×' }).click();
      await expect(page.getByTestId('export-size')).toContainText('480 × 320px');
      await expect(page.getByTestId('upscale-note')).toContainText('Real-ESRGAN');
      await expect(page.getByTestId('upscale-note')).toContainText('1 tile ');
    });
    const up = await analyse(page, ai.bytes, plain.bytes);
    expect([up.width, up.height]).toEqual([480, 320]);
    expect(up.energy).toBeGreaterThan(up.bilinear! * 1.15);
  });

  test('PNG keeps transparency', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 't.png', mimeType: 'image/png', buffer: await makeImage(page, 'transparent', 200, 150) });
    await waitForRender(page);
    const out = await exportOnce(page, async () => {
      await page.getByRole('radio', { name: 'PNG' }).click();
      await page.getByRole('radiogroup', { name: 'AI upscale' }).getByRole('radio', { name: '4×' }).click();
      await expect(page.getByTestId('upscale-note')).toContainText('transparency is kept');
    });
    const r = await analyse(page, out.bytes);
    expect([r.width, r.height]).toEqual([800, 600]);
    expect(r.corner).toBe(0);
    expect(out.name).toBe('t-edited.png');
  });

  test('oversize outputs are refused before starting; cancel stops an upscale', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'wide.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 4200, 120) });
    await waitForRender(page);
    await page.getByTestId('export-open').click();
    await page.getByRole('radiogroup', { name: 'AI upscale' }).getByRole('radio', { name: '4×' }).click();
    await expect(page.getByRole('alert')).toContainText('16384 px per side');
    await expect(page.getByTestId('export-start')).toBeDisabled();
    await page.getByRole('radiogroup', { name: 'AI upscale' }).getByRole('radio', { name: '2×' }).click();
    await expect(page.getByTestId('export-size').first()).toContainText('8400 × 240px');
    await expect(page.getByTestId('upscale-note')).toContainText('19 tiles');

    // Cancel while tiles are being upscaled.
    await page.getByTestId('export-start').click();
    await expect(page.getByText(/Upscaling 2× with AI/)).toBeVisible({ timeout: 300_000 });
    await page.getByRole('button', { name: 'Cancel export' }).click();
    await expect(page.getByText('Cancelled. 0 files saved.')).toBeVisible({ timeout: 120_000 });
  });
});
