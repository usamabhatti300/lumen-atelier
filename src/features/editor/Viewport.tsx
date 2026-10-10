/**
 * Canvas viewport: hosts the engine's canvas, handles fit / zoom / pan, and
 * renders interactive overlays (before/after divider, crop, mask tools, heal).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ImagePlus, Loader2 } from 'lucide-react';
import { engine } from '@/engine/controller';
import { useEngine } from '@/engine/engineStore';
import { useEditor } from '@/state/editorStore';
import { frameSize, outputSize } from '@/lib/engine/geometry';
import { CropOverlay } from './overlays/CropOverlay';
import { MaskToolOverlay } from './overlays/MaskToolOverlay';
import { SplitDivider } from './overlays/SplitDivider';
import { FocusOverlay } from './overlays/FocusOverlay';

export interface ViewBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARGIN = 28;

export function Viewport({ onImport }: { onImport: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const canvasSize = useEngine((s) => s.canvasSize);
  const loading = useEngine((s) => s.loadingPhoto);
  const error = useEngine((s) => s.photoError);
  const full = useEngine((s) => s.fullSize);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const zoom = useEditor((s) => s.zoom);
  const compare = useEditor((s) => s.compare);
  const tool = useEditor((s) => s.tool);
  const geometry = useEditor((s) => s.edit.geometry);
  const setUi = useEditor((s) => s.setUi);
  // Reset pan when the photo changes (state derived during render, no effect needed).
  const [panPhoto, setPanPhoto] = useState(activePhotoId);
  if (panPhoto !== activePhotoId) {
    setPanPhoto(activePhotoId);
    setPan({ x: 0, y: 0 });
  }

  // Mount the engine canvas into whichever host is current (the reveal wrapper
  // remounts per photo), and re-attach if the engine swaps canvases (CPU fallback).
  const attachCanvas = useCallback((el: HTMLDivElement | null) => {
    host.current = el;
    if (!el) return;
    const c = engine.getCanvas();
    if (c.parentElement !== el) el.replaceChildren(c);
  }, []);
  useLayoutEffect(
    () =>
      engine.onCanvasReplaced(() => {
        const c = engine.getCanvas();
        if (host.current && c.parentElement !== host.current) host.current.replaceChildren(c);
      }),
    [],
  );

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === 'Space' && !(e.target instanceof HTMLInputElement) && setSpaceDown(true);
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Full-resolution width of what the canvas shows (for true 100% zoom).
  const shownFullWidth = full
    ? (tool === 'crop' ? frameSize(full, geometry) : outputSize(full, geometry)).width * (compare === 'side' ? 2 : 1)
    : 1;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const fitScale =
    canvasSize.w && size.w
      ? Math.min((size.w - MARGIN * 2) / canvasSize.w, (size.h - MARGIN * 2) / canvasSize.h)
      : 1;
  const previewToFull = canvasSize.w ? shownFullWidth / canvasSize.w : 1;
  const scale = zoom === 'fit' ? fitScale : (zoom * previewToFull) / dpr;
  const displayW = canvasSize.w * scale;
  const displayH = canvasSize.h * scale;
  const fitted = zoom === 'fit';
  const box: ViewBox = {
    left: (size.w - displayW) / 2 + (fitted ? 0 : pan.x),
    top: (size.h - displayH) / 2 + (fitted ? 0 : pan.y),
    width: displayW,
    height: displayH,
  };
  const currentZoom = (scale * dpr) / previewToFull;

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const next = Math.min(8, Math.max(0.05, currentZoom * factor));
      const k = next / currentZoom;
      // Keep the point under the cursor fixed.
      const ox = cx - size.w / 2 - (fitted ? 0 : pan.x);
      const oy = cy - size.h / 2 - (fitted ? 0 : pan.y);
      setPan({ x: (fitted ? 0 : pan.x) - ox * (k - 1), y: (fitted ? 0 : pan.y) - oy * (k - 1) });
      setUi({ zoom: next });
    },
    [currentZoom, size, pan, fitted, setUi],
  );

  const toolActive = tool !== 'none' && tool !== 'crop' && tool !== 'focus';
  const canPan = !fitted && (tool === 'none' || spaceDown);

  return (
    <div
      ref={container}
      className="relative h-full w-full touch-none overflow-hidden bg-ink-950"
      style={{ cursor: canPan ? (isPanning ? 'grabbing' : 'grab') : undefined }}
      onWheel={(e) => {
        if (!activePhotoId || !canvasSize.w) return;
        const rect = container.current!.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top);
      }}
      onPointerDown={(e) => {
        if (!canPan || (e.button !== 0 && e.button !== 1)) return;
        panning.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        setIsPanning(true);
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!panning.current) return;
        setPan({ x: panning.current.px + e.clientX - panning.current.x, y: panning.current.py + e.clientY - panning.current.y });
      }}
      onPointerUp={() => {
        panning.current = null;
        setIsPanning(false);
      }}
      data-testid="viewport"
    >
      <motion.div
        key={activePhotoId ?? 'none'}
        initial={{ opacity: 0 }}
        animate={{ opacity: activePhotoId && !loading && !error ? 1 : 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="absolute"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      >
        <div ref={attachCanvas} className="h-full w-full shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] [&>canvas]:h-full [&>canvas]:w-full" />
        {activePhotoId && !loading && compare === 'split' && tool !== 'crop' && <SplitDivider box={box} />}
        {compare === 'split' && tool !== 'crop' && (
          <div className="pointer-events-none absolute top-2 flex w-full justify-between px-2 font-mono text-[10px] tracking-widest text-ivory/80 uppercase">
            <span className="rounded-xs bg-ink-950/60 px-1.5 py-0.5">Before</span>
            <span className="rounded-xs bg-ink-950/60 px-1.5 py-0.5">After</span>
          </div>
        )}
        {compare === 'side' && (
          <div className="pointer-events-none absolute top-2 flex w-full px-2 font-mono text-[10px] tracking-widest text-ivory/80 uppercase">
            <span className="w-1/2 rounded-xs px-1.5 py-0.5">Before</span>
            <span className="w-1/2 rounded-xs px-1.5 py-0.5 text-right">After</span>
          </div>
        )}
        {compare === 'before' && (
          <span className="pointer-events-none absolute top-2 left-2 rounded-xs bg-ink-950/60 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-ivory/80 uppercase">
            Before
          </span>
        )}
      </motion.div>

      {activePhotoId && !loading && !error && tool === 'crop' && <CropOverlay box={box} />}
      {activePhotoId && !loading && !error && toolActive && compare !== 'side' && !spaceDown && <MaskToolOverlay box={box} />}
      {activePhotoId && !loading && !error && tool === 'focus' && compare !== 'side' && !spaceDown && <FocusOverlay box={box} />}

      {!fitted && activePhotoId && currentZoom > previewToFull * 1.01 && (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-xs bg-ink-950/80 px-2 py-1 text-[11px] text-mute">
          Preview resolution. Export renders full detail.
        </p>
      )}

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="animate-spin text-faint" size={22} aria-label="Loading photo" />
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div role="alert" className="max-w-sm rounded-md border border-safelight/40 bg-ink-850 p-5 text-center">
            <AlertTriangle className="mx-auto mb-2 text-safelight" size={20} />
            <p className="text-sm text-ivory">{error}</p>
            <p className="mt-2 text-xs text-mute">Remove this photo from the filmstrip, or import it again.</p>
          </div>
        </div>
      )}
      {!activePhotoId && !loading && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <button type="button" onClick={onImport} className="group flex max-w-sm flex-col items-center rounded-md border border-dashed border-line px-10 py-12 text-center hover:border-line-strong">
            <ImagePlus className="mb-3 text-faint group-hover:text-amber" size={26} />
            <span className="font-display text-2xl text-ivory-dim">Add a photo to edit</span>
            <span className="mt-1 text-sm text-mute">Drop files here or click to choose. JPEG, PNG and WebP.</span>
          </button>
        </div>
      )}
    </div>
  );
}
