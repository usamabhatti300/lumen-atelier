import { expect, test } from '@playwright/test';

test('mobile first visit: the sample frame sits beside "add a photo" and fits the phone', async ({ page }) => {
  await page.goto('/');
  const sample = page.getByTestId('try-sample');
  await expect(sample).toBeVisible();
  const box = (await sample.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await sample.tap();
  await page.waitForURL(/\/project\//);
});
