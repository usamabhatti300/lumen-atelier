/**
 * Runs on-device face landmark detection and person segmentation for the
 * active photo (once per photo per session) and hands the results to the
 * engine as a portrait mask and segmentation maps.
 */
import { create } from 'zustand';
import { engine } from '@/engine/controller';
import { useEditor } from '@/state/editorStore';
import { resizeBitmap } from '@/lib/image/decode';
import { buildPortraitMask } from '@/lib/portrait/faceMask';
import { ModelsMissingError, detectFaces, regionsForFace, segmentPerson } from '@/lib/portrait/mediapipe';
import { maskCanvasSize, type SegmentationMaps } from '@/lib/masks/rasterize';

export type PortraitStatus = 'idle' | 'running' | 'ready' | 'missing-models' | 'error';

interface PortraitState {
  status: Record<string, PortraitStatus>;
  faces: Record<string, number>;
  person: Record<string, boolean>;
  message: Record<string, string>;
}

export const usePortraitStore = create<PortraitState>(() => ({ status: {}, faces: {}, person: {}, message: {} }));

export function usePortrait() {
  const id = useEditor((s) => s.activePhotoId) ?? '';
  const status = usePortraitStore((s) => s.status[id] ?? 'idle');
  const faces = usePortraitStore((s) => s.faces[id] ?? 0);
  const person = usePortraitStore((s) => s.person[id] ?? false);
  const message = usePortraitStore((s) => s.message[id] ?? '');
  return { status, faces, person, message, photoId: id };
}

const running = new Map<string, Promise<void>>();

export function ensurePortraitAnalysis(): Promise<void> {
  const id = engine.getActivePhotoId();
  if (!id) return Promise.resolve();
  const st = usePortraitStore.getState().status[id];
  if (st === 'ready') return Promise.resolve();
  const existing = running.get(id);
  if (existing) return existing;
  const job = run(id).finally(() => running.delete(id));
  running.set(id, job);
  return job;
}

function set(id: string, patch: { status?: PortraitStatus; faces?: number; person?: boolean; message?: string }) {
  usePortraitStore.setState((s) => ({
    status: patch.status ? { ...s.status, [id]: patch.status } : s.status,
    faces: patch.faces !== undefined ? { ...s.faces, [id]: patch.faces } : s.faces,
    person: patch.person !== undefined ? { ...s.person, [id]: patch.person } : s.person,
    message: patch.message !== undefined ? { ...s.message, [id]: patch.message } : s.message,
  }));
}

export interface PortraitAnalysis {
  mask: ImageData | null;
  segmentation: SegmentationMaps | null;
  faces: number;
  personFraction: number;
  segError: string;
}

/** Face landmarks + person segmentation for any image (used by the editor and batch export). */
export async function analyzePortraitBitmap(source: ImageBitmap, full: { width: number; height: number }): Promise<PortraitAnalysis> {
  const input = await resizeBitmap(source, 1280);
  try {
    let segmentation: SegmentationMaps | null = null;
    let segError = '';
    try {
      segmentation = await segmentPerson(input);
    } catch (e) {
      if (e instanceof ModelsMissingError) throw e;
      segError = 'Subject segmentation failed on this device.';
    }
    const faces = await detectFaces(input);
    let personFraction = 0;
    if (segmentation) {
      const m = segmentation.maps.subject;
      let sum = 0;
      for (let i = 0; i < m.length; i++) sum += m[i] > 127 ? 1 : 0;
      personFraction = sum / m.length;
    }
    let mask: ImageData | null = null;
    if (faces.length) {
      const regions = await regionsForFace(faces[0]);
      mask = buildPortraitMask(faces, regions, maskCanvasSize(full, 1280), segmentation);
    }
    return { mask, segmentation, faces: faces.length, personFraction, segError };
  } finally {
    input.close();
  }
}

async function run(id: string) {
  const preview = engine.getPreviewBitmap();
  const full = engine.getFullSize();
  if (!preview || !full) return;
  set(id, { status: 'running', message: '' });
  try {
    const a = await analyzePortraitBitmap(preview, full);
    if (engine.getActivePhotoId() !== id) {
      set(id, { status: 'idle' });
      return;
    }
    engine.setPortraitData(id, { mask: a.mask, segmentation: a.segmentation, faces: a.faces });
    const notes: string[] = [];
    if (!a.faces)
      notes.push('No face was found. Skin, eye and teeth tools need a clearly visible face; profiles and covered faces may not be detected.');
    if (a.faces > 1) notes.push(`${a.faces} faces found. Retouching applies to all of them.`);
    if (a.segmentation && a.personFraction < 0.01) notes.push('No person was detected, so subject and background masks will be empty.');
    if (a.segError) notes.push(a.segError);
    set(id, { status: 'ready', faces: a.faces, person: a.personFraction >= 0.01, message: notes.join(' ') });
  } catch (e) {
    if (e instanceof ModelsMissingError) {
      set(id, { status: 'missing-models', message: e.message });
    } else {
      console.error('[portrait]', e);
      set(id, { status: 'error', message: 'Face and subject detection failed to run in this browser.' });
    }
  }
}
