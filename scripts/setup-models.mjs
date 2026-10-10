// Downloads the on-device MediaPipe models used for portrait retouching and
// subject/background masks into public/models/. Run once: npm run setup:models
//
// Models (Apache-2.0, Google MediaPipe):
//   face_landmarker.task            ~3.7 MB  478 face landmarks incl. irises
//   selfie_multiclass_256x256.tflite ~16 MB  background/hair/body-skin/face-skin/clothes/other
import { createWriteStream, existsSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'models');
const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    file: 'selfie_multiclass_256x256.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  },
];

mkdirSync(dest, { recursive: true });
for (const m of MODELS) {
  const target = join(dest, m.file);
  if (existsSync(target) && statSync(target).size > 100_000) {
    console.log(`[models] ${m.file} already present`);
    continue;
  }
  process.stdout.write(`[models] downloading ${m.file} … `);
  const res = await fetch(m.url);
  if (!res.ok || !res.body) {
    console.error(`failed (${res.status})`);
    process.exitCode = 1;
    continue;
  }
  const tmp = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  renameSync(tmp, target);
  console.log(`${(statSync(target).size / 1e6).toFixed(1)} MB`);
}
