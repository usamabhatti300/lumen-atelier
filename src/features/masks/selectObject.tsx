/**
 * "Select object" tool UI: click the photo to mask an object (SlimSAM, on
 * device). Plain click starts a selection, Shift-click adds to it, Alt-click
 * subtracts from it. Status, progress and errors come from the object-mask
 * service (src/engine/objectMasks.ts).
 */
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Indeterminate, Kbd, Progress } from '@/components/ui/misc';
import { objectMasks, useObjectSelect, type ObjectSelectStatus } from '@/engine/objectMasks';
import { SETUP_HINT } from '@/lib/ml/verify';
import { useEditor } from '@/state/editorStore';
import { activateSelectObject, useObjectTool } from './selectObjectActions';

const mb = (n: number) => (n / 1e6).toFixed(1);

function statusText(st: ObjectSelectStatus): string {
  switch (st.phase) {
    case 'downloading':
      return st.total ? `Downloading the Select object model · ${mb(st.loaded)} of ${mb(st.total)} MB` : 'Downloading the Select object model…';
    case 'starting':
      return 'Starting the model…';
    case 'analysing':
      return 'Analysing the photo (once per photo)…';
    case 'selecting':
      return 'Selecting…';
    default:
      return '';
  }
}

/** Status, progress, cancel and errors for the Masks panel. */
export function SelectObjectPanel({ layerId }: { layerId: string }) {
  const st = useObjectSelect();
  const hint = useObjectTool((s) => s.hint);
  const startNew = useObjectTool((s) => s.startNew);
  const hasObject = useEditor((s) => s.edit.layers.find((l) => l.id === layerId)?.components.some((c) => c.type === 'object') ?? false);
  const busy = st.phase === 'downloading' || st.phase === 'starting' || st.phase === 'analysing' || st.phase === 'selecting';
  const missing = st.errorName === 'ModelMissingError';

  return (
    <div className="mb-3 rounded-xs border border-line-soft bg-ink-900 px-2.5 py-2" data-testid="select-object-panel">
      {busy ? (
        <div aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ivory-dim" data-testid="select-object-status">
              <Loader2 size={12} className="shrink-0 animate-spin text-amber" />
              <span className="truncate">{statusText(st)}</span>
            </span>
            {st.phase !== 'selecting' && (
              <button
                type="button"
                onClick={() => objectMasks.cancel()}
                className="flex shrink-0 items-center gap-1 rounded-xs px-1.5 py-0.5 text-[11px] text-mute hover:bg-ink-700 hover:text-ivory"
              >
                <X size={11} /> Cancel
              </button>
            )}
          </div>
          {st.phase === 'downloading' && st.total > 0 ? (
            <Progress value={st.loaded / st.total} label="Model download" />
          ) : (
            <Indeterminate />
          )}
        </div>
      ) : st.phase === 'error' && st.error ? (
        <div role="alert" className="text-[11px] leading-snug">
          <p className="flex items-start gap-1.5 text-safelight">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{missing ? 'The Select object model is not installed.' : st.error}</span>
          </p>
          <p className="mt-1 text-mute">
            {missing ? SETUP_HINT : 'Check the model files, then try again.'}
          </p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={activateSelectObject}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="text-[11px] leading-relaxed text-mute">
          <p className="text-ivory-dim">
            {startNew || !hasObject ? 'Tap or click an object in the photo to select it.' : 'Refine the selection, or tap elsewhere to start over.'}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 coarse:hidden">
            <Kbd>Shift</Kbd> click adds · <Kbd>Alt</Kbd> click subtracts
          </p>
          <p className="mt-1 hidden coarse:block">Use Add or Subtract on the photo to refine it.</p>
          {st.notice && <p className="mt-1 text-faint">{st.notice}</p>}
        </div>
      )}
      {hint && <p className="mt-1.5 text-[11px] text-amber">{hint}</p>}
      {hasObject && !busy && st.phase !== 'error' && (
        <button
          type="button"
          onClick={() => useObjectTool.setState({ startNew: true })}
          aria-pressed={startNew}
          className={`mt-2 flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[11px] ${startNew ? 'bg-amber/10 text-amber' : 'text-mute hover:bg-ink-700 hover:text-ivory'}`}
        >
          <Plus size={11} /> {startNew ? 'Tap the next object' : 'Add another object'}
        </button>
      )}
      <p className="mt-2 border-t border-line-soft pt-1.5 text-[10px] leading-snug text-faint">
        Runs on this device with SlimSAM (Apache-2.0, 39.8 MB download once). The photo never leaves your computer.
      </p>
    </div>
  );
}

/** Canvas hint chip shown while the tool is busy or idle. */
export function ObjectToolChip() {
  const st = useObjectSelect();
  const text = statusText(st);
  if (st.phase === 'error') return <Chip tone="error">Select object is unavailable. See the Masks panel.</Chip>;
  if (text) return <Chip busy>{st.phase === 'downloading' && st.total ? `${text} (${Math.round((st.loaded / st.total) * 100)}%)` : text}</Chip>;
  return (
    <Chip>
      <span className="coarse:hidden">Click an object · Shift adds · Alt subtracts</span>
      <span className="hidden coarse:inline">Tap an object to select it</span>
    </Chip>
  );
}

function Chip({ children, busy, tone }: { children: React.ReactNode; busy?: boolean; tone?: 'error' }) {
  return (
    <p
      className={`pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xs bg-ink-950/85 px-2.5 py-1 text-xs whitespace-nowrap backdrop-blur-sm ${tone === 'error' ? 'text-safelight' : 'text-ivory-dim'}`}
      data-testid="select-object-chip"
    >
      {busy && <Loader2 size={12} className="animate-spin text-amber" />}
      {children}
    </p>
  );
}
