/** Detail → Lens blur: depth-aware background blur with click-to-focus. */
import { Crosshair, Loader2, ScanEye, X } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Indeterminate, Progress, Toggle } from '@/components/ui/misc';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { cancelDepth, prepareLensBlur, useDepth, useDepthStore } from '@/features/depth/depthState';
import { ensurePortraitAnalysis, usePortrait } from '@/features/portrait/portraitState';
import { LENS_BLUR_RANGES, defaultLensBlur, type LensBlur } from '@/lib/schema/adjustments';

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function LensBlurSection() {
  const stored = useEditor((s) => s.edit.lensBlur);
  const lens = stored ?? defaultLensBlur();
  const setLensBlur = useEditor((s) => s.setLensBlur);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const tool = useEditor((s) => s.tool);
  const setUi = useEditor((s) => s.setUi);
  const mode = useEngine((s) => s.mode);
  const depth = useDepth();
  const portrait = usePortrait();
  const ready = depth.status === 'ready';
  const on = lens.amount > 0;
  const modified = !!stored && JSON.stringify(stored) !== JSON.stringify(defaultLensBlur());

  const slider = (key: keyof typeof LENS_BLUR_RANGES, label: string, hint: string, patch?: (v: number) => Partial<LensBlur>) => (
    <Slider
      label={label}
      hint={hint}
      value={lens[key]}
      range={LENS_BLUR_RANGES[key]}
      onGestureStart={() => begin(label)}
      onGestureEnd={end}
      onChange={(v) => {
        if (key === 'amount' && lens.amount === 0 && v > 0) void prepareLensBlur({ autoFocus: !lens.focusPoint });
        setLensBlur(patch ? patch(v) : { [key]: v }, label);
      }}
    />
  );

  return (
    <Section title="Lens blur" modified={modified} onReset={() => setLensBlur(defaultLensBlur(), 'Reset lens blur')}>
      {!on && depth.status === 'idle' && !depth.message && (
        <p className="mb-2 text-xs leading-relaxed text-mute">
          Blurs the scene by distance, like a fast lens. Depth is estimated on this device; nothing is uploaded.
        </p>
      )}
      {slider('amount', 'Amount', 'Size of the blur at full distance from the focal plane.')}

      <DepthStatusLine />

      <div className="mt-1 mb-1 flex items-center gap-2">
        <Button
          size="sm"
          variant={tool === 'focus' ? 'primary' : 'secondary'}
          icon={<Crosshair size={13} />}
          disabled={!ready || !on}
          aria-pressed={tool === 'focus'}
          onClick={() => setUi({ tool: tool === 'focus' ? 'none' : 'focus' })}
        >
          {tool === 'focus' ? 'Tap the photo to focus' : 'Pick focus'}
        </Button>
        {tool === 'focus' && (
          <Button size="sm" variant="ghost" onClick={() => setUi({ tool: 'none' })}>
            Done
          </Button>
        )}
      </div>
      {slider('focus', 'Focus distance', 'Distance that stays sharp: 0 is the nearest part of the scene, 100 the farthest.', (v) => ({
        focus: v,
        focusPoint: null,
      }))}
      {slider('falloff', 'Falloff', 'How gradually the blur grows with distance from the focal plane.')}
      {slider('highlights', 'Bokeh highlights', 'Keeps out-of-focus lights bright, so they form discs.')}
      <Toggle
        checked={lens.protectSubject}
        onChange={(v) => {
          setLensBlur({ protectSubject: v }, 'Keep subject sharp');
          if (v) void ensurePortraitAnalysis();
        }}
        label="Keep subject sharp"
        description={
          lens.protectSubject && on && portrait.status === 'running'
            ? 'Detecting the subject…'
            : lens.protectSubject && on && portrait.status === 'ready' && !portrait.person
              ? 'No person detected here; depth alone decides what is sharp.'
              : 'Keeps a detected person on one focal plane with clean edges.'
        }
      />
      {mode === 'cpu' && on && <p className="mt-1 text-[11px] leading-relaxed text-faint">Rendering on the CPU here, so the preview updates slowly.</p>}
    </Section>
  );
}

function DepthStatusLine() {
  const d = useDepth();
  const on = useEditor((s) => (s.edit.lensBlur?.amount ?? 0) > 0);
  if (d.status === 'running') {
    return (
      <div className="my-2" role="status" aria-live="polite" data-testid="depth-status">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-mute">
          <span className="flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            {d.progress ? `Downloading depth model… ${mb(d.progress.loaded)} of ${mb(d.progress.total)}` : 'Estimating depth…'}
          </span>
          <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => cancelDepth(d.photoId)}>
            Cancel
          </Button>
        </div>
        {d.progress ? <Progress value={d.progress.loaded / d.progress.total} label="Depth model download" /> : <Indeterminate />}
      </div>
    );
  }
  if (d.status === 'missing-model' || d.status === 'error') {
    return (
      <div role="alert" className="my-2 rounded-xs border border-safelight/40 p-2.5 text-xs leading-relaxed text-ivory-dim" data-testid="depth-status">
        {d.message}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => {
            useDepthStore.setState((s) => ({ status: { ...s.status, [d.photoId]: 'idle' } }));
            void prepareLensBlur({ autoFocus: false });
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (d.status === 'idle' && on) {
    return (
      <div className="my-2 flex items-center justify-between gap-2 text-xs text-mute" data-testid="depth-status">
        <span>{d.message || 'Depth has not been estimated for this photo.'}</span>
        <Button size="sm" variant="secondary" icon={<ScanEye size={13} />} onClick={() => void prepareLensBlur({ autoFocus: false })}>
          Estimate depth
        </Button>
      </div>
    );
  }
  if (d.status === 'ready' && on && d.message) {
    return (
      <p className="my-1.5 text-[11px] leading-relaxed text-faint" role="status" data-testid="depth-status">
        {d.message}
      </p>
    );
  }
  return null;
}
