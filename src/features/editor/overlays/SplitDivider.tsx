import { useRef } from 'react';
import { useEditor } from '@/state/editorStore';
import type { ViewBox } from '../Viewport';

/** Draggable before/after divider (also keyboard operable). */
export function SplitDivider({ box }: { box: ViewBox }) {
  const split = useEditor((s) => s.split);
  const setUi = useEditor((s) => s.setUi);
  const dragging = useRef(false);
  const fromEvent = (e: React.PointerEvent) => {
    const parent = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    setUi({ split: Math.min(1, Math.max(0, (e.clientX - parent.left) / parent.width)) });
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Before and after divider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(split * 100)}
      className="absolute top-0 z-10 h-full w-6 -translate-x-1/2 cursor-ew-resize touch-none focus:outline-none [&:focus-visible>span]:bg-amber"
      style={{ left: split * box.width }}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => dragging.current && fromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        if (e.key === 'ArrowLeft') setUi({ split: Math.max(0, split - step) });
        if (e.key === 'ArrowRight') setUi({ split: Math.min(1, split + step) });
      }}
    >
      <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-ivory/85 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
      <span className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-1/2 items-center justify-center rounded-full border border-ivory/80 bg-ink-950/70 text-[10px] text-ivory">
        ⇆
      </span>
    </div>
  );
}
