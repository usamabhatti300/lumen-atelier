import { describe, expect, it } from 'vitest';
import { defaultGeometry, type Geometry } from '../schema/adjustments';
import {
  apply,
  applyAspect,
  cropFitsRotation,
  fitCropToRotation,
  invert,
  mul,
  outputSize,
  outputToSourceMatrix,
  IDENTITY,
} from './geometry';

const src = { width: 400, height: 200 };
const g = (patch: Partial<Geometry>): Geometry => ({ ...defaultGeometry(), ...patch });
const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('geometry', () => {
  it('identity geometry maps output to source unchanged', () => {
    const m = outputToSourceMatrix(src, g({}));
    close(apply(m, 0.25, 0.75), [0.25, 0.75]);
  });

  it('crop maps output corners to the crop rectangle', () => {
    const m = outputToSourceMatrix(src, g({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } }));
    close(apply(m, 0, 0), [0.1, 0.2]);
    close(apply(m, 1, 1), [0.6, 0.6]);
    expect(outputSize(src, g({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } }))).toEqual({ width: 200, height: 80 });
  });

  it('rotate 90 clockwise swaps output dimensions and maps corners', () => {
    const geo = g({ rotate90: 1 });
    expect(outputSize(src, geo)).toEqual({ width: 200, height: 400 });
    const m = outputToSourceMatrix(src, geo);
    // Output top-left shows the source bottom-left after a clockwise rotation.
    close(apply(m, 0, 0), [0, 1]);
    close(apply(m, 1, 0), [0, 0]);
  });

  it('rotate 180 and 270 behave', () => {
    close(apply(outputToSourceMatrix(src, g({ rotate90: 2 })), 0, 0), [1, 1]);
    close(apply(outputToSourceMatrix(src, g({ rotate90: 3 })), 0, 0), [1, 0]);
  });

  it('horizontal flip mirrors x', () => {
    close(apply(outputToSourceMatrix(src, g({ flipH: true })), 0.2, 0.3), [0.8, 0.3]);
  });

  it('matrix inverse round-trips', () => {
    const m = outputToSourceMatrix(src, g({ rotate90: 1, straighten: 7, flipV: true, crop: { x: 0.1, y: 0.1, w: 0.7, h: 0.8 } }));
    const back = mul(m, invert(m));
    back.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i], 6));
  });

  it('straightening shrinks the crop to stay inside the image', () => {
    const frame = { width: 400, height: 200 };
    const full = { x: 0, y: 0, w: 1, h: 1 };
    expect(cropFitsRotation(full, 10, frame)).toBe(false);
    const fitted = fitCropToRotation(full, 10, frame);
    expect(cropFitsRotation(fitted, 10, frame)).toBe(true);
    expect(fitted.w).toBeLessThan(1);
    expect(fitted.w).toBeGreaterThan(0.5);
  });

  it('aspect ratio produces the requested pixel aspect', () => {
    const frame = { width: 400, height: 200 };
    const c = applyAspect({ x: 0, y: 0, w: 1, h: 1 }, 1, frame);
    expect((c.w * frame.width) / (c.h * frame.height)).toBeCloseTo(1, 6);
  });
});
