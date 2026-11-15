import { describe, expect, it } from 'vitest';
import { MAX_HEAL_SPOTS } from '../schema/adjustments';
import { retouchFrag } from '../engine/gl/shaders';
import { underEyeEllipse, type Landmark } from './faceMask';

// A level eye, 100 x 30 px in a 1000 x 1000 image, with its brow above it.
const W = 1000;
const H = 1000;
const eye: Landmark[] = [
  { x: 0.4, y: 0.5 },
  { x: 0.45, y: 0.485 },
  { x: 0.5, y: 0.5 },
  { x: 0.45, y: 0.515 },
];
const brow: Landmark[] = [
  { x: 0.4, y: 0.45 },
  { x: 0.5, y: 0.45 },
];
const rotate = (pts: Landmark[], deg: number, about = { x: 0.45, y: 0.5 }) => {
  const r = (deg * Math.PI) / 180;
  return pts.map((p) => ({
    x: about.x + (p.x - about.x) * Math.cos(r) - (p.y - about.y) * Math.sin(r),
    y: about.y + (p.x - about.x) * Math.sin(r) + (p.y - about.y) * Math.cos(r),
  }));
};

describe('under-eye area', () => {
  it('sits where it always did under a level eye', () => {
    const e = underEyeEllipse(eye, brow, W, H, 400);
    // The old mask: centred under the eye's box, 0.9 eye heights below the lower lid.
    expect(e.eyeH).toBeCloseTo(30, 5);
    expect(e.cx).toBeCloseTo(450, 5);
    expect(e.cy).toBeCloseTo(515 + 27, 5);
    expect(e.rx).toBeCloseTo(50 * 0.95, 5);
    expect(e.ry).toBeCloseTo(30 * 0.75, 5);
    expect(e.angle).toBeCloseTo(0, 5);
  });

  it('turns with a tilted head and stays on the side away from the brow', () => {
    for (const deg of [25, -25, 60]) {
      const e = underEyeEllipse(rotate(eye, deg), rotate(brow, deg), W, H, 400);
      // The level ellipse centre, rotated with the face.
      const [c] = rotate([{ x: 0.45, y: 0.542 }], deg);
      expect(e.cx).toBeCloseTo(c.x * W, 3);
      expect(e.cy).toBeCloseTo(c.y * H, 3);
      expect(Math.abs(Math.tan(e.angle) - Math.tan((deg * Math.PI) / 180))).toBeLessThan(1e-6);
      expect(e.rx).toBeCloseTo(47.5, 3);
    }
  });

  it('goes above the eye on an upside-down face', () => {
    const e = underEyeEllipse(rotate(eye, 180), rotate(brow, 180), W, H, 400);
    expect(e.cy).toBeLessThan(500);
  });
});

describe('heal spots', () => {
  it('the shader draws as many spots as an edit can hold', () => {
    const src = retouchFrag(true);
    expect(src).toContain(`uniform vec4 u_spots[${MAX_HEAL_SPOTS}]`);
    expect(src).toContain(`uniform vec2 u_spotOff[${MAX_HEAL_SPOTS}]`);
    expect(src).toContain(`i < ${MAX_HEAL_SPOTS}; i++`);
  });
});
