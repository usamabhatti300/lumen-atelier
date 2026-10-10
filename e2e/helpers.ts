import type { Page } from '@playwright/test';

export type FixtureKind = 'target' | 'reference' | 'transparent';

/**
 * Generates test images inside the browser (canvas -> JPEG/PNG) so the suite
 * needs no binary fixtures. Returns the encoded bytes.
 */
export async function makeImage(page: Page, kind: FixtureKind, width = 900, height = 600): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ kind, width, height }) => {
      const c = new OffscreenCanvas(width, height);
      const ctx = c.getContext('2d')!;
      if (kind === 'reference') {
        // Teal shadows, warm highlights, lifted blacks, muted colour.
        const g = ctx.createLinearGradient(0, 0, width, 0);
        g.addColorStop(0, '#16302f');
        g.addColorStop(0.5, '#6d7470');
        g.addColorStop(1, '#e9cfa8');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#b48b6c';
        ctx.beginPath();
        ctx.arc(width * 0.3, height * 0.45, height * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4c5b45';
        ctx.fillRect(0, height * 0.78, width, height * 0.22);
      } else {
        // Neutral daylight scene: grey ramp, blue sky, green field, skin patch, primaries.
        const sky = ctx.createLinearGradient(0, 0, 0, height * 0.5);
        sky.addColorStop(0, '#5b86c5');
        sky.addColorStop(1, '#cfdcea');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height * 0.5);
        ctx.fillStyle = '#4f8a3a';
        ctx.fillRect(0, height * 0.5, width, height * 0.25);
        const ramp = ctx.createLinearGradient(0, 0, width, 0);
        ramp.addColorStop(0, '#000');
        ramp.addColorStop(1, '#fff');
        ctx.fillStyle = ramp;
        ctx.fillRect(0, height * 0.75, width, height * 0.25);
        ctx.fillStyle = '#d29c7c';
        ctx.fillRect(width * 0.1, height * 0.2, width * 0.15, height * 0.25);
        ['#c0392b', '#f1c40f', '#2980b9'].forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.fillRect(width * (0.55 + i * 0.12), height * 0.12, width * 0.1, height * 0.2);
        });
        if (kind === 'transparent') ctx.clearRect(0, 0, width * 0.2, height * 0.2);
      }
      const blob = await c.convertToBlob({ type: kind === 'transparent' ? 'image/png' : 'image/jpeg', quality: 0.92 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { kind, width, height },
  );
  return Buffer.from(b64, 'base64');
}

/** Inserts an EXIF APP1 segment with the given orientation into a JPEG. */
export function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // next IFD
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = payload.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** Decodes image bytes in the browser and returns size and mean RGB. */
export async function imageStats(page: Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr]), { imageOrientation: 'from-image' });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    return { width: bmp.width, height: bmp.height, mean: [r / n, g / n, b / n] };
  }, bytes.toString('base64'));
}

export async function sha256(page: Page, bytes: Buffer): Promise<string> {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const h = await crypto.subtle.digest('SHA-256', arr);
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }, bytes.toString('base64'));
}

/** Waits until the editor has rendered at least one frame. */
export async function waitForRender(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas.editor-canvas') as HTMLCanvasElement | null;
    return !!c && c.isConnected && !(c.width === 300 && c.height === 150);
  }, null, { timeout: 120_000 });
}

/** Sets a range input by its accessible name (fires React's input event). */
export async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).first().evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
