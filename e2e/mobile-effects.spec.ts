import { expect, test } from '@playwright/test';
import { makeImage, setRange, waitForRender } from './helpers.ts';

test('mobile effects: More → Effects opens the effects, a slider changes the photo, the dock is unchanged', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'm.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  const dock = page.getByRole('navigation', { name: 'Editing tools' });
  // No new dock tab: Effects lives in the More grid.
  await expect(dock.getByRole('button', { name: 'Effects' })).toHaveCount(0);
  await dock.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Effects', pressed: true })).toBeVisible();
  const leak = page.getByRole('slider', { name: 'Light leak', exact: true });
  await expect(leak).toBeVisible();
  await page.waitForTimeout(800);
  const before = await page.locator('canvas.editor-canvas').screenshot();
  await setRange(page, 'Light leak', 80);
  await page.waitForTimeout(900);
  expect(Buffer.compare(await page.locator('canvas.editor-canvas').screenshot(), before)).not.toBe(0);
  // The back chevron returns to the grid.
  await page.getByRole('button', { name: 'All tools' }).click();
  await expect(page.getByRole('button', { name: 'Effects', exact: true })).toBeVisible();
});
