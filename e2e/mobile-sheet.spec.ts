import { expect, test, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/**
 * Drags the sheet handle by dy px in `steps` moves, `frameMs` apart (a finger reports about once per
 * frame; with no gap there is no speed, so no flick), optionally pausing before letting go.
 */
async function dragHandle(page: Page, dy: number, steps: number, pauseMs = 0, frameMs = 0) {
  const box = (await page.getByTestId('sheet-handle').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + (dy * i) / steps);
    if (frameMs) await page.waitForTimeout(frameMs);
  }
  if (pauseMs) await page.waitForTimeout(pauseMs);
  await page.mouse.up();
}

test('mobile sheet detents: follows the finger, settles on the nearest stop, dragging down closes it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 's.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  await page.getByRole('navigation', { name: 'Editing tools' }).getByRole('button', { name: 'Light' }).click();
  const sheet = page.getByTestId('compact-sheet');
  await expect(sheet).toHaveAttribute('data-expanded', 'false');
  await page.waitForTimeout(600);
  const compact = (await sheet.boundingBox())!.height;

  // While dragging, the sheet follows the finger.
  const box = (await page.getByTestId('sheet-handle').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2, box.y + 10 - 15 * i);
  await expect(sheet).toHaveAttribute('data-dragging', 'true');
  expect((await sheet.boundingBox())!.height).toBeGreaterThan(compact + 90);
  // A slow release past halfway settles on the tall stop.
  for (let i = 9; i <= 20; i++) await page.mouse.move(box.x + box.width / 2, box.y + 10 - 15 * i);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(sheet).toHaveAttribute('data-expanded', 'true');
  await expect(sheet).not.toHaveAttribute('data-dragging', 'true');

  // Slowly down a little from tall: back to the nearest stop, compact (not closed).
  await page.waitForTimeout(600);
  const tall = (await sheet.boundingBox())!.height;
  await dragHandle(page, tall - compact - 30, 12, 150);
  await expect(sheet).toHaveAttribute('data-expanded', 'false');
  await expect(sheet).toBeVisible();

  // A tap still toggles.
  await page.waitForTimeout(600);
  await page.getByTestId('sheet-handle').click();
  await expect(sheet).toHaveAttribute('data-expanded', 'true');
  await page.getByTestId('sheet-handle').click();
  await expect(sheet).toHaveAttribute('data-expanded', 'false');

  // Dragging most of the way down closes it, however fast the release. (Flick speed itself is unit
  // tested in sheetDetents.test.ts: under software rendering each simulated move takes 50–100 ms,
  // so the speed a test can produce varies from run to run.)
  await page.waitForTimeout(600);
  await dragHandle(page, compact - 60, 6, 0, 16);
  await expect(sheet).toHaveCount(0);
});
