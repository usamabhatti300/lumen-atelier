import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

const RESULT = /face(s)? found|No face found/;

test('face detection runs by itself when a photo opens, and Detect again re-runs it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  await page.locator('#tab-portrait').click();
  // No button press needed.
  await expect(page.getByText(RESULT)).toBeVisible({ timeout: 180_000 });
  await page.getByRole('button', { name: 'Detect again' }).click();
  await expect(page.getByText(RESULT)).toBeVisible({ timeout: 180_000 });
});

test('with the setting off nothing runs until asked, and a run can be stopped', async ({ page }) => {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: /Detect faces automatically/ });
  await expect(toggle).toBeChecked();
  await page.getByText('Detect faces automatically', { exact: true }).click();
  await expect(toggle).not.toBeChecked();

  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'q.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  await page.locator('#tab-portrait').click();
  const detect = page.getByRole('button', { name: 'Detect faces & subject' });
  await expect(detect).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(detect).toBeVisible(); // still not run

  // Start, then stop while it runs (loading the models takes seconds).
  await detect.click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText(/Stopped\./)).toBeVisible({ timeout: 120_000 });
  await expect(detect).toBeVisible();
  await detect.click();
  await expect(page.getByText(RESULT)).toBeVisible({ timeout: 180_000 });
});
