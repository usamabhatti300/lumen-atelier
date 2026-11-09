import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

test('afterimage: changing the look shows the previous frame as a ghost (read back without blocking)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'g.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  await page.getByRole('button', { name: 'Apply Velvet Slide', exact: true }).click();
  await page.waitForTimeout(1500);

  // Watch for the ghost's canvas and sample it once its pixels have arrived from the GPU.
  const sampled = page.evaluate(
    () =>
      new Promise<{ w: number; h: number; filled: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no ghost appeared')), 60_000);
        const obs = new MutationObserver(() => {
          const c = document.querySelector('.afterimage-ghost canvas') as HTMLCanvasElement | null;
          if (!c) return;
          obs.disconnect();
          const t0 = performance.now();
          const check = () => {
            const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
            let filled = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 30) filled++;
            if (filled > 0 || performance.now() - t0 > 3000) {
              clearTimeout(timer);
              resolve({ w: c.width, h: c.height, filled: filled / (d.length / 4) });
            } else requestAnimationFrame(check);
          };
          check();
        });
        obs.observe(document.body, { childList: true, subtree: true });
      }),
  );
  await page.getByRole('button', { name: 'Apply Golden Portrait Negative', exact: true }).click();
  const g = await sampled;
  expect(g.w).toBeGreaterThan(100);
  expect(g.h).toBeGreaterThan(50);
  // The previous frame fills the ghost (the test photo has no large black areas).
  expect(g.filled).toBeGreaterThan(0.6);
});
