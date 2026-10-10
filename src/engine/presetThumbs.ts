/**
 * Real preset previews: each preset is rendered through the same pipeline on
 * a small copy of the active photo (or a procedural test scene when no photo
 * is open). Renders are queued, one per animation frame, and cached.
 */
import { GLRenderer } from '@/lib/engine/gl/renderer';
import { deriveDevelopParams } from '@/lib/engine/params';
import { cpuRender } from '@/lib/engine/cpu/cpuRender';
import { blendPreset } from '@/lib/presets/blend';
import { createCanvas, canvasToBlob } from '@/lib/image/decode';
import { defaultAdjustments, defaultEditState, type PartialAdjustments } from '@/lib/schema/adjustments';
import { linearToSrgb } from '@/lib/color/srgb';

const THUMB_SIDE = 220;

interface Job {
  key: string;
  values: PartialAdjustments;
  resolve: (url: string) => void;
  reject: (e: unknown) => void;
}

let renderer: GLRenderer | null | undefined;
let source: { id: string; bitmap: ImageBitmap; data: ImageData } | null = null;
const cache = new Map<string, string>();
const queue: Job[] = [];
let pumping = false;

function getRenderer(): GLRenderer | null {
  if (renderer === undefined) {
    try {
      renderer = new GLRenderer(createCanvas(4, 4) as HTMLCanvasElement);
    } catch {
      renderer = null;
    }
  }
  return renderer;
}

/** Sets the photo used for previews (null = test scene). Clears the cache when it changes. */
export async function setPreviewSource(id: string | null, bitmap: ImageBitmap | null) {
  const key = id ?? 'scene';
  if (source?.id === key) return;
  let bmp: ImageBitmap;
  if (bitmap) {
    const k = THUMB_SIDE / Math.max(bitmap.width, bitmap.height);
    bmp = await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * Math.min(1, k))),
      resizeHeight: Math.max(1, Math.round(bitmap.height * Math.min(1, k))),
      resizeQuality: 'high',
    });
  } else {
    bmp = await createImageBitmap(testScene());
  }
  const c = createCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  source?.bitmap.close();
  source = { id: key, bitmap: bmp, data: ctx.getImageData(0, 0, bmp.width, bmp.height) };
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  thumbSourceListeners.forEach((fn) => fn(key));
}

export const thumbSourceListeners = new Set<(id: string) => void>();

export function previewSourceId(): string {
  return source?.id ?? 'none';
}

export function presetThumb(presetId: string, values: PartialAdjustments): Promise<string> {
  const key = `${source?.id}:${presetId}:${JSON.stringify(values).length}:${hash(JSON.stringify(values))}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    queue.push({ key, values, resolve, reject });
    pump();
  });
}

function pump() {
  if (pumping) return;
  pumping = true;
  const step = async () => {
    const job = queue.shift();
    if (!job) {
      pumping = false;
      return;
    }
    try {
      if (!source) await setPreviewSource(null, null);
      job.resolve(await renderJob(job));
    } catch (e) {
      job.reject(e);
    }
    schedule(() => void step());
  };
  schedule(() => void step());
}

/** Thumbnails are background work: run them when the main thread is idle. */
function schedule(fn: () => void) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 400 });
  else requestAnimationFrame(fn);
}

async function renderJob(job: Job): Promise<string> {
  const cached = cache.get(job.key);
  if (cached) return cached;
  const src = source!;
  const adjustments = blendPreset(defaultAdjustments(), job.values, 100);
  const edit = { ...defaultEditState(), adjustments };
  const size = { width: src.bitmap.width, height: src.bitmap.height };
  const r = getRenderer();
  let img: ImageData;
  if (r) {
    r.setSource(src.bitmap, size);
    r.render({ edit, params: deriveDevelopParams(adjustments), fullSize: size, out: size, target: 'thumb' });
    img = r.readTarget('thumb');
  } else {
    const out = cpuRender({ source: src.data, fullSize: size, edit, out: size });
    img = new ImageData(new Uint8ClampedArray(out.data), out.width, out.height);
  }
  const c = createCanvas(img.width, img.height);
  (c.getContext('2d') as CanvasRenderingContext2D).putImageData(img, 0, 0);
  const url = URL.createObjectURL(await canvasToBlob(c, 'image/jpeg', 0.85));
  cache.set(job.key, url);
  return url;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Procedural test scene used when no photo is open: sky gradient, warm sun,
 * foliage, water, a skin-tone gradient and a neutral grey ramp, so presets can
 * be compared on representative colours. It is labelled as a test scene in the UI.
 */
export function testScene(): ImageData {
  const W = 240;
  const H = 160;
  const img = new ImageData(W, H);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * W + x) * 4;
    img.data[i] = Math.round(linearToSrgb(r) * 255);
    img.data[i + 1] = Math.round(linearToSrgb(g) * 255);
    img.data[i + 2] = Math.round(linearToSrgb(b) * 255);
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      let r: number, g: number, b: number;
      if (v < 0.5) {
        // Sky: deep blue to warm horizon, with a sun glow.
        const t = v / 0.5;
        r = 0.08 + 0.75 * t * t;
        g = 0.16 + 0.48 * t;
        b = 0.55 - 0.15 * t;
        const d = Math.hypot(u - 0.72, v - 0.36);
        const glow = Math.exp(-d * d * 60);
        r += glow * 0.9;
        g += glow * 0.6;
        b += glow * 0.2;
      } else if (v < 0.68) {
        // Foliage band with variation.
        const n = 0.5 + 0.5 * Math.sin(u * 40) * Math.cos(v * 70);
        r = 0.05 + 0.04 * n;
        g = 0.14 + 0.12 * n;
        b = 0.04;
      } else if (v < 0.86) {
        // Water / teal.
        const t = (v - 0.68) / 0.18;
        r = 0.03 + 0.05 * t;
        g = 0.12 + 0.05 * t;
        b = 0.16 + 0.08 * t;
      } else {
        // Neutral grey ramp.
        const y0 = Math.pow(u, 2.2);
        r = g = b = y0;
      }
      // Skin-tone sphere.
      const ds = Math.hypot((u - 0.28) * 1.5, v - 0.55);
      if (ds < 0.2) {
        const shade = 0.35 + 0.65 * Math.max(0, 1 - Math.hypot(u - 0.24, v - 0.48) * 5);
        r = 0.62 * shade;
        g = 0.38 * shade;
        b = 0.26 * shade;
      }
      put(x, y, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
  }
  return img;
}
