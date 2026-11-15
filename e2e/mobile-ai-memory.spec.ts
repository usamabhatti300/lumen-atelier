import { expect, test, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/**
 * Phones keep one AI runtime alive at a time (src/lib/ml/memory.ts): a Galaxy S23 ran out of
 * memory going from Portrait to Masks → Select object → Clothes. The sequence must work, the
 * idle worker must be gone, and Select object must still work after its own worker was released.
 */
const workers = (page: Page) => page.workers().map((w) => w.url());
const has = (page: Page, name: string) => workers(page).some((u) => u.includes(name));

test('mobile: Portrait, then Select object, then Clothes, with one AI worker at a time', async ({ page }) => {
  test.setTimeout(1_500_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('crash', () => errors.push('page crashed'));
  const cdp = await page.context().newCDPSession(page);
  const tapPhoto = async (fx: number, fy: number) => {
    const b = (await page.locator('canvas.editor-canvas').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width * fx, y: b.y + b.height * fy }] });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'm.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 960, 640) });
  await waitForRender(page);

  // Portrait first: its worker starts and stays.
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: /^Portrait/ }).first().click();
  await expect(page.getByText(/face(s)? found|No face found/).first()).toBeVisible({ timeout: 240_000 });
  expect(has(page, 'portrait.worker')).toBe(true);

  // Select object: the portrait worker is shut down to make room, and a tap selects.
  await page.getByRole('button', { name: 'Masks', exact: true }).click();
  await page.getByRole('button', { name: /Select object/ }).first().click();
  const chip = page.getByTestId('select-object-chip');
  await expect(chip).toContainText(/an object/i, { timeout: 900_000 });
  expect(has(page, 'portrait.worker')).toBe(false);
  expect(has(page, 'ml.worker')).toBe(true);
  await tapPhoto(0.4, 0.08);
  await expect(page.getByTestId('object-point-include')).toHaveCount(1, { timeout: 120_000 });

  // Clothes while Select object is still on.
  await page.getByRole('button', { name: 'New mask' }).click();
  await page.getByRole('button', { name: 'Clothes', exact: true }).click();
  await page.waitForTimeout(5000);
  await expect(page.locator('canvas.editor-canvas')).toBeVisible();

  // Leaving the tool gives the model's memory back a few seconds later.
  await page.getByTestId('touch-mode').getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => has(page, 'ml.worker'), { timeout: 30_000 }).toBe(false);

  // Coming back loads it again, and a tap still selects.
  await page.getByRole('button', { name: 'Select object', exact: true }).last().click();
  await expect(chip).toContainText(/an object/i, { timeout: 900_000 });
  await tapPhoto(0.45, 0.6);
  await expect(page.getByTestId('object-point-include')).toHaveCount(1, { timeout: 120_000 });
  expect(errors).toEqual([]);
});
