/**
 * Image import: validation, decoding with EXIF orientation applied, preview
 * and thumbnail generation.
 *
 * Colour management: createImageBitmap with colorSpaceConversion 'default'
 * converts embedded ICC profiles (e.g. Display P3, Adobe RGB) to sRGB during
 * decode. The editor's working/output space is sRGB; wide-gamut colours are
 * mapped into sRGB at import. This is documented in docs/RENDERING_PIPELINE.md.
 */
import { readExif, type ExifInfo } from './exif';
import {
  MAX_FILE_BYTES,
  MAX_PIXELS,
  sniffImageType,
  unsupportedMessage,
  type SupportedMime,
} from './fileTypes';

export type ImportErrorKind = 'unsupported' | 'corrupt' | 'too_large' | 'memory';

export class ImageImportError extends Error {
  readonly kind: ImportErrorKind;
  constructor(kind: ImportErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  mime: SupportedMime;
  exif: ExifInfo;
}

export async function decodeImageBlob(blob: Blob, displayName: string): Promise<DecodedImage> {
  if (blob.size === 0) throw new ImageImportError('corrupt', `${displayName} is empty.`);
  if (blob.size > MAX_FILE_BYTES) {
    throw new ImageImportError(
      'too_large',
      `${displayName} is ${(blob.size / 1e6).toFixed(0)} MB. The limit is ${MAX_FILE_BYTES / 1e6} MB per file.`,
    );
  }
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const sniff = sniffImageType(head);
  if (!sniff.ok) throw new ImageImportError('unsupported', unsupportedMessage(sniff.reason, displayName));

  const exif = sniff.mime === 'image/jpeg' ? readExif(await blob.slice(0, 512 * 1024).arrayBuffer()) : { orientation: 1 };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'default',
    });
  } catch (error) {
    const memory = error instanceof DOMException && /memory|allocation/i.test(error.message);
    throw new ImageImportError(
      memory ? 'memory' : 'corrupt',
      memory
        ? `${displayName} is too large to decode in this browser's available memory.`
        : `${displayName} could not be decoded. The file may be corrupt or truncated.`,
    );
  }
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    const mp = ((bitmap.width * bitmap.height) / 1e6).toFixed(0);
    bitmap.close();
    throw new ImageImportError(
      'too_large',
      `${displayName} is ${mp} megapixels. The current limit is ${MAX_PIXELS / 1e6} megapixels.`,
    );
  }
  return { bitmap, width: bitmap.width, height: bitmap.height, mime: sniff.mime, exif };
}

/** Downscaled copy for interactive editing (never upscales). */
export async function resizeBitmap(bitmap: ImageBitmap, maxSide: number): Promise<ImageBitmap> {
  const k = maxSide / Math.max(bitmap.width, bitmap.height);
  if (k >= 1) return createImageBitmap(bitmap, { premultiplyAlpha: 'none' });
  return createImageBitmap(bitmap, {
    resizeWidth: Math.max(1, Math.round(bitmap.width * k)),
    resizeHeight: Math.max(1, Math.round(bitmap.height * k)),
    resizeQuality: 'high',
    premultiplyAlpha: 'none',
  });
}

export function createCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality),
  );
}

/** Small JPEG thumbnail for galleries, filmstrips and preset previews. */
export async function makeThumbnail(source: ImageBitmap | ImageData, maxSide = 360): Promise<Blob> {
  const w = source.width;
  const h = source.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * k));
  const th = Math.max(1, Math.round(h * k));
  const canvas = createCanvas(tw, th);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  if (source instanceof ImageData) {
    const tmp = createCanvas(w, h);
    (tmp.getContext('2d') as CanvasRenderingContext2D).putImageData(source, 0, 0);
    ctx.drawImage(tmp as CanvasImageSource, 0, 0, tw, th);
  } else {
    ctx.drawImage(source, 0, 0, tw, th);
  }
  return canvasToBlob(canvas, 'image/jpeg', 0.84);
}

/** Pixel data of a bitmap at reduced size (analysis, histograms). */
export function bitmapToImageData(bitmap: ImageBitmap, maxSide: number): ImageData {
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
