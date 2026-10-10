/**
 * On-device render benchmark. Renders a synthetic photo-like image through the
 * full pipeline with a demanding edit and forces GPU completion with a pixel
 * read-back each iteration, so the timings are real (not just command submission).
 */
import { GLRenderer } from '@/lib/engine/gl/renderer';
import { deriveDevelopParams } from '@/lib/engine/params';
import { createCanvas } from '@/lib/image/decode';
import { defaultEditState, mergeAdjustments, defaultAdjustments } from '@/lib/schema/adjustments';

export interface BenchmarkResult {
  width: number;
  height: number;
  iterations: number;
  medianMs: number;
  p90Ms: number;
  simpleMedianMs: number;
}

function syntheticImage(w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const u = x / w;
      const v = y / h;
      const n = (Math.sin(x * 0.37) * Math.cos(y * 0.29) + 1) * 20;
      img.data[i] = Math.min(255, 40 + u * 180 + n);
      img.data[i + 1] = Math.min(255, 60 + v * 150 + n);
      img.data[i + 2] = Math.min(255, 90 + (1 - u) * 120 + n);
      img.data[i + 3] = 255;
    }
  return img;
}

export async function runBenchmark(side = 2048, iterations = 12): Promise<BenchmarkResult> {
  const w = side;
  const h = Math.round(side * (2 / 3));
  const renderer = new GLRenderer(createCanvas(4, 4) as HTMLCanvasElement);
  try {
    const bmp = await createImageBitmap(syntheticImage(w, h));
    renderer.setSource(bmp, { width: w, height: h });
    const heavy = mergeAdjustments(defaultAdjustments(), {
      basic: { exposure: 0.3, contrast: 20, highlights: -30, shadows: 25, vibrance: 15 },
      presence: { clarity: 25, texture: 15, dehaze: 10 },
      detail: { sharpening: 40, noiseReduction: 20 },
      hsl: { green: { hue: 10, saturation: -20 }, orange: { saturation: 10 } },
      curves: { master: [[0, 0.05], [0.5, 0.48], [1, 0.97]] },
      grading: { shadows: { hue: 200, saturation: 20 }, highlights: { hue: 50, saturation: 15 } },
      effects: { vignette: -20, grain: 20 },
    });
    const run = (adjustments: typeof heavy) => {
      const edit = { ...defaultEditState(), adjustments };
      const params = deriveDevelopParams(adjustments);
      const times: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        renderer.render({ edit, params, fullSize: { width: w, height: h }, out: { width: w, height: h }, target: 'bench' });
        renderer.readTargetScaled('bench', 4); // forces the GPU to finish
        times.push(performance.now() - t0);
      }
      times.shift(); // first run includes shader compilation
      times.sort((a, b) => a - b);
      return times;
    };
    const t = run(heavy);
    const simple = run(mergeAdjustments(defaultAdjustments(), { basic: { exposure: 0.3 } }));
    bmp.close();
    return {
      width: w,
      height: h,
      iterations,
      medianMs: t[Math.floor(t.length / 2)],
      p90Ms: t[Math.floor(t.length * 0.9)],
      simpleMedianMs: simple[Math.floor(simple.length / 2)],
    };
  } finally {
    renderer.dispose();
  }
}
