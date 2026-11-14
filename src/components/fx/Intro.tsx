/**
 * Opening animation (Lit). It picks up where the phone's own splash (icon on the night ground)
 * leaves off: "lu" locks on through flickering glyphs, a shutter flash fires and the lilac copy
 * slides out behind it (the afterimage), the mark spells out "lumen" with "atelier" under it, and
 * the whole thing lifts away to show the app, which has been loading underneath.
 *
 * The first ever open plays it in full (~2.1 s); later opens get a short version (~1 s). A tap
 * skips it. Nothing plays with reduced motion or under browser automation (tests ask for it with
 * `?intro=full` or `?intro=short`).
 */
import { useEffect, useState } from 'react';
import { motionReduced } from '@/lib/haptics';

export type IntroMode = 'full' | 'short';
const SEEN_KEY = 'lumen.introSeen';
const GLYPHS = '▚▞▖▗▘▝░▒01/+*#';

/** Milliseconds: when the letters settle, when the overlay starts to leave, and how long leaving takes. */
export const INTRO_TIMING = {
  full: { settle: 420, leave: 1750, out: 420 },
  short: { settle: 0, leave: 620, out: 360 },
} as const;

/** Which version to play for this launch, or null for none. */
export function introMode(opts: { search: string; seen: boolean; reduced: boolean; automated: boolean }): IntroMode | null {
  const asked = new URLSearchParams(opts.search).get('intro');
  if (asked === 'full' || asked === 'short') return asked;
  if (opts.reduced || opts.automated) return null;
  return opts.seen ? 'short' : 'full';
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage blocked: don't replay the long version on every open
  }
}

function Word({ head, mode }: { head: string; mode: IntroMode }) {
  return (
    <>
      {head}
      {mode === 'full' &&
        ['m', 'e', 'n'].map((ch, i) => (
          <span key={ch} className="intro-extra" style={{ animationDelay: `${950 + i * 90}ms` }}>
            {ch}
          </span>
        ))}
    </>
  );
}

export function Intro() {
  const [mode] = useState<IntroMode | null>(() =>
    introMode({ search: window.location.search, seen: readSeen(), reduced: motionReduced(), automated: navigator.webdriver === true }),
  );
  const [stage, setStage] = useState<'play' | 'leave' | 'done'>(mode ? 'play' : 'done');
  const [head, setHead] = useState(mode === 'full' ? '▚▞' : 'lu');

  useEffect(() => {
    if (!mode) return;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage blocked: the full version plays again next time; harmless.
    }
    const T = INTRO_TIMING[mode];
    const timers: number[] = [];
    let flicker = 0;
    if (T.settle > 0) {
      const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      const t0 = performance.now();
      flicker = window.setInterval(() => {
        const t = performance.now() - t0;
        // "l" settles halfway through, "u" at the end.
        if (t >= T.settle) {
          setHead('lu');
          window.clearInterval(flicker);
        } else setHead((t >= T.settle / 2 ? 'l' : pick()) + pick());
      }, 55);
    }
    timers.push(window.setTimeout(() => setStage((s) => (s === 'play' ? 'leave' : s)), T.leave));
    return () => {
      window.clearInterval(flicker);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [mode]);

  useEffect(() => {
    if (stage !== 'leave' || !mode) return;
    const t = window.setTimeout(() => setStage('done'), INTRO_TIMING[mode].out);
    return () => window.clearTimeout(t);
  }, [stage, mode]);

  if (!mode || stage === 'done') return null;
  return (
    <div
      className="intro"
      data-testid="intro"
      data-mode={mode}
      data-stage={stage}
      aria-hidden
      onPointerDown={() => setStage('leave')}
      style={{ ['--intro-out' as string]: `${INTRO_TIMING[mode].out}ms` }}
    >
      <div className="intro-light intro-light-a" />
      <div className="intro-light intro-light-b" />
      <div className="intro-lockup">
        <div className="intro-mark mono-display">
          <span className="intro-ghost">
            <Word head={head} mode={mode} />
          </span>
          <span className="intro-word">
            <Word head={head} mode={mode} />
          </span>
        </div>
        {mode === 'full' && <div className="intro-sub">atelier</div>}
      </div>
      <div className="intro-flash" />
    </div>
  );
}
