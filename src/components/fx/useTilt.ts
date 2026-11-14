/**
 * Pointer tilt for cards: the card leans toward the pointer and a soft light follows it (`.tilt`,
 * `.tilt-light`). Fine pointers only; touch and reduced motion get a flat card. Writes CSS variables
 * on the element itself, so moving the pointer never re-renders React. Spread the returned handlers
 * on the `.tilt` element.
 */
import { useCallback, useMemo } from 'react';
import { motionReduced } from '@/lib/haptics';

const fine = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function useTilt<T extends HTMLElement>(max = 7) {
  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      const node = e.currentTarget;
      if (e.pointerType !== 'mouse' || !fine() || motionReduced()) return;
      const r = node.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      node.dataset.tilting = '';
      node.style.setProperty('--ry', `${(x - 0.5) * 2 * max}deg`);
      node.style.setProperty('--rx', `${(0.5 - y) * 2 * max}deg`);
      node.style.setProperty('--mx', `${x * 100}%`);
      node.style.setProperty('--my', `${y * 100}%`);
    },
    [max],
  );

  const onPointerLeave = useCallback((e: React.PointerEvent<T>) => {
    const node = e.currentTarget;
    delete node.dataset.tilting;
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
  }, []);

  return useMemo(() => ({ onPointerMove, onPointerLeave }), [onPointerMove, onPointerLeave]);
}
