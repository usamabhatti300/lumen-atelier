/**
 * Non-destructive geometry: source -> rotate90 -> flip -> straighten -> crop.
 *
 * All transforms are composed into one affine 3x3 matrix mapping OUTPUT
 * normalized coordinates (u, v in 0..1 over the cropped result) to SOURCE
 * normalized coordinates (s, t in 0..1 over the oriented original). The same
 * matrix is used by the GPU output pass, the CPU fallback, brush/mask tools
 * (screen -> source) and export.
 */
import type { CropRect, Geometry } from '../schema/adjustments';

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

export function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return IDENTITY;
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ];
}

export function apply(m: Mat3, x: number, y: number): [number, number] {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
}

const translate = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y, 0, 0, 1];
const scale = (x: number, y: number): Mat3 => [x, 0, 0, 0, y, 0, 0, 0, 1];
const rotate = (rad: number): Mat3 => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

export interface Size {
  width: number;
  height: number;
}

/** Size of the oriented frame after 90-degree rotations. */
export function frameSize(source: Size, g: Pick<Geometry, 'rotate90'>): Size {
  return g.rotate90 % 2 === 1
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

/** Full-resolution output size in pixels. */
export function outputSize(source: Size, g: Geometry): Size {
  const f = frameSize(source, g);
  return {
    width: Math.max(1, Math.round(g.crop.w * f.width)),
    height: Math.max(1, Math.round(g.crop.h * f.height)),
  };
}

/** Matrix mapping frame pixels (pre-straighten, pre-crop) to source pixels. */
function frameToSourcePx(source: Size, g: Geometry): Mat3 {
  const { width: W0, height: H0 } = source;
  const f = frameSize(source, g);
  // Un-flip in frame space.
  const unflip = mul(
    translate(g.flipH ? f.width : 0, g.flipV ? f.height : 0),
    scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1),
  );
  let unrot: Mat3;
  switch (g.rotate90) {
    case 1: // frame (fx,fy) -> source (fy, H0 - fx)
      unrot = [0, 1, 0, -1, 0, H0, 0, 0, 1];
      break;
    case 2:
      unrot = [-1, 0, W0, 0, -1, H0, 0, 0, 1];
      break;
    case 3: // frame (fx,fy) -> source (W0 - fy, fx)
      unrot = [0, -1, W0, 1, 0, 0, 0, 0, 1];
      break;
    default:
      unrot = IDENTITY;
  }
  return mul(unrot, unflip);
}

/**
 * Output-normalized (u,v) -> source-normalized (s,t).
 * `crop` can be overridden (e.g. to show the full straightened frame in crop mode).
 */
export function outputToSourceMatrix(source: Size, g: Geometry, crop: CropRect = g.crop): Mat3 {
  const f = frameSize(source, g);
  const theta = (g.straighten * Math.PI) / 180;
  const cropToFramePx = mul(scale(f.width, f.height), mul(translate(crop.x, crop.y), scale(crop.w, crop.h)));
  const unstraighten = mul(
    translate(f.width / 2, f.height / 2),
    mul(rotate(-theta), translate(-f.width / 2, -f.height / 2)),
  );
  const toSourceNorm = scale(1 / source.width, 1 / source.height);
  return mul(toSourceNorm, mul(frameToSourcePx(source, g), mul(unstraighten, cropToFramePx)));
}

export function sourceToOutputMatrix(source: Size, g: Geometry, crop: CropRect = g.crop): Mat3 {
  return invert(outputToSourceMatrix(source, g, crop));
}

/** True when the crop rectangle lies within the straightened image. */
export function cropFitsRotation(crop: CropRect, straightenDeg: number, frame: Size): boolean {
  const theta = (straightenDeg * Math.PI) / 180;
  const c = Math.cos(-theta);
  const s = Math.sin(-theta);
  const cx = frame.width / 2;
  const cy = frame.height / 2;
  const corners: [number, number][] = [
    [crop.x, crop.y],
    [crop.x + crop.w, crop.y],
    [crop.x, crop.y + crop.h],
    [crop.x + crop.w, crop.y + crop.h],
  ];
  const eps = 1e-6;
  return corners.every(([nx, ny]) => {
    const px = nx * frame.width - cx;
    const py = ny * frame.height - cy;
    const rx = c * px - s * py + cx;
    const ry = s * px + c * py + cy;
    return rx >= -eps && rx <= frame.width + eps && ry >= -eps && ry <= frame.height + eps;
  });
}

/** Shrinks the crop about its centre (and recentres if needed) so it fits the straightened image. */
export function fitCropToRotation(crop: CropRect, straightenDeg: number, frame: Size): CropRect {
  if (cropFitsRotation(crop, straightenDeg, frame)) return crop;
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const at = (k: number, ccx: number, ccy: number): CropRect => ({
    x: ccx - (crop.w * k) / 2,
    y: ccy - (crop.h * k) / 2,
    w: crop.w * k,
    h: crop.h * k,
  });
  let centre: [number, number] = [cx, cy];
  if (!cropFitsRotation(at(0.001, cx, cy), straightenDeg, frame)) centre = [0.5, 0.5];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (cropFitsRotation(at(mid, centre[0], centre[1]), straightenDeg, frame)) lo = mid;
    else hi = mid;
  }
  return at(lo, centre[0], centre[1]);
}

/** Largest crop of the given aspect (w/h in pixels) centred on the current crop. */
export function applyAspect(crop: CropRect, aspect: number | null, frame: Size): CropRect {
  if (!aspect) return crop;
  const cw = crop.w * frame.width;
  const ch = crop.h * frame.height;
  let w = cw;
  let h = cw / aspect;
  if (h > ch) {
    h = ch;
    w = ch * aspect;
  }
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const nw = w / frame.width;
  const nh = h / frame.height;
  return clampCrop({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
}

export function clampCrop(c: CropRect): CropRect {
  const w = Math.min(1, Math.max(0.01, c.w));
  const h = Math.min(1, Math.max(0.01, c.h));
  return { x: Math.min(1 - w, Math.max(0, c.x)), y: Math.min(1 - h, Math.max(0, c.y)), w, h };
}

/** Converts a column-major Float32Array for gl.uniformMatrix3fv. */
export function toGlMat3(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}
