import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

test('mobile finish: stamp, overlay and contact sheet controls fit a phone and reach the export', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'reference', 600, 900) },
  ]);
  await waitForRender(page);
  await page.getByTestId('export-open').click();
  const finish = page.getByTestId('finish');
  await expect(finish).toBeVisible();
  await page.getByText('Date stamp', { exact: true }).tap();
  await expect(page.getByRole('switch', { name: /Date stamp/ })).toBeChecked();
  await expect(page.getByLabel('Stamp date')).toBeVisible();
  await page.getByRole('radio', { name: 'Top right' }).tap();
  await expect(page.getByRole('radio', { name: 'Top right' })).toHaveAttribute('aria-checked', 'true');
  // The overlay control is reachable by touch and fits the phone.
  const overlay = page.getByRole('radiogroup', { name: 'Overlay' });
  await overlay.scrollIntoViewIfNeeded();
  await overlay.getByRole('radio', { name: 'Viewfinder' }).tap();
  await expect(overlay.getByRole('radio', { name: 'Viewfinder' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /Date stamp/ })).toBeEnabled();
  await overlay.getByRole('radio', { name: 'Camcorder' }).tap();
  await expect(page.getByText('The camcorder overlay shows the date itself.')).toBeVisible();
  await expect(page.getByLabel('Stamp date')).toBeVisible();
  const ob = await overlay.boundingBox();
  expect(ob!.x).toBeGreaterThanOrEqual(0);
  expect(ob!.x + ob!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // The contact sheet takes no overlay.
  await page.getByRole('radio', { name: 'Contact sheet' }).tap();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByText('frames · 2 of 2')).toBeVisible();
  // Nothing in the sheet runs off the side of the phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await finish.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  // Phones hand the file to the share sheet when they can, otherwise to downloads.
  const done = page.getByRole('status');
  await page.getByTestId('export-start').click();
  await expect(done).toContainText(/Exported 1 file/, { timeout: 180_000 });
});
