/// <reference lib="webworker" />
/** Runs reference/target statistics and target-aware matching off the main thread. */
import type { PartialAdjustments } from '../schema/adjustments';
import type { MatchFeatures } from '../schema/matchFeatures';
import { matchToTarget } from './match';
import { computeStats, type PixelImage } from './stats';

export type AnalysisRequest =
  | { id: number; kind?: 'stats'; image: PixelImage; detail?: PixelImage }
  | {
      id: number;
      kind: 'match';
      ref: MatchFeatures;
      target: PixelImage;
      generic: PartialAdjustments;
      keepExposure?: number;
    };

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'match') {
      const match = matchToTarget(req.ref, req.target, req.generic, {
        keepExposure: req.keepExposure,
        onProgress: (iteration, max) => post({ id: req.id, progress: { iteration, max } }),
      });
      post({ id: req.id, match });
      return;
    }
    const stats = computeStats(req.image, req.detail);
    post({ id: req.id, stats });
  } catch (err) {
    post({ id: req.id, error: err instanceof Error ? err.message : String(err) });
  }
};
