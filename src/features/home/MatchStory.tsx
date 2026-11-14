/**
 * Home, the scroll story: how "Match a look" works, told by scrolling. The section pins while you
 * scroll through it:
 *   1. a reference photo arrives and a scan line reads it; what it finds appears beside it;
 *   2. its colours come off as a palette, break into particles and fly across;
 *   3. they land on your photo, the look washes over it, and an editable look card rises.
 * Scrolling back plays it backwards. With reduced motion it is a still, finished picture.
 *
 * Illustration only: the "reference" is a crop of the bundled sample photo with a CSS grade, and
 * the readings are the kind of things the analysis describes, not a live measurement.
 */
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { SAMPLE_PHOTO } from '@/lib/samples';
import { motionReduced } from '@/lib/haptics';
import { DecodeText } from '@/components/fx/DecodeText';

// The look being matched: teal shadows, warm highlights, a little contrast, lifted blacks.
const GRADE = 'contrast(1.22) saturate(0.82) sepia(0.38) hue-rotate(-20deg) brightness(0.98)';
const PALETTE = ['#1d3940', '#3f5a63', '#9c8a73', '#d9a46a', '#efd2a4'];
const READINGS = ['teal in the shadows', 'warm highlights', 'contrast +18', 'blacks lifted'];
const SLIDERS: { label: string; value: number; text: string }[] = [
  { label: 'Temperature', value: 0.62, text: '+12' },
  { label: 'Contrast', value: 0.68, text: '+18' },
  { label: 'Shadows tint', value: 0.3, text: 'teal' },
  { label: 'Fade', value: 0.22, text: '+9' },
];
const STEPS = [
  { title: 'Bring the look', body: 'A screenshot, a saved post, any photo whose colour you love.' },
  {
    title: 'Lumen reads it',
    body: 'Light, contrast and the colour in its shadows and highlights, measured on your device.',
  },
  { title: 'It lands on your photo', body: 'As a look you can adjust, save and use again.' },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function MatchStory({
  scroller,
  onMatch,
}: {
  scroller: RefObject<HTMLElement | null>;
  onMatch: () => void;
}) {
  const [still] = useState(() => motionReduced());
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    container: scroller,
    target: section,
    offset: ['start start', 'end end'],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  const fixed = useMotionValue(1);
  const p = still ? fixed : smooth;

  const [step, setStep] = useState(still ? 2 : 0);
  useMotionValueEvent(p, 'change', (v) => setStep(v < 0.34 ? 0 : v < 0.62 ? 1 : 2));

  return (
    <section
      ref={section}
      aria-labelledby="story-title"
      className="relative"
      style={{ height: still ? 'auto' : '340vh' }}
    >
      <div
        className={`${still ? '' : 'sticky top-14'} flex min-h-[calc(100dvh-3.5rem)] flex-col justify-center gap-6 py-8 lg:grid lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-center lg:gap-10`}
      >
        <div>
          <h2 id="story-title" className="display text-[clamp(2rem,6vw,3.4rem)] text-fg">
            <DecodeText text="How a look" />{' '}
            <DecodeText text="travels" className="voice pr-1 text-accent" />
          </h2>
          <ol className="mt-6 grid gap-1 sm:gap-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative pl-12">
                <span
                  className={`absolute top-1 left-0 font-mono text-[12px] transition-colors duration-500 ${i === step ? 'text-accent' : 'text-fg-4'}`}
                >
                  0{i + 1}
                </span>
                <span
                  aria-hidden
                  className="absolute top-[22px] left-0 h-px w-8 origin-left bg-accent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ transform: `scaleX(${i <= step ? 1 : 0})` }}
                />
                <p
                  className={`text-[17px] font-semibold tracking-[-0.015em] transition-colors duration-500 sm:text-[19px] ${i === step ? 'text-fg' : 'text-fg-4'}`}
                >
                  {s.title}
                </p>
                <motion.p
                  initial={false}
                  animate={{ height: i === step ? 'auto' : 0, opacity: i === step ? 1 : 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-[34ch] overflow-hidden text-[14px] leading-relaxed text-fg-3"
                >
                  <span className="block pt-1 pb-2">{s.body}</span>
                </motion.p>
              </li>
            ))}
          </ol>
        </div>
        <Stage p={p} onMatch={onMatch} />
      </div>
    </section>
  );
}

function Stage({ p, onMatch }: { p: MotionValue<number>; onMatch: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = size.w > 0 && size.w < 560;

  // Card geometry as fractions of the stage.
  const ref = narrow ? { x: 0.02, y: 0.0, w: 0.4 } : { x: 0.02, y: 0.08, w: 0.36 };
  const photo = narrow ? { x: 0.27, y: 0.31, w: 0.71 } : { x: 0.46, y: 0.33, w: 0.52 };

  const refIn = useTransform(p, (v) => ease(seg(v, 0, 0.1)));
  const refX = useTransform(refIn, (t) => (1 - t) * -60);
  const refO = useTransform(refIn, (t) => t);
  const scanY = useTransform(p, (v) => `${seg(v, 0.1, 0.32) * 100}%`);
  const scanO = useTransform(p, (v) => (v > 0.09 && v < 0.33 ? 1 : 0));
  const photoIn = useTransform(p, (v) => ease(seg(v, 0.28, 0.42)));
  const photoY = useTransform(photoIn, (t) => (1 - t) * 50);
  const wash = useTransform(p, (v) => ease(seg(v, 0.56, 0.78)));
  const washClip = useTransform(wash, (w) => `inset(0 ${(1 - w) * 100}% 0 0)`);
  const washLine = useTransform(wash, (w) => `${w * 100}%`);
  const washLineO = useTransform(wash, (w) => (w > 0.01 && w < 0.99 ? 1 : 0));
  const cardIn = useTransform(p, (v) => ease(seg(v, 0.76, 0.88)));
  const cardY = useTransform(cardIn, (t) => (1 - t) * 40);
  const tiltRef = useTransform(p, (v) => -6 + seg(v, 0.3, 0.6) * 3);
  const tiltPhoto = useTransform(p, (v) => 5 - seg(v, 0.5, 0.85) * 4);

  return (
    <div
      ref={stage}
      className="relative h-[min(64dvh,520px)] w-full select-none sm:h-[min(72dvh,560px)]"
      aria-hidden
    >
      {/* The reference, read by a scan line. */}
      <motion.div
        className="absolute overflow-hidden rounded-xl shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)] ring-1 ring-white/10"
        style={{
          left: `${ref.x * 100}%`,
          top: `${ref.y * 100}%`,
          width: `${ref.w * 100}%`,
          aspectRatio: '4 / 5',
          x: refX,
          opacity: refO,
          rotate: tiltRef,
        }}
      >
        <img
          src={SAMPLE_PHOTO.thumbUrl}
          alt=""
          className="h-full w-full scale-[1.6] object-cover"
          style={{ objectPosition: '50% 18%', filter: GRADE }}
          draggable={false}
        />
        <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-md">
          the look you saved
        </span>
        <motion.span
          className="absolute inset-x-0 h-14 -translate-y-full"
          style={{ top: scanY, opacity: scanO }}
        >
          <span className="absolute inset-0 bg-gradient-to-b from-transparent to-accent/35" />
          <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent shadow-[0_0_18px_4px_rgb(200_184_255/0.7)]" />
        </motion.span>
      </motion.div>

      {/* What the scan found. */}
      <div
        className={`absolute flex items-start gap-1.5 ${narrow ? 'flex-col' : 'flex-wrap'}`}
        style={{ left: `${(ref.x + ref.w) * 100 + 2}%`, top: `${ref.y * 100 + 2}%`, right: '2%' }}
      >
        {READINGS.map((r, i) => (
          <Reading key={r} p={p} at={0.15 + i * 0.045} text={r} />
        ))}
      </div>

      {/* The palette, then its particles. */}
      <Palette p={p} left={ref.x} top={ref.y} width={ref.w} size={size} />
      <Particles
        p={p}
        size={size}
        from={{
          x: ref.x + ref.w / 2,
          y: ref.y + (ref.w * size.w * 1.25) / Math.max(1, size.h) + 0.06,
        }}
        to={photo}
      />

      {/* Your photo: the look washes across it. */}
      <motion.div
        className="absolute overflow-hidden rounded-xl shadow-[0_50px_90px_-30px_rgb(0_0_0/0.95)] ring-1 ring-white/10"
        style={{
          left: `${photo.x * 100}%`,
          top: `${photo.y * 100}%`,
          width: `${photo.w * 100}%`,
          aspectRatio: '4 / 3',
          y: photoY,
          opacity: photoIn,
          rotate: tiltPhoto,
        }}
      >
        <img
          src={SAMPLE_PHOTO.thumbUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <motion.img
          src={SAMPLE_PHOTO.thumbUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: GRADE, clipPath: washClip }}
          draggable={false}
        />
        <motion.span
          className="absolute inset-y-0 w-[2px] bg-accent shadow-[0_0_24px_6px_rgb(200_184_255/0.65)]"
          style={{ left: washLine, opacity: washLineO }}
        />
        <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-md">
          your photo
        </span>
      </motion.div>

      {/* The look, now yours to adjust. */}
      <motion.div
        className="liquid absolute w-[min(300px,74%)] rounded-2xl p-3.5 sm:p-4"
        style={{
          right: narrow ? '2%' : '4%',
          bottom: narrow ? '0%' : '0%',
          y: cardY,
          opacity: cardIn,
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Late Summer Teal</p>
          <span className="font-mono text-[11px] text-stamp">'26 11 14</span>
        </div>
        <p className="font-mono text-[11px] text-fg-3">matched look · editable</p>
        <div className="mt-3 grid gap-2">
          {SLIDERS.map((s, i) => (
            <StorySlider key={s.label} p={p} at={0.8 + i * 0.03} {...s} />
          ))}
        </div>
        <button
          type="button"
          tabIndex={-1}
          onClick={onMatch}
          className="pointer-events-auto mt-3 h-9 w-full rounded-full bg-accent text-[13px] font-medium text-on-accent shadow-offset-sm transition-transform active:scale-95"
        >
          Match your own
        </button>
      </motion.div>
    </div>
  );
}

function Reading({ p, at, text }: { p: MotionValue<number>; at: number; text: string }) {
  const t = useTransform(p, (v) => ease(seg(v, at, at + 0.05)));
  const x = useTransform(t, (k) => (1 - k) * -14);
  const filter = useTransform(t, (k) => `blur(${(1 - k) * 6}px)`);
  return (
    <motion.span
      className="liquid rounded-full px-2.5 py-1 font-mono text-[11.5px] whitespace-nowrap text-fg"
      style={{ opacity: t, x, filter }}
    >
      {text}
    </motion.span>
  );
}

function Palette({
  p,
  left,
  top,
  width,
  size,
}: {
  p: MotionValue<number>;
  left: number;
  top: number;
  width: number;
  size: { w: number; h: number };
}) {
  const below = top + (width * size.w * 1.25) / Math.max(1, size.h) + 0.03;
  return (
    <div
      className="absolute flex gap-1.5"
      style={{ left: `${left * 100}%`, top: `${below * 100}%`, width: `${width * 100}%` }}
    >
      {PALETTE.map((c, i) => (
        <Swatch key={c} p={p} color={c} at={0.3 + i * 0.012} />
      ))}
    </div>
  );
}

function Swatch({ p, color, at }: { p: MotionValue<number>; color: string; at: number }) {
  const s = useTransform(p, (v) => {
    const inn = ease(seg(v, at, at + 0.05));
    const out = seg(v, 0.4, 0.5);
    return inn * (1 - out * 0.6);
  });
  return (
    <motion.span
      className="aspect-square flex-1 rounded-md ring-1 ring-white/15"
      style={{ backgroundColor: color, scale: s, opacity: s }}
    />
  );
}

/** Colour particles flying from the palette to the photo on arcs, each with its own timing. */
function Particles({
  p,
  size,
  from,
  to,
}: {
  p: MotionValue<number>;
  size: { w: number; h: number };
  from: { x: number; y: number };
  to: { x: number; y: number; w: number };
}) {
  const n = size.w < 560 ? 70 : 130;
  const parts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const r = (k: number) => {
          const v = Math.sin((i + 1) * 12.9898 * (k + 1)) * 43758.5453;
          return v - Math.floor(v);
        };
        return {
          color: PALETTE[i % PALETTE.length],
          sx: (r(1) - 0.5) * 0.3,
          sy: (r(2) - 0.5) * 0.04,
          ex: 0.08 + r(3) * 0.84,
          ey: 0.1 + r(4) * 0.8,
          lift: 0.12 + r(5) * 0.22,
          delay: r(6) * 0.14,
          size: 4 + Math.round(r(7) * 6),
          spin: (r(8) - 0.5) * 720,
        };
      }),
    [n],
  );
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  const paint = (v: number) => {
    const W = size.w;
    const H = size.h;
    if (!W) return;
    const photoH = (to.w * W * 0.75) / H;
    parts.forEach((pt, i) => {
      const el = els.current[i];
      if (!el) return;
      const t = seg(v, 0.38 + pt.delay, 0.52 + pt.delay);
      if (t <= 0 || t >= 1) {
        el.style.opacity = '0';
        return;
      }
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const x0 = (from.x + pt.sx) * W;
      const y0 = (from.y + pt.sy) * H;
      const x1 = (to.x + pt.ex * to.w) * W;
      const y1 = (to.y + pt.ey * photoH) * H;
      const cx = (x0 + x1) / 2;
      const cy = Math.min(y0, y1) - pt.lift * H;
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1;
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
      const s = 1 - Math.abs(t - 0.5) * 0.8;
      el.style.opacity = String(Math.min(1, Math.sin(Math.PI * t) * 1.6));
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${pt.spin * t}deg) scale(${s})`;
    });
  };
  useMotionValueEvent(p, 'change', (v) => paint(v));
  // First paint and on resize.
  useEffect(() => paint(p.get()));
  return (
    <div className="pointer-events-none absolute inset-0">
      {parts.map((pt, i) => (
        <span
          key={i}
          ref={(el) => {
            els.current[i] = el;
          }}
          className="absolute top-0 left-0 rounded-[2px]"
          style={{
            width: pt.size,
            height: pt.size,
            backgroundColor: pt.color,
            opacity: 0,
            boxShadow: `0 0 10px ${pt.color}`,
          }}
        />
      ))}
    </div>
  );
}

function StorySlider({
  p,
  at,
  label,
  value,
  text,
}: {
  p: MotionValue<number>;
  at: number;
  label: string;
  value: number;
  text: string;
}) {
  const k = useTransform(p, (v) => ease(seg(v, at, at + 0.08)));
  const width = useTransform(k, (t) => `${t * value * 100}%`);
  const left = useTransform(k, (t) => `calc(${t * value * 100}% - 5px)`);
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)_34px] items-center gap-2 text-[11px]">
      <span className="text-fg-3">{label}</span>
      <span className="relative h-[3px] rounded-full bg-white/15">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full bg-accent shadow-[0_0_10px_rgb(200_184_255/0.6)]"
          style={{ width }}
        />
        <motion.span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-fg"
          style={{ left }}
        />
      </span>
      <motion.span className="text-right font-mono text-accent-fg" style={{ opacity: k }}>
        {text}
      </motion.span>
    </div>
  );
}
