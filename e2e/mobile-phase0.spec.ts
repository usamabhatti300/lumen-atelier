import { expect, test, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/** Phase 0 fixes (PRODUCT_STRATEGY.md), phone. */

const photoWidth = async (page: Page) => (await page.locator('canvas.editor-canvas').boundingBox())!.width;

test('mobile: two fingers zoom while a tool is active, and leave no stray mark', async ({ page }) => {
  test.setTimeout(300_000);
  const cdp = await page.context().newCDPSession(page);
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'z.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: /^Portrait/ }).first().click();
  await page.getByRole('button', { name: 'Heal spots' }).click();
  await expect(page.getByTestId('tool-overlay')).toBeVisible();

  const b = (await page.locator('canvas.editor-canvas').boundingBox())!;
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const tap = async (x: number, y: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  // One finger still heals (on lifting the finger).
  await tap(c.x, c.y);
  await expect(page.getByRole('button', { name: 'Clear 1' })).toBeVisible();

  // Two fingers zoom in, and add no spot.
  const fit = await photoWidth(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x - 30, y: c.y }, { x: c.x + 30, y: c.y }] });
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 30 - 16 * i, y: c.y }, { x: c.x + 30 + 16 * i, y: c.y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => photoWidth(page)).toBeGreaterThan(fit * 1.5);
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: 'Clear 1' })).toBeVisible();

  // Zoomed in, one finger heals again: the tool is still the tool.
  await tap(c.x + 20, c.y + 10);
  await expect(page.getByRole('button', { name: 'Clear 2' })).toBeVisible();
});
