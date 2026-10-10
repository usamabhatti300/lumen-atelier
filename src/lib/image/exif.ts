/**
 * Minimal, defensive EXIF reader for JPEG files. Extracts orientation and a
 * few display fields. Corrupt or truncated metadata returns partial results
 * rather than throwing; image decoding never depends on this parser (the
 * browser applies orientation itself via imageOrientation: 'from-image').
 */
export interface ExifInfo {
  orientation: number;
  make?: string;
  model?: string;
  dateTime?: string;
  exposureTime?: string;
  fNumber?: string;
  iso?: number;
  focalLength?: string;
}

const TAGS = {
  orientation: 0x0112,
  make: 0x010f,
  model: 0x0110,
  exifIfd: 0x8769,
  dateTimeOriginal: 0x9003,
  exposureTime: 0x829a,
  fNumber: 0x829d,
  iso: 0x8827,
  focalLength: 0x920a,
};

export function readExif(buf: ArrayBuffer): ExifInfo {
  const info: ExifInfo = { orientation: 1 };
  try {
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return info;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) return info;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) return info; // start of scan / end
      const size = view.getUint16(offset + 2);
      if (size < 2) return info;
      if (marker === 0xe1 && offset + 10 <= view.byteLength) {
        const isExif = view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0;
        if (isExif) {
          parseTiff(view, offset + 10, Math.min(view.byteLength, offset + 2 + size), info);
          return info;
        }
      }
      offset += 2 + size;
    }
  } catch {
    // Corrupt metadata: keep what we have.
  }
  return info;
}

function parseTiff(view: DataView, start: number, end: number, info: ExifInfo) {
  if (start + 8 > end) return;
  const order = view.getUint16(start);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  if (u16(start + 2) !== 42) return;
  const readIfd = (ifdOffset: number, visit: (tag: number, type: number, count: number, valueOffset: number) => void) => {
    const base = start + ifdOffset;
    if (base + 2 > end) return;
    const n = u16(base);
    for (let i = 0; i < n && i < 512; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > end) return;
      visit(u16(e), u16(e + 2), u32(e + 4), e + 8);
    }
  };
  const ascii = (count: number, valueOffset: number) => {
    const o = count <= 4 ? valueOffset : start + u32(valueOffset);
    if (o + count > end) return undefined;
    let s = '';
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 64) || undefined;
  };
  const rational = (valueOffset: number): [number, number] | undefined => {
    const o = start + u32(valueOffset);
    if (o + 8 > end) return undefined;
    return [u32(o), u32(o + 4)];
  };

  let exifIfd = 0;
  readIfd(u32(start + 4), (tag, type, count, vo) => {
    if (tag === TAGS.orientation && type === 3) {
      const v = u16(vo);
      if (v >= 1 && v <= 8) info.orientation = v;
    } else if (tag === TAGS.make && type === 2) info.make = ascii(count, vo);
    else if (tag === TAGS.model && type === 2) info.model = ascii(count, vo);
    else if (tag === TAGS.exifIfd) exifIfd = u32(vo);
  });
  if (exifIfd > 0) {
    readIfd(exifIfd, (tag, type, count, vo) => {
      if (tag === TAGS.dateTimeOriginal && type === 2) info.dateTime = ascii(count, vo);
      else if (tag === TAGS.iso && type === 3) info.iso = u16(vo);
      else if (tag === TAGS.exposureTime && type === 5) {
        const r = rational(vo);
        if (r && r[1]) info.exposureTime = r[0] >= r[1] ? `${(r[0] / r[1]).toFixed(1)}s` : `1/${Math.round(r[1] / r[0])}s`;
      } else if (tag === TAGS.fNumber && type === 5) {
        const r = rational(vo);
        if (r && r[1]) info.fNumber = `f/${(r[0] / r[1]).toFixed(1)}`;
      } else if (tag === TAGS.focalLength && type === 5) {
        const r = rational(vo);
        if (r && r[1]) info.focalLength = `${Math.round(r[0] / r[1])}mm`;
      }
    });
  }
}

/** Whether an EXIF orientation swaps width and height. */
export function orientationSwapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}
