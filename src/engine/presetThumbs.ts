/**
 * Real preset previews: each preset is rendered through the same pipeline on
 * a small copy of the active photo (or a procedural test scene when no photo
 * is open). Renders are queued, one per idle moment, and cached in memory and,
 * for sources that never change (a photo's original, the sample, the test
 * scene), in IndexedDB, so reopening a photo shows its previews at once.
 *
 * Roadmap 1.5: the pixels come back from the GPU asynchronously (a fenced
 * pixel-buffer read), so a preview never makes the page wait for a render.
 * Rendering stays on the main thread's GL context on purpose: a worker's GL
 * context shares the browser's GPU process and stalled the page the same way
 * (measured with MediaPipe's GPU delegate in 1.3).
 */
import { GLRenderer } from '@/lib/engine/gl/renderer';
import { deriveDevelopParams } from '@/lib/engine/params';
import { cpuRender } from '@/lib/engine/cpu/cpuRender';
import { blendPreset } from '@/lib/presets/blend';
import { createCanvas, canvasToBlob } from '@/lib/image/decode';
import { defaultAdjustments, defaultEditState, type PartialAdjustments } from '@/lib/schema/adjustments';
import { linearToSrgb } from '@/lib/color/srgb';
import { getCachedThumb, putCachedThumb } from '@/lib/storage/db';
import * as shaders from '@/lib/engine/gl/shaders';
import * as params from '@/lib/engine/params';

// Sharp on high-density phone screens (larger cards there), unchanged on standard desktop screens.
const THUMB_SIDE = typeof window === 'undefined' ? 220 : Math.round(Math.min(480, Math.max(260, 200 * (window.devicePixelRatio || 1))));

interface Job {
  key: string;
  /** IndexedDB key and source name, when the source may be kept. */
  stored: string | null;
  persist: string | null;
  values: PartialAdjustments;
  resolve: (url: string) => void;
  reject: (e: unknown) => void;
}

let renderer: GLRenderer | null | undefined;
/** `persist`: the cache name for sources whose pixels never change (photo id, 'sample', 'scene'). */
let source: { id: string; persist: string | null; bitmap: ImageBitmap; data: ImageData } | null = null;

/**
 * Changes whenever the rendering code does (shader text, parameter derivation, preset blending), so
 * cached previews from an older build are never shown.
 */
const PIPELINE_ID = hash(
  [...Object.values(shaders), ...Object.values(params), blendPreset]
    .map((v) => (typeof v === 'function' ? v.toString() : JSON.stringify(v)))
    .join('|'),
).toString(36);
const cache = new Map<string, string>();
const queue: Job[] = [];

/** The source bitmap the renderer already holds as its texture (uploaded once, not per preview). */
let uploaded: ImageBitmap | null = null;

function getRenderer(): GLRenderer | null {
  if (renderer === undefined) {
    uploaded = null;
    try {
      const r = new GLRenderer(createCanvas(4, 4) as HTMLCanvasElement);
      // A lost context never comes back for this renderer: drop it, and the next preview makes a
      // new one (or falls back to the CPU if the browser won't give out a context).
      r.onContextLost = () => {
        if (renderer === r) renderer = undefined;
      };
      renderer = r;
    } catch {
      renderer = null;
    }
  }
  return renderer;
}

/**
 * Sets the photo used for previews (null = test scene). Clears the memory cache when it changes.
 * `persist` names a source whose pixels never change, so its previews may be kept in IndexedDB
 * (the test scene always is); omit it for sources such as an edited thumbnail.
 */
export async function setPreviewSource(id: string | null, bitmap: ImageBitmap | null, persist?: string) {
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
  source = { id: key, persist: bitmap ? (persist ?? null) : 'scene', bitmap: bmp, data: ctx.getImageData(0, 0, bmp.width, bmp.height) };
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  thumbSourceListeners.forEach((fn) => fn(key));
}

export const thumbSourceListeners = new Set<(id: string) => void>();

export function previewSourceId(): string {
  return source?.id ?? 'none';
}

/**
 * Renders (or returns the cached) preview of a preset on the current source. Pass a signal to
 * drop the request if the tile goes away before its turn, so visible tiles never wait behind
 * tiles nobody is looking at any more.
 */
export async function presetThumb(presetId: string, values: PartialAdjustments, signal?: AbortSignal): Promise<string> {
  const json = JSON.stringify(values);
  const key = `${source?.id}:${presetId}:${json.length}:${hash(json)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const persist = source?.persist ?? null;
  const stored = persist ? `${persist}:${THUMB_SIDE}:${PIPELINE_ID}:${json.length}:${hash(json)}` : null;
  if (stored) {
    const blob = await getCachedThumb(stored);
    if (blob && !cache.has(key)) cache.set(key, URL.createObjectURL(blob));
    const now = cache.get(key);
    if (now) return now;
  }
  if (signal?.aborted) throw new DOMException('Preview no longer needed', 'AbortError');
  return new Promise((resolve, reject) => {
    const job: Job = { key, stored, persist, values, resolve, reject };
    queue.push(job);
    signal?.addEventListener(
      'abort',
      () => {
        const i = queue.indexOf(job);
        if (i >= 0) {
          queue.splice(i, 1);
          reject(new DOMException('Preview no longer needed', 'AbortError'));
        }
      },
      { once: true },
    );
    pump();
  });
}

/**
 * Up to this many previews in flight: their GPU renders and reads queue back to back (GL runs them in
 * order, so reusing the 'thumb' target is safe), instead of each waiting for the previous fence.
 * One at a time on the CPU fallback, where each render is a synchronous chunk of work.
 */
const IN_FLIGHT = 4;
let inFlight = 0;
let scheduled = false;

function pump() {
  if (scheduled) return;
  scheduled = true;
  schedule(() => void fill());
}

async function fill() {
  scheduled = false;
  if (!source) await setPreviewSource(null, null);
  const max = getRenderer() ? IN_FLIGHT : 1;
  while (inFlight < max && queue.length) {
    const job = queue.shift()!;
    inFlight++;
    renderJob(job)
      .then(job.resolve, job.reject)
      .finally(() => {
        inFlight--;
        if (queue.length) pump();
      });
  }
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
    if (uploaded !== src.bitmap) {
      r.setSource(src.bitmap, size);
      uploaded = src.bitmap;
    }
    r.render({ edit, params: deriveDevelopParams(adjustments), fullSize: size, out: size, target: 'thumb' });
    img = await r.readTargetAsync('thumb');
  } else {
    const out = cpuRender({ source: src.data, fullSize: size, edit, out: size });
    img = new ImageData(new Uint8ClampedArray(out.data), out.width, out.height);
  }
  // CPU-backed, so encoding never waits for the GPU (see makeThumbnail).
  const c = createCanvas(img.width, img.height);
  (c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D).putImageData(img, 0, 0);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.85);
  if (job.stored && job.persist && source?.persist === job.persist) void putCachedThumb(job.stored, job.persist, blob);
  const url = URL.createObjectURL(blob);
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
