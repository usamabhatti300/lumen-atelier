/**
 * Reference-matching evaluation on real photos (opt-in, not part of `npm test`):
 *
 *   MATCH_EVAL=1 MATCH_EVAL_OUT=<dir> npx vitest run src/lib/analysis/match.eval.test.ts
 *
 * References are made by applying known looks (EVAL_LOOKS) with the CPU
 * reference renderer to one photo; every other photo is matched to them with
 * the old method (generic look + exposure/cast adaptation) and the new
 * target-aware method. Prints a metrics table and writes contact sheets
 * (reference | target | old | new) to MATCH_EVAL_OUT. Photos come from the
 * Windows wallpaper folder plus procedural scenes.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EVAL_LOOKS,
  forestScene,
  jungleScene,
  portraitScene,
  streetScene,
  synth,
} from './evalScenes';
import {
  computeStats,
  evaluateRender,
  newMethod,
  oldMethod,
  renderImage,
  type MatchMetrics,
} from './matchEval';
import { targetModel } from './match';
import type { PixelImage } from './stats';

const enabled = !!process.env.MATCH_EVAL;
const OUT = process.env.MATCH_EVAL_OUT ?? 'match-eval-out';
const WALL = 'C:/Windows/Web/Wallpaper';

/** The few sharp calls used here (sharp is an optional, transitive dev dependency; not imported statically). */
interface SharpChain {
  resize(w: number, h: number, o: { fit: string }): SharpChain;
  ensureAlpha(): SharpChain;
  raw(): SharpChain;
  png(): SharpChain;
  composite(c: { input: Buffer; left: number; top: number }[]): SharpChain;
  toBuffer(): Promise<Buffer>;
  toBuffer(o: {
    resolveWithObject: true;
  }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
  toFile(path: string): Promise<unknown>;
}
type Sharp = (input?: unknown, options?: unknown) => SharpChain;

async function loadPhoto(sharp: Sharp, file: string): Promise<PixelImage> {
  const { data, info } = await sharp(file)
    .resize(420, 420, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
  };
}

async function tile(sharp: Sharp, img: PixelImage, w: number, h: number) {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .resize(w, h, { fit: 'cover' })
    .png()
    .toBuffer();
}

const KEYS: (keyof MatchMetrics)[] = [
  'lum',
  'chroma',
  'bandHue',
  'bandChroma',
  'zone',
  'drift',
  'driftMax',
];

describe.skipIf(!enabled)('reference matching evaluation (real photos)', () => {
  it('beats the old method and writes contact sheets', { timeout: 600_000 }, async () => {
    const moduleName = 'sharp';
    const sharp = ((await import(/* @vite-ignore */ moduleName)) as { default: Sharp }).default;
    mkdirSync(OUT, { recursive: true });
    const photo = async (name: string) => loadPhoto(sharp, join(WALL, name));
    const exists = (name: string) =>
      existsSync(join(WALL, name)) && statSync(join(WALL, name)).isFile();

    const scenes: Record<string, PixelImage> = {
      'jungle (generated)': synth(420, 280, jungleScene),
      'forest (generated)': synth(420, 280, forestScene),
      'portrait (generated)': synth(300, 380, portraitScene),
      'street (generated)': synth(420, 280, streetScene),
    };
    const files: Record<string, string> = {
      'beach and blossom': 'Spotlight/img50.jpg',
      'lake and pines': 'ThemeC/img28.jpg',
      'lake, hazy sun': 'ThemeC/img29.jpg',
      'lake sunset': 'ThemeC/img30.jpg',
      'dune lake': 'ThemeC/img31.jpg',
      'orange ribbons': 'ThemeB/img25.jpg',
      'vivid ribbons': 'ThemeB/img24.jpg',
      'sage sculpture': 'ThemeD/img33.jpg',
      'pink sculpture': 'ThemeD/img34.jpg',
      'blue bloom': 'Spotlight/img14.jpg',
    };
    for (const [k, f] of Object.entries(files)) if (exists(f)) scenes[k] = await photo(f);

    // Which photo each look is applied to (the reference), and which photos are matched to it.
    const refSource: Record<string, string> = {
      'muted teal forest': 'forest (generated)',
      'warm golden hour': 'lake, hazy sun',
      'faded matte film': 'lake sunset',
      'high-contrast cool': 'dune lake',
      'desaturated pastel': 'lake, hazy sun',
      'black and white': 'blue bloom',
      'orange-teal': 'orange ribbons',
    };
    const targets = [
      'jungle (generated)',
      'portrait (generated)',
      'street (generated)',
      'beach and blossom',
      'lake and pines',
      'vivid ribbons',
      'sage sculpture',
    ].filter((t) => scenes[t]);

    const rows: {
      look: string;
      target: string;
      old: MatchMetrics;
      neu: MatchMetrics;
      ms: number;
      iters: number;
    }[] = [];
    const W = 240;
    const H = 160;
    for (const [look, values] of Object.entries(EVAL_LOOKS)) {
      const src = scenes[refSource[look]];
      if (!src) continue;
      const refImg = renderImage(src, values);
      const refStats = computeStats(refImg);
      const comps: { input: Buffer; left: number; top: number }[] = [];
      let row = 0;
      for (const name of targets) {
        if (name === refSource[look]) continue;
        const tImg = scenes[name];
        const tStats = computeStats(tImg);
        const t = targetModel(tImg);
        const oldAdj = oldMethod(refStats, tStats);
        const t0 = performance.now();
        const { adjustments: newAdj, result } = newMethod(refStats, t);
        const ms = performance.now() - t0;
        const old = evaluateRender(refStats.features, t, oldAdj).metrics;
        const neu = evaluateRender(refStats.features, t, newAdj).metrics;
        rows.push({ look, target: name, old, neu, ms, iters: result.iterations });
        const tiles = [refImg, tImg, renderImage(tImg, oldAdj), renderImage(tImg, newAdj)];
        for (let c = 0; c < 4; c++)
          comps.push({ input: await tile(sharp, tiles[c], W, H), left: c * W, top: row * H });
        row++;
      }
      await sharp({ create: { width: 4 * W, height: row * H, channels: 3, background: '#000' } })
        .composite(comps)
        .png()
        .toFile(join(OUT, `sheet-${look.replace(/[^a-z]+/gi, '-')}.png`));
    }

    // The owner's reported case, larger: vivid foliage with brown leaves -> muted teal foggy forest.
    {
      const refImg = renderImage(scenes['forest (generated)'], EVAL_LOOKS['muted teal forest']);
      const refStats = computeStats(refImg);
      const tImg = scenes['jungle (generated)'];
      const t = targetModel(tImg);
      const tiles = [
        refImg,
        tImg,
        renderImage(tImg, oldMethod(refStats, computeStats(tImg))),
        renderImage(tImg, newMethod(refStats, t).adjustments),
      ];
      const BW = 420;
      const BH = 280;
      const comps: { input: Buffer; left: number; top: number }[] = [];
      for (let c = 0; c < 4; c++)
        comps.push({
          input: await tile(sharp, tiles[c], BW, BH),
          left: (c % 2) * BW,
          top: Math.floor(c / 2) * BH,
        });
      await sharp({ create: { width: 2 * BW, height: 2 * BH, channels: 3, background: '#000' } })
        .composite(comps)
        .png()
        .toFile(join(OUT, 'forest-case.png'));
    }

    const fmt = (v: number) => v.toFixed(2);
    const mean = (sel: (r: (typeof rows)[number]) => number) =>
      rows.reduce((s, r) => s + sel(r), 0) / rows.length;
    const lines = [
      `| Metric (lower is better) | Old | New |`,
      `| --- | --- | --- |`,
      ...KEYS.map(
        (k) => `| ${k} | ${fmt(mean((r) => r.old[k]))} | ${fmt(mean((r) => r.neu[k]))} |`,
      ),
      '',
      `Pairs: ${rows.length}. Mean match time ${mean((r) => r.ms).toFixed(0)} ms, max ${Math.max(...rows.map((r) => r.ms)).toFixed(0)} ms; mean iterations ${mean((r) => r.iters).toFixed(1)}.`,
      '',
      '| Look | Target | lum old/new | chroma old/new | band hue old/new | band chroma old/new | zone old/new | drift old/new |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(
        (r) =>
          `| ${r.look} | ${r.target} | ${fmt(r.old.lum)} / ${fmt(r.neu.lum)} | ${fmt(r.old.chroma)} / ${fmt(r.neu.chroma)} | ${fmt(r.old.bandHue)} / ${fmt(r.neu.bandHue)} | ${fmt(r.old.bandChroma)} / ${fmt(r.neu.bandChroma)} | ${fmt(r.old.zone)} / ${fmt(r.neu.zone)} | ${fmt(r.old.drift)} / ${fmt(r.neu.drift)} |`,
      ),
    ];
    writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
    console.log(lines.join('\n'));
    expect(mean((r) => r.neu.lum)).toBeLessThan(mean((r) => r.old.lum));
    expect(mean((r) => r.neu.chroma)).toBeLessThan(mean((r) => r.old.chroma));
  });
});
