/**
 * Memory on phones. The app has two AI runtimes, each in its own worker: MediaPipe (faces and
 * person segmentation) and ONNX Runtime (Select object, Remove, depth, upscale). Each keeps a
 * WebAssembly heap that only grows, and with both alive after a few tools a phone browser can
 * run out of memory and kill the page ("Aw, Snap": seen on a Galaxy S23, 2026-11-15, going
 * from Portrait to Masks, Select object).
 *
 * So on touch devices only one runtime is kept alive: when one starts work, the other is shut
 * down if it is idle. Nothing is lost by this: results (masks, faces, depth) live on the main
 * thread or in the cache; a runtime that is needed again loads its model again, from the app's
 * own files. Desktop keeps both, where memory is not the limit and reloading would only be slower.
 */
type Runtime = 'ml' | 'portrait';

const releasers: Partial<Record<Runtime, () => boolean>> = {};

/** Each worker client registers how to shut its worker down when idle. */
export function registerRuntime(name: Runtime, releaseIfIdle: () => boolean) {
  releasers[name] = releaseIfIdle;
}

export function memoryConstrained(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** `name` is about to do work: give back the memory of the other runtime if it is idle. */
export function runtimeStarting(name: Runtime) {
  for (const other of Object.keys(releasers) as Runtime[]) if (other !== name) releasers[other]?.();
}
