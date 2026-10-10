/**
 * Lazy-loaded MediaPipe Tasks Vision (Apache-2.0). Runs fully on-device:
 * the WASM runtime is served from /mediapipe/wasm (copied from node_modules
 * on install) and models from /models (downloaded by `npm run setup:models`).
 * No image data leaves the browser.
 */
import type { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import type { SegmentationMaps } from '../masks/rasterize';
import { regionsFromConnections, type FaceRegions, type Landmark } from './faceMask';

export const FACE_MODEL_URL = '/models/face_landmarker.task';
export const SEGMENT_MODEL_URL = '/models/selfie_multiclass_256x256.tflite';
const WASM_BASE = '/mediapipe/wasm';

export class ModelsMissingError extends Error {}

let facePromise: Promise<FaceLandmarker> | null = null;
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
  try {
    return await make('GPU');
  } catch {
    return make('CPU');
  }
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!facePromise) {
    facePromise = (async () => {
      await assertModel(FACE_MODEL_URL);
      const { FilesetResolver, FaceLandmarker } = await vision();
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return createWithFallback((delegate) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
          runningMode: 'IMAGE',
          numFaces: 6,
          minFaceDetectionConfidence: 0.45,
          minFacePresenceConfidence: 0.45,
        }),
      );
    })();
    facePromise.catch(() => (facePromise = null));
  }
  return facePromise;
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

export async function detectFaces(image: ImageBitmap): Promise<Landmark[][]> {
  const lm = await getFaceLandmarker();
  const res = lm.detect(image);
  return res.faceLandmarks.map((f) => f.map((p) => ({ x: p.x, y: p.y })));
}

/** Confidence maps for background, hair, skin (body + face), clothes and subject. */
export async function segmentPerson(image: ImageBitmap): Promise<SegmentationMaps> {
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
    for (let i = 0; i < n; i++) {
      const bg = f[0][i];
      maps.background[i] = bg * 255;
      maps.subject[i] = (1 - bg) * 255;
      maps.hair[i] = f[1][i] * 255;
      maps.skin[i] = Math.max(f[2][i], f[3][i]) * 255;
      maps.clothes[i] = f[4][i] * 255;
    }
    return { width, height, maps };
  } finally {
    res.close();
  }
}
