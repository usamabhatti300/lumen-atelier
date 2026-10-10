/** Runtime engine status, kept separate from the edit state to avoid needless re-renders. */
import { create } from 'zustand';
import type { HistogramData } from './histogram';

export type EngineMode = 'webgl' | 'cpu' | 'none';

export interface EngineStatus {
  mode: EngineMode;
  maxTextureSize: number;
  floatPipeline: boolean;
  loadingPhoto: boolean;
  photoError: string | null;
  fullSize: { width: number; height: number } | null;
  previewSize: { width: number; height: number } | null;
  /** Rendered (displayed) output size in px. */
  outputSize: { width: number; height: number } | null;
  lastRenderMs: number | null;
  histogram: HistogramData | null;
  /** Bumped whenever a new frame is presented (canvas consumers can react). */
  frame: number;
  /** Pixel size of the displayed canvas (twice as wide in side-by-side mode). */
  canvasSize: { w: number; h: number };
  maskWarnings: Record<string, string>;
}

export const useEngine = create<EngineStatus>(() => ({
  mode: 'none',
  maxTextureSize: 0,
  floatPipeline: false,
  loadingPhoto: false,
  photoError: null,
  fullSize: null,
  previewSize: null,
  outputSize: null,
  lastRenderMs: null,
  histogram: null,
  frame: 0,
  canvasSize: { w: 0, h: 0 },
  maskWarnings: {},
}));
