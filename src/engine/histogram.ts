/** RGB + luminance histograms (256 bins) and clipping indicators. */
export interface HistogramData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
  total: number;
  clippedShadows: number;
  clippedHighlights: number;
}

export function computeHistogram(img: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }): HistogramData {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const l = new Uint32Array(256);
  const d = img.data;
  let total = 0;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const R = d[i];
    const G = d[i + 1];
    const B = d[i + 2];
    r[R]++;
    g[G]++;
    b[B]++;
    l[Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B)]++;
    if (R <= 1 && G <= 1 && B <= 1) lo++;
    if (R >= 254 || G >= 254 || B >= 254) hi++;
    total++;
  }
  return { r, g, b, l, total, clippedShadows: total ? lo / total : 0, clippedHighlights: total ? hi / total : 0 };
}
