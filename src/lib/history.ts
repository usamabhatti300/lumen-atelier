/**
 * Bounded undo/redo history of immutable snapshots.
 *
 * Grouping rules:
 *  - A slider drag is one entry: the snapshot is taken when the gesture
 *    begins and committed once when it ends (only if something changed).
 *  - Repeated discrete changes with the same label inside `mergeWindowMs`
 *    (e.g. keyboard nudges) collapse into one entry.
 */
export interface HistoryEntry<T> {
  state: T;
  label: string;
  at: number;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
}

export const HISTORY_LIMIT = 80;
export const MERGE_WINDOW_MS = 700;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Records `previous` as an undo point for a change labelled `label`. */
export function record<T>(
  h: History<T>,
  previous: T,
  label: string,
  now = Date.now(),
  limit = HISTORY_LIMIT,
  mergeWindowMs = MERGE_WINDOW_MS,
): History<T> {
  const last = h.past[h.past.length - 1];
  if (last && last.label === label && now - last.at < mergeWindowMs && label !== '') {
    // Same discrete action repeated quickly: keep the original undo point, extend the window.
    const past = [...h.past.slice(0, -1), { ...last, at: now }];
    return { past, future: [] };
  }
  const past = [...h.past, { state: previous, label, at: now }];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; state: T; label: string } | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  return {
    history: {
      past: h.past.slice(0, -1),
      future: [{ state: current, label: entry.label, at: entry.at }, ...h.future],
    },
    state: entry.state,
    label: entry.label,
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; state: T; label: string } | null {
  const entry = h.future[0];
  if (!entry) return null;
  return {
    history: {
      past: [...h.past, { state: current, label: entry.label, at: entry.at }],
      future: h.future.slice(1),
    },
    state: entry.state,
    label: entry.label,
  };
}
