/** Settings: performance, privacy, AI configuration, on-device AI models, data. */
import { BrainCircuit, Cpu, Database, Gauge, Loader2, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { CartonBar } from '@/components/CartonBar';
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
      <CartonBar />
      <main className="mx-auto max-w-3xl space-y-10 px-4 pt-6 pb-24 sm:px-8">
        <h1 className="carton-title text-[3rem] text-fg sm:text-[4.5rem]">Settings</h1>

        <Block icon={<Smartphone size={16} />} title="App & offline">
          <AppSettings />
        </Block>

        <Block icon={<Gauge size={16} />} title="Performance">
          <p className="mb-2 text-xs text-fg-3">Preview resolution while editing. Exports always use the full original resolution.</p>
          <Segmented<PreviewQuality>
            label="Preview quality"
            value={s.previewQuality}
            onChange={(v) => s.update({ previewQuality: v })}
            options={(['performance', 'balanced', 'high'] as const).map((q) => ({ value: q, label: `${q[0].toUpperCase()}${q.slice(1)} · ${PREVIEW_SIZES[q]}px` }))}
          />
          <Toggle
            checked={s.forceCpu}
            onChange={(v) => s.update({ forceCpu: v })}
            label="Use CPU renderer"
            description="For troubleshooting GPU problems. Much slower; portrait retouching and mask blur are unavailable."
          />
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <dt className="text-fg-3">Renderer</dt>
            <dd className="text-fg">{engine.mode === 'webgl' ? 'WebGL2 (GPU)' : engine.mode === 'cpu' ? 'CPU (worker)' : 'Starts when you open a project'}</dd>
            <dt className="text-fg-3">Max texture size</dt>
            <dd className="tabular text-fg">{engine.maxTextureSize || '–'} px</dd>
            <dt className="text-fg-3">Float pipeline</dt>
            <dd className="text-fg">{engine.mode === 'webgl' ? (engine.floatPipeline ? '16-bit float intermediates' : '8-bit fallback') : '–'}</dd>
          </dl>
          <div className="mt-4 rounded-sm border border-line-soft p-3">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-fg-3">Measure full-pipeline render time on this device (2048 × 1365, a demanding edit).</p>
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
              <p className="tabular mt-2 text-xs text-fg" role="status">
                {typeof bench === 'string'
                  ? bench
                  : `Median ${bench.medianMs.toFixed(1)} ms (90th percentile ${bench.p90Ms.toFixed(1)} ms) for the demanding edit; ${bench.simpleMedianMs.toFixed(1)} ms for a simple edit. Measured over ${bench.iterations - 1} renders at ${bench.width}×${bench.height}.`}
              </p>
            )}
          </div>
        </Block>

        <Block icon={<ShieldCheck size={16} />} title="Privacy">
          <ul className="mb-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-fg-3">
            <li>Photos, edits, projects and presets are stored only in this browser (IndexedDB). There are no accounts and no analytics.</li>
            <li>Editing, portrait detection and masking run on this device.</li>
            <li>Only the reference-matching feature can send an image off the device, and only with your permission. With a local model (Ollama) nothing is sent.</li>
          </ul>
          <Toggle
            checked={s.aiConsent}
            onChange={(v) => s.update({ aiConsent: v })}
            label="Allow sending reference photos to the AI model"
            description="When on, “Analyse look” sends a downscaled copy (max 1024 px) of the reference, never your edited photos, through this app's server to Anthropic. When off, you'll be asked first."
          />
        </Block>

        <Block icon={<Sparkles size={16} />} title="AI configuration">
          {!health ? (
            <p className="text-xs text-fg-3">Checking server…</p>
          ) : !health.reachable ? (
            <p className="text-xs leading-relaxed text-danger">
              The app server is not reachable. Start the app with <code className="text-fg">npm run dev</code> (or{' '}
              <code className="text-fg">npm start</code> after building). Reference analysis still works with measurements only.
            </p>
          ) : (
            <div className="text-xs leading-relaxed text-fg-3">
              <p>
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
                  <code className="text-fg">.env</code> file and restart the server to use Claude. Without either, presets are built from
                  measurements only.
                </p>
              )}
            </div>
          )}
        </Block>

        <Block icon={<BrainCircuit size={16} />} title="AI models">
          <AiModels />
        </Block>

        <Block icon={<Sparkles size={16} />} title="Motion">
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
        </Block>

        <Block icon={<Database size={16} />} title="Data">
          <p className="text-xs text-fg-3">
            {projects} project{projects === 1 ? '' : 's'} stored.
            {usage && ` Using ${(usage.usage / 1e6).toFixed(0)} MB of about ${(usage.quota / 1e9).toFixed(1)} GB available to this site.`}
          </p>
          <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmClear(true)}>
            Delete all local data
          </Button>
        </Block>
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
        <p className="px-4 py-4 text-sm text-fg-3">All projects, photos, edits, your presets and settings will be removed from this browser. This cannot be undone.</p>
      </Dialog>
    </div>
  );
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-fg pt-4">
      <h2 className="carton-label mb-4 flex items-center gap-2 text-[15px] text-fg">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent text-on-accent">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
