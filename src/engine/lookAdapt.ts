/**
 * Adaptive looks, engine side: a small, cached pixel sample of the open photo's original, and the
 * adaptation for a library look (lib/analysis/lookAdapt.ts) when the setting is on.
 */
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { createCanvas } from '@/lib/image/decode';
import { linearPixels } from '@/lib/analysis/features';
import { adaptLookValues, LOOK_ADAPT, type LookAdaptation } from '@/lib/analysis/lookAdapt';
import type { PartialAdjustments } from '@/lib/schema/adjustments';
import { engine } from './controller';

let cached: { key: string; lin: Float32Array } | null = null;

function photoSample(): Float32Array | null {
  const id = engine.getActivePhotoId();
  const bmp = engine.getPreviewBitmap();
  if (!id || !bmp) return null;
  const key = `${id}:${bmp.width}x${bmp.height}`;
  if (cached?.key === key) return cached.lin;
  const scale = Math.min(1, Math.sqrt((LOOK_ADAPT.samplePixels * 1.2) / (bmp.width * bmp.height)));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const lin = linearPixels({ width: w, height: h, data: img.data }, LOOK_ADAPT.samplePixels);
  cached = { key, lin };
  return lin;
}

/** The adaptation for applying `values` to the open photo, or null (setting off, no photo yet). */
export function adaptationForLook(values: PartialAdjustments): LookAdaptation | null {
  if (!useSettings.getState().adaptiveLooks) return null;
  const lin = photoSample();
  if (!lin) return null;
  const e = useEditor.getState().edit;
  const baseline = e.appliedPreset ? e.appliedPreset.baseline : e.adjustments;
  try {
    return adaptLookValues(lin, baseline, values);
  } catch {
    return null;
  }
}
