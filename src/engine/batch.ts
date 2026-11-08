/**
 * Batch operations across photos in a project: apply settings/presets and
 * export. Each photo is processed in turn; progress is reported per photo and
 * cancellation is honoured between photos (and between export tiles).
 */
import { useEditor } from '@/state/editorStore';
import { bitmapToImageData, decodeImageBlob, makeThumbnail } from '@/lib/image/decode';
import { getOriginal, getPhoto, updatePhotoEdit } from '@/lib/storage/db';
import { rasterizeLayer } from '@/lib/masks/rasterize';
import type { EditState } from '@/lib/schema/adjustments';
import { analyzePortraitBitmap } from '@/features/portrait/portraitState';
import { depthForPhoto } from '@/features/depth/depthState';
import { engine } from './controller';
import { objectComponentsOf, objectMasks } from './objectMasks';
import { OBJECT_MASK_SIDE } from '@/lib/masks/objectMask';
import { ExportCancelled, exportEdited, exportFileName, plannedRenderSize, type ExportFormat } from './exporter';
import type { UpscaleFactor } from '@/lib/ml/upscale';
import { canvasToBlob, createCanvas } from '@/lib/image/decode';
import { defaultStampDate, isoDate, loadFinishFonts, type StampOptions } from '@/lib/finish/stamp';
import { contactSheetLayout, drawContactSheet, MAX_SHEET_FRAMES, sheetFrameLongSide, type SheetFrame, type SheetRatio } from '@/lib/finish/contactSheet';

export interface ExportSettings {
  format: ExportFormat;
  quality: number;
  scale: number;
  /** On-device AI upscale after rendering (works in batch too: each photo is upscaled in turn). */
  aiUpscale?: UpscaleFactor;
  /** Finish step: the date stamp (a null date means each photo's own date). */
  stamp?: StampOptions;
}

/** The date a photo's stamp shows: the chosen date, else its capture date, else today. */
export function stampDateFor(id: string, chosen: string | null): string {
  if (chosen) return chosen;
  const meta = useEditor.getState().photos.find((p) => p.id === id);
  return defaultStampDate(meta?.exif?.dateTime);
}

export async function editFor(id: string): Promise<EditState | null> {
  const s = useEditor.getState();
  if (id === s.activePhotoId) return s.edit;
  if (s.stash[id]) return s.stash[id].edit;
  return (await getPhoto(id))?.edit ?? null;
}

const lensBlurOn = (edit: EditState) => (edit.lensBlur?.amount ?? 0) > 0;

function needsPortrait(edit: EditState) {
  const r = edit.retouch;
  return (
    edit.layers.some((l) => l.components.some((c) => c.type === 'segment')) ||
    r.skinSmoothing > 0 || r.eyeEnhance > 0 || r.teethWhitening > 0 || r.faceLight > 0 || r.underEye > 0 ||
    (lensBlurOn(edit) && edit.lensBlur!.protectSubject)
  );
}

export interface BatchProgress {
  index: number;
  total: number;
  name: string;
  fraction: number;
  stage: string;
}

export async function exportPhoto(
  id: string,
  opts: ExportSettings,
  signal?: AbortSignal,
  onProgress?: (fraction: number, stage: string) => void,
): Promise<{ name: string; blob: Blob }> {
  const meta = useEditor.getState().photos.find((p) => p.id === id);
  const name = meta?.name ?? 'photo';
  const edit = await editFor(id);
  if (!edit) throw new Error(`${name}: edit data not found.`);
  const isActive = engine.getActivePhotoId() === id && engine.getFullBitmap();
  let bitmap: ImageBitmap;
  let owned = false;
  if (isActive) bitmap = engine.getFullBitmap()!;
  else {
    onProgress?.(0, 'Decoding original');
    const blob = await getOriginal(id);
    if (!blob) throw new Error(`${name}: original file is missing.`);
    bitmap = (await decodeImageBlob(blob, name)).bitmap;
    owned = true;
  }
  try {
    const full = { width: bitmap.width, height: bitmap.height };
    let portrait = engine.getPortraitData(id) ?? null;
    if (!portrait && needsPortrait(edit)) {
      onProgress?.(0.01, 'Detecting faces and subject');
      const a = await analyzePortraitBitmap(bitmap, full);
      portrait = { mask: a.mask, segmentation: a.segmentation, faces: a.faces };
    }
    const objects = objectComponentsOf(edit.layers);
    if (objects.length) {
      onProgress?.(0.02, 'Preparing selected objects');
      try {
        await objectMasks.ensure(id, objects, () => bitmapToImageData(bitmap, OBJECT_MASK_SIDE), signal);
      } catch (e) {
        if (signal?.aborted) throw new ExportCancelled();
        throw new Error(`${name}: a "Select object" mask could not be computed (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    let depth = null;
    if (lensBlurOn(edit)) {
      if (!engine.getDepthData(id)) onProgress?.(0.01, 'Estimating depth');
      if (await depthForPhoto(id, bitmap, signal)) depth = engine.exportDepthRaster(id, bitmap, edit, portrait?.segmentation ?? null);
    }
    const masks = new Map<string, TexImageSource>();
    const lookup = objectMasks.lookup(id, false);
    for (const layer of edit.layers) {
      masks.set(layer.id, rasterizeLayer(layer, full, portrait?.segmentation ?? null, 4096, lookup).canvas as TexImageSource);
    }
    const blob = await exportEdited({
      bitmap,
      edit,
      format: opts.format,
      quality: opts.quality,
      scale: opts.scale,
      aiUpscale: opts.aiUpscale,
      layerMasks: masks,
      portraitMask: (portrait?.mask as TexImageSource | null) ?? null,
      removalScope: id,
      depth,
      signal,
      onProgress,
      stamp: opts.stamp ? { placement: opts.stamp.placement, date: stampDateFor(id, opts.stamp.date) } : undefined,
    });
    return { name: exportFileName(name, opts.format), blob };
  } finally {
    if (owned) bitmap.close();
  }
}

export async function exportMany(
  ids: string[],
  opts: ExportSettings,
  signal: AbortSignal,
  onProgress: (p: BatchProgress) => void,
  onFile: (file: { name: string; blob: Blob }) => void,
): Promise<{ done: number; errors: string[]; cancelled: boolean }> {
  const errors: string[] = [];
  let done = 0;
  for (let i = 0; i < ids.length; i++) {
    if (signal.aborted) return { done, errors, cancelled: true };
    const name = useEditor.getState().photos.find((p) => p.id === ids[i])?.name ?? 'photo';
    try {
      const file = await exportPhoto(ids[i], opts, signal, (fraction, stage) =>
        onProgress({ index: i, total: ids.length, name, fraction, stage }),
      );
      onFile(file);
      done++;
    } catch (e) {
      if (e instanceof ExportCancelled) return { done, errors, cancelled: true };
      errors.push(e instanceof Error ? e.message : `${name}: export failed.`);
    }
  }
  return { done, errors, cancelled: false };
}

export interface ContactSheetSettings {
  ratio: SheetRatio;
  format: ExportFormat;
  quality: number;
  /** Stamp each frame (null date: each photo's own date). */
  stamp?: StampOptions;
}

/**
 * Renders each photo with its own edit at the size its frame needs, then lays them out as one
 * contact-sheet image. Progress is per photo; a photo that fails is left out and reported.
 */
export async function exportContactSheet(
  ids: string[],
  opts: ContactSheetSettings,
  signal: AbortSignal,
  onProgress: (p: BatchProgress) => void,
): Promise<{ file: { name: string; blob: Blob } | null; errors: string[]; cancelled: boolean }> {
  const list = ids.slice(0, MAX_SHEET_FRAMES);
  const longSide = sheetFrameLongSide(list.length, opts.ratio);
  const frames: SheetFrame[] = [];
  const errors: string[] = [];
  const total = list.length + 1;
  try {
    for (let i = 0; i < list.length; i++) {
      if (signal.aborted) return { file: null, errors, cancelled: true };
      const id = list[i];
      const meta = useEditor.getState().photos.find((p) => p.id === id);
      const name = meta?.name ?? 'photo';
      try {
        const edit = await editFor(id);
        if (!meta || !edit) throw new Error(`${name}: edit data not found.`);
        const out = plannedRenderSize({ width: meta.width, height: meta.height }, edit, 1);
        const scale = Math.min(1, longSide / Math.max(out.width, out.height));
        const { blob } = await exportPhoto(id, { format: 'image/png', quality: 100, scale }, signal, (fraction, stage) =>
          onProgress({ index: i, total, name, fraction, stage }),
        );
        const image = await createImageBitmap(blob);
        frames.push({ image, width: image.width, height: image.height, look: edit.appliedPreset?.name, date: stampDateFor(id, opts.stamp?.date ?? null) });
      } catch (e) {
        if (e instanceof ExportCancelled) return { file: null, errors, cancelled: true };
        errors.push(e instanceof Error ? e.message : `${name}: export failed.`);
      }
    }
    if (!frames.length) return { file: null, errors, cancelled: false };
    onProgress({ index: list.length, total, name: 'Contact sheet', fraction: 0, stage: 'Laying out the contact sheet' });
    await loadFinishFonts();
    const layout = contactSheetLayout(frames.length, opts.ratio, undefined, frames.map((f) => f.width / f.height));
    const canvas = createCanvas(layout.width, layout.height);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('This browser could not allocate the contact sheet.');
    drawContactSheet(ctx, layout, frames, { stamp: opts.stamp?.placement ?? null, today: isoDate() });
    const q = opts.format === 'image/png' ? undefined : Math.min(1, Math.max(0.01, opts.quality / 100));
    const blob = await canvasToBlob(canvas, opts.format, q);
    canvas.width = 1;
    canvas.height = 1;
    onProgress({ index: list.length, total, name: 'Contact sheet', fraction: 1, stage: 'Done' });
    const project = useEditor.getState().projectName || 'lumen';
    return { file: { name: exportFileName(`${project} contact sheet`, opts.format).replace('-edited', ''), blob }, errors, cancelled: false };
  } finally {
    for (const f of frames) (f.image as ImageBitmap).close?.();
  }
}

/** Applies `mutate` to each photo's edit, saves it, and refreshes its thumbnail. */
export async function applyToMany(
  ids: string[],
  mutate: (edit: EditState) => EditState,
  label: string,
  signal: AbortSignal,
  onProgress: (p: BatchProgress) => void,
): Promise<{ done: number; cancelled: boolean; errors: string[] }> {
  const errors: string[] = [];
  let done = 0;
  for (let i = 0; i < ids.length; i++) {
    if (signal.aborted) return { done, cancelled: true, errors };
    const id = ids[i];
    const name = useEditor.getState().photos.find((p) => p.id === id)?.name ?? 'photo';
    onProgress({ index: i, total: ids.length, name, fraction: 0, stage: 'Applying' });
    try {
      const s = useEditor.getState();
      if (id === s.activePhotoId) {
        s.commitEdit(label, mutate);
      } else {
        const current = await editFor(id);
        if (!current) throw new Error(`${name}: edit data not found.`);
        const next = mutate(current);
        useEditor.setState((st) => ({
          stash: { ...st.stash, [id]: { edit: next, history: st.stash[id]?.history ?? { past: [], future: [] } } },
        }));
        onProgress({ index: i, total: ids.length, name, fraction: 0.4, stage: 'Rendering thumbnail' });
        const meta = useEditor.getState().photos.find((p) => p.id === id);
        const scale = meta ? Math.min(1, 480 / Math.max(meta.width, meta.height)) : 0.2;
        const { blob } = await exportPhoto(id, { format: 'image/jpeg', quality: 85, scale }, signal);
        const thumb = await makeThumbnail(await createImageBitmap(blob), 360);
        await updatePhotoEdit(id, next, thumb);
        useEditor.getState().setPhotoThumb(id, URL.createObjectURL(thumb));
      }
      done++;
      onProgress({ index: i, total: ids.length, name, fraction: 1, stage: 'Done' });
    } catch (e) {
      if (e instanceof ExportCancelled) return { done, cancelled: true, errors };
      errors.push(e instanceof Error ? e.message : `${name}: failed.`);
    }
  }
  return { done, cancelled: false, errors };
}
