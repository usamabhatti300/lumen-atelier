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
    if (wasOnline.current && !online) showToast('You are offline. Editing, looks and export keep working on this device; AI style interpretation needs a connection.', 'info');
    wasOnline.current = online;
  }, [online, showToast]);

  return (
    <>
      <AnimatePresence>
        {updateReady && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="surface-float fixed right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[85] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-[13px] text-fg shadow-float sm:bottom-6"
            role="status"
            data-testid="update-ready"
          >
            <RefreshCw size={14} className="shrink-0 text-accent-fg" />
            <span>A new version of Lumen Atelier is ready.</span>
            <Button size="sm" variant="accent" onClick={applyUpdate}>
              Reload
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      {!online && (
        <span className="surface-float pointer-events-none fixed top-[calc(0.5rem+env(safe-area-inset-top))] left-1/2 z-[85] flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-fg-2 shadow-float" data-testid="offline-pill">
          <CloudOff size={13} className="text-accent-fg" /> Offline
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
        className={`h-9 shrink-0 items-center gap-2 rounded-full border border-accent/35 px-3.5 text-[13px] font-medium whitespace-nowrap text-accent-fg transition-colors hover:border-accent/70 hover:bg-accent/10 coarse:h-11 ${className}`}
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
    <div className="mx-4 mt-2 flex items-center gap-2 border-b border-line-soft py-1 sm:hidden" data-testid="install-banner">
      <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-3">add lumen to your home screen</p>
      <button
        type="button"
        onClick={() => (installEvent ? void promptInstall() : setIosHelp(true))}
        className="h-11 shrink-0 rounded-full px-3 text-[13px] font-medium text-fg transition-transform active:scale-95"
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-4 hover:bg-control"
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
      <ol className="space-y-4 px-5 pb-5 text-sm leading-relaxed text-fg-2">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-on-accent">1</span>
          <span>
            In Safari, tap <Share size={14} className="mx-0.5 inline align-[-2px] text-fg" /> <span className="text-fg">Share</span> in the toolbar.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-on-accent">2</span>
          <span>
            Choose <SquarePlus size={14} className="mx-0.5 inline align-[-2px] text-fg" /> <span className="text-fg">Add to Home Screen</span>, then
            Add.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-on-accent">3</span>
          <span>Open Lumen Atelier from your Home Screen. It runs full screen and works offline; your photos stay on the device.</span>
        </li>
      </ol>
    </Dialog>
  );
}
