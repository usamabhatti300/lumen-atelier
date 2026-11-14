/** Settings: performance, privacy, AI configuration, on-device AI models, data. */
import { DecodeText } from '@/components/fx/DecodeText';
import { AfterimageCursor } from '@/components/fx/AfterimageCursor';
import { BrainCircuit, Cpu, Database, Gauge, Loader2, ShieldCheck, Smartphone, Sparkles, Waves } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { AppBar } from '@/components/AppBar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented, Toggle } from '@/components/ui/misc';
import { useSettings, PREVIEW_SIZES, type PreviewQuality } from '@/state/settingsStore';
import { useEngine } from '@/engine/engineStore';
import { getAiHealth, type AiHealth } from '@/lib/analysis/client';
import { clearAllData, listProjects, storageEstimate } from '@/lib/storage/db';
import { AiModels } from '@/features/settings/AiModels';
import { AppSettings } from '@/features/settings/AppSettings';
import { runBenchmark, type BenchmarkResult } from '@/engine/benchmark';

export default function SettingsScreen() {
  const s = useSettings();
  const engine = useEngine();
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [projects, setProjects] = useState(0);
  const [bench, setBench] = useState<BenchmarkResult | 'running' | string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void getAiHealth(true).then(setHealth);
    void storageEstimate().then(setUsage);
    void listProjects().then((p) => setProjects(p.length));
  }, []);

  return (
    <div className="scroll-quiet h-full overflow-y-auto bg-ground">
      <AfterimageCursor />
      <AppBar />
      <main className="screen-enter mx-auto max-w-3xl px-4 pt-8 pb-24 sm:px-8 sm:pt-12">
        <p className="label-caps text-fg-4">Everything stays on this device</p>
        <h1 className="display mt-3 text-[3.2rem] text-fg sm:text-[4.5rem]"><DecodeText text="Settings" immediate /></h1>
        <nav aria-label="Settings sections" className="no-scrollbar -mx-4 mt-6 mb-8 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {SECTIONS.map((x) => (
            <a
              key={x.id}
              href={`#${x.id}`}
              className="flex h-9 shrink-0 items-center rounded-full bg-control px-3.5 text-[13px] font-medium text-fg-2 transition-colors hover:bg-control-2 hover:text-fg coarse:h-10"
            >
              {x.title}
            </a>
          ))}
        </nav>
        <div className="space-y-4">

        <Block icon={<Smartphone size={16} />} title="App & offline">
          <AppSettings />
        </Block>

        <Block icon={<Gauge size={16} />} title="Performance">
          <Row title="Preview quality" description="Resolution while editing. Exports always use the full original resolution.">
          <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
          <Segmented<PreviewQuality>
            label="Preview quality"
            value={s.previewQuality}
            onChange={(v) => s.update({ previewQuality: v })}
            options={(['performance', 'balanced', 'high'] as const).map((q) => ({
              value: q,
              label: (
                <span className="flex flex-col items-center leading-tight sm:flex-row sm:gap-1.5">
                  <span>{`${q[0].toUpperCase()}${q.slice(1)}`}</span>
                  <span className="font-mono text-[11px] opacity-70">{PREVIEW_SIZES[q]}px</span>
                </span>
              ),
            }))}
          />
          </div>
          </Row>
          <Divider />
          <Toggle
            checked={s.adaptiveLooks}
            onChange={(v) => s.update({ adaptiveLooks: v })}
            label="Adaptive looks"
            description="Before a look is applied, the photo's exposure is evened out, and a colour cast of its own is eased, so the look reads as it was made to. A look's own colour is never changed. What was changed shows in Light and can be edited. Matched looks are already fitted and are left as they are."
          />
          <Divider />
          <Toggle
            checked={s.autoDetectFaces}
            onChange={(v) => s.update({ autoDetectFaces: v })}
            label="Detect faces automatically"
            description="When a photo opens, faces and the person are found in the background with on-device models, so portrait tools are ready when you need them. Turn off to save battery; the Portrait tool can still run it."
          />
          <Divider />
          <Toggle
            checked={s.forceCpu}
            onChange={(v) => s.update({ forceCpu: v })}
            label="Use CPU renderer"
            description="For troubleshooting GPU problems. Much slower; portrait retouching and mask blur are unavailable."
          />
          <Divider />
          <details className="group py-1">
            <summary className="flex h-9 cursor-pointer list-none items-center text-[13px] font-medium text-fg-2 hover:text-fg coarse:h-11">Diagnostics</summary>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 py-1 text-[13px]">
            <dt className="text-fg-3">Renderer</dt>
            <dd className="text-right text-fg">{engine.mode === 'webgl' ? 'WebGL2 (GPU)' : engine.mode === 'cpu' ? 'CPU (worker)' : 'Starts when you open a project'}</dd>
            <dt className="text-fg-3">Max texture size</dt>
            <dd className="text-right font-mono text-fg">{engine.maxTextureSize || '–'} px</dd>
            <dt className="text-fg-3">Float pipeline</dt>
            <dd className="text-right text-fg">{engine.mode === 'webgl' ? (engine.floatPipeline ? '16-bit float intermediates' : '8-bit fallback') : '–'}</dd>
          </dl>
          </details>
          <div className="mt-4 rounded-md bg-raised-2 p-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] leading-relaxed text-fg-3">Measure full-pipeline render time on this device (2048 × 1365, a demanding edit).</p>
              <Button
                size="sm"
                variant="secondary"
                icon={bench === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Cpu size={13} />}
                disabled={bench === 'running'}
                onClick={async () => {
                  setBench('running');
                  try {
                    setBench(await runBenchmark());
                  } catch (e) {
                    setBench(e instanceof Error ? e.message : 'Benchmark failed (WebGL2 unavailable?)');
                  }
                }}
              >
                Run benchmark
              </Button>
            </div>
            {bench && bench !== 'running' && (
              <p className="mt-3 font-mono text-xs leading-relaxed text-fg" role="status">
                {typeof bench === 'string'
                  ? bench
                  : `Median ${bench.medianMs.toFixed(1)} ms (90th percentile ${bench.p90Ms.toFixed(1)} ms) for the demanding edit; ${bench.simpleMedianMs.toFixed(1)} ms for a simple edit. Measured over ${bench.iterations - 1} renders at ${bench.width}×${bench.height}.`}
              </p>
            )}
          </div>
        </Block>

        <Block icon={<ShieldCheck size={16} />} title="Privacy">
          <ul className="mb-3 space-y-2.5 text-[13px] leading-relaxed text-fg-3">
            {PRIVACY.map((t) => (
              <li key={t} className="flex gap-3">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <Divider />
          <Toggle
            checked={s.aiConsent}
            onChange={(v) => s.update({ aiConsent: v })}
            label="Allow sending reference photos to the AI model"
            description="When on, “Analyse look” sends a downscaled copy (max 1024 px) of the reference, never your edited photos, through this app's server to Anthropic. When off, you'll be asked first."
          />
        </Block>

        <Block icon={<Sparkles size={16} />} title="AI configuration">
          {!health ? (
            <p className="text-[13px] text-fg-3">Checking server…</p>
          ) : !health.reachable ? (
            <p className="text-[13px] leading-relaxed text-danger">
              The app server is not reachable. Start the app with <code className="text-fg">npm run dev</code> (or{' '}
              <code className="text-fg">npm start</code> after building). Reference analysis still works with measurements only.
            </p>
          ) : (
            <div className="text-[13px] leading-relaxed text-fg-3">
              <p>
                <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${health.configured ? 'bg-success' : 'bg-accent'}`} aria-hidden />
                Status:{' '}
                <span className={health.configured ? 'text-success' : 'text-accent-fg'}>
                  {health.configured ? `configured (${health.model}${health.local ? ', running on this computer' : ''})` : 'not configured'}
                </span>
              </p>
              {!health.configured && (
                <p className="mt-2">
                  Free and private: install <span className="text-fg">Ollama</span> and run{' '}
                  <code className="text-fg">ollama pull qwen3-vl:4b-instruct</code> (3.3 GB, Apache-2.0). The app uses it automatically while Ollama
                  is running, and the reference never leaves this computer. Or add <code className="text-fg">ANTHROPIC_API_KEY=…</code> to a{' '}
                  <code className="text-fg">.env</code> file and restart the server to use Claude. Without either, looks are built from
                  measurements only.
                </p>
              )}
            </div>
          )}
        </Block>

        <Block icon={<BrainCircuit size={16} />} title="AI models">
          <AiModels />
        </Block>

        <Block icon={<Waves size={16} />} title="Motion">
          <Row title="Animations" description="Follow system respects your device's reduce-motion setting.">
          <Segmented
            label="Motion"
            value={s.motion}
            onChange={(v) => s.update({ motion: v })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'full', label: 'Full' },
            ]}
          />
          </Row>
        </Block>

        <Block icon={<Database size={16} />} title="Data">
          <p className="text-[13px] leading-relaxed text-fg-3">
            <span className="font-mono text-fg">{projects}</span> project{projects === 1 ? '' : 's'} stored.
            {usage && ` Using ${(usage.usage / 1e6).toFixed(0)} MB of about ${(usage.quota / 1e9).toFixed(1)} GB available to this site.`}
          </p>
          <Button variant="danger" size="sm" className="mt-4" onClick={() => setConfirmClear(true)}>
            Delete all local data
          </Button>
        </Block>
        </div>
      </main>
      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Delete everything?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await clearAllData();
                setConfirmClear(false);
                window.location.assign('/');
              }}
            >
              Delete all data
            </Button>
          </>
        }
      >
        <p className="px-5 pb-5 text-sm leading-relaxed text-fg-3">All edits, photos, the looks you saved and your settings will be removed from this browser. This cannot be undone.</p>
      </Dialog>
    </div>
  );
}

const PRIVACY = [
  'Photos, edits and looks are stored only in this browser (IndexedDB). There are no accounts and no analytics.',
  'Editing, portrait detection and masking run on this device.',
  'Only the reference-matching feature can send an image off the device, and only with your permission. With a local model (Ollama) nothing is sent.',
];

const SECTIONS = [
  { id: 'app-offline', title: 'App & offline' },
  { id: 'performance', title: 'Performance' },
  { id: 'privacy', title: 'Privacy' },
  { id: 'ai-configuration', title: 'AI configuration' },
  { id: 'ai-models', title: 'AI models' },
  { id: 'motion', title: 'Motion' },
  { id: 'data', title: 'Data' },
];

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const id = SECTIONS.find((x) => x.title === title)?.id;
  return (
    <section id={id} aria-labelledby={id && `${id}-title`} className="scroll-mt-20 rounded-lg border border-line-soft bg-raised p-4 sm:p-6">
      <h2 id={id && `${id}-title`} className="mb-4 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.02em] text-fg">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-control text-accent-fg">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-3 py-1">
      <div>
        <p className="text-sm text-fg">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-3 h-px bg-line-soft" />;
}
