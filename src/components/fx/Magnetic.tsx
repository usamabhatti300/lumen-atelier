/**
 * A magnetic wrapper for a main action: on a fine pointer the child is drawn a few pixels toward
 * the cursor and springs back when it leaves. Nothing happens on touch or with reduced motion.
 */
import { motion, useMotionValue, useSpring } from 'motion/react';
import type { ReactNode } from 'react';
import { motionReduced } from '@/lib/haptics';

export function Magnetic({
  children,
  strength = 0.28,
  className = '',
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.6 });
  return (
    <motion.div
      className={`inline-flex ${className}`}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || motionReduced()) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
