/**
 * Batch operations across photos in a project: apply settings/presets and
 * export. Each photo is processed in turn; progress is reported per photo and
 * cancellation is honoured between photos (and between export tiles).
 */
import { useEditor } from '@/state/editorStore';
import { decodeImageBlob, makeThumbnail } from '@/lib/image/decode';
import { getOriginal, getPhoto, updatePhotoEdit } from '@/lib/storage/db';
import { rasterizeLayer } from '@/lib/masks/rasterize';
import type { EditState } from '@/lib/schema/adjustments';
import { analyzePortraitBitmap } from '@/features/portrait/portraitState';
import { engine } from './controller';
import { ExportCancelled, exportEdited, exportFileName, type ExportFormat } from './exporter';

export async function editFor(id: string): Promise<EditState | null> {
  const s = useEditor.getState();
  if (id === s.activePhotoId) return s.edit;
  if (s.stash[id]) return s.stash[id].edit;
  return (await getPhoto(id))?.edit ?? null;
}

function needsPortrait(edit: EditState) {
  const r = edit.retouch;
  return (
    edit.layers.some((l) => l.components.some((c) => c.type === 'segment')) ||
    r.skinSmoothing > 0 || r.eyeEnhance > 0 || r.teethWhitening > 0 || r.faceLight > 0 || r.underEye > 0
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
  opts: { format: ExportFormat; quality: number; scale: number },
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
    const masks = new Map<string, TexImageSource>();
    for (const layer of edit.layers) {
      masks.set(layer.id, rasterizeLayer(layer, full, portrait?.segmentation ?? null, 4096).canvas as TexImageSource);
    }
    const blob = await exportEdited({
      bitmap,
      edit,
      format: opts.format,
      quality: opts.quality,
      scale: opts.scale,
      layerMasks: masks,
      portraitMask: (portrait?.mask as TexImageSource | null) ?? null,
      signal,
      onProgress,
    });
    return { name: exportFileName(name, opts.format), blob };
  } finally {
    if (owned) bitmap.close();
  }
}

export async function exportMany(
  ids: string[],
  opts: { format: ExportFormat; quality: number; scale: number },
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
