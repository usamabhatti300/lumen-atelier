/** Installable-app UI: the update banner, the offline notice, and the Install button with iPhone instructions. */
import { AnimatePresence, motion } from 'motion/react';
import { CloudOff, Download, RefreshCw, Share, SquarePlus, X } from 'lucide-react';
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
            className="fixed right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[85] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-sm border border-accent-fg/40 bg-ground-2 py-2 pr-2 pl-3.5 text-[13px] text-fg shadow-float sm:bottom-6"
            role="status"
            data-testid="update-ready"
          >
            <RefreshCw size={14} className="shrink-0 text-accent-fg" />
            <span>A new version of Lumen Atelier is ready.</span>
            <Button size="sm" variant="primary" onClick={applyUpdate}>
              Reload
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      {!online && (
        <span className="pointer-events-none fixed top-[calc(0.5rem+env(safe-area-inset-top))] left-1/2 z-[85] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-ground-2/95 px-2.5 py-1 text-[11px] text-fg-3 shadow-float" data-testid="offline-pill">
          <CloudOff size={12} /> Offline
        </span>
      )}
    </>
  );
}

/** "Install app": Chromium's prompt where available, otherwise step-by-step instructions on iPhone/iPad. */
/** `className` sets the display (default `flex`), e.g. `hidden sm:flex`. */
export function InstallButton({ className = 'flex' }: { className?: string }) {
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
        className={`h-8 shrink-0 items-center gap-2 rounded-sm px-3 text-[13px] whitespace-nowrap text-accent-fg hover:bg-accent/10 coarse:h-10 ${className}`}
        data-testid="install-app"
      >
        <Download size={15} /> <span>Install app</span>
      </button>
      <IosInstallDialog open={iosHelp} onClose={() => setIosHelp(false)} />
    </>
  );
}

const BANNER_KEY = 'lumen.installBannerDismissed';

/** Phones: a full-width install card under the header (the header has no room for a labelled button). */
export function InstallBanner() {
  const installEvent = usePwa((s) => s.installEvent);
  const standalone = usePwa((s) => s.standalone);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [iosHelp, setIosHelp] = useState(false);
  const ios = isIosSafari();
  if (hidden || standalone || (!installEvent && !ios)) return null;
  return (
    <div className="mx-4 mt-3 mb-1 flex items-center gap-3 rounded-sm border-2 border-fg bg-raised py-2 pr-1.5 pl-3.5 sm:hidden" data-testid="install-banner">
      <Download size={18} className="shrink-0 text-accent-fg" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg">
        Install Lumen Atelier
        <span className="block text-xs text-fg-3">Full screen, works offline. Photos stay on this phone.</span>
      </p>
      <button
        type="button"
        onClick={() => (installEvent ? void promptInstall() : setIosHelp(true))}
        className="carton-label h-10 shrink-0 rounded-sm bg-fg px-4 text-[13px] text-ground active:scale-95"
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Hide install suggestion"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(BANNER_KEY, '1');
          } catch {
            // Private mode: hidden for this visit only.
          }
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center text-fg-4"
      >
        <X size={15} />
      </button>
      <IosInstallDialog open={iosHelp} onClose={() => setIosHelp(false)} />
    </div>
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
      <ol className="space-y-3 p-4 text-sm leading-relaxed text-fg-2">
        <li className="flex gap-3">
          <span className="tabular w-4 shrink-0 text-accent-fg">1</span>
          <span>
            In Safari, tap <Share size={14} className="mx-0.5 inline align-[-2px] text-fg" /> <span className="text-fg">Share</span> in the toolbar.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="tabular w-4 shrink-0 text-accent-fg">2</span>
          <span>
            Choose <SquarePlus size={14} className="mx-0.5 inline align-[-2px] text-fg" /> <span className="text-fg">Add to Home Screen</span>, then
            Add.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="tabular w-4 shrink-0 text-accent-fg">3</span>
          <span>Open Lumen Atelier from your Home Screen. It runs full screen and works offline; your photos stay on the device.</span>
        </li>
      </ol>
    </Dialog>
  );
}
