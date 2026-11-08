/// <reference lib="webworker" />
/**
 * Portrait models off the main thread: MediaPipe start-up (seconds on slow devices) and detection
 * run here, so opening a photo never freezes the page. One request at a time, in order; the models
 * stay loaded between photos.
 */
import { ModelsMissingError } from './mediapipe';
import { runPortraitModels } from './portraitModels';

declare const self: DedicatedWorkerGlobalScope;

// MediaPipe loads its ES-module WASM glue with `self.import` when defined, else `import()`, once per
// model, and clears `self.ModuleFactory` after each. `import()` caches a module and won't run it a
// second time, so each load gets its own URL (`?instance=n`, same origin, so the CSP's script-src
// 'self' allows it; the service worker matches runtime files without the query). In dev, Vite refuses
// `import()` of files in public/, so there the glue is loaded from a blob URL instead.
let instance = 0;
(self as unknown as { import: (url: string) => Promise<unknown> }).import = async (url: string) => {
  instance++;
  if (!import.meta.env.DEV) return import(/* @vite-ignore */ `${url}${url.includes('?') ? '&' : '?'}instance=${instance}`);
  const code = await (await fetch(url)).text();
  const blob = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ blob);
  } finally {
    URL.revokeObjectURL(blob);
  }
};

let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
  const { id, bitmap } = e.data;
  queue = queue.then(async () => {
    try {
      const r = await runPortraitModels(bitmap);
      const s = r.segmentation;
      const transfer: Transferable[] = s ? [...Object.values(s.maps).map((m) => m.buffer as ArrayBuffer), s.faceSkin.buffer as ArrayBuffer] : [];
      self.postMessage({ id, ok: true, result: r }, transfer);
    } catch (err) {
      self.postMessage({ id, ok: false, missing: err instanceof ModelsMissingError, message: err instanceof Error ? err.message : String(err) });
    } finally {
      bitmap.close();
    }
  });
};
