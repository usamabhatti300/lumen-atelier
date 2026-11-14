/**
 * Ambient light ("Lit"): a heavily blurred, slowly drifting copy of a photo behind the chrome, so the
 * interface takes on the photo's colours (the album-art background pattern). Cross-fades when the
 * photo changes. It is decoration only: hidden from assistive tech, never over the photo itself.
 */
import { AnimatePresence, motion } from 'motion/react';

/** `still`: no drift (the editor, where glass panels sit over it and would re-blur on every frame). */
export function Ambient({
  src,
  opacity = 0.5,
  className = '',
  still = false,
}: {
  src: string | null | undefined;
  opacity?: number;
  className?: string;
  still?: boolean;
}) {
  return (
    <div aria-hidden className={`ambient ${still ? 'ambient-still' : ''} ${className}`}>
      <AnimatePresence initial={false}>
        {src && (
          <motion.img
            key={src}
            src={src}
            alt=""
            decoding="async"
            className="ambient-img"
            initial={{ opacity: 0 }}
            animate={{ opacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>
      {/* The brand's own light over the photo's: lilac and a cold blue, so a warm photo never turns the whole screen brown. */}
      <div className="ambient-aurora" />
      <div className="ambient-grain" />
    </div>
  );
}
