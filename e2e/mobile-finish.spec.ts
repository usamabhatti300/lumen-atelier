import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

test('mobile finish: stamp and contact sheet controls fit a phone and reach the export', async ({ page }) => {
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
  await page.getByRole('radio', { name: 'Contact sheet' }).tap();
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
