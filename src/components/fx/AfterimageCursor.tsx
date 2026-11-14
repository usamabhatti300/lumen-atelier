/**
 * The afterimage cursor (home, looks, settings; never the editor, whose tools draw their own
 * cursors). A sharp ivory dot follows the pointer exactly; a ring follows on a spring, and a lilac
 * copy of the ring trails behind it at a hard offset (the double exposure). Fast moves leave a short
 * trail of lilac pixels. Over something you can click, the ring opens up; over an element with
 * `data-cursor="Label"` it shows that word. Text fields keep the system cursor.
 *
 * Fine pointers only, and not with reduced motion: then nothing is drawn and the system cursor stays.
 */
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { motionReduced } from '@/lib/haptics';

const INTERACTIVE = 'a, button, [role="button"], summary, label, select, [data-cursor]';
const TEXT = 'input, textarea, [contenteditable="true"]';

export function AfterimageCursor() {
  const [on] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !motionReduced(),
  );
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 520, damping: 40, mass: 0.6 });
  const ry = useSpring(y, { stiffness: 520, damping: 40, mass: 0.6 });
  const gx = useSpring(x, { stiffness: 160, damping: 22, mass: 0.9 });
  const gy = useSpring(y, { stiffness: 160, damping: 22, mass: 0.9 });
  const [mode, setMode] = useState<{ kind: 'idle' | 'hover' | 'text' | 'hidden'; label?: string }>({
    kind: 'hidden',
  });
  const [down, setDown] = useState(false);
  const trail = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.dataset.cursor = '';
    const pts: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    let lx = 0;
    let ly = 0;
    const cv = trail.current;
    const cx = cv?.getContext('2d');
    const size = () => {
      if (!cv) return;
      const d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = innerWidth * d;
      cv.height = innerHeight * d;
      cx?.setTransform(d, 0, 0, d, 0, 0);
    };
    size();
    const draw = () => {
      raf = 0;
      if (!cx || !cv) return;
      const now = performance.now();
      cx.clearRect(0, 0, innerWidth, innerHeight);
      while (pts.length && now - pts[0].t > 420) pts.shift();
      for (const p of pts) {
        const k = 1 - (now - p.t) / 420;
        cx.fillStyle = `rgba(200, 184, 255, ${0.5 * k})`;
        const s = 2 + 3 * k;
        cx.fillRect(Math.round(p.x / 4) * 4 - s / 2, Math.round(p.y / 4) * 4 - s / 2, s, s);
      }
      if (pts.length) raf = requestAnimationFrame(draw);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      x.set(e.clientX);
      y.set(e.clientY);
      const t = e.target as Element | null;
      const text = t?.closest?.(TEXT);
      const hit = text ? null : (t?.closest?.(INTERACTIVE) as HTMLElement | null);
      const label = hit?.closest?.('[data-cursor]')?.getAttribute('data-cursor') ?? undefined;
      setMode((m) => {
        const kind = text ? 'text' : hit ? 'hover' : 'idle';
        return m.kind === kind && m.label === label ? m : { kind, label };
      });
      // Pixel trail on quick moves.
      const dist = Math.hypot(e.clientX - lx, e.clientY - ly);
      if (dist > 14) {
        const steps = Math.min(6, Math.floor(dist / 14));
        for (let i = 1; i <= steps; i++)
          pts.push({
            x: lx + ((e.clientX - lx) * i) / steps,
            y: ly + ((e.clientY - ly) * i) / steps,
            t: performance.now(),
          });
        lx = e.clientX;
        ly = e.clientY;
        if (!raf) raf = requestAnimationFrame(draw);
      }
    };
    const leave = () => setMode({ kind: 'hidden' });
    const press = () => setDown(true);
    const release = () => setDown(false);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('resize', size);
    return () => {
      delete root.dataset.cursor;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('resize', size);
    };
  }, [on, x, y]);

  if (!on) return null;
  const hidden = mode.kind === 'hidden' || mode.kind === 'text';
  const big = mode.kind === 'hover';
  const ring = mode.label ? 74 : big ? 46 : 30;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ opacity: hidden ? 0 : 1, transition: 'opacity 200ms' }}
    >
      <canvas ref={trail} className="absolute inset-0 h-full w-full" />
      {/* The afterimage: a lilac ring, late and offset. */}
      <motion.div className="absolute top-0 left-0" style={{ x: gx, y: gy }}>
        <div
          className="rounded-full border-[1.5px] border-accent/70 transition-[width,height,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: ring, height: ring, marginLeft: -ring / 2 + 3, marginTop: -ring / 2 + 3 }}
        />
      </motion.div>
      <motion.div className="absolute top-0 left-0" style={{ x: rx, y: ry }}>
        <div
          className={`flex items-center justify-center rounded-full border-[1.5px] border-fg/80 font-mono text-[11px] font-medium text-ground transition-[width,height,margin,background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mode.label ? 'bg-fg' : big ? 'bg-fg/10' : ''
          }`}
          style={{
            width: ring,
            height: ring,
            marginLeft: -ring / 2,
            marginTop: -ring / 2,
            transform: `scale(${down ? 0.82 : 1})`,
          }}
        >
          {mode.label}
        </div>
      </motion.div>
      <motion.div className="absolute top-0 left-0" style={{ x, y }}>
        <div
          className="-mt-[3px] -ml-[3px] h-1.5 w-1.5 rounded-full bg-fg"
          style={{ opacity: mode.label ? 0 : 1 }}
        />
      </motion.div>
    </div>
  );
}
