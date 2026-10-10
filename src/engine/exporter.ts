/**
 * Full-resolution export.
 *
 * The output is rendered in tiles (default 2048 px) so large photos stay
 * within GPU texture limits and memory. Each tile renders a padded source
 * region (padding covers the largest blur radius and healing offsets), then
 * only the tile's interior is written to the final canvas, so tiles join
 * seamlessly. Progress is reported per finished tile; cancellation is
 * checked between tiles.
 *
 * The output size is never reduced silently: the caller chooses the scale,
 * and if the browser cannot hold the full-size canvas the export fails with
 * an explanation instead of shrinking the image.
 *
 * Optional AI upscale (2×/4×, Real-ESRGAN in the ML worker) runs after the
 * edit is rendered: the model is loaded first (so a missing model fails
 * fast), then the rendered image is enlarged tile by tile.
 */
import { GLRenderer } from '@/lib/engine/gl/renderer';
import { cpuRender } from '@/lib/engine/cpu/cpuRender';
import { deriveDevelopParams, BLUR_RADII } from '@/lib/engine/params';
import { apply, outputSize, outputToSourceMatrix, type Size } from '@/lib/engine/geometry';
import { canvasToBlob, createCanvas } from '@/lib/image/decode';
import { getLut } from '@/lib/storage/db';
import type { EditState } from '@/lib/schema/adjustments';
import { effectiveAdjustments } from '@/state/editorStore';
import { upscaleSizeProblem, upscaleTileCount, type UpscaleFactor } from '@/lib/ml/upscale';
import { aiUpscale, loadUpscaler } from './aiUpscale';
import { activeRemovals } from '@/lib/removal/removal';
import { applyRemovalsToBitmap } from '@/lib/removal/inpaint';

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ExportOptions {
  bitmap: ImageBitmap;
  edit: EditState;
  format: ExportFormat;
  /** 1..100, JPEG/WebP only. */
  quality: number;
  /** Output scale relative to full resolution (0 < scale <= 1). */
  scale: number;
  /** Enlarge the rendered result with the on-device AI upscaler. */
  aiUpscale?: UpscaleFactor;
  layerMasks: Map<string, TexImageSource>;
  portraitMask: TexImageSource | null;
  signal?: AbortSignal;
  onProgress?: (fraction: number, stage: string) => void;
  tileSize?: number;
  forceCpu?: boolean;
  /** Cache scope for filled removal patches (the photo id); without it nothing is reused. */
  removalScope?: string;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled.');
  }
}

/** Largest canvas side we rely on across browsers. */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 268_000_000;

/** Size of the rendered edit before any AI upscale. */
export function plannedRenderSize(source: Size, edit: EditState, scale: number): Size {
  const full = outputSize(source, edit.geometry);
  return { width: Math.max(1, Math.round(full.width * scale)), height: Math.max(1, Math.round(full.height * scale)) };
}

/** Size of the exported file. */
export function plannedExportSize(source: Size, edit: EditState, scale: number, upscale: UpscaleFactor | 1 = 1): Size {
  const r = plannedRenderSize(source, edit, scale);
  return { width: r.width * upscale, height: r.height * upscale };
}

/** Why this export cannot run (too large), or null. `render` is the size before AI upscale. */
export function exportPlanProblem(render: Size, upscale: UpscaleFactor | 1 = 1): string | null {
  if (upscale === 1) return exportSizeProblem(render);
  return upscaleSizeProblem(render, upscale) ?? exportSizeProblem({ width: render.width * upscale, height: render.height * upscale });
}

export { upscaleTileCount };

export function exportSizeProblem(size: Size): string | null {
  if (size.width > MAX_CANVAS_SIDE || size.height > MAX_CANVAS_SIDE || size.width * size.height > MAX_CANVAS_AREA) {
    return `The output (${size.width} × ${size.height}) exceeds what this browser can encode in one image. Choose a smaller output size.`;
  }
  return null;
}

export async function exportEdited(opts: ExportOptions): Promise<Blob> {
  const { bitmap, edit } = opts;
  const check = () => {
    if (opts.signal?.aborted) throw new ExportCancelled();
  };
  let source = bitmap;
  let fullSize: Size = { width: bitmap.width, height: bitmap.height };
  let scaled: ImageBitmap | null = null;
  if (opts.scale < 0.999) {
    opts.onProgress?.(0, 'Resampling');
    scaled = await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * opts.scale)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * opts.scale)),
      resizeQuality: 'high',
      premultiplyAlpha: 'none',
    });
    source = scaled;
    fullSize = { width: scaled.width, height: scaled.height };
  }
  const out = outputSize(fullSize, edit.geometry);
  const problem = exportPlanProblem(out, opts.aiUpscale ?? 1);
  if (problem) throw new Error(problem);

  // With AI upscale: model load 0–5 %, render 5–15 %, upscale tiles 15–95 %.
  const report = opts.onProgress;
  const upscaling = !!opts.aiUpscale;
  if (upscaling) {
    try {
      await loadUpscaler(opts.signal, (f, stage) => report?.(f * 0.05, stage));
    } catch (e) {
      throw cancelOr(e);
    }
    check();
  }
  const renderOpts: ExportOptions = upscaling ? { ...opts, onProgress: (f, stage) => report?.(0.05 + f * 0.1, stage) } : opts;

  // Object removals are applied to the original pixels at output resolution, before any adjustment
  // (reported within the render share of the progress bar when upscaling).
  let removed: ImageBitmap | null = null;
  let tileBase = 0.02;
  if (activeRemovals(edit.removals).length > 0) {
    renderOpts.onProgress?.(0.01, 'Removing objects');
    try {
      removed = await applyRemovalsToBitmap(source, edit.removals, {
        scope: opts.removalScope ? `${opts.removalScope}/export` : `export-${Math.random()}`,
        signal: opts.signal,
        onProgress: (p) =>
          p.phase === 'download'
            ? renderOpts.onProgress?.(0.01, `Loading the removal model (${Math.round((p.loaded / Math.max(1, p.total)) * 100)}%)`)
            : renderOpts.onProgress?.(0.02 + (p.index / p.count) * 0.3, `Removing object ${p.index + 1} of ${p.count}`),
      });
    } catch (e) {
      scaled?.close();
      if (opts.signal?.aborted) throw new ExportCancelled();
      throw e;
    }
    if (removed) {
      source = removed;
      tileBase = 0.32;
    }
  }

  const final = createCanvas(out.width, out.height);
  const fctx = final.getContext('2d') as CanvasRenderingContext2D | null;
  if (!fctx) throw new Error('This browser could not allocate an image of this size. Choose a smaller output size.');
  if (opts.format === 'image/jpeg') {
    // JPEG has no transparency: flatten onto white.
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, out.width, out.height);
  }

  try {
    let renderer: GLRenderer | null = null;
    if (!opts.forceCpu) {
      try {
        renderer = new GLRenderer(createCanvas(4, 4) as HTMLCanvasElement);
      } catch {
        renderer = null;
      }
    }
    if (renderer) {
      await renderTiles(renderer, source, fullSize, out, edit, renderOpts, fctx, check, tileBase);
      renderer.dispose();
    } else {
      renderOpts.onProgress?.(0.05, 'Rendering on CPU');
      const tmp = createCanvas(source.width, source.height);
      const tctx = tmp.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      tctx.drawImage(source, 0, 0);
      const data = tctx.getImageData(0, 0, source.width, source.height);
      const masks: Record<string, { width: number; height: number; data: Uint8ClampedArray }> = {};
      for (const [id, m] of opts.layerMasks) {
        const c = m as HTMLCanvasElement | OffscreenCanvas;
        const ctx = c.getContext('2d') as CanvasRenderingContext2D;
        const img = ctx.getImageData(0, 0, c.width, c.height);
        masks[id] = { width: img.width, height: img.height, data: img.data };
      }
      check();
      const res = cpuRender({ source: data, fullSize, edit, out, layerMasks: masks });
      fctx.putImageData(new ImageData(new Uint8ClampedArray(res.data), res.width, res.height), 0, 0);
    }
    check();
    let encodeFrom: OffscreenCanvas | HTMLCanvasElement = final;
    if (opts.aiUpscale) {
      const factor = opts.aiUpscale;
      const rendered = fctx.getImageData(0, 0, out.width, out.height);
      final.width = 1;
      final.height = 1;
      report?.(0.15, `Upscaling ${factor}× with AI`);
      let big;
      try {
        big = await aiUpscale(rendered, factor, opts.signal, (done, total) =>
          report?.(0.15 + (done / total) * 0.8, `Upscaling ${factor}× with AI: tile ${done} of ${total}`),
        );
      } catch (e) {
        throw cancelOr(e);
      }
      check();
      encodeFrom = createCanvas(big.width, big.height);
      const bctx = encodeFrom.getContext('2d') as CanvasRenderingContext2D | null;
      if (!bctx) throw new Error('This browser could not allocate an image of this size. Choose a smaller AI upscale.');
      bctx.putImageData(new ImageData(big.data as Uint8ClampedArray<ArrayBuffer>, big.width, big.height), 0, 0);
    }
    report?.(0.97, 'Encoding');
    const q = opts.format === 'image/png' ? undefined : Math.min(1, Math.max(0.01, opts.quality / 100));
    const blob = await canvasToBlob(encodeFrom, opts.format, q);
    if (encodeFrom !== final) {
      encodeFrom.width = 1;
      encodeFrom.height = 1;
    }
    if (blob.type !== opts.format) {
      throw new Error(`This browser cannot encode ${opts.format.replace('image/', '').toUpperCase()}. Choose another format.`);
    }
    opts.onProgress?.(1, 'Done');
    return blob;
  } finally {
    scaled?.close();
    removed?.close();
    if ('width' in final) {
      final.width = 1;
      final.height = 1;
    }
  }
}

async function renderTiles(
  renderer: GLRenderer,
  source: ImageBitmap,
  fullSize: Size,
  out: Size,
  edit: EditState,
  opts: ExportOptions,
  fctx: CanvasRenderingContext2D,
  check: () => void,
  tileBase = 0.02,
) {
  const params = deriveDevelopParams(effectiveAdjustments(edit));
  for (const [id, m] of opts.layerMasks) renderer.setLayerMask(id, m);
  renderer.setPortraitMask(opts.portraitMask);
  if (edit.lut) {
    const lut = await getLut(edit.lut.id);
    if (lut) renderer.setLut(lut.data, lut.size);
  }
  const tile = Math.min(opts.tileSize ?? 2048, Math.floor(renderer.maxTextureSize / 2));
  const longEdge = Math.max(fullSize.width, fullSize.height);
  const maxLayerBlur = Math.max(0, ...edit.layers.map((l) => l.adjustments.blur / 100));
  const maxSpotReach = Math.max(
    0,
    ...edit.retouch.spots.map((s) => (Math.hypot(s.dx * fullSize.width, s.dy * fullSize.height) / longEdge + s.r * 1.3)),
  );
  // Gaussian support ~3 sigma; layer blur, clarity and skin smoothing set the largest radius.
  const pad = Math.ceil(
    Math.max(BLUR_RADII.large * 3, BLUR_RADII.layerMax * maxLayerBlur * 3, BLUR_RADII.medium * 1.6 * 3, maxSpotReach) * longEdge,
  ) + 8;

  const mat = outputToSourceMatrix(fullSize, edit.geometry);
  const cols = Math.ceil(out.width / tile);
  const rows = Math.ceil(out.height / tile);
  const total = cols * rows;
  let done = 0;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      check();
      const ox = tx * tile;
      const oy = ty * tile;
      const tw = Math.min(tile, out.width - ox);
      const th = Math.min(tile, out.height - oy);
      const outRegion = { x: ox / out.width, y: oy / out.height, w: tw / out.width, h: th / out.height };
      // Source bounding box of the tile's corners (handles rotation), padded.
      const corners = [
        apply(mat, outRegion.x, outRegion.y),
        apply(mat, outRegion.x + outRegion.w, outRegion.y),
        apply(mat, outRegion.x, outRegion.y + outRegion.h),
        apply(mat, outRegion.x + outRegion.w, outRegion.y + outRegion.h),
      ];
      const sx0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])) * fullSize.width) - pad);
      const sy0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])) * fullSize.height) - pad);
      const sx1 = Math.min(fullSize.width, Math.ceil(Math.max(...corners.map((c) => c[0])) * fullSize.width) + pad);
      const sy1 = Math.min(fullSize.height, Math.ceil(Math.max(...corners.map((c) => c[1])) * fullSize.height) + pad);
      const sw = Math.max(1, sx1 - sx0);
      const sh = Math.max(1, sy1 - sy0);
      const region = createImageBitmap(source, sx0, sy0, sw, sh, { premultiplyAlpha: 'none' });
      const bmp = await region;
      try {
        renderer.setSource(bmp, { width: sw, height: sh }, {
          x: sx0 / fullSize.width,
          y: sy0 / fullSize.height,
          w: sw / fullSize.width,
          h: sh / fullSize.height,
        });
        renderer.render({ edit, params, fullSize, out: { width: tw, height: th }, outRegion, target: 'export' });
        const img = renderer.readTarget('export');
        if (opts.format === 'image/jpeg') {
          // putImageData ignores the white backdrop; composite instead.
          const t = createCanvas(tw, th);
          (t.getContext('2d') as CanvasRenderingContext2D).putImageData(img, 0, 0);
          fctx.drawImage(t as CanvasImageSource, ox, oy);
        } else {
          fctx.putImageData(img, ox, oy);
        }
      } finally {
        bmp.close();
      }
      done++;
      opts.onProgress?.(tileBase + (done / total) * (0.95 - tileBase), `Rendering tile ${done} of ${total}`);
      // Yield so the UI can update and the user can cancel.
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

/** Cancellation from the ML worker arrives as an AbortError; report it like any other cancelled export. */
function cancelOr(e: unknown): unknown {
  return e instanceof Error && e.name === 'AbortError' ? new ExportCancelled() : e;
}

export function exportFileName(name: string, format: ExportFormat): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\w\- ]+/g, '_').trim() || 'photo';
  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp';
  return `${base}-edited.${ext}`;
}
