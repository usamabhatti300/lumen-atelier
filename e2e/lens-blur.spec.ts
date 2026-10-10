import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { setRange, waitForRender } from './helpers.ts';

/**
 * Lens blur (Step 4): depth from Depth Anything V2 Small on this device, then a
 * depth-aware blur. The scene is a textured ground plane receding to the
 * horizon, so the model sees depth increase towards the top of the frame.
 */

async function groundScene(page: Page, width = 960, height = 640): Promise<Buffer> {
  // Vite may reload the page once while it finishes optimising dependencies on a cold start.
  for (let attempt = 0; ; attempt++) {
    try {
      return await drawGroundScene(page, width, height);
    } catch (e) {
      if (attempt > 2 || !String(e).includes('Execution context was destroyed')) throw e;
      await page.waitForLoadState('load');
    }
  }
}

async function drawGroundScene(page: Page, width: number, height: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ width, height }) => {
      const c = new OffscreenCanvas(width, height);
      const ctx = c.getContext('2d')!;
      const sky = ctx.createLinearGradient(0, 0, 0, height * 0.35);
      sky.addColorStop(0, '#6f97cf');
      sky.addColorStop(1, '#dfe8f0');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height * 0.35);
      // Perspective checkerboard: rows shrink towards the horizon.
      const horizon = height * 0.35;
      for (let row = 0; row < 40; row++) {
        const z0 = 1 + row * 0.35;
        const z1 = z0 + 0.35;
        const y0 = horizon + (height - horizon) / z1;
        const y1 = horizon + (height - horizon) / z0;
        for (let col = -30; col < 30; col++) {
          const xa0 = width / 2 + (col * width * 0.12) / z0;
          const xa1 = width / 2 + ((col + 1) * width * 0.12) / z0;
          const xb0 = width / 2 + (col * width * 0.12) / z1;
          const xb1 = width / 2 + ((col + 1) * width * 0.12) / z1;
          ctx.fillStyle = (row + col) % 2 ? '#3b5d2c' : '#c9b48a';
          ctx.beginPath();
          ctx.moveTo(xb0, y0);
          ctx.lineTo(xb1, y0);
          ctx.lineTo(xa1, y1);
          ctx.lineTo(xa0, y1);
          ctx.closePath();
          ctx.fill();
        }
      }
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.93 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { width, height },
  );
  return Buffer.from(b64, 'base64');
}

/** Mean absolute horizontal luminance difference (detail) inside a rectangle given in fractions of the image. */
async function detail(page: Page, bytes: Buffer, rect: [number, number, number, number]) {
  return page.evaluate(
    async ({ b64, rect }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const x0 = Math.round(rect[0] * bmp.width);
      const y0 = Math.round(rect[1] * bmp.height);
      const w = Math.round(rect[2] * bmp.width);
      const h = Math.round(rect[3] * bmp.height);
      const d = ctx.getImageData(x0, y0, w, h).data;
      let s = 0;
      let n = 0;
      for (let y = 0; y < h; y++)
        for (let x = 1; x < w; x++) {
          const i = (y * w + x) * 4;
          const l1 = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
          const l0 = 0.3 * d[i - 4] + 0.59 * d[i - 3] + 0.11 * d[i - 2];
          s += Math.abs(l1 - l0);
          n++;
        }
      return s / n;
    },
    { b64: bytes.toString('base64'), rect },
  );
}

const NEAR: [number, number, number, number] = [0.3, 0.82, 0.4, 0.14];
const FAR: [number, number, number, number] = [0.3, 0.4, 0.4, 0.08];

test('lens blur: depth on device, click to focus, blur grows with distance, export', async ({ page }) => {
  test.setTimeout(1_500_000);
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'ground.jpg', mimeType: 'image/jpeg', buffer: await groundScene(page) });
  await waitForRender(page);
  await page.locator('#tab-detail').click();
  const canvas = page.locator('canvas.editor-canvas');
  const before = await canvas.screenshot();

  await expect(page.getByRole('button', { name: 'Pick focus' })).toBeDisabled();
  await setRange(page, 'Amount', 60);
  const status = page.getByTestId('depth-status');
  await expect(status).toContainText(/Estimating depth|Downloading depth model/);
  await expect(status).toContainText('Depth estimated on this device', { timeout: 1_200_000 });

  // Focus on the near ground (bottom of the frame).
  await page.getByRole('button', { name: 'Pick focus' }).click();
  const box = (await canvas.boundingBox())!;
  const overlay = page.getByTestId('focus-overlay');
  const ov = (await overlay.boundingBox())!;
  await overlay.click({ position: { x: box.x - ov.x + box.width * 0.5, y: box.y - ov.y + box.height * 0.9 }, force: true });
  await expect(page.getByRole('slider', { name: 'Focus distance', exact: true })).not.toHaveValue('0');
  const focusNear = Number(await page.getByRole('slider', { name: 'Focus distance', exact: true }).inputValue());
  expect(focusNear).toBeLessThan(40);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(3000);
  const after = await canvas.screenshot();

  // The near ground keeps its detail; the far ground loses most of it.
  const nearRatio = (await detail(page, after, NEAR)) / (await detail(page, before, NEAR));
  const farRatio = (await detail(page, after, FAR)) / (await detail(page, before, FAR));
  expect(nearRatio).toBeGreaterThan(0.75);
  expect(farRatio).toBeLessThan(0.6);
  expect(farRatio).toBeLessThan(nearRatio - 0.2);

  // Undo-able and stored with the edit (not baked into the photo).
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('slider', { name: 'Focus distance', exact: true })).not.toHaveValue(String(focusNear));
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('slider', { name: 'Focus distance', exact: true })).toHaveValue(String(focusNear));

  // Full-resolution export renders the same blur (tiled renderer).
  await page.getByTestId('export-open').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-start').click();
  const file = readFileSync((await (await dl).path())!);
  const exNear = await detail(page, file, NEAR);
  const exFar = await detail(page, file, FAR);
  const src = await groundScene(page);
  expect(exFar / (await detail(page, src, FAR))).toBeLessThan(0.6);
  expect(exNear / (await detail(page, src, NEAR))).toBeGreaterThan(0.75);
});
