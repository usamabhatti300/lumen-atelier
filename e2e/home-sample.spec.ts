import { expect, test } from '@playwright/test';
import { waitForRender } from './helpers.ts';

test('first visit: roll covers render on the sample photo, and "try a sample" opens it as an edit', async ({ page }) => {
  await page.goto('/');
  // No edits yet: covers still show real renders (on the bundled sample), not blank cards.
  const covers = page.getByRole('heading', { name: 'Rolls' }).locator('xpath=../..').locator('img');
  await expect.poll(() => covers.count(), { timeout: 120_000 }).toBeGreaterThan(2);
  await expect(covers.first()).toHaveAttribute('src', /^(blob:|data:)/);

  const sample = page.getByTestId('try-sample');
  await expect(sample).toBeVisible();
  await expect(sample).toContainText('try a sample');
  await sample.click();
  await page.waitForURL(/\/project\//);
  await waitForRender(page);
  await expect(page.getByText('2048 × 1536')).toBeVisible();

  // Back home, the sample is now one of your edits and the sample frame is gone.
  await page.goto('/');
  await expect(page.getByText('1 frame')).toBeVisible();
  await expect(page.getByTestId('try-sample')).toHaveCount(0);
});
