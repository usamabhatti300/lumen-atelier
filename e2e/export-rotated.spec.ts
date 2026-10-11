import { expect, test } from '@playwright/test';
import { waitForRender, withExifOrientation } from './helpers.ts';

/**
 * Regression: a camera JPEG stored sideways with an EXIF rotation, and larger than one export tile
 * (2048 px), exported as scrambled tiles. Chrome crops a rotated ImageBitmap in its stored pixel
 * order, so each tile took the wrong region. Checks the four quadrants of the exported file.
 */
test('a large EXIF-rotated photo exports upright and unscrambled', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  // Stored 2600x1400 quadrants (red, green / blue, yellow); EXIF 6 rotates 90° clockwise -> 1400x2600.
  const b64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(2600, 1400);
    const g = c.getContext('2d')!;
    const quads: [string, number, number][] = [
      ['#e01010', 0, 0],
      ['#10c010', 1300, 0],
      ['#1010e0', 0, 700],
      ['#e0e010', 1300, 700],
    ];
    for (const [col, x, y] of quads) {
      g.fillStyle = col;
      g.fillRect(x, y, 1300, 700);
    }
    const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const jpeg = withExifOrientation(Buffer.from(b64, 'base64'), 6);
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'rotated-big.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await waitForRender(page);
  await page.getByTestId('export-open').click();
  await expect(page.getByText('1400 × 2600px')).toBeVisible();
  const dl = page.waitForEvent('download', { timeout: 480_000 });
  await page.getByTestId('export-start').click({ timeout: 180_000 });
  const file = await (await dl).createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of file) chunks.push(c as Buffer);

  const quadrants = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr]));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const at = (fx: number, fy: number) => {
      const [r, gg, b] = g.getImageData(Math.round(fx * bmp.width), Math.round(fy * bmp.height), 1, 1).data;
      return r > 150 && gg > 150 ? 'yellow' : r > 150 ? 'red' : gg > 150 ? 'green' : b > 150 ? 'blue' : `?${r},${gg},${b}`;
    };
    // Sample each quadrant near its centre, and both sides of the 2048 px tile boundary.
    return {
      size: `${bmp.width}x${bmp.height}`,
      topLeft: at(0.25, 0.25),
      topRight: at(0.75, 0.25),
      bottomLeft: at(0.25, 0.9),
      bottomRight: at(0.75, 0.9),
      aboveTileEdge: at(0.25, 2040 / 2600),
      belowTileEdge: at(0.25, 2056 / 2600),
    };
  }, Buffer.concat(chunks).toString('base64'));

  // 90° clockwise: stored bottom-left -> top-left, top-left -> top-right, bottom-right -> bottom-left.
  expect(quadrants).toEqual({
    size: '1400x2600',
    topLeft: 'blue',
    topRight: 'red',
    bottomLeft: 'yellow',
    bottomRight: 'green',
    aboveTileEdge: 'yellow',
    belowTileEdge: 'yellow',
  });
});
