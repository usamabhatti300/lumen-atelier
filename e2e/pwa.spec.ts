import { expect, test, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/**
 * The installable app on a phone (Pixel 7 profile, production build):
 * installability, offline use of the whole editor, photos shared from other apps,
 * and the on-device AI tools after "Save AI models offline".
 * Run with `npm run test:e2e:pwa` (see playwright.pwa.config.ts).
 */

/** Proves the network is really cut, for the page and its service worker alike: an uncached file must fail. */
async function expectNetworkCut(page: Page) {
  const probe = await page.evaluate(() => fetch(`/favicon.svg?probe=${Date.now()}`).then(() => 'reached', () => 'failed'));
  expect(probe).toBe('failed');
}

async function controlled(page: Page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The first visit installs the worker and it claims the page; a reload is then served by it.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('installable: manifest, icons, service worker, cross-origin isolation', async ({ page, request }) => {
  await controlled(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(href!);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: 'Lumen Atelier', display: 'standalone', start_url: '/', scope: '/' });
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type']).toBe(icon.type);
  }
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
  // Chromium's own install criteria.
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

test('offline: gallery, editor, presets, settings and export work without a connection', async ({ page, context }) => {
  await controlled(page);
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'offline.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  const projectUrl = page.url();

  await context.setOffline(true);
  await page.goto('/');
  await expectNetworkCut(page);
  await expect(page.getByTestId('offline-pill')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your edits' })).toBeVisible();

  await page.goto(projectUrl);
  await waitForRender(page);
  const nav = page.getByRole('navigation', { name: 'Editing tools' });
  await nav.getByRole('button', { name: 'Looks' }).click();
  await page.getByRole('button', { name: 'Apply Golden Hour Glow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply Golden Hour Glow', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close panel' }).click();

  await page.getByTestId('export-open').click();
  await page.getByTestId('export-start').click();
  await expect(page.getByText(/Exported 1 file/)).toBeVisible({ timeout: 180_000 });
  await page.keyboard.press('Escape');

  await page.goto('/presets');
  await expect(page.getByRole('heading', { name: 'Every roll' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('The editor is saved on this device')).toBeVisible();
  await context.setOffline(false);
});

test('share target: photos shared from another app open in a new project', async ({ page }) => {
  await controlled(page);
  const bytes = await makeImage(page, 'target', 640, 480);
  // What Android's share sheet does: a multipart POST to the manifest's share_target action.
  const status = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const form = new FormData();
    form.append('photos', new File([arr], 'shared.jpg', { type: 'image/jpeg' }));
    const res = await fetch('/share-target', { method: 'POST', body: form, redirect: 'manual' });
    return res.type === 'opaqueredirect' ? 'redirect' : String(res.status);
  }, bytes.toString('base64'));
  expect(status).toBe('redirect');
  await page.goto('/?share=1');
  await page.waitForURL(/\/project\//);
  await waitForRender(page);
  // Phones hide the filmstrip for a single photo; the Photos tab lists the project's photos.
  await page.getByRole('navigation', { name: 'Editing tools' }).getByRole('button', { name: 'Looks' }).click();
  await page.getByTestId('compact-sheet').getByRole('radio', { name: 'Photos' }).click();
  await expect(page.getByRole('list', { name: 'Photos in this project' })).toContainText('shared.jpg');
});

test('offline AI: saved models run portrait detection and the AI runtime with no connection', async ({ page, context }) => {
  await controlled(page);
  await page.goto('/settings');
  const saved = page.getByTestId('offline-models');
  await expect(saved).toContainText('files saved offline');
  await page.getByTestId('save-offline').click();
  await expect(saved).toHaveText(/^(\d+) of \1 files saved offline/, { timeout: 480_000 });

  await context.setOffline(true);
  await page.goto('/settings');
  await expectNetworkCut(page);
  await page.getByRole('button', { name: 'Check AI runtime' }).click();
  await expect(page.getByTestId('ai-runtime-status')).toContainText('Working', { timeout: 180_000 });

  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'face.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  await page.getByRole('navigation', { name: 'Editing tools' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Portrait', exact: true }).click();
  await page.getByRole('button', { name: 'Detect faces & subject' }).click();
  await expect(page.getByText(/face(s)? found|No face found/)).toBeVisible({ timeout: 180_000 });
  await context.setOffline(false);
});
