/**
 * Installable app (PWA) runtime: service worker registration and updates, the
 * install prompt, online state, offline copies of the on-device AI files, and
 * photos shared to the app from the phone's share sheet.
 *
 * The service worker (src/pwa/sw-template.js) only exists in production builds.
 */
import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** A service worker controls this page, so the app shell works offline. */
  offlineReady: boolean;
  /** A newer build is installed and waiting; `applyUpdate` switches to it. */
  updateReady: boolean;
  /** Chromium's install prompt, captured so the app can offer its own Install button. */
  installEvent: BeforeInstallPromptEvent | null;
  /** Running as an installed app (home screen / desktop window). */
  standalone: boolean;
  online: boolean;
}

const standaloneQuery = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const usePwa = create<PwaState>(() => ({
  offlineReady: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller,
  updateReady: false,
  installEvent: null,
  standalone: standaloneQuery(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}));

/** iPhone / iPad Safari: no install prompt API, so the app shows "Share → Add to Home Screen" instead. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
}

let registration: ServiceWorkerRegistration | null = null;

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installEvent: null, standalone: true }));
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => usePwa.setState({ standalone: standaloneQuery() }));
  window.addEventListener('online', () => usePwa.setState({ online: true }));
  window.addEventListener('offline', () => usePwa.setState({ online: false }));

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    // First install: the page is now controlled. Later: the user accepted an update, so load the new build.
    if (usePwa.getState().updateReady && !reloading) {
      reloading = true;
      window.location.reload();
    }
    usePwa.setState({ offlineReady: true });
  });
  void sw
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((reg) => {
      registration = reg;
      const watch = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const check = () => {
          // "installed" while another worker controls the page = an update is waiting.
          if (worker.state === 'installed' && sw.controller) usePwa.setState({ updateReady: true });
          if (worker.state === 'activated') usePwa.setState({ offlineReady: true });
        };
        check();
        worker.addEventListener('statechange', check);
      };
      if (reg.waiting && sw.controller) usePwa.setState({ updateReady: true });
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // Long-lived sessions (an installed app may stay open for days): look for updates now and then.
      const poll = () => document.visibilityState === 'visible' && navigator.onLine && void reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', poll);
      window.setInterval(poll, 60 * 60 * 1000);
    })
    .catch((e) => console.warn('[pwa] service worker registration failed', e));
}

/** Switches to the waiting build; the page reloads when it takes control. */
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}

export async function promptInstall(): Promise<boolean> {
  const e = usePwa.getState().installEvent;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  usePwa.setState({ installEvent: null });
  return outcome === 'accepted';
}

// ---------------------------------------------------------------------------
// Offline copies of the on-device AI files

export interface OfflineFile {
  url: string;
  bytes: number;
}

export interface OfflineStatus {
  /** False in development or when the browser has no service worker / Cache API. */
  available: boolean;
  files: OfflineFile[];
  saved: number;
  savedBytes: number;
  totalBytes: number;
  cacheName: string;
}

const EMPTY: OfflineStatus = { available: false, files: [], saved: 0, savedBytes: 0, totalBytes: 0, cacheName: '' };

/** The AI files this device would use: the WebGPU build of ONNX Runtime only where WebGPU exists. */
async function offlineManifest(): Promise<{ version: string; files: OfflineFile[] } | null> {
  if (!import.meta.env.PROD || !('caches' in window)) return null;
  try {
    const res = await fetch('/offline-files.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const m = (await res.json()) as { version: string; files: OfflineFile[] };
    const webgpu = 'gpu' in navigator;
    return { version: m.version, files: m.files.filter((f) => webgpu || !f.url.includes('.asyncify.')) };
  } catch {
    return null;
  }
}

export async function offlineStatus(): Promise<OfflineStatus> {
  const m = await offlineManifest();
  if (!m) return EMPTY;
  const cacheName = `lumen-runtime-${m.version}`;
  const cache = await caches.open(cacheName);
  let saved = 0;
  let savedBytes = 0;
  for (const f of m.files) {
    if (await cache.match(f.url)) {
      saved++;
      savedBytes += f.bytes;
    }
  }
  return { available: true, files: m.files, saved, savedBytes, totalBytes: m.files.reduce((n, f) => n + f.bytes, 0), cacheName };
}

/**
 * Downloads every AI file this device would use into the service worker's runtime cache,
 * so Select object, Remove, Lens blur, AI upscale and portrait tools work without a
 * connection. Progress is real bytes received.
 */
export async function saveForOffline(onProgress: (loaded: number, total: number) => void, signal: AbortSignal): Promise<OfflineStatus> {
  const status = await offlineStatus();
  if (!status.available) throw new Error('Offline saving needs the installed app (a production build).');
  const cache = await caches.open(status.cacheName);
  const total = status.totalBytes;
  let loaded = status.savedBytes;
  onProgress(loaded, total);
  for (const f of status.files) {
    if (await cache.match(f.url)) continue;
    // The header tells the service worker to let this request through: the page stores it itself.
    const res = await fetch(f.url, { signal, cache: 'no-store', headers: { 'X-Lumen-Offline': '1' } });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !res.body || type.includes('text/html')) throw new Error(`Could not download ${f.url} (${res.status}). Is the model installed on the server?`);
    const reader = res.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    await cache.put(f.url, new Response(new Blob(chunks, { type }), { headers: res.headers }));
  }
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  return offlineStatus();
}

export async function clearOfflineFiles(): Promise<void> {
  const status = await offlineStatus();
  if (status.available) await caches.delete(status.cacheName);
}

// ---------------------------------------------------------------------------
// Photos shared to the app (Android share sheet → service worker → here)

export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open('lumen-share');
  const files: File[] = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    if (res) {
      const name = decodeURIComponent(res.headers.get('X-File-Name') ?? 'shared.jpg');
      files.push(new File([await res.blob()], name, { type: res.headers.get('Content-Type') ?? '' }));
    }
    await cache.delete(req);
  }
  return files;
}
