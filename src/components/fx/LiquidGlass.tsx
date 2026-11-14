/**
 * Liquid glass: glass that bends what is behind it. Chromium can run an SVG filter as a
 * backdrop-filter, so on Chromium `.liquid` surfaces refract the page under them through a soft
 * noise displacement (the lens wobble you see in water or thick glass) on top of the frost, and a
 * specular highlight follows the pointer across the surface. Other browsers keep the frosted glass.
 *
 * Mount <LiquidGlass /> once (App). It renders the filter, marks <html data-liquid> when the
 * refraction is supported, and moves the highlight of whichever `.liquid` surface is under the
 * pointer (CSS variables only, no React renders). The highlight is off in the editor and on touch
 * devices; the refraction itself is CSS and stays everywhere.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';

function chromium() {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
    .userAgentData?.brands;
  return !!brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));
}

export function LiquidGlass() {
  // The highlight is a mouse nicety for the calm screens. The editor (/project/…) gets no pointer
  // listener at all: every mouse move there would cost a DOM walk and a layout read while you work.
  const inEditor = useLocation().pathname.startsWith('/project/');

  useEffect(() => {
    const root = document.documentElement;
    if (chromium()) root.dataset.liquid = '';
    return () => {
      delete root.dataset.liquid;
    };
  }, []);

  useEffect(() => {
    if (inEditor || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let last: HTMLElement | null = null;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.(
          '[class*="liquid"]',
        ) as HTMLElement | null;
        if (last && last !== el) last.style.removeProperty('--lx');
        last = el;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--lx', `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty('--ly', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      last?.style.removeProperty('--lx');
    };
  }, [inEditor]);

  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {/* Strong lens for small surfaces (buttons, dock, pills). */}
        <filter
          id="liquid-lens"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.011 0.011"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale="62"
            xChannelSelector="R"
            yChannelSelector="G"
            result="bent"
          />
          <feGaussianBlur in="bent" stdDeviation="1.2" />
        </filter>
        {/* Gentle lens for wide bars (headers, toolbars), so text under them stays readable. */}
        <filter
          id="liquid-bar"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.02"
            numOctaves="2"
            seed="3"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="3" result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale="44"
            xChannelSelector="R"
            yChannelSelector="B"
            result="bent"
          />
          <feGaussianBlur in="bent" stdDeviation="6" />
        </filter>
      </defs>
    </svg>
  );
}
