/**
 * Runs the real MI-GAN graph (when installed with `npm run setup:models`) through
 * the same mask encoding and compositing the app uses, to pin its contract.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// onnxruntime-node (same 1.30 engine, installed with Transformers.js) runs this graph in ~2 s; the
// single-threaded WASM build takes minutes under Node.
import * as ort from 'onnxruntime-node';
import { getModel } from '@/lib/ml/registry';
import type { Removal } from '@/lib/schema/adjustments';
import { buildPatch, compositePatch, nchwToRgba, rasterizeRemoval, removalCrop, rgbaToNchw } from './removal';

const file = join(process.cwd(), 'public', 'models', ...getModel('migan').files[0].path.split('/'));
const installed = existsSync(file);

describe.skipIf(!installed)('MI-GAN contract (installed model)', () => {
  it('fills a painted object from its surroundings and leaves other pixels untouched', async () => {
    const session = await ort.InferenceSession.create(readFileSync(file));
    expect(session.inputNames).toEqual(['image', 'mask']);
    expect(session.outputNames).toEqual(['result']);

    // A blue-to-white sky with a dark square "object" in the middle.
    const W = 320;
    const H = 240;
    const img = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const t = y / H;
        const obj = x >= 150 && x < 170 && y >= 110 && y < 130;
        img[i] = obj ? 20 : 90 + 140 * t;
        img[i + 1] = obj ? 20 : 140 + 90 * t;
        img[i + 2] = obj ? 20 : 210 + 30 * t;
        img[i + 3] = 255;
      }
    const removal: Removal = { id: 'r', visible: true, strokes: [{ size: 0.1, points: [[160 / W, 120 / H]] }] };
    const crop = removalCrop(removal, W, H)!;
    const ras = rasterizeRemoval(removal, W, H, crop);
    const pixels = new Uint8ClampedArray(crop.w * crop.h * 4);
    for (let y = 0; y < crop.h; y++) pixels.set(img.subarray(((crop.y + y) * W + crop.x) * 4, ((crop.y + y) * W + crop.x + crop.w) * 4), y * crop.w * 4);

    const out = await session.run({
      image: new ort.Tensor('uint8', rgbaToNchw(pixels, crop.w, crop.h), [1, 3, crop.h, crop.w]),
      mask: new ort.Tensor('uint8', ras.keep, [1, 1, crop.h, crop.w]),
    });
    const res = out.result;
    expect(res.type).toBe('uint8');
    expect(res.dims).toEqual([1, 3, crop.h, crop.w]);
    const filled = nchwToRgba(res.data as Uint8Array, crop.w, crop.h);
    const dst = pixels.slice();
    compositePatch(dst, buildPatch(crop, filled, ras.alpha));

    // The dark object is gone: its centre now matches the sky around it.
    const c = ((120 - crop.y) * crop.w + (160 - crop.x)) * 4;
    const above = ((95 - crop.y) * crop.w + (160 - crop.x)) * 4;
    expect(dst[c]).toBeGreaterThan(120);
    for (let k = 0; k < 3; k++) expect(Math.abs(dst[c + k] - dst[above + k])).toBeLessThan(35);
    // Pixels with zero weight are byte-identical.
    for (let i = 0; i < ras.alpha.length; i++) if (ras.alpha[i] === 0) expect(dst[i * 4]).toBe(pixels[i * 4]);
    await session.release();
  }, 60_000);
});
