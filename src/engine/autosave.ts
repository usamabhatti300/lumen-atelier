/**
 * Autosave / session recovery. Edits are written to IndexedDB shortly after
 * every change (debounced), so closing the tab or a crash loses at most the
 * last half second. Thumbnails are refreshed after a longer idle period.
 */
import { shallow } from 'zustand/shallow';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { getProject, saveProject, updatePhotoEdit } from '@/lib/storage/db';
import { makeThumbnail } from '@/lib/image/decode';
import type { EditState } from '@/lib/schema/adjustments';
import { engine } from './controller';

const SAVE_DELAY = 500;
const THUMB_DELAY = 1500;

let pending: { photoId: string; edit: EditState } | null = null;
let saveTimer = 0;
let thumbTimer = 0;
let started = false;

async function flush(): Promise<void> {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  const job = pending;
  pending = null;
  const { projectId, projectName, photos, activePhotoId } = useEditor.getState();
  try {
    if (job) {
      useEditor.getState().setSaveState('saving');
      await updatePhotoEdit(job.photoId, job.edit);
    }
    if (projectId) {
      const project = await getProject(projectId);
      if (project) {
        await saveProject({ ...project, name: projectName || project.name, photoIds: photos.map((p) => p.id), activePhotoId });
      }
    }
    if (!pending) useEditor.getState().markSaved(Date.now());
  } catch (e) {
    console.error('[autosave] failed', e);
    useEditor.getState().setSaveState('error');
    useEditor.getState().showToast('Saving failed. Browser storage may be full or unavailable.', 'error');
  }
}

/** Force an immediate save (Save button / before navigation). */
export async function saveNow(): Promise<void> {
  const { activePhotoId, edit } = useEditor.getState();
  if (activePhotoId) pending = { photoId: activePhotoId, edit };
  await flush();
  await refreshThumbnail();
}

async function refreshThumbnail() {
  window.clearTimeout(thumbTimer);
  thumbTimer = 0;
  const { activePhotoId } = useEditor.getState();
  if (!activePhotoId || engine.getActivePhotoId() !== activePhotoId) return;
  const img = engine.readRendered(360);
  if (!img) return;
  try {
    const blob = await makeThumbnail(img, 360);
    const { edit } = useEditor.getState();
    await updatePhotoEdit(activePhotoId, edit, blob);
    useEditor.getState().setPhotoThumb(activePhotoId, URL.createObjectURL(blob));
  } catch {
    /* thumbnails are best-effort */
  }
}

export function startAutosave() {
  if (started) return;
  started = true;
  useEditor.subscribe(
    (s) => [s.edit, s.activePhotoId] as const,
    ([edit, photoId], [prevEdit, prevPhotoId]) => {
      if (photoId !== prevPhotoId) {
        // Photo switched: persist the previous photo's pending edit right away.
        if (pending) void flush();
        if (prevPhotoId && prevEdit) {
          pending = { photoId: prevPhotoId, edit: prevEdit };
          void flush();
        }
        return;
      }
      if (!photoId) return;
      pending = { photoId, edit };
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => void flush(), SAVE_DELAY);
      window.clearTimeout(thumbTimer);
      thumbTimer = window.setTimeout(() => void refreshThumbnail(), THUMB_DELAY);
    },
    { equalityFn: shallow },
  );
  useEditor.subscribe(
    (s) => s.projectName,
    () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => void flush(), SAVE_DELAY);
    },
  );
  useEditor.subscribe(
    (s) => s.projectId,
    (id) => {
      if (id) useSettings.getState().update({ lastProjectId: id });
    },
  );
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
