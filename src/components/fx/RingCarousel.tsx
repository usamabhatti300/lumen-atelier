/**
 * A 3D ring of cards (after the "circular carousel" pattern): cards stand on a turning ring,
 * the front one faces you and the rest fall away into the dark. Drag (mouse or finger) with
 * momentum and snapping, click a side card to bring it round, click the front card to open it.
 * Arrow keys turn it, Enter opens. It turns itself slowly until touched (not with reduced motion,
 * and never while hovered, focused or off screen).
 */
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motionReduced, tick } from '@/lib/haptics';

export interface RingItem {
  key: string;
  label: string;
  render: (state: { active: boolean }) => ReactNode;
}

const norm = (deg: number) => {
  const d = (((deg % 360) + 540) % 360) - 180;
  return d;
};

export function RingCarousel({
  items,
  cardWidth,
  cardHeight,
  onOpen,
  label,
  autoplay = true,
}: {
  items: RingItem[];
  cardWidth: number;
  cardHeight: number;
  onOpen: (index: number) => void;
  label: string;
  autoplay?: boolean;
}) {
  const n = items.length;
  const step = 360 / n;
  const radius = Math.round((cardWidth / 2 / Math.tan(Math.PI / n)) * 1.12);
  const rot = useMotionValue(0);
  const ringTransform = useTransform(rot, (r) => `translateZ(${-radius}px) rotateY(${r}deg)`);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const hold = useRef({ hover: false, focus: false, visible: true, touched: false });

  // Light each card by how squarely it faces you; only the front half takes clicks.
  useEffect(() => {
    const paint = (r: number) => {
      let best = 0;
      let bestCos = -2;
      for (let i = 0; i < n; i++) {
        const el = cards.current[i];
        const c = Math.cos((norm(i * step + r) * Math.PI) / 180);
        if (c > bestCos) {
          bestCos = c;
          best = i;
        }
        if (!el) continue;
        const f = Math.max(0, c);
        el.style.opacity = String(0.12 + 0.88 * Math.pow(f, 1.6));
        el.style.filter = `brightness(${0.35 + 0.65 * Math.pow(f, 2)})`;
        el.style.pointerEvents = c > 0.3 ? 'auto' : 'none';
        el.style.visibility = c > -0.05 ? 'visible' : 'hidden';
      }
      setActive((a) => (a === best ? a : best));
    };
    paint(rot.get());
    return rot.on('change', paint);
  }, [n, step, rot]);

  const turnTo = useCallback(
    (target: number, velocity = 0) => {
      anim.current?.stop();
      if (motionReduced()) {
        rot.set(target);
        return;
      }
      anim.current = animate(rot, target, {
        type: 'spring',
        stiffness: 90,
        damping: 20,
        mass: 1,
        velocity,
      });
    },
    [rot],
  );

  const goIndex = useCallback(
    (i: number) => {
      const current = rot.get();
      const target = -i * step;
      // Shortest way round.
      const delta = norm(target - current);
      turnTo(current + delta);
    },
    [rot, step, turnTo],
  );

  // Drag with momentum.
  const drag = useRef<{
    x: number;
    start: number;
    moved: boolean;
    lastX: number;
    lastT: number;
    v: number;
    id: number;
  } | null>(null);
  const degPerPx = (360 / (2 * Math.PI * radius)) * 0.9;
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    anim.current?.stop();
    hold.current.touched = true;
    drag.current = {
      x: e.clientX,
      start: rot.get(),
      moved: false,
      lastX: e.clientX,
      lastT: e.timeStamp,
      v: 0,
      id: e.pointerId,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    if (!d.moved) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = 0.75 * (((e.clientX - d.lastX) * degPerPx) / dt) * 1000 + 0.25 * d.v;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    rot.set(d.start + dx * degPerPx);
  };
  const suppressClick = useRef(false);
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    const v = e.timeStamp - d.lastT > 90 ? 0 : d.v;
    const projected = rot.get() + v * 0.22;
    const snapped = Math.round(projected / step) * step;
    tick();
    turnTo(snapped, v);
  };

  // Self-turning until the visitor takes over.
  useEffect(() => {
    if (!autoplay || motionReduced()) return;
    const el = stage.current;
    const io = el
      ? new IntersectionObserver(([e]) => (hold.current.visible = e.isIntersecting))
      : null;
    if (el) io?.observe(el);
    const id = window.setInterval(() => {
      const h = hold.current;
      if (h.hover || h.focus || !h.visible || h.touched || document.hidden || drag.current) return;
      turnTo(Math.round(rot.get() / step) * step - step);
    }, 3400);
    return () => {
      window.clearInterval(id);
      io?.disconnect();
    };
  }, [autoplay, rot, step, turnTo]);

  useEffect(() => () => anim.current?.stop(), []);

  return (
    <div
      ref={stage}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      data-cursor="Drag"
      className="ring-stage relative mx-auto w-full touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-accent-fg/60 rounded-xl"
      style={{ height: cardHeight + 70, cursor: 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={() => (hold.current.hover = true)}
      onPointerLeave={() => (hold.current.hover = false)}
      onFocus={() => (hold.current.focus = true)}
      onBlur={() => (hold.current.focus = false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          hold.current.touched = true;
          goIndex((active + 1) % n);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          hold.current.touched = true;
          goIndex((active - 1 + n) % n);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(active);
        }
      }}
    >
      <div
        aria-hidden
        className="ring-floor pointer-events-none absolute inset-x-[15%] bottom-2 h-10"
      />
      <motion.div
        className="ring-3d absolute inset-x-0 top-6"
        style={{ height: cardHeight, transform: ringTransform }}
      >
        {items.map((it, i) => (
          <div
            key={it.key}
            ref={(el) => {
              cards.current[i] = el;
            }}
            className="ring-card"
            style={{
              width: cardWidth,
              height: cardHeight,
              marginLeft: -cardWidth / 2,
              transform: `rotateY(${i * step}deg) translateZ(${radius}px)`,
            }}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label={i === active ? `Open ${it.label}` : `Show ${it.label}`}
              aria-current={i === active || undefined}
              data-cursor={i === active ? 'Open' : 'Turn'}
              className="block h-full w-full text-left"
              onClick={(e) => {
                if (suppressClick.current) {
                  e.preventDefault();
                  return;
                }
                hold.current.touched = true;
                if (i === active) onOpen(i);
                else goIndex(i);
              }}
            >
              {it.render({ active: i === active })}
            </button>
          </div>
        ))}
      </motion.div>
      <p className="sr-only" aria-live="polite">
        {items[active]?.label}
      </p>
    </div>
  );
}
