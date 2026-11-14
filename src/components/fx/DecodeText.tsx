/**
 * Kinetic type: text that develops like a digital signal locking on. Each letter flickers through
 * glyphs (pixels, digits, the letters of "lumen") and settles in order, with a short blur clearing
 * as it lands. Runs when the text first scrolls into view (or at once with `immediate`), and again
 * when `text` changes. Screen readers get the final text only; reduced motion shows it at once.
 */
import { useEffect, useRef, useState } from 'react';
import { motionReduced } from '@/lib/haptics';

const GLYPHS = '▚▞▖▗▘▝░▒01lumen/+*#';

export function DecodeText({
  text,
  className = '',
  immediate = false,
  delay = 0,
  speed = 1,
}: {
  text: string;
  className?: string;
  immediate?: boolean;
  /** Seconds before it starts. */
  delay?: number;
  /** >1 is faster. */
  speed?: number;
}) {
  const [out, setOut] = useState<{ ch: string; done: boolean }[] | null>(null);
  const el = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(immediate);
  const [still] = useState(() => motionReduced());
  const [ran, setRan] = useState(false);

  useEffect(() => {
    if (armed || !el.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setArmed(true), {
      threshold: 0.4,
    });
    io.observe(el.current);
    return () => io.disconnect();
  }, [armed]);

  useEffect(() => {
    if (!armed || still) return;
    const chars = [...text];
    const per = 38 / speed;
    const flicker = 260 / speed;
    let raf = 0;
    const t0 = performance.now() + delay * 1000;
    const run = (now: number) => {
      const t = now - t0;
      let all = true;
      const next = chars.map((ch, i) => {
        if (ch === ' ') return { ch, done: true };
        const settle = i * per + flicker;
        if (t >= settle) return { ch, done: true };
        all = false;
        if (t < i * per * 0.5) return { ch: ' ', done: false };
        return { ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)], done: false };
      });
      setOut(next);
      if (!all) raf = requestAnimationFrame(run);
      else {
        setOut(null);
        setRan(true);
      }
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [armed, text, delay, speed, still]);

  return (
    <span ref={el} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {out ? (
          out.map((c, i) => (
            <span key={i} className={c.done ? 'decode-done' : 'decode-flicker'}>
              {c.ch}
            </span>
          ))
        ) : (
          <span style={armed && !ran && !still ? { opacity: 0 } : undefined}>{text}</span>
        )}
      </span>
    </span>
  );
}
