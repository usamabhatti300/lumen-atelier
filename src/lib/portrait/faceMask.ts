/**
 * Builds the portrait mask from face landmarks (+ optional segmentation):
 *   R = skin (face oval minus eyes, brows and lips; limited to segmented skin when available)
 *   G = teeth (inner mouth)
 *   B = irises
 *   A = under-eye areas
 * Returned as ImageData (not a canvas) so channels are uploaded to the GPU
 * exactly, without canvas alpha premultiplication.
 */
import { createCanvas } from '../image/decode';
import type { SegmentationMaps } from '../masks/rasterize';

export interface Landmark {
  x: number;
  y: number;
}
export interface Connection {
  start: number;
  end: number;
}

export interface FaceRegions {
  oval: number[];
  leftEye: number[];
  rightEye: number[];
  leftBrow: number[];
  rightBrow: number[];
  lipsOuter: number[];
  lipsInner: number[];
  leftIris: number[];
  rightIris: number[];
}

/** Orders connection pairs into closed loops (one per connected component). */
export function connectionLoops(conns: Connection[]): number[][] {
  const adj = new Map<number, number[]>();
  for (const { start, end } of conns) {
    adj.set(start, [...(adj.get(start) ?? []), end]);
    adj.set(end, [...(adj.get(end) ?? []), start]);
  }
  const seen = new Set<number>();
  const loops: number[][] = [];
  for (const startNode of adj.keys()) {
    if (seen.has(startNode)) continue;
    const loop = [startNode];
    seen.add(startNode);
    let prev = -1;
    let cur = startNode;
    for (let guard = 0; guard < 1000; guard++) {
      const next = (adj.get(cur) ?? []).find((n) => n !== prev && !seen.has(n));
      if (next === undefined) break;
      loop.push(next);
      seen.add(next);
      prev = cur;
      cur = next;
    }
    loops.push(loop);
  }
  return loops;
}

function polygonArea(pts: Landmark[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function regionsFromConnections(c: {
  oval: Connection[];
  leftEye: Connection[];
  rightEye: Connection[];
  leftBrow: Connection[];
  rightBrow: Connection[];
  lips: Connection[];
  leftIris: Connection[];
  rightIris: Connection[];
}, sample: Landmark[]): FaceRegions {
  const first = (conns: Connection[]) => connectionLoops(conns).sort((a, b) => b.length - a.length)[0] ?? [];
  const lipLoops = connectionLoops(c.lips).filter((l) => l.length > 3);
  lipLoops.sort((a, b) => polygonArea(b.map((i) => sample[i])) - polygonArea(a.map((i) => sample[i])));
  return {
    oval: first(c.oval),
    leftEye: first(c.leftEye),
    rightEye: first(c.rightEye),
    leftBrow: first(c.leftBrow),
    rightBrow: first(c.rightBrow),
    lipsOuter: lipLoops[0] ?? [],
    lipsInner: lipLoops[1] ?? [],
    leftIris: first(c.leftIris),
    rightIris: first(c.rightIris),
  };
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function fillPoly(ctx: Ctx, pts: Landmark[], W: number, H: number) {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x * W, pts[0].y * H);
  for (const p of pts.slice(1)) ctx.lineTo(p.x * W, p.y * H);
  ctx.closePath();
  ctx.fill();
}

function centroid(pts: Landmark[]): Landmark {
  const n = Math.max(1, pts.length);
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
}

function bbox(pts: Landmark[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** Scales a polygon about its centroid. */
function grow(pts: Landmark[], k: number): Landmark[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

export function buildPortraitMask(
  faces: Landmark[][],
  regions: FaceRegions,
  size: { width: number; height: number },
  segmentation: SegmentationMaps | null,
): ImageData {
  const { width: W, height: H } = size;
  const channel = () => {
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d', { willReadFrequently: true }) as Ctx;
    ctx.fillStyle = '#fff';
    return { c, ctx };
  };
  const skin = channel();
  const teeth = channel();
  const iris = channel();
  const under = channel();
  const pick = (face: Landmark[], idx: number[]) => idx.map((i) => face[i]).filter(Boolean);

  for (const face of faces) {
    const oval = pick(face, regions.oval);
    const ob = bbox(oval);
    const faceW = (ob.x1 - ob.x0) * W;
    const feather = Math.max(1, faceW * 0.035);

    // Skin: oval minus features.
    skin.ctx.save();
    skin.ctx.filter = `blur(${feather.toFixed(1)}px)`;
    skin.ctx.globalCompositeOperation = 'source-over';
    fillPoly(skin.ctx, oval, W, H);
    skin.ctx.globalCompositeOperation = 'destination-out';
    skin.ctx.filter = `blur(${(feather * 0.5).toFixed(1)}px)`;
    for (const region of [regions.leftEye, regions.rightEye]) fillPoly(skin.ctx, grow(pick(face, region), 1.45), W, H);
    for (const region of [regions.leftBrow, regions.rightBrow]) fillPoly(skin.ctx, grow(pick(face, region), 1.25), W, H);
    fillPoly(skin.ctx, grow(pick(face, regions.lipsOuter), 1.12), W, H);
    skin.ctx.restore();

    // Teeth: inner mouth opening.
    teeth.ctx.save();
    teeth.ctx.filter = `blur(${Math.max(0.6, feather * 0.15).toFixed(1)}px)`;
    fillPoly(teeth.ctx, pick(face, regions.lipsInner), W, H);
    teeth.ctx.restore();

    // Irises: circle through the iris ring landmarks.
    for (const ring of [regions.leftIris, regions.rightIris]) {
      const pts = pick(face, ring);
      if (pts.length < 3) continue;
      const c = centroid(pts);
      const r = (pts.reduce((s, p) => s + Math.hypot((p.x - c.x) * W, (p.y - c.y) * H), 0) / pts.length) * 1.05;
      iris.ctx.save();
      iris.ctx.filter = `blur(${Math.max(0.5, r * 0.15).toFixed(1)}px)`;
      iris.ctx.beginPath();
      iris.ctx.arc(c.x * W, c.y * H, r, 0, Math.PI * 2);
      iris.ctx.fill();
      iris.ctx.restore();
    }

    // Under-eye: band below each eye's lower lid.
    for (const eye of [regions.leftEye, regions.rightEye]) {
      const pts = pick(face, eye);
      if (pts.length < 4) continue;
      const b = bbox(pts);
      const eyeH = Math.max((b.y1 - b.y0) * H, faceW * 0.02);
      const cx = ((b.x0 + b.x1) / 2) * W;
      const cy = b.y1 * H + eyeH * 0.9;
      under.ctx.save();
      under.ctx.filter = `blur(${(eyeH * 0.45).toFixed(1)}px)`;
      under.ctx.beginPath();
      under.ctx.ellipse(cx, cy, ((b.x1 - b.x0) * W) / 2 * 0.95, eyeH * 0.75, 0, 0, Math.PI * 2);
      under.ctx.fill();
      under.ctx.restore();
    }
  }

  const get = (x: { ctx: Ctx }) => x.ctx.getImageData(0, 0, W, H).data;
  const r = get(skin);
  const g = get(teeth);
  const b = get(iris);
  const a = get(under);
  const out = new ImageData(W, H);
  const skinSeg = segmentation?.maps.skin;
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    let s = r[i + 3];
    if (skinSeg) {
      // Exclude hair/clothes overlapping the face oval when segmentation is available.
      const sx = Math.min(segmentation!.width - 1, Math.floor(((p % W) / W) * segmentation!.width));
      const sy = Math.min(segmentation!.height - 1, Math.floor((Math.floor(p / W) / H) * segmentation!.height));
      const conf = skinSeg[sy * segmentation!.width + sx] / 255;
      s = Math.round(s * Math.min(1, conf * 1.4));
    }
    out.data[i] = s;
    out.data[i + 1] = g[i + 3];
    out.data[i + 2] = b[i + 3];
    out.data[i + 3] = a[i + 3];
  }
  return out;
}
