/**
 * Engine controller: owns decoded images, the WebGL2 renderer (or the CPU
 * worker fallback), mask rasters and portrait data for the active photo, and
 * re-renders the preview when the editor state changes.
 *
 * Performance notes
 *  - Interactive rendering uses a preview-resolution copy (Settings ->
 *    preview quality); export renders the full-resolution original.
 *  - Renders are coalesced to one per animation frame.
 *  - Derived parameters and mask rasters are cached by input identity.
 *  - The previous photo's bitmaps and GPU intermediates are released on switch.
 */
import { shallow } from 'zustand/shallow';
import { useEditor, effectiveAdjustments } from '@/state/editorStore';
import { useSettings, PREVIEW_SIZES } from '@/state/settingsStore';
import { useEngine } from './engineStore';
import { computeHistogram } from './histogram';
import { GLRenderer, WebGLUnavailableError } from '@/lib/engine/gl/renderer';
import { deriveDevelopParams, type DevelopParams } from '@/lib/engine/params';
import { outputSize, outputToSourceMatrix, frameSize, type Size } from '@/lib/engine/geometry';
import { decodeImageBlob, resizeBitmap, bitmapToImageData, ImageImportError } from '@/lib/image/decode';
import { getOriginal, getLut } from '@/lib/storage/db';
import { rasterizeLayer, maskKey, type SegmentationMaps } from '@/lib/masks/rasterize';
import type { Adjustments, EditState, MaskLayer } from '@/lib/schema/adjustments';
import { RemovalPreview } from './removalPreview';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface PortraitData {
  /** RGBA mask (R skin, G teeth, B iris, A under-eye) in full-image extent. */
  mask: AnyCanvas | ImageData | null;
  segmentation: SegmentationMaps | null;
  faces: number;
}

interface CpuRequest {
  id: number;
  neutral: boolean;
}

class EngineController {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: GLRenderer | null = null;
  private cpuWorker: Worker | null = null;
  private cpuSeq = 0;
  private cpuPending: CpuRequest | null = null;
  private photoId: string | null = null;
  private full: ImageBitmap | null = null;
  private preview: ImageBitmap | null = null;
  private previewData: ImageData | null = null;
  private fullSize: Size | null = null;
  private paramsCache: { adj: Adjustments | null; params: DevelopParams | null } = { adj: null, params: null };
  private maskKeys = new Map<string, string>();
  private maskCanvases = new Map<string, AnyCanvas>();
  private portrait = new Map<string, PortraitData>();
  private segVersion = 0;
  private beforeKey = '';
  private lutKey = '';
  private raf = 0;
  private loadToken = 0;
  private histTimer = 0;
  private initialized = false;
  private listeners = new Set<() => void>();
  /** Preview original with the edit's removals applied (null: none, use `preview`). */
  private removalSource: AnyCanvas | null = null;
  readonly removals = new RemovalPreview((source) => {
    this.removalSource = source;
    this.previewData = null;
    this.beforeKey = '';
    this.applySourceToRenderer();
    this.requestRender();
  });

  /** The canvas element the editor displays. Created lazily. */
  getCanvas(): HTMLCanvasElement {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'editor-canvas';
      this.canvas.setAttribute('aria-label', 'Edited photo');
      this.canvas.setAttribute('role', 'img');
      this.setupRenderer();
    }
    return this.canvas;
  }

  onCanvasReplaced(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.getCanvas();
    useEditor.subscribe(
      (s) => s.activePhotoId,
      (id) => void this.loadPhoto(id),
      { fireImmediately: true },
    );
    useEditor.subscribe(
      (s) => [s.edit, s.compare, s.split, s.tool, s.activeLayerId, s.showMaskOverlay, s.liveStroke] as const,
      () => this.requestRender(),
      { equalityFn: shallow },
    );
    useEditor.subscribe(
      (s) => s.edit.removals,
      (removals) => this.removals.update(removals),
    );
    useSettings.subscribe((s, prev) => {
      if (s.previewQuality !== prev.previewQuality && this.photoId) void this.reloadPreview();
      if (s.forceCpu !== prev.forceCpu) this.switchMode(s.forceCpu ? 'cpu' : 'webgl');
    });
  }

  private setupRenderer() {
    if (useSettings.getState().forceCpu) {
      this.useCpu('CPU rendering selected in settings.');
      return;
    }
    try {
      this.renderer = new GLRenderer(this.canvas!);
      this.renderer.onContextLost = () => {
        this.renderer = null;
        this.useCpu('The GPU context was lost. Switched to CPU rendering.');
      };
      useEngine.setState({
        mode: 'webgl',
        maxTextureSize: this.renderer.maxTextureSize,
        floatPipeline: this.renderer.floatFbo,
      });
    } catch (e) {
      this.useCpu(e instanceof WebGLUnavailableError ? e.message : 'WebGL2 failed to initialise.');
    }
  }

  private switchMode(mode: 'cpu' | 'webgl') {
    this.renderer?.dispose();
    this.renderer = null;
    this.cpuWorker?.terminate();
    this.cpuWorker = null;
    this.canvas = null;
    this.maskKeys.clear();
    this.beforeKey = '';
    this.lutKey = '';
    this.getCanvas();
    if (mode === 'webgl' && this.preview && this.renderer) {
      this.applySourceToRenderer();
      this.applyPortraitToRenderer();
    }
    for (const fn of this.listeners) fn();
    this.requestRender();
  }

  private useCpu(reason: string) {
    // A fresh 2D canvas (a canvas that had a WebGL context cannot provide 2D).
    const replace = this.canvas && this.renderer === null && this.canvas.getContext('2d') === null;
    if (replace) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'editor-canvas';
      this.canvas.setAttribute('aria-label', 'Edited photo');
      this.canvas.setAttribute('role', 'img');
      for (const fn of this.listeners) fn();
    }
    this.cpuWorker = new Worker(new URL('./cpu.worker.ts', import.meta.url), { type: 'module' });
    this.cpuWorker.onmessage = (e: MessageEvent) => this.onCpuResult(e.data);
    useEngine.setState({ mode: 'cpu', floatPipeline: false });
    useEditor.getState().showToast(`${reason} Portrait retouching and mask blur need WebGL2.`, 'info');
    this.requestRender();
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  async loadPhoto(id: string | null) {
    const token = ++this.loadToken;
    this.releasePhoto();
    this.photoId = id;
    if (!id) {
      useEngine.setState({ fullSize: null, previewSize: null, outputSize: null, histogram: null, photoError: null });
      return;
    }
    useEngine.setState({ loadingPhoto: true, photoError: null });
    try {
      const blob = await getOriginal(id);
      if (!blob) throw new ImageImportError('corrupt', 'The original file for this photo is missing from local storage.');
      const name = useEditor.getState().photos.find((p) => p.id === id)?.name ?? 'Photo';
      const decoded = await decodeImageBlob(blob, name);
      if (token !== this.loadToken) {
        decoded.bitmap.close();
        return;
      }
      this.full = decoded.bitmap;
      this.fullSize = { width: decoded.width, height: decoded.height };
      await this.reloadPreview();
      if (token !== this.loadToken) return;
      useEngine.setState({ loadingPhoto: false, fullSize: this.fullSize });
    } catch (e) {
      if (token !== this.loadToken) return;
      useEngine.setState({
        loadingPhoto: false,
        photoError: e instanceof Error ? e.message : 'This photo could not be opened.',
      });
    }
  }

  private async reloadPreview() {
    if (!this.full) return;
    const maxTex = this.renderer?.maxTextureSize ?? 4096;
    const maxSide = Math.min(PREVIEW_SIZES[useSettings.getState().previewQuality], maxTex);
    // The CPU path is much slower; keep its preview small.
    const side = useEngine.getState().mode === 'cpu' ? Math.min(maxSide, 1280) : maxSide;
    const preview = await resizeBitmap(this.full, side);
    this.preview?.close();
    this.preview = preview;
    this.previewData = null;
    this.removalSource = null;
    this.renderer?.releaseIntermediates();
    this.renderer?.setSource(preview, { width: preview.width, height: preview.height });
    this.removals.setBase(this.photoId, preview, useEditor.getState().edit.removals);
    this.maskKeys.clear();
    this.beforeKey = '';
    this.applyPortraitToRenderer();
    useEngine.setState({ previewSize: { width: preview.width, height: preview.height } });
    this.requestRender();
  }

  private releasePhoto() {
    this.full?.close();
    this.preview?.close();
    this.full = null;
    this.preview = null;
    this.previewData = null;
    this.removalSource = null;
    this.removals.setBase(null, null, undefined);
    this.fullSize = null;
    this.maskKeys.clear();
    this.maskCanvases.clear();
    this.beforeKey = '';
    this.renderer?.releaseIntermediates();
    this.renderer?.setPortraitMask(null);
    this.renderer?.pruneLayerMasks(new Set());
  }

  /** Full-resolution original of the active photo (for export / analysis). */
  getFullBitmap(): ImageBitmap | null {
    return this.full;
  }

  getPreviewBitmap(): ImageBitmap | null {
    return this.preview;
  }

  getFullSize(): Size | null {
    return this.fullSize;
  }

  getActivePhotoId(): string | null {
    return this.photoId;
  }

  // -------------------------------------------------------------------------
  // Portrait / segmentation data
  // -------------------------------------------------------------------------

  setPortraitData(photoId: string, data: PortraitData) {
    this.portrait.set(photoId, data);
    if (photoId === this.photoId) {
      this.segVersion++;
      this.maskKeys.clear();
      this.applyPortraitToRenderer();
      this.requestRender();
    }
  }

  getPortraitData(photoId: string): PortraitData | undefined {
    return this.portrait.get(photoId);
  }

  getSegmentation(): SegmentationMaps | null {
    return (this.photoId && this.portrait.get(this.photoId)?.segmentation) || null;
  }

  /** Gives the renderer the preview original, with removals applied when there are any. */
  private applySourceToRenderer() {
    if (!this.renderer || !this.preview) return;
    this.renderer.setSource(this.removalSource ?? this.preview, { width: this.preview.width, height: this.preview.height });
  }

  private applyPortraitToRenderer() {
    if (!this.renderer || !this.photoId) return;
    const p = this.portrait.get(this.photoId);
    this.renderer.setPortraitMask(p?.mask ?? null);
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  requestRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.renderNow();
    });
  }

  private params(adj: Adjustments): DevelopParams {
    if (this.paramsCache.adj !== adj || !this.paramsCache.params) {
      this.paramsCache = { adj, params: deriveDevelopParams(adj) };
    }
    return this.paramsCache.params!;
  }

  /** Layers to render, with the live (in-progress) brush stroke merged into the active layer. */
  private layersForRender(edit: EditState): MaskLayer[] {
    const { liveStroke, activeLayerId } = useEditor.getState();
    if (!liveStroke || !activeLayerId) return edit.layers;
    return edit.layers.map((l) => (l.id === activeLayerId ? { ...l, components: [...l.components, liveStroke] } : l));
  }

  private updateMasks(layers: MaskLayer[]): Record<string, string> {
    const warnings: Record<string, string> = {};
    if (!this.fullSize) return warnings;
    const seg = this.getSegmentation();
    const keep = new Set<string>();
    for (const layer of layers) {
      keep.add(layer.id);
      const key = maskKey(layer, this.segVersion);
      if (this.maskKeys.get(layer.id) !== key) {
        const { canvas, missingSegmentation } = rasterizeLayer(layer, this.fullSize, seg);
        this.maskCanvases.set(layer.id, canvas);
        this.renderer?.setLayerMask(layer.id, canvas);
        this.maskKeys.set(layer.id, key);
        if (missingSegmentation) warnings[layer.id] = 'Subject detection has not run for this photo yet.';
      }
    }
    for (const id of [...this.maskKeys.keys()]) if (!keep.has(id)) {
      this.maskKeys.delete(id);
      this.maskCanvases.delete(id);
    }
    this.renderer?.pruneLayerMasks(keep);
    return warnings;
  }

  getMaskCanvas(layerId: string): AnyCanvas | undefined {
    return this.maskCanvases.get(layerId);
  }

  private async syncLut(edit: EditState) {
    const key = edit.lut?.id ?? '';
    if (key === this.lutKey || !this.renderer) return;
    this.lutKey = key;
    if (!edit.lut) {
      this.renderer.setLut(null);
      return;
    }
    const lut = await getLut(edit.lut.id);
    if (lut && this.renderer) {
      this.renderer.setLut(lut.data, lut.size);
      this.requestRender();
    }
  }

  /** Output size of the preview render for the current view. */
  private previewOutSize(edit: EditState, cropMode: boolean): Size {
    const full = this.fullSize!;
    const scale = this.preview!.width / full.width;
    const size = cropMode ? frameSize(full, edit.geometry) : outputSize(full, edit.geometry);
    return {
      width: Math.max(1, Math.round(size.width * (cropMode ? 1 : 1) * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    };
  }

  private renderNow() {
    if (!this.preview || !this.fullSize) return;
    const state = useEditor.getState();
    const edit = state.edit;
    const cropMode = state.tool === 'crop';
    const out = this.previewOutSize(edit, cropMode);
    const cropOverride = cropMode ? { x: 0, y: 0, w: 1, h: 1 } : undefined;
    const layers = this.layersForRender(edit);
    const editForRender: EditState = layers === edit.layers ? edit : { ...edit, layers };
    const warnings = this.updateMasks(layers);
    if (Object.keys(warnings).length || Object.keys(useEngine.getState().maskWarnings).length) {
      useEngine.setState({ maskWarnings: warnings });
    }

    if (this.renderer) {
      void this.syncLut(edit);
      const t0 = performance.now();
      try {
        const params = this.params(effectiveAdjustments(edit));
        this.renderer.render({ edit: editForRender, params, fullSize: this.fullSize, out, cropOverride });
        const needBefore = state.compare !== 'off';
        const bKey = `${JSON.stringify(edit.geometry)}|${cropMode}|${out.width}x${out.height}`;
        if (needBefore && (bKey !== this.beforeKey || !this.renderer.hasTarget('before'))) {
          this.renderer.render({ edit, params, fullSize: this.fullSize, out, cropOverride, neutral: true });
          this.beforeKey = bKey;
        }
        const overlayLayer = state.showMaskOverlay && state.activeLayerId ? state.activeLayerId : null;
        this.renderer.present({
          mode: state.compare === 'split' ? 'split' : state.compare === 'before' ? 'before' : state.compare === 'side' ? 'side' : 'after',
          split: state.split,
          overlayLayerId: overlayLayer,
          overlayMatrix: outputToSourceMatrix(this.fullSize, edit.geometry, cropOverride ?? edit.geometry.crop),
        });
        const ms = performance.now() - t0;
        const c = this.canvas!;
        useEngine.setState((s) => ({ lastRenderMs: ms, outputSize: out, frame: s.frame + 1, canvasSize: { w: c.width, h: c.height } }));
        this.scheduleHistogram();
      } catch (e) {
        console.error('[engine] GPU render failed', e);
        this.renderer.dispose();
        this.renderer = null;
        this.useCpu('GPU rendering failed on this device.');
      }
      return;
    }
    if (this.cpuWorker) this.renderCpu(editForRender, out);
  }

  private renderCpu(edit: EditState, out: Size) {
    if (!this.preview || !this.fullSize) return;
    if (!this.previewData) this.previewData = bitmapToImageData(this.removalSource ?? this.preview, 1280);
    const id = ++this.cpuSeq;
    this.cpuPending = { id, neutral: false };
    const masks: Record<string, { width: number; height: number; data: Uint8ClampedArray }> = {};
    for (const layer of edit.layers) {
      const c = this.maskCanvases.get(layer.id);
      if (!c) continue;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      const img = ctx.getImageData(0, 0, c.width, c.height);
      masks[layer.id] = { width: img.width, height: img.height, data: img.data };
    }
    const scale = this.previewData.width / this.preview.width;
    this.cpuWorker!.postMessage({
      id,
      source: { width: this.previewData.width, height: this.previewData.height, data: this.previewData.data },
      fullSize: this.fullSize,
      edit,
      out: { width: Math.max(1, Math.round(out.width * scale)), height: Math.max(1, Math.round(out.height * scale)) },
      layerMasks: masks,
    });
  }

  private onCpuResult(msg: { id: number; width: number; height: number; data: Uint8ClampedArray; ms: number; error?: string }) {
    if (!this.cpuPending || msg.id !== this.cpuPending.id || !this.canvas) return;
    if (msg.error) {
      useEditor.getState().showToast(`Rendering failed: ${msg.error}`, 'error');
      return;
    }
    this.canvas.width = msg.width;
    this.canvas.height = msg.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const img = new ImageData(new Uint8ClampedArray(msg.data), msg.width, msg.height);
    ctx.putImageData(img, 0, 0);
    useEngine.setState((s) => ({
      lastRenderMs: msg.ms,
      outputSize: { width: msg.width, height: msg.height },
      frame: s.frame + 1,
      canvasSize: { w: msg.width, h: msg.height },
      histogram: computeHistogram(img),
    }));
  }

  private scheduleHistogram() {
    if (this.histTimer) return;
    this.histTimer = window.setTimeout(() => {
      this.histTimer = 0;
      if (!this.renderer?.hasTarget('after')) return;
      try {
        const small = this.renderer.readTargetScaled('after', 320);
        useEngine.setState({ histogram: computeHistogram(small) });
      } catch {
        /* ignore transient failures */
      }
    }, 160);
  }

  /** Small render of the current edit for thumbnails and comparisons. */
  readRendered(maxSide: number): ImageData | null {
    if (this.renderer?.hasTarget('after')) {
      // Thumbnails should show the final crop, not the crop tool's full frame.
      if (useEditor.getState().tool === 'crop' && this.fullSize && this.preview) {
        const edit = useEditor.getState().edit;
        this.renderer.render({
          edit,
          params: this.params(effectiveAdjustments(edit)),
          fullSize: this.fullSize,
          out: this.previewOutSize(edit, false),
          target: 'thumb',
        });
        return this.renderer.readTargetScaled('thumb', maxSide);
      }
      return this.renderer.readTargetScaled('after', maxSide);
    }
    if (this.canvas && useEngine.getState().mode === 'cpu') {
      const ctx = this.canvas.getContext('2d');
      if (!ctx || this.canvas.width === 0) return null;
      const k = Math.min(1, maxSide / Math.max(this.canvas.width, this.canvas.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(this.canvas.width * k));
      c.height = Math.max(1, Math.round(this.canvas.height * k));
      const cctx = c.getContext('2d')!;
      cctx.drawImage(this.canvas, 0, 0, c.width, c.height);
      return cctx.getImageData(0, 0, c.width, c.height);
    }
    return null;
  }

  /** Re-raster masks at a higher resolution for export. */
  exportMaskRasters(maxSide: number): Map<string, AnyCanvas> {
    const out = new Map<string, AnyCanvas>();
    if (!this.fullSize) return out;
    const seg = this.getSegmentation();
    for (const layer of useEditor.getState().edit.layers) {
      out.set(layer.id, rasterizeLayer(layer, this.fullSize, seg, maxSide).canvas);
    }
    return out;
  }
}

export const engine = new EngineController();
