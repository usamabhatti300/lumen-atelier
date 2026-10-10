/**
 * AI upscaling for export: Real-ESRGAN general x4v3 (BSD-3-Clause) in the ML
 * worker, one tile per model run (see src/lib/ml/upscale.ts for the tiling).
 * Tile buffers are transferred, not copied, so the main thread only packs
 * and blends pixels and the UI stays responsive.
 */
import { loadModel, runModel } from '@/lib/ml/client';
import { getModel, modelBytes } from '@/lib/ml/registry';
import { ESRGAN_SCALE, upscaleImage, type RgbaImage, type UpscaleFactor } from '@/lib/ml/upscale';

export const UPSCALE_MODEL_ID = 'realesrgan-x4v3';

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

/** Downloads (verified, with byte progress) and starts the model; a no-op once loaded. */
export async function loadUpscaler(signal?: AbortSignal, onProgress?: (fraction: number, stage: string) => void) {
  const total = modelBytes(getModel(UPSCALE_MODEL_ID));
  onProgress?.(0, 'Loading AI upscaler');
  return loadModel(UPSCALE_MODEL_ID, {
    signal,
    onProgress: (loaded, t) => onProgress?.(loaded / (t || total), `Loading AI upscaler (${mb(loaded)} of ${mb(t || total)})`),
  });
}

/** Upscales an RGBA image 2× or 4×, reporting real per-tile progress. Throws AbortError when `signal` fires. */
export async function aiUpscale(
  image: RgbaImage,
  factor: UpscaleFactor,
  signal?: AbortSignal,
  onTile?: (done: number, total: number) => void,
): Promise<RgbaImage> {
  await loadUpscaler(signal);
  return upscaleImage(image, {
    factor,
    signal,
    onTile,
    runTile: async (input, w, h) => {
      const out = await runModel(UPSCALE_MODEL_ID, { input: { type: 'float32', dims: [1, 3, h, w], data: input } }, { signal });
      const t = out.output;
      if (!t || t.type !== 'float32' || t.dims.join() !== [1, 3, h * ESRGAN_SCALE, w * ESRGAN_SCALE].join()) {
        throw new Error('The AI upscaler returned an unexpected result. Try exporting without AI upscale.');
      }
      return t.data as Float32Array;
    },
  });
}
