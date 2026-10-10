/**
 * File validation by content (magic bytes), not by extension or the
 * browser-reported MIME type, which can be spoofed or missing.
 */
export type SupportedMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type SniffResult =
  | { ok: true; mime: SupportedMime }
  | { ok: false; reason: 'heic' | 'raw' | 'gif' | 'tiff' | 'svg' | 'unknown' | 'empty' };

export const MAX_FILE_BYTES = 150 * 1024 * 1024;
/** Decode guard: very large images can exhaust browser memory. */
export const MAX_PIXELS = 150_000_000;

export function sniffImageType(head: Uint8Array): SniffResult {
  if (head.length < 12) return { ok: false, reason: 'empty' };
  const b = head;
  const ascii = (start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, mime: 'image/jpeg' };
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return { ok: true, mime: 'image/png' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { ok: true, mime: 'image/webp' };
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heis', 'avif'].includes(brand))
      return { ok: false, reason: 'heic' };
    if (brand === 'crx ') return { ok: false, reason: 'raw' };
  }
  if (ascii(0, 3) === 'GIF') return { ok: false, reason: 'gif' };
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) {
    // TIFF container; most camera RAW formats (CR2, NEF, ARW, DNG) are TIFF-based.
    return { ok: false, reason: 'raw' };
  }
  if (ascii(0, 5) === '<?xml' || ascii(0, 4) === '<svg') return { ok: false, reason: 'svg' };
  return { ok: false, reason: 'unknown' };
}

export function unsupportedMessage(reason: Exclude<SniffResult, { ok: true }>['reason'], name: string): string {
  switch (reason) {
    case 'heic':
      return `${name} is HEIC/HEIF or AVIF. Those formats are not supported yet. Export it as JPEG from your photo app and import that instead.`;
    case 'raw':
      return `${name} looks like a camera RAW or TIFF file. RAW processing is not supported yet. Import a JPEG, PNG or WebP export.`;
    case 'gif':
      return `${name} is a GIF. Import a JPEG, PNG or WebP photo instead.`;
    case 'svg':
      return `${name} is a vector file. Import a JPEG, PNG or WebP photo instead.`;
    case 'empty':
      return `${name} is empty or truncated.`;
    default:
      return `${name} is not a supported image. Supported formats: JPEG, PNG and WebP.`;
  }
}

/** Removes path components and control characters from a user-supplied file name. */
export function safeFileName(name: string, fallback = 'photo'): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 120);
  return cleaned || fallback;
}

export function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{2,5}$/i, '');
}
