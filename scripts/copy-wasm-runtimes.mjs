// Copies the WebAssembly runtimes into public/ so they are served from our
// own origin (no third-party CDN at runtime). Runs on `npm install`.
//   MediaPipe Tasks Vision  -> public/mediapipe/wasm
//   ONNX Runtime Web        -> public/ort  (the asyncify binary used by onnxruntime-web/webgpu)
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const mediapipe = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
if (existsSync(mediapipe)) {
  const dest = join(root, 'public', 'mediapipe', 'wasm');
  mkdirSync(dest, { recursive: true });
  cpSync(mediapipe, dest, { recursive: true });
  console.log(`[copy-wasm] MediaPipe runtime -> ${dest}`);
} else {
  console.log('[copy-wasm] @mediapipe/tasks-vision not installed yet; skipping.');
}

const ortDist = join(root, 'node_modules', 'onnxruntime-web', 'dist');
// Only the binary: the onnxruntime-web/webgpu bundle embeds its JS loader.
const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.wasm'];
if (existsSync(ortDist)) {
  const dest = join(root, 'public', 'ort');
  mkdirSync(dest, { recursive: true });
  for (const f of ORT_FILES) cpSync(join(ortDist, f), join(dest, f));
  console.log(`[copy-wasm] ONNX Runtime Web -> ${dest}`);
} else {
  console.log('[copy-wasm] onnxruntime-web not installed yet; skipping.');
}
