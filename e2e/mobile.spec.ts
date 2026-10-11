import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

test('mobile: compact controls, presets sheet and reference entry point', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  const nav = page.getByRole('navigation', { name: 'Editing tools' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Presets' }).click();
  // The Signature Collection is the default tab in the mobile presets sheet too.
  await expect(page.getByRole('tab', { name: 'Signature Collection' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Apply Golden Hour Glow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply Golden Hour Glow', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await nav.getByRole('button', { name: 'Match look' }).click();
  await expect(page.getByText('Add a reference photo')).toBeVisible();
  // No horizontal page scroll.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
