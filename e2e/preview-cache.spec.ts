import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';


test('look previews are kept per photo, so reopening an edit shows them straight away', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'c.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  await page.waitForFunction(() => {
    const n = [...document.querySelectorAll('button[aria-label^="Apply "] img')].filter((i) => (i as HTMLImageElement).src).length;
    return n >= 6;
  }, null, { timeout: 120_000 });

  // Stored in IndexedDB, tagged with this photo.
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open('lumen-atelier');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const q = r.result.transaction('thumbs').objectStore('thumbs').count();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        };
      }),
  );
  expect(stored).toBeGreaterThanOrEqual(6);

  await page.reload();
  await waitForRender(page);
  const t0 = Date.now();
  await page.waitForFunction(() => {
    const n = [...document.querySelectorAll('button[aria-label^="Apply "] img')].filter((i) => (i as HTMLImageElement).src).length;
    return n >= 6;
  }, null, { timeout: 60_000 });
  // From the cache: well under the time a fresh render of six previews takes under software GL.
  expect(Date.now() - t0).toBeLessThan(2000);
});
