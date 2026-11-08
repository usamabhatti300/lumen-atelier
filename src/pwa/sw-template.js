/*
 * Lumen Atelier service worker. `npm run build` turns this template into dist/sw.js
 * (scripts/pwa-plugin.ts fills in the version and the precache list). It is
 * never registered in development.
 *
 * - App shell (HTML, JS, CSS, fonts, icons): precached per build, served cache-first,
 *   so the app opens offline. A new build installs in the background and waits until
 *   the page asks it to take over (the "Update ready" prompt).
 * - On-device AI files (/models, /mediapipe, /ort): cached the first time they are
 *   used, kept across app updates (the cache name changes only when those files do).
 *   They are still checksum-verified by the app on every load.
 * - /api: always the network (AI interpretation needs the app server); never cached.
 * - Android share sheet: photos shared to the app arrive as a POST to /share-target and
 *   are handed to the page through the Cache API.
 */
/* global self, caches */
const VERSION = '__LUMEN_VERSION__';
const RUNTIME_KEY = '__LUMEN_RUNTIME_KEY__';
const PRECACHE = __LUMEN_PRECACHE__;

const SHELL = `lumen-shell-${VERSION}`;
const RUNTIME = `lumen-runtime-${RUNTIME_KEY}`;
const SHARE = 'lumen-share';
const RUNTIME_PREFIXES = ['/models/', '/mediapipe/', '/ort/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const stale = (name.startsWith('lumen-shell-') && name !== SHELL) || (name.startsWith('lumen-runtime-') && name !== RUNTIME);
        if (stale) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'VERSION') event.ports[0]?.postMessage({ version: VERSION, runtime: RUNTIME });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(req));
    return;
  }
  // /api is always live; Range requests pass through; Settings' offline download stores files itself.
  if (url.pathname.startsWith('/api/') || req.headers.has('range') || req.headers.has('x-lumen-offline')) return;
  const runtime = RUNTIME_PREFIXES.some((p) => url.pathname.startsWith(p));
  if (req.method === 'HEAD' && runtime) {
    event.respondWith(headFromCache(req));
    return;
  }
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    event.respondWith(navigate(req));
    return;
  }
  event.respondWith(cacheFirst(event, req, runtime ? RUNTIME : SHELL));
});

/** Every page is the single-page app: serve the cached shell, so routes open offline. */
async function navigate(req) {
  const cached = await caches.match('/', { cacheName: SHELL });
  if (cached) return isolated(cached);
  try {
    return isolated(await fetch(req));
  } catch {
    return new Response('Lumen Atelier is offline and has not been cached yet. Connect once and reload.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(event, req, cacheName) {
  const cache = await caches.open(cacheName);
  // Runtime files are versioned by path; a query (MediaPipe's per-load `?instance=n`) names the same file.
  const hit = await cache.match(req, { ignoreSearch: cacheName === RUNTIME });
  if (hit) return isolated(hit);
  const res = await fetch(req);
  // Only complete, same-origin, successful bodies; never the SPA's HTML fallback for a missing file.
  const html = (res.headers.get('content-type') ?? '').includes('text/html');
  if (res.status === 200 && res.type === 'basic' && !html) event.waitUntil(cache.put(req, res.clone()).catch(() => undefined));
  return isolated(res);
}

/** MediaPipe checks that a model exists with HEAD before loading it; answer from the cache when offline. */
async function headFromCache(req) {
  const hit = await caches.match(req.url, { cacheName: RUNTIME });
  if (hit) return new Response(null, { status: 200, headers: hit.headers });
  return fetch(req);
}

/**
 * Multi-threaded WebAssembly needs cross-origin isolation (COOP + COEP). The app server
 * sends these headers, but a plain static host may not, so add them when they're missing.
 * Redirected responses are rebuilt too: the browser rejects them for navigations.
 */
function isolated(res) {
  if (res.type !== 'basic' && res.type !== 'default') return res;
  if (res.headers.get('cross-origin-embedder-policy') && !res.redirected) return res;
  const headers = new Headers(res.headers);
  if (!headers.has('cross-origin-embedder-policy')) headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  if (!headers.has('cross-origin-opener-policy')) headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (!headers.has('cross-origin-resource-policy')) headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function receiveShare(req) {
  try {
    const form = await req.formData();
    const files = form.getAll('photos').filter((f) => typeof f === 'object' && f && 'arrayBuffer' in f);
    const cache = await caches.open(SHARE);
    for (const key of await cache.keys()) await cache.delete(key);
    await Promise.all(
      files.map((f, i) =>
        cache.put(
          `/__shared/${i}`,
          new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name || `shared-${i + 1}.jpg`) } }),
        ),
      ),
    );
    return Response.redirect(files.length ? '/?share=1' : '/', 303);
  } catch {
    return Response.redirect('/?share=failed', 303);
  }
}
