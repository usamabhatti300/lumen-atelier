import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

// Regression: replacing an analysed reference used to crash the studio (blank screen) while the
// "Apply to your photo" pane animated out with its data already cleared.
test('replacing an analysed reference keeps the studio working', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const target = await makeImage(page, 'target', 900, 600);
  const first = await makeImage(page, 'reference', 900, 600);
  const second = await makeImage(page, 'target', 700, 500);
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'target.jpg', mimeType: 'image/jpeg', buffer: target });
  await page.waitForURL(/\/project\//);
  await waitForRender(page);
  await page.getByTestId('open-reference').click();
  await page.getByTestId('reference-file-input').setInputFiles({ name: 'first.jpg', mimeType: 'image/jpeg', buffer: first });
  await page.getByTestId('analyze').click({ timeout: 180_000 });
  await expect(page.getByTestId('style-description')).toBeVisible({ timeout: 240_000 });

  await page.getByTestId('reference-file-input').setInputFiles({ name: 'second.jpg', mimeType: 'image/jpeg', buffer: second });
  await expect(page.getByTestId('analyze')).toBeVisible();
  await expect(page.getByTestId('style-description')).toHaveCount(0);
  expect(errors).toEqual([]);
});
