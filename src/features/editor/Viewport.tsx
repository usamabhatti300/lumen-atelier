/**
 * Canvas viewport: hosts the engine's canvas, handles fit / zoom / pan, and
 * renders interactive overlays (before/after divider, crop, mask tools, heal).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ImagePlus, Loader2 } from 'lucide-react';
import { engine } from '@/engine/controller';
import { useEngine } from '@/engine/engineStore';
import { motionReduced, tick } from '@/lib/haptics';
import { useEditor } from '@/state/editorStore';
import { frameSize, outputSize } from '@/lib/engine/geometry';
import { CropOverlay } from './overlays/CropOverlay';
import { MaskToolOverlay } from './overlays/MaskToolOverlay';
import { RemoveToolOverlay } from './overlays/RemoveToolOverlay';
import { SplitDivider } from './overlays/SplitDivider';
import { FocusOverlay } from './overlays/FocusOverlay';
import { TouchModeChip } from './overlays/TouchModeChip';
import { useMediaQuery } from '@/lib/useMediaQuery';

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
  // Touch gestures: active touch points, the pinch that started from them, and the last tap (double-tap zoom).
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; zoom: number; pan: { x: number; y: number } } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const coarse = useMediaQuery('(pointer: coarse)');
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
  // Pinch and double-tap only where a finger does not already draw or drag something.
  const canPinch = !!activePhotoId && !!canvasSize.w && tool === 'none';

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = container.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const pinchFrame = () => {
    const [a, b] = [...touches.current.values()];
    return { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  // Press and hold the photo (one finger, still) to see the original; let go to return.
  const hold = useRef<{ timer: number; x: number; y: number; on: boolean } | null>(null);
  const endHold = () => {
    const h = hold.current;
    hold.current = null;
    if (!h) return;
    window.clearTimeout(h.timer);
    if (h.on) setUi({ compare: 'off' });
  };
  const onTouchDown = (e: React.PointerEvent) => {
    touches.current.set(e.pointerId, local(e));
    endHold();
    if (touches.current.size === 2) {
      // A second finger turns a pan into a pinch.
      panning.current = null;
      setIsPanning(false);
      const f = pinchFrame();
      pinch.current = { ...f, zoom: currentZoom, pan: fitted ? { x: 0, y: 0 } : pan };
      lastTap.current = null;
      return true;
    }
    const p = local(e);
    const prev = lastTap.current;
    if (prev && e.timeStamp - prev.t < 320 && Math.hypot(p.x - prev.x, p.y - prev.y) < 32) {
      lastTap.current = null;
      if (fitted) zoomAt(Math.max(1, currentZoom * 2.5) / currentZoom, p.x, p.y);
      else setUi({ zoom: 'fit' });
      return true;
    }
    lastTap.current = { t: e.timeStamp, x: p.x, y: p.y };
    if (useEditor.getState().compare === 'off') {
      const h = { x: p.x, y: p.y, on: false, timer: 0 };
      h.timer = window.setTimeout(() => {
        if (hold.current !== h || touches.current.size !== 1) return;
        h.on = true;
        tick();
        setUi({ compare: 'before' });
      }, 320);
      hold.current = h;
    }
    return false;
  };
  const onTouchMove = (e: React.PointerEvent) => {
    if (!touches.current.has(e.pointerId)) return false;
    const at = local(e);
    touches.current.set(e.pointerId, at);
    const h = hold.current;
    if (h && !h.on && Math.hypot(at.x - h.x, at.y - h.y) > 10) endHold();
    const start = pinch.current;
    if (!start || touches.current.size !== 2) return false;
    const f = pinchFrame();
    const next = Math.min(8, Math.max(0.05, (start.zoom * f.dist) / start.dist));
    const k = next / start.zoom;
    // Keep the content under the pinch centre fixed, and follow the centre as the fingers move.
    const ox = start.mid.x - size.w / 2 - start.pan.x;
    const oy = start.mid.y - size.h / 2 - start.pan.y;
    setPan({ x: start.pan.x - ox * (k - 1) + f.mid.x - start.mid.x, y: start.pan.y - oy * (k - 1) + f.mid.y - start.mid.y });
    setUi({ zoom: next });
    return true;
  };
  const lookId = useEditor((s) => s.edit.appliedPreset?.id ?? null);
  const [sweep, setSweep] = useState(0);
  const lastLook = useRef<{ photo: string | null; look: string | null } | null>(null);
  const pendingSweep = useRef(false);
  const frame = useEngine((s) => s.frame);
  useEffect(() => {
    const prev = lastLook.current;
    lastLook.current = { photo: activePhotoId, look: lookId };
    // Only a new look on the same photo sweeps; opening a photo with a look already applied doesn't.
    if (prev && prev.photo === activePhotoId && lookId && prev.look !== lookId) pendingSweep.current = true;
  }, [lookId, activePhotoId]);
  // The sweep waits for the first frame rendered with the new look, so the light passes over the
  // look itself rather than over the old render.
  useEffect(() => {
    if (!pendingSweep.current) return;
    pendingSweep.current = false;
    setSweep((n) => n + 1);
    // The photo lands: a breath of light and scale (skipped when motion is reduced).
    if (!motionReduced()) {
      land.current?.animate(
        [
          { transform: 'scale(0.985)', filter: 'brightness(1.14) saturate(1.08)' },
          { transform: 'scale(1)', filter: 'none' },
        ],
        { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  }, [frame]);
  const land = useRef<HTMLDivElement>(null);

  const onTouchUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    endHold();
    if (touches.current.size < 2) pinch.current = null;
  };

  return (
    <div
      ref={container}
      className="relative h-full w-full touch-none overflow-hidden bg-transparent"
      style={{ cursor: canPan ? (isPanning ? 'grabbing' : 'grab') : undefined }}
      onWheel={(e) => {
        if (!activePhotoId || !canvasSize.w) return;
        const rect = container.current!.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch' && canPinch && onTouchDown(e)) return;
        if (!canPan || (e.button !== 0 && e.button !== 1)) return;
        panning.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        setIsPanning(true);
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          // The pointer is already gone (e.g. a very short tap); panning works without capture.
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch' && onTouchMove(e)) return;
        if (!panning.current) return;
        setPan({ x: panning.current.px + e.clientX - panning.current.x, y: panning.current.py + e.clientY - panning.current.y });
      }}
      onPointerUp={(e) => {
        onTouchUp(e);
        panning.current = null;
        setIsPanning(false);
      }}
      onPointerCancel={(e) => {
        onTouchUp(e);
        panning.current = null;
        setIsPanning(false);
      }}
      data-testid="viewport"
    >
      <motion.div
        key={activePhotoId ?? 'none'}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: activePhotoId && !loading && !error ? 1 : 0, scale: activePhotoId && !loading && !error ? 1 : 0.97 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      >
        <div ref={land} className="h-full w-full">
          <div ref={attachCanvas} className="h-full w-full shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] [&>canvas]:h-full [&>canvas]:w-full" />
        </div>
        {/* Signature: a band of light passes over the photo when a new look loads. */}
        {sweep > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span key={sweep} className="lumen-sweep" />
          </div>
        )}
        {activePhotoId && !loading && compare === 'split' && tool !== 'crop' && <SplitDivider box={box} />}
        {compare === 'split' && tool !== 'crop' && (
          <div className="pointer-events-none absolute top-2.5 flex w-full justify-between px-2.5">
            <span className="surface-float rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.1em] text-fg uppercase">Before</span>
            <span className="surface-float rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.1em] text-fg uppercase">After</span>
          </div>
        )}
        {compare === 'side' && (
          <div className="pointer-events-none absolute top-2.5 flex w-full px-2.5">
            <span className="w-1/2"><span className="surface-float rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.1em] text-fg uppercase">Before</span></span>
            <span className="w-1/2 text-right"><span className="surface-float rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.1em] text-fg uppercase">After</span></span>
          </div>
        )}
        {compare === 'before' && (
          <span className="pointer-events-none absolute top-2.5 left-2.5 surface-float rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.1em] text-fg uppercase">
            Before
          </span>
        )}
      </motion.div>

      {activePhotoId && !loading && !error && tool === 'crop' && <CropOverlay box={box} />}
      {activePhotoId && !loading && !error && toolActive && compare !== 'side' && !spaceDown &&
        (tool === 'remove' ? <RemoveToolOverlay box={box} /> : <MaskToolOverlay box={box} />)}
      {activePhotoId && !loading && !error && tool === 'focus' && compare !== 'side' && !spaceDown && <FocusOverlay box={box} />}
      {coarse && activePhotoId && !loading && !error && compare !== 'side' && <TouchModeChip />}

      {!fitted && activePhotoId && currentZoom > previewToFull * 1.01 && (
        <p className="surface-float pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] text-fg-2">
          Preview resolution. Export renders full detail.
        </p>
      )}

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="animate-spin text-fg-4" size={22} aria-label="Loading photo" />
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div role="alert" className="max-w-sm rounded-lg border border-danger/30 bg-raised p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 text-danger" size={20} />
            <p className="text-sm text-fg">{error}</p>
            <p className="mt-2 text-xs text-fg-3">Remove this photo from the filmstrip, or import it again.</p>
          </div>
        </div>
      )}
      {!activePhotoId && !loading && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <button type="button" onClick={onImport} className="group flex max-w-sm flex-col items-center rounded-xl border border-dashed border-line px-10 py-12 text-center transition-colors hover:border-accent/50 hover:bg-accent/[0.03]">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-control text-fg-2 transition-[transform,color] duration-300 group-hover:scale-110 group-hover:text-accent">
              <ImagePlus size={24} />
            </span>
            <span className="display text-2xl text-fg">Add a photo to edit</span>
            <span className="mt-1 text-sm text-fg-3">
              <span className="coarse:hidden">Drop files here or click to choose.</span>
              <span className="hidden coarse:inline">Tap to choose from your library or camera.</span> JPEG, PNG and WebP.
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
