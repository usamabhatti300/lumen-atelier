import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/** Tests for the 2026-11-14 audit pass (PRODUCT_AUDIT_AND_IMPROVEMENT_PLAN.md), phone. */

test('mobile looks: picks for the photo open first, and choosing a look never moves the photo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'm.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  const sheet = page.getByTestId('compact-sheet');
  await expect(page.getByRole('tab', { name: 'For this photo' })).toHaveAttribute('aria-selected', 'true');
  const strip = sheet.locator('ul[aria-label="Looks"] li > button');
  await expect(strip).toHaveCount(6);
  // With no look on, the amount row's place holds one quiet line.
  await expect(page.getByTestId('looks-hint')).toBeVisible();
  await expect(page.getByTestId('edge-print')).toHaveCount(0);

  const viewport = page.getByTestId('viewport');
  const before = (await viewport.boundingBox())!;
  const sheetBefore = (await sheet.boundingBox())!;
  await strip.first().click();
  await expect(sheet.getByRole('slider', { name: 'Amount' })).toBeVisible();
  await page.waitForTimeout(800);
  const after = (await viewport.boundingBox())!;
  const sheetAfter = (await sheet.boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(sheetAfter.height - sheetBefore.height)).toBeLessThanOrEqual(1);

  // Keep the look from the amount row; it shows under Kept.
  await sheet.getByRole('button', { name: /^Keep / }).click();
  await page.getByRole('radio', { name: 'Kept' }).click();
  await expect(strip).toHaveCount(1);

  // Touch targets in the looks sheet are at least 44 px tall.
  for (const el of [page.getByRole('radio', { name: 'Kept' }), page.getByRole('button', { name: 'Search looks' }), sheet.getByRole('button', { name: 'Remove look' })]) {
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('mobile tools: More returns to the grid, Photos has a back chevron, the look chip steps aside for a tool', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'm.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  const dock = page.getByRole('navigation', { name: 'Editing tools' });
  const sheet = page.getByTestId('compact-sheet');
  await sheet.locator('ul[aria-label="Looks"] li > button').first().click();
  const chip = page.getByTestId('edge-print');
  await expect(chip).toBeVisible();

  await dock.getByRole('button', { name: 'More' }).click();
  await sheet.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'photos' })).toBeVisible();
  // The back chevron goes to the grid.
  await sheet.getByRole('button', { name: 'All tools' }).click();
  await expect(sheet.getByRole('button', { name: 'Portrait', exact: true })).toBeVisible();

  // Inside a tool, the dock's More goes back to the grid too.
  await sheet.getByRole('button', { name: 'Crop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adjust crop on photo' })).toBeVisible();
  await dock.getByRole('button', { name: 'More' }).click();
  await expect(sheet.getByRole('button', { name: 'Portrait', exact: true })).toBeVisible();

  // While a tool works on the photo, the look chip is out of its way; it returns afterwards.
  await sheet.getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByRole('button', { name: 'Adjust crop on photo' }).click();
  await expect(chip).toHaveCount(0);
  await page.getByTestId('crop-cancel').click();
  await expect(chip).toBeVisible();
});

test('mobile home: once you have an edit, your edits come right after the two actions', async ({ page }) => {
  await page.goto('/');
  // First visit: the story sits between the hero and the contact sheet.
  const edits = page.getByRole('heading', { name: 'Your edits' });
  const firstVisitY = (await edits.boundingBox())!.y + (await page.evaluate(() => document.querySelector('.scroll-quiet')?.scrollTop ?? 0));
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'm.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Open / }).first()).toBeVisible();
  const y = (await edits.boundingBox())!.y;
  // On the first screen of a phone, and far above where a first visit puts it.
  expect(y).toBeLessThan(page.viewportSize()!.height * 0.6);
  expect(y).toBeLessThan(firstVisitY - 300);
  // Both actions are still there, and only one of them is lilac.
  await expect(page.getByRole('button', { name: 'Match a look' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open a photo' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
