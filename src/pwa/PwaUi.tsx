/** Installable-app UI: the update banner, the offline notice, and the Install button with iPhone instructions. */
import { AnimatePresence, motion } from 'motion/react';
import { CloudOff, Download, RefreshCw, Share, SquarePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useEditor } from '@/state/editorStore';
import { applyUpdate, isIosSafari, promptInstall, usePwa } from './pwa';

/** App-wide: offers a waiting update, and says what still works when the connection drops. */
export function PwaPrompts() {
  const updateReady = usePwa((s) => s.updateReady);
  const online = usePwa((s) => s.online);
  const showToast = useEditor((s) => s.showToast);
  const wasOnline = useRef(online);

  useEffect(() => {
    if (wasOnline.current && !online) showToast('You are offline. Editing, presets and export keep working on this device; AI style interpretation needs a connection.', 'info');
    wasOnline.current = online;
  }, [online, showToast]);

  return (
    <>
      <AnimatePresence>
        {updateReady && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[85] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-sm border border-amber/40 bg-ink-850 py-2 pr-2 pl-3.5 text-[13px] text-ivory shadow-float sm:bottom-6"
            role="status"
            data-testid="update-ready"
          >
            <RefreshCw size={14} className="shrink-0 text-amber" />
            <span>A new version of Lumen Atelier is ready.</span>
            <Button size="sm" variant="primary" onClick={applyUpdate}>
              Reload
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      {!online && (
        <span className="pointer-events-none fixed top-[calc(0.5rem+env(safe-area-inset-top))] left-1/2 z-[85] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-ink-850/95 px-2.5 py-1 text-[11px] text-mute shadow-float" data-testid="offline-pill">
          <CloudOff size={12} /> Offline
        </span>
      )}
    </>
  );
}

/** "Install app": Chromium's prompt where available, otherwise step-by-step instructions on iPhone/iPad. */
export function InstallButton({ className = '' }: { className?: string }) {
  const installEvent = usePwa((s) => s.installEvent);
  const standalone = usePwa((s) => s.standalone);
  const [iosHelp, setIosHelp] = useState(false);
  const ios = isIosSafari();
  if (standalone || (!installEvent && !ios)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (installEvent ? void promptInstall() : setIosHelp(true))}
        className={`flex h-8 items-center gap-2 rounded-sm px-3 text-[13px] text-amber hover:bg-amber/10 coarse:h-10 ${className}`}
        data-testid="install-app"
      >
        <Download size={15} /> <span>Install app</span>
      </button>
      <IosInstallDialog open={iosHelp} onClose={() => setIosHelp(false)} />
    </>
  );
}

export function IosInstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Install on iPhone or iPad"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <ol className="space-y-3 p-4 text-sm leading-relaxed text-ivory-dim">
        <li className="flex gap-3">
          <span className="tabular w-4 shrink-0 text-amber">1</span>
          <span>
            In Safari, tap <Share size={14} className="mx-0.5 inline align-[-2px] text-ivory" /> <span className="text-ivory">Share</span> in the toolbar.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="tabular w-4 shrink-0 text-amber">2</span>
          <span>
            Choose <SquarePlus size={14} className="mx-0.5 inline align-[-2px] text-ivory" /> <span className="text-ivory">Add to Home Screen</span>, then
            Add.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="tabular w-4 shrink-0 text-amber">3</span>
          <span>Open Lumen Atelier from your Home Screen. It runs full screen and works offline; your photos stay on the device.</span>
        </li>
      </ol>
    </Dialog>
  );
}
