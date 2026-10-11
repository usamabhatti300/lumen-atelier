import { Loader2, ScanFace, Sparkles, Trash2, UserRound } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { ensurePortraitAnalysis, usePortrait, usePortraitStore } from '@/features/portrait/portraitState';
import { RETOUCH_RANGES, type Retouch } from '@/lib/schema/adjustments';
import { newId } from '@/lib/storage/db';

const CONTROLS: [keyof Omit<Retouch, 'spots'>, string, string][] = [
  ['skinSmoothing', 'Skin smoothing', 'Softens blotches and uneven tone within detected skin; fine texture is kept.'],
  ['skinTexture', 'Keep texture', 'How much pore-level detail survives smoothing.'],
  ['underEye', 'Under-eye', 'Lightens and evens the area beneath the eyes.'],
  ['eyeEnhance', 'Eyes', 'Adds brightness, contrast and colour to the irises.'],
  ['teethWhitening', 'Teeth whitening', 'Removes yellow from visible teeth.'],
  ['faceLight', 'Face light', 'A soft light across the face.'],
];

export function PortraitPanel() {
  const retouch = useEditor((s) => s.edit.retouch);
  const setRetouch = useEditor((s) => s.setRetouch);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);
  const setBrush = useEditor((s) => s.setBrush);
  const setUi = useEditor((s) => s.setUi);
  const clearSpots = useEditor((s) => s.clearSpots);
  const addLayer = useEditor((s) => s.addLayer);
  const mode = useEngine((s) => s.mode);
  const hasPhoto = useEditor((s) => !!s.activePhotoId);
  const p = usePortrait();
  const gpu = mode === 'webgl';
  const ready = p.status === 'ready';
  const faceTools = ready && p.faces > 0 && gpu;

  const backgroundLayer = async (kind: 'blur' | 'darken' | 'desaturate') => {
    await ensurePortraitAnalysis();
    const adjustments =
      kind === 'blur' ? { blur: 55 } : kind === 'darken' ? { exposure: -0.6, saturation: -10 } : { saturation: -70 };
    addLayer(kind === 'blur' ? 'Background blur' : kind === 'darken' ? 'Darken background' : 'Mute background', [
      { type: 'segment', id: newId('c_'), mode: 'add', target: 'background' },
    ], adjustments);
  };

  if (!hasPhoto) return <p className="p-4 text-xs text-mute">Open a portrait to retouch it.</p>;

  return (
    <>
      <Section title="Face detection">
        {!gpu && (
          <p className="mb-2 text-xs leading-relaxed text-safelight">
            Portrait retouching needs WebGL2, which is unavailable or disabled here. Masks and global adjustments
            still work.
          </p>
        )}
        {p.status === 'idle' && (
          <>
            <p className="mb-3 text-xs leading-relaxed text-mute">
              Finds faces, eyes, lips and the person in this photo with on-device models. Nothing is uploaded.
            </p>
            <Button variant="secondary" size="sm" icon={<ScanFace size={14} />} onClick={() => void ensurePortraitAnalysis()}>
              Detect faces &amp; subject
            </Button>
          </>
        )}
        {p.status === 'running' && (
          <p className="flex items-center gap-2 text-xs text-mute" role="status">
            <Loader2 size={13} className="animate-spin" /> Detecting faces and subject…
          </p>
        )}
        {p.status === 'ready' && (
          <p className="text-xs text-ivory-dim" role="status">
            <UserRound size={12} className="mr-1 inline text-amber" />
            {p.faces === 0 ? 'No face found' : p.faces === 1 ? '1 face found' : `${p.faces} faces found`}
            {p.person ? ' · person detected' : ''}
          </p>
        )}
        {(p.status === 'missing-models' || p.status === 'error') && (
          <div role="alert" className="rounded-xs border border-safelight/40 p-2.5 text-xs leading-relaxed text-ivory-dim">
            {p.message}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                usePortraitStore.setState((s) => ({ status: { ...s.status, [p.photoId]: 'idle' } }));
                void ensurePortraitAnalysis();
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {p.message && p.status === 'ready' && <p className="mt-2 text-[11px] leading-relaxed text-mute">{p.message}</p>}
      </Section>

      <Section title="Retouch">
        {!faceTools && (
          <p className="mb-2 text-[11px] leading-relaxed text-faint">
            {ready ? 'These controls need a detected face.' : 'Run face detection to enable these controls.'}
          </p>
        )}
        {CONTROLS.map(([key, label, hint]) => (
          <Slider
            key={key}
            label={label}
            hint={hint}
            value={retouch[key]}
            range={RETOUCH_RANGES[key]}
            disabled={!faceTools}
            onGestureStart={() => begin(label)}
            onGestureEnd={end}
            onChange={(v) => setRetouch(key, v)}
          />
        ))}
      </Section>

      <Section title="Spot healing">
        <p className="mb-2 text-xs leading-relaxed text-mute">
          <span className="coarse:hidden">Click blemishes to heal them. A matching patch nearby is chosen automatically. Alt-click a spot to remove it.</span>
          <span className="hidden coarse:inline">Tap blemishes to heal them. A matching patch nearby is chosen automatically. Choose Delete spot on the photo to remove one.</span>
        </p>
        <div className="flex gap-2">
          <Button
            variant={tool === 'heal' ? 'primary' : 'secondary'}
            size="sm"
            icon={<Sparkles size={14} />}
            disabled={!gpu}
            onClick={() => setUi({ tool: tool === 'heal' ? 'none' : 'heal' })}
          >
            {tool === 'heal' ? 'Healing on' : 'Heal spots'}
          </Button>
          {retouch.spots.length > 0 && (
            <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={clearSpots}>
              Clear {retouch.spots.length}
            </Button>
          )}
        </div>
        {tool === 'heal' && (
          <Slider label="Spot size" value={Math.round(brush.size * 1000) / 10} range={{ min: 0.3, max: 10, default: 2, step: 0.1 }} format={(v) => `${v.toFixed(1)}%`} onChange={(v) => setBrush({ size: v / 100 })} />
        )}
      </Section>

      <Section title="Background">
        <p className="mb-2 text-xs leading-relaxed text-mute">
          Creates a mask layer from the detected background. Its sliders are in the Masks tab.
        </p>
        <div className="grid grid-cols-3 gap-1">
          <Button size="sm" variant="secondary" disabled={!gpu} onClick={() => void backgroundLayer('blur')}>
            Blur
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void backgroundLayer('darken')}>
            Darken
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void backgroundLayer('desaturate')}>
            Mute
          </Button>
        </div>
      </Section>
    </>
  );
}
