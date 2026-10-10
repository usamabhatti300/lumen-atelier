/// <reference lib="webworker" />
/**
 * CPU fallback renderer worker. Only the most recent request is processed;
 * older ones are skipped (stale renders cancelled).
 */
import { cpuRender, RenderCancelled, type CpuRenderInput } from '@/lib/engine/cpu/cpuRender';

interface Req extends Omit<CpuRenderInput, 'shouldCancel'> {
  id: number;
}

let latest = 0;

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data;
  latest = req.id;
  // Yield so a burst of slider events collapses to the newest request.
  setTimeout(() => {
    if (req.id !== latest) return;
    const t0 = performance.now();
    try {
      const out = cpuRender({ ...req, shouldCancel: () => req.id !== latest });
      (self as unknown as Worker).postMessage(
        { id: req.id, width: out.width, height: out.height, data: out.data, ms: performance.now() - t0 },
        [out.data.buffer],
      );
    } catch (err) {
      if (err instanceof RenderCancelled) return;
      (self as unknown as Worker).postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) });
    }
  }, 0);
};
