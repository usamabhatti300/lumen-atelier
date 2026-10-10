/** Importing files into a project: validate, decode, thumbnail, persist the untouched original. */
import { decodeImageBlob, makeThumbnail, ImageImportError } from '@/lib/image/decode';
import { safeFileName } from '@/lib/image/fileTypes';
import { addPhoto, newId } from '@/lib/storage/db';
import { defaultEditState, type EditState } from '@/lib/schema/adjustments';
import type { PhotoMeta } from '@/state/editorStore';

export interface ImportOutcome {
  added: PhotoMeta[];
  edits: Record<string, EditState>;
  errors: string[];
}

export async function importFiles(
  files: File[],
  projectId: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ImportOutcome> {
  const added: PhotoMeta[] = [];
  const edits: Record<string, EditState> = {};
  const errors: string[] = [];
  let done = 0;
  for (const file of files) {
    if (signal?.aborted) break;
    const name = safeFileName(file.name);
    try {
      const decoded = await decodeImageBlob(file, name);
      const thumb = await makeThumbnail(decoded.bitmap, 360);
      decoded.bitmap.close();
      const id = newId('ph_');
      const edit = defaultEditState();
      const now = Date.now();
      await addPhoto(
        {
          id,
          projectId,
          name,
          mime: decoded.mime,
          width: decoded.width,
          height: decoded.height,
          byteSize: file.size,
          exif: decoded.exif,
          createdAt: now,
          updatedAt: now,
          thumbnail: thumb,
          edit,
        },
        file,
      );
      added.push({
        id,
        name,
        width: decoded.width,
        height: decoded.height,
        byteSize: file.size,
        mime: decoded.mime,
        exif: decoded.exif,
        thumbUrl: URL.createObjectURL(thumb),
      });
      edits[id] = edit;
    } catch (e) {
      if (e instanceof ImageImportError) errors.push(e.message);
      else if (e instanceof DOMException && e.name === 'QuotaExceededError')
        errors.push(`${name}: browser storage is full. Delete old projects in Settings and try again.`);
      else errors.push(`${name}: import failed (${e instanceof Error ? e.message : 'unknown error'}).`);
    }
    done++;
    onProgress?.(done, files.length);
  }
  return { added, edits, errors };
}
