/** Settings → AI models: every on-device model with size, licence and install state, plus a runtime check. */
import { Cpu, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { installedModelFiles, modelInstallState, runSelfTest, type InstallState } from '@/lib/ml/client';
import type { SelfTestResult } from '@/lib/ml/protocol';
import { MODELS, modelBytes } from '@/lib/ml/registry';

const mb = (n: number) => `${(n / 1e6).toFixed(n < 10e6 ? 1 : 0)} MB`;

const STATE_LABEL: Record<InstallState, string> = { installed: 'Downloaded', missing: 'Not downloaded', partial: 'Incomplete', unknown: 'Unknown (server offline)' };

export function AiModels() {
  const [states, setStates] = useState<Record<string, InstallState> | null>(null);
  const [check, setCheck] = useState<SelfTestResult | 'running' | string | null>(null);

  useEffect(() => {
    let live = true;
    void installedModelFiles().then((files) => {
      if (live) setStates(Object.fromEntries(MODELS.map((m) => [m.id, modelInstallState(m, files)])));
    });
    return () => {
      live = false;
    };
  }, []);

  const readyMissing = states && MODELS.some((m) => m.status === 'ready' && (states[m.id] === 'missing' || states[m.id] === 'partial'));

  return (
    <div className="text-xs leading-relaxed text-fg-3">
      <p className="mb-3">
        These models run on this device; photos are never uploaded. Model files are served by this app, not fetched from third parties while you
        edit, and each file is checked against its SHA-256 checksum before use.
      </p>
      <ul className="divide-y divide-line-soft rounded-sm border border-line-soft" aria-label="AI models">
        {MODELS.map((m) => {
          const state = states?.[m.id];
          return (
            <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 px-3 py-2.5" data-testid={`ai-model-${m.id}`}>
              <span className="text-fg">{m.name}</span>
              <span className="tabular text-right text-fg-2">{mb(modelBytes(m))}</span>
              <span>
                {m.feature}
                {m.status === 'planned' && <span className="text-fg-3"> · not used by any tool yet</span>}
              </span>
              <span
                className={`text-right ${state === 'installed' ? 'text-success' : m.status === 'ready' && state ? 'text-accent-fg' : 'text-fg-3'}`}
                data-testid="ai-model-state"
              >
                {state ? STATE_LABEL[state] : 'Checking…'}
              </span>
              <span className="col-span-2">
                Licence:{' '}
                <a href={m.licenceUrl} target="_blank" rel="noreferrer noopener" className="text-fg-2 underline decoration-line-soft underline-offset-2 hover:text-fg">
                  {m.licence}
                </a>{' '}
                · {m.source}
              </span>
            </li>
          );
        })}
      </ul>
      {readyMissing && (
        <p className="mt-2 text-accent-fg">
          Some models the editor uses are missing. Run <code className="text-fg">npm run setup:models</code> in the project folder, then reload.
        </p>
      )}

      <div className="mt-4 rounded-sm border border-line-soft p-3">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Runtime: ONNX Runtime Web (MIT) and Transformers.js (Apache-2.0), served from this app. Check that it starts on this device's GPU
            (WebGPU) and CPU (WebAssembly).
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon={check === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Cpu size={13} />}
            disabled={check === 'running'}
            onClick={async () => {
              setCheck('running');
              try {
                setCheck(await runSelfTest());
              } catch (e) {
                setCheck(e instanceof Error ? e.message : 'The AI runtime check failed.');
              }
            }}
          >
            Check AI runtime
          </Button>
        </div>
        {check && check !== 'running' && (
          <div className="mt-2 text-fg" role="status" data-testid="ai-runtime-status">
            {typeof check === 'string' ? <p className="text-danger">{check}</p> : <RuntimeReport r={check} />}
          </div>
        )}
      </div>
    </div>
  );
}

function RuntimeReport({ r }: { r: SelfTestResult }) {
  const gpu = r.backends.find((b) => b.backend === 'webgpu');
  const cpu = r.backends.find((b) => b.backend === 'wasm');
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
      <dt className="text-fg-3">GPU (WebGPU)</dt>
      <dd>{gpu?.ok ? 'Working' : `Unavailable${gpu?.error?.includes('not available') ? ' in this browser' : ''}; the CPU is used instead`}</dd>
      <dt className="text-fg-3">CPU (WebAssembly)</dt>
      <dd className={cpu?.ok ? '' : 'text-danger'}>
        {cpu?.ok ? `Working, ${r.threads} thread${r.threads === 1 ? '' : 's'}${r.crossOriginIsolated ? '' : ' (multi-threading needs cross-origin isolation)'}` : `Failed: ${cpu?.error}`}
      </dd>
      <dt className="text-fg-3">Versions</dt>
      <dd className="tabular">
        ONNX Runtime {r.ortVersion}
        {'version' in r.transformers ? ` · Transformers.js ${r.transformers.version}` : ''}
      </dd>
      <dt className="text-fg-3">Remote models</dt>
      <dd className={'error' in r.transformers ? 'text-danger' : ''}>
        {'error' in r.transformers ? `Transformers.js failed to start: ${r.transformers.error}` : r.transformers.remoteModelsDisabled ? 'Blocked (local files only)' : 'Allowed'}
      </dd>
    </dl>
  );
}
