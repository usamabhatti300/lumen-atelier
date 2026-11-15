/**
 * Two fingers always zoom and pan, also while a canvas tool is active. The viewport sees the
 * second finger first and calls `cancelToolStrokes`, so the stroke or tap the first finger
 * started is dropped instead of being left behind as a stray mark.
 */
const listeners = new Set<() => void>();

/** Called by a tool overlay; `cancel` must drop whatever the current touch has started. */
export function onToolPinch(cancel: () => void): () => void {
  listeners.add(cancel);
  return () => void listeners.delete(cancel);
}

export function cancelToolStrokes() {
  for (const fn of listeners) fn();
}
