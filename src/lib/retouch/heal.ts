/**
 * Automatic source selection for the healing tool. For a spot of radius r we
 * test candidate source positions on rings around the spot and pick the one
 * whose surrounding texture best matches the spot's own surroundings (sum of
 * squared differences over an annulus), excluding the spot itself so the
 * blemish is not copied. The shader then clones from that source and matches
 * colour at the boundary.
 */
export interface PixelSource {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function findHealOffset(
  img: PixelSource,
  /** Spot centre and radius, normalized (radius relative to the long edge). */
  spot: { x: number; y: number; r: number },
): { dx: number; dy: number } {
  const { width: W, height: H, data } = img;
  const long = Math.max(W, H);
  const cx = spot.x * W;
  const cy = spot.y * H;
  const rp = Math.max(1.5, spot.r * long);
  const lum = (x: number, y: number) => {
    const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
    const i = (yi * W + xi) * 4;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };
  // Annulus samples (between 1.1r and 1.8r) describe the neighbourhood.
  const samples: [number, number][] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    for (const f of [1.15, 1.45, 1.8]) samples.push([Math.cos(a) * rp * f, Math.sin(a) * rp * f]);
  }
  const target = samples.map(([sx, sy]) => lum(cx + sx, cy + sy));
  let best = { dx: rp * 2.4, dy: 0, score: Infinity };
  for (const dist of [2.4, 3.2, 4.4]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const ox = Math.cos(a) * rp * dist;
      const oy = Math.sin(a) * rp * dist;
      const sx0 = cx + ox;
      const sy0 = cy + oy;
      if (sx0 - rp * 1.8 < 0 || sy0 - rp * 1.8 < 0 || sx0 + rp * 1.8 >= W || sy0 + rp * 1.8 >= H) continue;
      let ssd = 0;
      for (let i = 0; i < samples.length; i++) {
        const d = lum(sx0 + samples[i][0], sy0 + samples[i][1]) - target[i];
        ssd += d * d;
      }
      // Also prefer a smooth source interior (no blemish of its own).
      let interior = 0;
      const centre = lum(sx0, sy0);
      for (let k2 = 0; k2 < 8; k2++) {
        const a2 = (k2 / 8) * Math.PI * 2;
        const d = lum(sx0 + Math.cos(a2) * rp * 0.6, sy0 + Math.sin(a2) * rp * 0.6) - centre;
        interior += d * d;
      }
      const score = ssd / samples.length + interior / 8 + dist * 4;
      if (score < best.score) best = { dx: ox, dy: oy, score };
    }
  }
  return { dx: best.dx / W, dy: best.dy / H };
}
