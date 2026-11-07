/**
 * Remove tab: a brush that erases distractions (people, wires, signs) by
 * filling them with MI-GAN, on this device. Each removal is listed and can be
 * hidden or deleted; undo works stroke by stroke.
 */
import { Eraser, Eye, EyeOff, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Indeterminate, Kbd, Progress } from '@/components/ui/misc';
import { useEditor } from '@/state/editorStore';
import { engine } from '@/engine/controller';
import { useRemovalStatus } from '@/engine/removalPreview';
import { getModel, modelBytes } from '@/lib/ml/registry';
import { MIGAN_MODEL_ID } from '@/lib/removal/inpaint';
import type { Removal } from '@/lib/schema/adjustments';

const NO_REMOVALS: Removal[] = [];
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function RemovePanel() {
  const hasPhoto = useEditor((s) => !!s.activePhotoId);
  const tool = useEditor((s) => s.tool);
  const size = useEditor((s) => s.brush.size);
  const removals = useEditor((s) => s.edit.removals) ?? NO_REMOVALS;
  const setUi = useEditor((s) => s.setUi);
  const setBrush = useEditor((s) => s.setBrush);
  const setVisible = useEditor((s) => s.setRemovalVisible);
  const deleteRemoval = useEditor((s) => s.deleteRemoval);
  const clearRemovals = useEditor((s) => s.clearRemovals);
  const status = useRemovalStatus();
  const model = getModel(MIGAN_MODEL_ID);

  if (!hasPhoto) return <p className="p-4 text-xs text-fg-3">Open a photo to remove objects from it.</p>;

  const on = tool === 'remove';
  const applied = new Set(status.applied);

  return (
    <>
      <Section title="Remove objects">
        <p className="mb-3 text-xs leading-relaxed text-fg-3">
          Paint over a person, wire or sign and it is filled in from its surroundings. Cover the whole object,
          including its shadow. <span className="coarse:hidden">Hold <Kbd>Shift</Kbd> to add to the last removal.</span>
          <span className="hidden coarse:inline">Choose Add to last on the photo to extend the previous removal.</span>
        </p>
        <Button
          variant={on ? 'primary' : 'secondary'}
          size="sm"
          icon={<Eraser size={14} />}
          onClick={() => setUi({ tool: on ? 'none' : 'remove' })}
          aria-pressed={on}
        >
          {on ? 'Remove brush on' : 'Remove brush'}
        </Button>
        <Slider
          label="Brush size"
          value={Math.round(size * 1000) / 10}
          range={{ min: 0.5, max: 25, default: 6, step: 0.1 }}
          format={(v) => `${v.toFixed(1)}%`}
          onChange={(v) => setBrush({ size: v / 100 })}
        />

        <div aria-live="polite" className="mt-1">
          {status.phase === 'download' && (
            <div className="space-y-1.5" data-testid="remove-status">
              <p className="text-xs text-fg-2">
                Loading the removal model · {mb(status.loaded)} of {mb(status.total)}
              </p>
              <Progress value={status.total ? status.loaded / status.total : 0} label="Removal model download" />
              <Button variant="ghost" size="sm" onClick={() => engine.removals.cancel()}>
                Cancel
              </Button>
            </div>
          )}
          {status.phase === 'inpaint' && (
            <div className="space-y-1.5" data-testid="remove-status">
              <p className="flex items-center gap-1.5 text-xs text-fg-2">
                <Loader2 size={12} className="animate-spin text-accent-fg" />
                Filling {status.count > 1 ? `removal ${status.index + 1} of ${status.count}` : 'the painted area'}…
              </p>
              <Indeterminate />
              <Button variant="ghost" size="sm" onClick={() => engine.removals.cancel()}>
                Cancel
              </Button>
            </div>
          )}
          {(status.phase === 'error' || status.phase === 'cancelled') && (
            <div
              role={status.phase === 'error' ? 'alert' : 'status'}
              className={`rounded-xs border p-2.5 text-xs leading-relaxed text-fg-2 ${status.phase === 'error' ? 'border-danger/40' : 'border-line'}`}
              data-testid="remove-status"
            >
              {status.message}
              <Button variant="ghost" size="sm" className="mt-2" icon={<RotateCcw size={12} />} onClick={() => engine.removals.retry()}>
                {status.phase === 'error' ? 'Try again' : 'Resume'}
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Removals"
        aside={removals.length > 0 ? <span className="font-mono text-[10px] text-fg-4">{removals.length}</span> : undefined}
      >
        {removals.length === 0 ? (
          <p className="text-xs text-fg-4">Nothing removed yet.</p>
        ) : (
          <>
            <ul className="space-y-0.5" aria-label="Removals">
              {removals.map((r, i) => {
                const pending = r.visible && !applied.has(r.id);
                return (
                  <li key={r.id} className="flex h-8 coarse:h-11 items-center gap-2 rounded-xs px-1.5 hover:bg-raised-2" data-testid="removal-item">
                    <span className={`flex-1 text-xs ${r.visible ? 'text-fg-2' : 'text-fg-4 line-through'}`}>
                      Removal {i + 1}
                      {r.strokes.length > 1 && <span className="text-fg-4"> · {r.strokes.length} strokes</span>}
                    </span>
                    {pending && <span className="text-[10px] text-accent-fg">{status.phase === 'error' || status.phase === 'cancelled' ? 'not applied' : 'filling…'}</span>}
                    <button
                      type="button"
                      className="coarse:p-2.5 rounded-xs p-1 text-fg-3 hover:bg-control hover:text-fg"
                      aria-label={r.visible ? `Hide removal ${i + 1}` : `Show removal ${i + 1}`}
                      title={r.visible ? 'Hide' : 'Show'}
                      onClick={() => setVisible(r.id, !r.visible)}
                    >
                      {r.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                      type="button"
                      className="coarse:p-2.5 rounded-xs p-1 text-fg-3 hover:bg-control hover:text-danger"
                      aria-label={`Delete removal ${i + 1}`}
                      title="Delete"
                      onClick={() => deleteRemoval(r.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button variant="ghost" size="sm" className="mt-2" icon={<Trash2 size={13} />} onClick={clearRemovals}>
              Clear all
            </Button>
          </>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-fg-4">
          Filled on this device by {model.name} ({model.licence}, {mb(modelBytes(model))}). The original is never changed;
          export fills at full resolution.
        </p>
      </Section>
    </>
  );
}
