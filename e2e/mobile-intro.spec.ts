import { expect, test } from '@playwright/test';

test('mobile opening animation: it covers the whole screen, then shows the app', async ({ page }) => {
  await page.goto('/?intro=full');
  const intro = page.getByTestId('intro');
  await expect(intro).toBeVisible();
  await expect(intro).toHaveAttribute('data-mode', 'full');
  const box = (await intro.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width);
  expect(box.height).toBeGreaterThanOrEqual(vp.height);
  await expect(intro).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('gallery-file-input')).toBeAttached();
});
