/** Settings → App & offline: install state, offline copies of the AI files, and persistent storage. */
import { CheckCircle2, CloudDownload, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/misc';
import { InstallButton, IosInstallDialog } from '@/pwa/PwaUi';
import { clearOfflineFiles, isIosSafari, offlineStatus, saveForOffline, usePwa, type OfflineStatus } from '@/pwa/pwa';

const mb = (n: number) => `${(n / 1e6).toFixed(0)} MB`;

export function AppSettings() {
  const standalone = usePwa((s) => s.standalone);
  const offlineReady = usePwa((s) => s.offlineReady);
  const installEvent = usePwa((s) => s.installEvent);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [iosHelp, setIosHelp] = useState(false);
  const ac = useRef<AbortController | null>(null);

  useEffect(() => {
    void offlineStatus().then(setStatus);
    void navigator.storage?.persisted?.().then(setPersisted);
    return () => ac.current?.abort();
  }, []);

  const save = async () => {
    ac.current = new AbortController();
    setError(null);
    try {
      setStatus(await saveForOffline((loaded, total) => setProgress({ loaded, total }), ac.current.signal));
      void navigator.storage?.persisted?.().then(setPersisted);
    } catch (e) {
      if (!ac.current.signal.aborted) setError(e instanceof Error ? e.message : 'Download failed.');
      setStatus(await offlineStatus());
    } finally {
      setProgress(null);
    }
  };

  const complete = !!status && status.saved === status.files.length && status.files.length > 0;

  return (
    <div className="space-y-4 text-xs leading-relaxed text-fg-3">
      <div className="flex flex-col items-start gap-3 rounded-sm border border-line-soft p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <Smartphone size={14} className="mt-0.5 shrink-0 text-fg-2" />
          <span>
            {standalone
              ? 'Running as an installed app.'
              : installEvent
                ? 'Install Lumen Atelier to open it from your home screen or desktop, full screen and offline.'
                : isIosSafari()
                  ? 'On iPhone and iPad, install from Safari: Share → Add to Home Screen.'
                  : 'Your browser can install this app from its menu (Install app / Add to Home screen). Installing needs a secure (https) address.'}
            {!standalone && <span className="block text-fg-4">Photos stay in this browser's storage either way.</span>}
          </span>
        </p>
        {!standalone && (installEvent ? <InstallButton className="flex border border-accent-fg/40" /> : isIosSafari() && <Button size="sm" variant="secondary" onClick={() => setIosHelp(true)}>How to install</Button>)}
      </div>

      <div className="rounded-sm border border-line-soft p-3">
        <p className="flex items-start gap-2">
          {offlineReady ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" /> : <CloudDownload size={14} className="mt-0.5 shrink-0 text-fg-2" />}
          <span>
            {offlineReady
              ? 'The editor is saved on this device and opens without a connection. Editing, presets, masks, reference matching from measurements and export all work offline.'
              : import.meta.env.PROD
                ? 'Preparing offline use… (reload once if this does not change)'
                : 'Offline use is set up by the built app (npm run build, then npm start). Not available in development.'}
          </span>
        </p>
        {status?.available && (
          <div className="mt-3 border-t border-line-soft pt-3">
            <p>
              On-device AI (Select object, Remove, Lens blur, AI upscale, portrait detection) downloads its models the first time each tool is used.
              Save them all now to use every tool offline.
            </p>
            <p className="tabular mt-1.5 text-fg-2" data-testid="offline-models">
              {status.saved} of {status.files.length} files saved offline ({mb(status.savedBytes)} of {mb(status.totalBytes)})
            </p>
            {progress ? (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1">
                  <Progress value={progress.total ? progress.loaded / progress.total : 0} label="Offline download" />
                  <p className="tabular mt-1">
                    {mb(progress.loaded)} of {mb(progress.total)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => ac.current?.abort()}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {!complete && (
                  <Button size="sm" variant="secondary" icon={<CloudDownload size={13} />} onClick={() => void save()} data-testid="save-offline">
                    Save AI models offline ({mb(status.totalBytes - status.savedBytes)})
                  </Button>
                )}
                {status.saved > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={13} />}
                    onClick={async () => {
                      await clearOfflineFiles();
                      setStatus(await offlineStatus());
                    }}
                  >
                    Remove offline models
                  </Button>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-2 text-danger">
                {error}
              </p>
            )}
          </div>
        )}
        {progress === null && persisted === false && (
          <p className="mt-2 text-fg-4">
            The browser may clear this site's storage (projects, photos, presets) when the device runs low on space.{' '}
            <button
              type="button"
              className="text-accent-fg underline-offset-2 hover:underline"
              onClick={async () => setPersisted((await navigator.storage?.persist?.()) ?? false)}
            >
              Ask to keep it
            </button>
          </p>
        )}
      </div>
      <IosInstallDialog open={iosHelp} onClose={() => setIosHelp(false)} />
    </div>
  );
}
