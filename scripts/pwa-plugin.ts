/**
 * Build-only Vite plugin for the installable app (PWA):
 * - writes dist/sw.js from src/pwa/sw-template.js with this build's precache list and version;
 * - writes dist/offline-files.json, the on-device AI files (models, MediaPipe, ONNX Runtime)
 *   with their sizes, so Settings can save them for offline use with real byte progress.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Folders cached on first use (or from Settings), not precached: they are large and per-feature. */
export const RUNTIME_DIRS = ['models', 'mediapipe', 'ort'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

const hash = (...parts: (string | Buffer)[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex').slice(0, 12);
};

/** Which app-shell files to precache: everything the app needs to open, minus source maps and unused fallbacks. */
export function isShellFile(rel: string): boolean {
  if (RUNTIME_DIRS.some((d) => rel.startsWith(`${d}/`))) return false;
  if (rel === 'sw.js' || rel === 'offline-files.json') return false;
  // Source maps; legacy .woff duplicates of the .woff2 fonts; the hashed ORT .wasm copy (the app loads /ort/).
  return !/\.(map|woff|wasm)$/.test(rel);
}

export function pwaPlugin(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'lumen-pwa',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!existsSync(join(outDir, 'index.html'))) return;
      const files = walk(outDir).map((abs) => ({ abs, rel: relative(outDir, abs).split(sep).join('/') }));

      const shell = files.filter((f) => isShellFile(f.rel)).sort((a, b) => a.rel.localeCompare(b.rel));
      const precache = shell.map((f) => (f.rel === 'index.html' ? '/' : `/${f.rel}`));
      const template = readFileSync(join(root, 'src/pwa/sw-template.js'), 'utf8');
      const version = hash(template, ...shell.map((f) => f.rel), readFileSync(join(outDir, 'index.html')));

      const runtime = files
        .filter((f) => RUNTIME_DIRS.some((d) => f.rel.startsWith(`${d}/`)) && !f.rel.endsWith('.part'))
        .map((f) => ({ url: `/${f.rel}`, bytes: statSync(f.abs).size }))
        .sort((a, b) => a.url.localeCompare(b.url));
      // Changes only when an AI/runtime file changes, so model caches survive ordinary app updates.
      const runtimeKey = hash(runtime.map((f) => `${f.url}:${f.bytes}`).join('\n'), readFileSync(join(root, 'src/lib/ml/registry.ts')), readFileSync(join(root, 'package-lock.json')));

      const sw = template
        .replace("'__LUMEN_VERSION__'", JSON.stringify(version))
        .replace("'__LUMEN_RUNTIME_KEY__'", JSON.stringify(runtimeKey))
        .replace('__LUMEN_PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, 'offline-files.json'), JSON.stringify({ version: runtimeKey, files: runtime }));
      const kb = shell.reduce((n, f) => n + statSync(f.abs).size, 0) / 1024;
      console.log(`[pwa] sw.js ${version}: ${precache.length} app files precached (${(kb / 1024).toFixed(1)} MB); ${runtime.length} AI files offline-ready on demand`);
    },
  };
}
