/** "Select object" tool actions (no components): activation and click handling. */
import { create } from 'zustand';
import { engine } from '@/engine/controller';
import { objectMasks } from '@/engine/objectMasks';
import { applyPoint, newObjectComponent, pointActionFor } from '@/lib/masks/objectMask';
import type { ObjectComponent } from '@/lib/schema/adjustments';
import { newId } from '@/lib/storage/db';
import { useEditor } from '@/state/editorStore';
import { releaseMlWorkerIfIdle } from '@/lib/ml/client';
import { memoryConstrained } from '@/lib/ml/memory';

/** When set, the next plain click starts another object in the active layer instead of replacing the current one. */
export const useObjectTool = create<{ startNew: boolean; hint: string | null }>(() => ({ startNew: false, hint: null }));

/** Turns the tool on for the active layer and starts downloading / analysing ahead of the first click. */
export function activateSelectObject() {
  const s = useEditor.getState();
  s.setUi({ tool: 'object', showMaskOverlay: true });
  useObjectTool.setState({ startNew: false, hint: null });
  const photoId = engine.getActivePhotoId();
  if (photoId) objectMasks.prepare(photoId, engine.objectImage());
}

export function currentObject(layerId: string | null): ObjectComponent | undefined {
  const layer = useEditor.getState().edit.layers.find((l) => l.id === layerId);
  return layer?.components.filter((c): c is ObjectComponent => c.type === 'object').at(-1);
}

/** Handles a click on the photo at source coordinates (x, y). */
export function objectClick(x: number, y: number, mods: { shiftKey: boolean; altKey: boolean }) {
  const s = useEditor.getState();
  const layerId = s.activeLayerId;
  const photoId = engine.getActivePhotoId();
  if (!layerId || !photoId) return;
  const action = pointActionFor(mods);
  const { startNew } = useObjectTool.getState();
  const current = startNew ? undefined : currentObject(layerId);
  if (objectMasks.isPaused(photoId)) objectMasks.resume(photoId);
  if (!current) {
    if (action === 'exclude') {
      useObjectTool.setState({ hint: 'Click the object first, then Alt-click to subtract from it.' });
      return;
    }
    objectMasks.markSelecting();
    s.addMaskComponent(layerId, newObjectComponent(newId('c_'), [{ x, y, include: true }]));
    useObjectTool.setState({ startNew: false, hint: null });
    return;
  }
  const points = applyPoint(current.points, x, y, action);
  if (!points) {
    useObjectTool.setState({ hint: 'A selection needs at least one point on the object.' });
    return;
  }
  objectMasks.markSelecting();
  s.updateMaskComponent(layerId, { ...current, points });
  useObjectTool.setState({ hint: null });
}

// On phones, leaving the Select object tool gives the model's memory back once it is idle.
// The masks already made stay; coming back to the tool loads the model again.
let leaveTimer = 0;
useEditor.subscribe(
  (s) => s.tool,
  (tool, prev) => {
    window.clearTimeout(leaveTimer);
    if (prev === 'object' && tool !== 'object' && memoryConstrained()) leaveTimer = window.setTimeout(() => releaseMlWorkerIfIdle(), 4000);
  },
);
