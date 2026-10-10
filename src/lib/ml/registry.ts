/**
 * Registry of every on-device AI model the app can use. Plain data with no
 * imports so `scripts/setup-models.mjs` (Node, native TypeScript) can read it
 * too. Every file is pinned to an immutable upstream revision and carries its
 * byte size and SHA-256; the downloader and the browser loader both refuse a
 * file that does not match.
 *
 * Files are served from this app's own origin under /models/<path>. Nothing
 * is fetched from a third-party host at runtime.
 *
 * `status: 'planned'` models are listed (with verified sizes and licences)
 * but no tool uses them yet, so `setup:models` does not download them.
 */

export type ModelRuntime = 'mediapipe' | 'onnxruntime' | 'transformers';
export type ModelStatus = 'ready' | 'planned';

export interface ModelFile {
  /** Path under /models/ on this origin. */
  path: string;
  /** Upstream download URL pinned to a fixed revision (used by setup:models only). */
  url: string;
  bytes: number;
  sha256: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  /** The editor feature that uses it, as the user sees it. */
  feature: string;
  runtime: ModelRuntime;
  status: ModelStatus;
  licence: string;
  licenceUrl: string;
  source: string;
  /** Input/output contract, checked against the real ONNX graph before use. */
  io: string;
  files: ModelFile[];
}

/** File extensions the loaders accept. Pickle-based formats (.pt, .pth, .pkl, .bin) are never loaded. */
export const SAFE_MODEL_EXTENSIONS = ['.onnx', '.json', '.task', '.tflite', '.safetensors'] as const;

export const MODELS_BASE = '/models/';

const HF = 'https://huggingface.co';
const SLIMSAM_REV = '5850ab45f587c112167512ffef949107115e26a0';
const DEPTH_REV = '4472b7362082ad9968fee890ca0f1e5aca36b93d';
const MIGAN_REV = '406830d0fa60666da0071c342ad2fbc8f30c5c64';
const ESRGAN_REV = '899dc1e4b22bbf1955c2f1739c085edc080cb366';

export const MODELS: readonly ModelInfo[] = [
  {
    id: 'mediapipe-face',
    name: 'MediaPipe Face Landmarker',
    feature: 'Portrait retouching (face, eyes, lips)',
    runtime: 'mediapipe',
    status: 'ready',
    licence: 'Apache-2.0',
    licenceUrl: 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker',
    source: 'Google MediaPipe',
    io: 'Image in; 478 face landmarks per face out.',
    files: [
      {
        path: 'face_landmarker.task',
        url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        bytes: 3_758_596,
        sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
      },
    ],
  },
  {
    id: 'mediapipe-segmenter',
    name: 'MediaPipe Selfie Multiclass',
    feature: 'Subject, background, hair, skin and clothes masks',
    runtime: 'mediapipe',
    status: 'ready',
    licence: 'Apache-2.0',
    licenceUrl: 'https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter',
    source: 'Google MediaPipe',
    io: '256×256 image in; six confidence maps out.',
    files: [
      {
        path: 'selfie_multiclass_256x256.tflite',
        url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
        bytes: 16_371_837,
        sha256: 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0',
      },
    ],
  },
  {
    id: 'slimsam',
    name: 'SlimSAM-77 (Segment Anything)',
    feature: 'Select object: click to mask anything',
    runtime: 'transformers',
    status: 'planned',
    licence: 'Apache-2.0',
    licenceUrl: `${HF}/Xenova/slimsam-77-uniform`,
    source: 'Xenova/slimsam-77-uniform',
    io: 'Image embedding once per photo; points in, masks with IoU scores out.',
    files: [
      hfFile('Xenova/slimsam-77-uniform', SLIMSAM_REV, 'config.json', 379, '6339884f168658d3ca6473b486973913fb33e84e625e06ae2dd7b4a808187419'),
      hfFile('Xenova/slimsam-77-uniform', SLIMSAM_REV, 'preprocessor_config.json', 466, '225545a743c654e3c495ec6f545a0eaba57c8ba3fbbd8483b3cb1c0fc58db517'),
      hfFile('Xenova/slimsam-77-uniform', SLIMSAM_REV, 'onnx/vision_encoder.onnx', 23_276_014, '9f8433273a6750b587779baa0cf5508111001bf7e7acfcf585d370139fd366d0'),
      hfFile('Xenova/slimsam-77-uniform', SLIMSAM_REV, 'onnx/prompt_encoder_mask_decoder.onnx', 16_557_892, 'f4514391764fbd56e08e119060d874ecd7d52994bfb1968af159e12d4943b5bb'),
    ],
  },
  {
    id: 'migan',
    name: 'MI-GAN inpainting',
    feature: 'Remove: paint over objects to erase them',
    runtime: 'onnxruntime',
    status: 'ready',
    licence: 'MIT',
    licenceUrl: `${HF}/andraniksargsyan/migan/blob/main/LICENSE`,
    source: 'Picsart AI Research, andraniksargsyan/migan',
    io: 'uint8 RGB image and uint8 mask (255 keep, 0 fill) in; filled RGB out.',
    files: [hfFile('andraniksargsyan/migan', MIGAN_REV, 'migan_pipeline_v2.onnx', 28_079_181, '6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b')],
  },
  {
    id: 'depth-anything-v2-small',
    name: 'Depth Anything V2 Small',
    feature: 'Lens blur: depth-aware background blur',
    runtime: 'transformers',
    status: 'planned',
    licence: 'Apache-2.0 (Small only)',
    licenceUrl: `${HF}/onnx-community/depth-anything-v2-small`,
    source: 'onnx-community/depth-anything-v2-small',
    io: 'Image in; relative depth map out.',
    files: [
      hfFile('onnx-community/depth-anything-v2-small', DEPTH_REV, 'config.json', 38, '3aee5b9bc4f711ee885c2526d871f0c8c6c8c4b26b8e04253d0167f6a83264f5'),
      hfFile('onnx-community/depth-anything-v2-small', DEPTH_REV, 'preprocessor_config.json', 461, '03576db3c13dd0471fdf5f5e1428befcb95de063fe699879150b293dc9e0a2c6'),
      hfFile('onnx-community/depth-anything-v2-small', DEPTH_REV, 'onnx/model_fp16.onnx', 49_642_442, '2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04'),
    ],
  },
  {
    id: 'realesrgan-x4v3',
    name: 'Real-ESRGAN general x4v3',
    feature: 'AI upscale 2× / 4× on export',
    runtime: 'onnxruntime',
    status: 'planned',
    licence: 'BSD-3-Clause',
    licenceUrl: `${HF}/jonathanst29/tinier-upscale-models`,
    source: 'xinntao/Real-ESRGAN, jonathanst29/tinier-upscale-models',
    io: 'float32 [1,3,H,W] RGB 0–1 in; [1,3,4H,4W] out.',
    files: [hfFile('jonathanst29/tinier-upscale-models', ESRGAN_REV, 'realesr-general-x4v3.onnx', 4_866_396, '924ebad6532777303582d4ce7811849b88869231a3ae7093e0f21200249df8d5')],
  },
];

function hfFile(repo: string, rev: string, file: string, bytes: number, sha256: string): ModelFile {
  return { path: `${repo}/${file}`, url: `${HF}/${repo}/resolve/${rev}/${file}`, bytes, sha256 };
}

export function getModel(id: string): ModelInfo {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model "${id}".`);
  return m;
}

export function modelBytes(m: ModelInfo): number {
  return m.files.reduce((s, f) => s + f.bytes, 0);
}

/** The registered file served at a /models/ path, if any. */
export function findModelFile(path: string): ModelFile | undefined {
  for (const m of MODELS) for (const f of m.files) if (f.path === path) return f;
  return undefined;
}

export function isSafeModelPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((s) => s === '..' || s === '.' || s === '')) return false;
  const lower = path.toLowerCase();
  return SAFE_MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
