/**
 * Lazy-loaded MediaPipe Tasks Vision (Apache-2.0). Runs fully on-device:
 * the WASM runtime is served from /mediapipe/wasm (copied from node_modules
 * on install) and models from /models (downloaded by `npm run setup:models`).
 * No image data leaves the browser.
 */
import type { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import type { SegmentationMaps } from '../masks/rasterize';
import { regionsFromConnections, type FaceRegions, type Landmark } from './faceMask';
import { faceSearchCrops, fromCrop, landmarkBox, mergeFaces } from './faceRegions';

export const FACE_MODEL_URL = '/models/face_landmarker.task';
export const SEGMENT_MODEL_URL = '/models/selfie_multiclass_256x256.tflite';
const WASM_BASE = '/mediapipe/wasm';

export class ModelsMissingError extends Error {}

let facePromise: Promise<FaceLandmarker> | null = null;
let faceCpuPromise: Promise<FaceLandmarker> | null = null;
let segPromise: Promise<ImageSegmenter> | null = null;

async function assertModel(url: string) {
  const res = await fetch(url, { method: 'HEAD' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || type.includes('text/html')) {
    throw new ModelsMissingError(
      'Portrait models are not installed. Run "npm run setup:models" in the project folder, then reload.',
    );
  }
}

async function vision() {
  return import('@mediapipe/tasks-vision');
}

async function createWithFallback<T>(make: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  let task: T;
  try {
    task = await make('GPU');
  } catch {
    task = await make('CPU');
  }
  disableUsageLogging(task);
  return task;
}

interface UsageLogger {
  flush(done?: () => void): void;
  i?: unknown[];
  h?: ReturnType<typeof setInterval>;
}

/**
 * Privacy: MediaPipe Tasks Vision 1.1.0 batches usage statistics and POSTs them
 * to https://odml.pa.googleapis.com/v1/log every 60 s (no public option turns
 * this off). The production CSP blocks it, but nothing may even try to leave
 * the device, so the logger's flush is replaced with a no-op (on the shared
 * prototype, which also covers a GPU attempt that fell back to CPU).
 * `e2e/network-isolation.spec.ts` runs long enough to catch it if an upgrade
 * renames these internals.
 */
function disableUsageLogging(task: unknown) {
  const logger = (task as { o?: { m?: UsageLogger } } | null)?.o?.m;
  if (!logger || typeof logger.flush !== 'function') {
    console.warn('[mediapipe] usage logger not found; check that telemetry is still disabled after an upgrade.');
    return;
  }
  const proto = Object.getPrototypeOf(logger) as UsageLogger;
  proto.flush = function (this: UsageLogger, done?: () => void) {
    this.i = [];
    done?.();
  };
  if (logger.h !== undefined) clearInterval(logger.h);
  logger.h = undefined;
}

async function makeFaceLandmarker(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  await assertModel(FACE_MODEL_URL);
  const { FilesetResolver, FaceLandmarker } = await vision();
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
    runningMode: 'IMAGE',
    numFaces: 6,
    minFaceDetectionConfidence: 0.45,
    minFacePresenceConfidence: 0.45,
  });
}

/** Which delegate the main face landmarker started with. */
let faceDelegate: 'GPU' | 'CPU' = 'GPU';

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!facePromise) {
    facePromise = createWithFallback((delegate) =>
      makeFaceLandmarker(delegate).then((t) => {
        faceDelegate = delegate;
        return t;
      }),
    );
    facePromise.catch(() => (facePromise = null));
  }
  return facePromise;
}

/**
 * CPU landmarker. Some phone GPUs run the GPU delegate without errors but return no
 * faces at all, so a GPU pass that finds nothing is repeated on the CPU.
 */
function getCpuFaceLandmarker(): Promise<FaceLandmarker> {
  if (!faceCpuPromise) {
    faceCpuPromise = makeFaceLandmarker('CPU').then((t) => {
      disableUsageLogging(t);
      return t;
    });
    faceCpuPromise.catch(() => (faceCpuPromise = null));
  }
  return faceCpuPromise;
}

export function getSegmenter(): Promise<ImageSegmenter> {
  if (!segPromise) {
    segPromise = (async () => {
      await assertModel(SEGMENT_MODEL_URL);
      const { FilesetResolver, ImageSegmenter } = await vision();
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return createWithFallback((delegate) =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: SEGMENT_MODEL_URL, delegate },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        }),
      );
    })();
    segPromise.catch(() => (segPromise = null));
  }
  return segPromise;
}

/** Lip loops are ordered per detected face (larger area = outer lip). */
export async function regionsForFace(face: Landmark[]): Promise<FaceRegions> {
  const { FaceLandmarker } = await vision();
  return regionsFromConnections(
    {
      oval: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
      leftEye: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      rightEye: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      leftBrow: FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
      rightBrow: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
      lips: FaceLandmarker.FACE_LANDMARKS_LIPS,
      leftIris: FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
      rightIris: FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    },
    face,
  );
}

export async function detectFaces(image: ImageBitmap, landmarker?: FaceLandmarker): Promise<Landmark[][]> {
  const lm = landmarker ?? (await getFaceLandmarker());
  const res = lm.detect(image);
  return res.faceLandmarks.map((f) => f.map((p) => ({ x: p.x, y: p.y })));
}

/** Smallest side a crop is enlarged to before the second pass, so a small face fills the detector's input. */
const CROP_DETECT_SIDE = 512;

/**
 * Full-frame detection, then a second pass on crops around likely faces the
 * first pass missed (small faces of people further from the camera). See faceRegions.ts.
 */
export async function detectFacesThorough(image: ImageBitmap, seg: PersonSegmentation | null): Promise<Landmark[][]> {
  const faces = await detectPasses(image, seg, await getFaceLandmarker());
  if (faces.length || faceDelegate === 'CPU') return faces;
  // Nothing on the GPU: repeat on the CPU (see getCpuFaceLandmarker).
  try {
    return await detectPasses(image, seg, await getCpuFaceLandmarker());
  } catch {
    return faces;
  }
}

async function detectPasses(image: ImageBitmap, seg: PersonSegmentation | null, lm: FaceLandmarker): Promise<Landmark[][]> {
  let faces = await detectFaces(image, lm);
  const crops = faceSearchCrops(
    seg ? { width: seg.width, height: seg.height, faceSkin: seg.faceSkin, subject: seg.maps.subject } : null,
    image.width,
    image.height,
    faces.map(landmarkBox),
  );
  for (const crop of crops) {
    const up = Math.max(1, CROP_DETECT_SIDE / Math.max(crop.w, crop.h));
    const bmp = await createImageBitmap(image, crop.x, crop.y, crop.w, crop.h, {
      resizeWidth: Math.round(crop.w * up),
      resizeHeight: Math.round(crop.h * up),
      resizeQuality: 'high',
    });
    try {
      const found = await detectFaces(bmp, lm);
      faces = mergeFaces(faces, found.map((f) => fromCrop(f, crop, image.width, image.height)));
    } finally {
      bmp.close();
    }
  }
  return faces;
}

/** Segmentation maps plus the face-skin channel on its own (used to find small faces). */
export interface PersonSegmentation extends SegmentationMaps {
  faceSkin: Uint8ClampedArray;
}

/** Confidence maps for background, hair, skin (body + face), clothes and subject. */
export async function segmentPerson(image: ImageBitmap): Promise<PersonSegmentation> {
  const seg = await getSegmenter();
  const res = seg.segment(image);
  try {
    const masks = res.confidenceMasks ?? [];
    if (masks.length < 5) throw new Error('Unexpected segmentation output.');
    const width = masks[0].width;
    const height = masks[0].height;
    const f = masks.map((m) => m.getAsFloat32Array());
    const n = width * height;
    const mk = () => new Uint8ClampedArray(n);
    const maps = { background: mk(), hair: mk(), skin: mk(), clothes: mk(), subject: mk() };
    const faceSkin = mk();
    for (let i = 0; i < n; i++) {
      const bg = f[0][i];
      maps.background[i] = bg * 255;
      maps.subject[i] = (1 - bg) * 255;
      maps.hair[i] = f[1][i] * 255;
      maps.skin[i] = Math.max(f[2][i], f[3][i]) * 255;
      faceSkin[i] = f[3][i] * 255;
      maps.clothes[i] = f[4][i] * 255;
    }
    return { width, height, maps, faceSkin };
  } finally {
    res.close();
  }
}
