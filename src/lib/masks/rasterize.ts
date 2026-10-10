/**
 * Rasterizes a mask layer's vector components into an RGBA canvas whose ALPHA
 * channel is the mask (1 = full effect). Components are composited in order:
 * "add" unions coverage, "erase" removes it. All geometry is stored in
 * normalized source-image coordinates, so masks are resolution independent
 * and survive crops/rotations (which happen later in the pipeline).
 */
import type { MaskComponent, MaskLayer, SegmentTarget } from '../schema/adjustments';
import { createCanvas } from '../image/decode';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface SegmentationMaps {
  width: number;
  height: number;
  /** Per-target confidence 0..255, row-major. */
  maps: Record<SegmentTarget, Uint8ClampedArray>;
}

export const MASK_MAX_SIDE = 1536;

export function maskCanvasSize(full: { width: number; height: number }, maxSide = MASK_MAX_SIDE) {
  const k = Math.min(1, maxSide / Math.max(full.width, full.height));
  return { width: Math.max(1, Math.round(full.width * k)), height: Math.max(1, Math.round(full.height * k)) };
}

export interface RasterResult {
  canvas: AnyCanvas;
  /** True when a segment component could not be drawn (no segmentation available). */
  missingSegmentation: boolean;
}

export function rasterizeLayer(
  layer: Pick<MaskLayer, 'components'>,
  full: { width: number; height: number },
  segmentation: SegmentationMaps | null,
  maxSide = MASK_MAX_SIDE,
): RasterResult {
  const { width, height } = maskCanvasSize(full, maxSide);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as Ctx2D;
  const temp = createCanvas(width, height);
  const tctx = temp.getContext('2d') as Ctx2D;
  let missingSegmentation = false;

  for (const comp of layer.components) {
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    tctx.filter = 'none';
    tctx.clearRect(0, 0, width, height);
    let alpha = 1;
    const drawn = drawComponent(tctx, comp, width, height, segmentation);
    if (drawn === 'missing') missingSegmentation = true;
    if (comp.type === 'brush') alpha = comp.opacity;
    tctx.restore();
    if (drawn !== 'drawn') continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = comp.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.drawImage(temp as CanvasImageSource, 0, 0);
    ctx.restore();
  }
  return { canvas, missingSegmentation };
}

function drawComponent(
  ctx: Ctx2D,
  comp: MaskComponent,
  W: number,
  H: number,
  seg: SegmentationMaps | null,
): 'drawn' | 'missing' | 'empty' {
  const longEdge = Math.max(W, H);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  switch (comp.type) {
    case 'brush': {
      if (comp.points.length === 0) return 'empty';
      const radius = (comp.size * longEdge) / 2;
      const blur = radius * comp.softness * 0.6;
      const core = Math.max(0.5, radius - blur * 1.2);
      if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = core * 2;
      const [x0, y0] = comp.points[0];
      if (comp.points.length === 1) {
        ctx.beginPath();
        ctx.arc(x0 * W, y0 * H, core, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x0 * W, y0 * H);
        for (const [x, y] of comp.points.slice(1)) ctx.lineTo(x * W, y * H);
        ctx.stroke();
      }
      return 'drawn';
    }
    case 'linear': {
      const g = ctx.createLinearGradient(comp.x0 * W, comp.y0 * H, comp.x1 * W, comp.y1 * H);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      return 'drawn';
    }
    case 'radial': {
      const draw = () => {
        ctx.save();
        ctx.translate(comp.cx * W, comp.cy * H);
        ctx.rotate((comp.rotation * Math.PI) / 180);
        ctx.scale(Math.max(comp.rx * longEdge, 0.5), Math.max(comp.ry * longEdge, 0.5));
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        const inner = Math.min(0.999, Math.max(0, 1 - comp.feather));
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(inner, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      if (comp.invert) {
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'destination-out';
        draw();
      } else draw();
      return 'drawn';
    }
    case 'segment': {
      if (!seg) return 'missing';
      const src = seg.maps[comp.target];
      const img = new ImageData(seg.width, seg.height);
      for (let i = 0, j = 0; i < src.length; i++, j += 4) {
        img.data[j] = 255;
        img.data[j + 1] = 255;
        img.data[j + 2] = 255;
        img.data[j + 3] = src[i];
      }
      const tmp = createCanvas(seg.width, seg.height);
      (tmp.getContext('2d') as Ctx2D).putImageData(img, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tmp as CanvasImageSource, 0, 0, W, H);
      return 'drawn';
    }
  }
}

/** Stable key for caching rasterized masks. */
export function maskKey(layer: Pick<MaskLayer, 'components'>, segVersion: number): string {
  return `${segVersion}:${JSON.stringify(layer.components)}`;
}
