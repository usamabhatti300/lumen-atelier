/// <reference lib="webworker" />
/** Runs reference/target statistics off the main thread. */
import { computeStats, type PixelImage } from './stats';

self.onmessage = (e: MessageEvent<{ id: number; image: PixelImage; detail?: PixelImage }>) => {
  const { id, image, detail } = e.data;
  try {
    const stats = computeStats(image, detail);
    (self as unknown as Worker).postMessage({ id, stats });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
