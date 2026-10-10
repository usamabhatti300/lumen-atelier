/**
 * Runs MI-GAN (Picsart AI Research, MIT code and weights) on the area around
 * each removal and composites the result into a 2D canvas.
 *
 * Verified ONNX contract of migan_pipeline_v2.onnx (onnxruntime 1.30, 2026-10-10):
 *   inputs   image  uint8 [B,3,H,W]  RGB, planar (NCHW), 0–255, any H×W
 *            mask   uint8 [B,1,H,W]  255 = keep, 0 = fill. Intermediate values are
 *                                    treated as partly known, so the mask is strictly binary.
 *   output   result uint8 [B,3,H,W]  same size as the input; known pixels come back
 *                                    within a few levels, the hole is filled. The
 *                                    pipeline crops around the hole and runs the GAN at
 *                                    512 px internally.
 *
 * Inference runs in the shared ML worker. Calls are serialized because one
 * ONNX session must not run two inferences at once.
 */
import { loadModel, runModel } from '@/lib/ml/client';
import { createCanvas } from '@/lib/image/decode';
import type { Removal } from '@/lib/schema/adjustments';
import { getPatch, putPatch } from './cache';
import {
  activeRemovals,
  buildPatch,
  compositePatch,
  inferenceScale,
  nchwToRgba,
  rasterizeRemoval,
  removalChainKeys,
  removalCrop,
  rgbaToNchw,
  type PxRect,
  type RemovalPatch,
} from './removal';

export const MIGAN_MODEL_ID = 'migan';

export type RemovalProgress =
  | { phase: 'download'; loaded: number; total: number }
  | { phase: 'inpaint'; index: number; count: number };

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function resample(data: Uint8ClampedArray, w: number, h: number, tw: number, th: number): Uint8ClampedArray {
  const src = createCanvas(w, h);
  (src.getContext('2d') as Ctx2D).putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  const dst = createCanvas(tw, th);
  const ctx = dst.getContext('2d', { willReadFrequently: true }) as Ctx2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as CanvasImageSource, 0, 0, tw, th);
  return ctx.getImageData(0, 0, tw, th).data;
}

/** Fills one removal. `pixels` is the RGBA content of `crop` in a W×H working image. */
export async function inpaintCrop(
  pixels: Uint8ClampedArray,
  removal: Removal,
  W: number,
  H: number,
  crop: PxRect,
  signal?: AbortSignal,
): Promise<RemovalPatch> {
  const scale = inferenceScale(crop);
  // When downscaling, grow the model's hole a little so it covers the full-res fill area.
  const mask = rasterizeRemoval(removal, W, H, crop, scale, scale < 1 ? 1.5 / scale : 0);
  const gw = mask.width;
  const gh = mask.height;
  const input = scale < 1 ? resample(pixels, crop.w, crop.h, gw, gh) : pixels;
  const out = await serialized(() =>
    runModel(
      MIGAN_MODEL_ID,
      {
        image: { type: 'uint8', dims: [1, 3, gh, gw], data: rgbaToNchw(input, gw, gh) },
        mask: { type: 'uint8', dims: [1, 1, gh, gw], data: mask.keep },
      },
      { signal },
    ),
  );
  const res = out.result;
  if (!res || res.type !== 'uint8' || res.dims.join() !== `1,3,${gh},${gw}`) {
    throw new Error('The removal model returned an unexpected result.');
  }
  let filled = nchwToRgba(res.data as Uint8Array, gw, gh);
  let alpha = mask.alpha;
  if (scale < 1) {
    filled = resample(filled, gw, gh, crop.w, crop.h);
    alpha = rasterizeRemoval(removal, W, H, crop, 1).alpha;
  }
  return buildPatch(crop, filled, alpha);
}

export interface ApplyRemovalsOptions {
  /** Cache scope, e.g. the photo id plus "preview" or "export". */
  scope: string;
  /** Keep filled patches on this device across reloads (preview only). */
  persist: boolean;
  signal?: AbortSignal;
  onProgress?: (p: RemovalProgress) => void;
  /** Called after each removal; return true to stop early (throws RemovalRestart). */
  stale?: () => boolean;
}

export class RemovalRestart extends Error {
  override name = 'RemovalRestart';
}

/**
 * Applies the active removals in order to a W×H canvas context (the original
 * pixels of the working image). Each removal sees the result of the previous
 * ones. Untouched pixels are not rewritten.
 */
export async function applyRemovals(ctx: Ctx2D, W: number, H: number, removals: readonly Removal[] | undefined, opts: ApplyRemovalsOptions) {
  const list = activeRemovals(removals);
  const keys = removalChainKeys(list, W, H);
  let modelReady = false;
  for (let i = 0; i < list.length; i++) {
    opts.signal?.throwIfAborted();
    let patch = await getPatch(opts.scope, keys[i], opts.persist);
    if (!patch) {
      const crop = removalCrop(list[i], W, H);
      if (!crop) continue;
      if (!modelReady) {
        await loadModel(MIGAN_MODEL_ID, {
          signal: opts.signal,
          onProgress: (loaded, total) => opts.onProgress?.({ phase: 'download', loaded, total }),
        });
        modelReady = true;
      }
      opts.onProgress?.({ phase: 'inpaint', index: i, count: list.length });
      const pixels = ctx.getImageData(crop.x, crop.y, crop.w, crop.h).data;
      patch = await inpaintCrop(pixels, list[i], W, H, crop, opts.signal);
      opts.signal?.throwIfAborted();
      void putPatch(opts.scope, keys[i], patch, opts.persist);
    }
    const dst = ctx.getImageData(patch.x, patch.y, patch.w, patch.h);
    compositePatch(dst.data, patch);
    ctx.putImageData(dst, patch.x, patch.y);
    if (opts.stale?.()) throw new RemovalRestart();
  }
}

/** Full-resolution source with the removals applied, for export. Null when there are none. */
export async function applyRemovalsToBitmap(
  source: ImageBitmap,
  removals: readonly Removal[] | undefined,
  opts: Omit<ApplyRemovalsOptions, 'persist'>,
): Promise<ImageBitmap | null> {
  if (activeRemovals(removals).length === 0) return null;
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) throw new Error('This browser could not allocate an image of this size for object removal.');
  ctx.drawImage(source, 0, 0);
  try {
    await applyRemovals(ctx, source.width, source.height, removals, { ...opts, persist: false });
    return await createImageBitmap(canvas, { premultiplyAlpha: 'none' });
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
