import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/** Tests for the 2026-11-14 audit pass (PRODUCT_AUDIT_AND_IMPROVEMENT_PLAN.md), desktop. */

async function openPhoto(page: import('@playwright/test').Page, kind: 'target' | 'reference' = 'target') {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, kind, 900, 600) });
  await waitForRender(page);
}

const light = ['Exposure', 'Contrast', 'Highlights', 'Shadows', 'Blacks', 'Temperature', 'Tint', 'Vibrance'];
const readLight = (page: import('@playwright/test').Page) =>
  Promise.all(light.map((name) => page.getByRole('slider', { name, exact: true }).first().inputValue())).then((v) => v.join(','));

test('Auto sets the Light sliders in one undo step, and a second press changes nothing', async ({ page }) => {
  // A dark, hazy, warm scene: Auto has something to do.
  await openPhoto(page, 'reference');
  await page.locator('#tab-adjust').click();
  const before = await readLight(page);
  await page.getByTestId('auto-enhance').click();
  await expect.poll(() => readLight(page)).not.toBe(before);
  // It says what it changed.
  await expect(page.getByText(/^Auto: /)).toBeVisible();
  const after = await readLight(page);

  // Pressing again on the balanced photo says so and leaves the sliders alone.
  await page.getByTestId('auto-enhance').click();
  await expect(page.getByText('Already balanced: Auto found nothing to change.')).toBeVisible();
  expect(await readLight(page)).toBe(after);

  // One undo step takes all of it back.
  await page.keyboard.press('Control+z');
  await expect.poll(() => readLight(page)).toBe(before);
});

test('Auto on top of a look keeps the look’s colour and contrast', async ({ page }) => {
  await openPhoto(page, 'reference');
  await page.getByRole('tab', { name: 'Late Showing' }).click();
  await page.getByRole('button', { name: 'Apply Teal and Orange', exact: true }).click();
  await expect(page.getByText(/^Applied /)).toBeVisible();
  await page.locator('#tab-adjust').click();
  const value = (name: string) => page.getByRole('slider', { name, exact: true }).first().inputValue();
  const kept = await Promise.all(['Contrast', 'Blacks', 'Temperature', 'Tint', 'Vibrance'].map(value));
  await page.getByTestId('auto-enhance').click();
  await page.waitForTimeout(1500);
  expect(await Promise.all(['Contrast', 'Blacks', 'Temperature', 'Tint', 'Vibrance'].map(value))).toEqual(kept);
  // The look is still the applied look.
  await expect(page.getByText(/^Applied /)).toContainText('Teal and Orange');
});

test('a graded look is fitted for exposure only: its colour is not corrected away', async ({ page }) => {
  await openPhoto(page);
  await page.getByRole('tab', { name: 'Late Showing' }).click();
  await page.getByRole('button', { name: 'Apply Teal and Orange', exact: true }).click();
  await expect(page.getByText(/^Applied /)).toBeVisible();
  await page.locator('#tab-adjust').click();
  // The look sets temperature +5 and no tint; a neutral daylight photo must not add a correction.
  await expect(page.getByRole('slider', { name: 'Temperature', exact: true }).first()).toHaveValue('5');
  await expect(page.getByRole('slider', { name: 'Tint', exact: true }).first()).toHaveValue('0');
});

test('crop: Cancel and Escape put back the crop the tool opened with', async ({ page }) => {
  await openPhoto(page);
  await page.locator('#tab-geometry').click();
  const square = page.getByRole('button', { name: '1:1', exact: true });
  const size = page.getByText(/^Output \d+ × \d+ px$/);
  const full = await size.textContent();

  await page.getByRole('button', { name: 'Adjust crop on photo' }).click();
  await square.click();
  await expect(square).toHaveAttribute('aria-pressed', 'true');
  await expect(size).not.toHaveText(full!);
  await page.getByTestId('crop-cancel').click();
  await expect(square).toHaveAttribute('aria-pressed', 'false');
  await expect(size).toHaveText(full!);
  // A cancelled crop leaves nothing to undo back into.
  await expect(page.getByRole('button', { name: /^Undo/ }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Adjust crop on photo' })).toBeVisible();

  // Escape does the same.
  await page.getByRole('button', { name: 'Adjust crop on photo' }).click();
  await page.getByRole('button', { name: '4:5', exact: true }).click();
  await expect(size).not.toHaveText(full!);
  await page.getByTestId('viewport').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(size).toHaveText(full!);

  // Done keeps the crop.
  await page.getByRole('button', { name: 'Adjust crop on photo' }).click();
  await square.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(square).toHaveAttribute('aria-pressed', 'true');
});

test('the export preview shows the photo, not a black frame', async ({ page }) => {
  await openPhoto(page);
  await page.getByRole('tab', { name: "Editor's Picks" }).click();
  await page.getByRole('button', { name: 'Apply Daylight', exact: true }).click();
  await expect(page.getByText(/^Applied /)).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const preview = page.getByTestId('finish-preview');
  await expect(preview).toBeVisible();
  // Mean brightness of the preview canvas (the test photo is a bright daylight scene).
  await expect
    .poll(
      () =>
        preview.evaluate((el) => {
          const c = (el instanceof HTMLCanvasElement ? el : el.querySelector('canvas')) as HTMLCanvasElement | null;
          if (!c || !c.width) return 0;
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 16) sum += d[i] + d[i + 1] + d[i + 2];
          return sum / (d.length / 16) / 3;
        }),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(40);
});

test('the look library shows every look, roll by roll, on a real photo', async ({ page }) => {
  await page.goto('/presets');
  await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^View / })).toHaveCount(54);
  await expect(page.getByText('Shown here on a sample photo')).toBeVisible();
  // Twelve rolls and "all", no empty ones.
  await expect(page.getByRole('tablist', { name: 'Rolls' }).getByRole('tab')).toHaveCount(13);
  await page.getByRole('tab', { name: 'Pocket Digicam' }).click();
  await expect(page.getByRole('button', { name: 'View Pocket Flash' })).toBeVisible();
});

test('favourites and recents from the old library carry over to the curated looks', async ({ page }) => {
  await page.goto('/');
  // Seed the settings the 186-look library would have left behind.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('lumen-atelier');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          const put = (key: string, value: unknown) => (store.keyPath ? store.put({ key, value }) : store.put(value, key));
          put('favorites', ['builtin:golden-portrait-negative', 'builtin:creator-clean-pop', 'builtin:velvet-slide']);
          put('recentLooks', ['builtin:bleach-bypass', 'builtin:runway-black']);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.goto('/presets');
  await page.getByRole('radio', { name: 'Kept' }).click();
  await expect(page.getByRole('button', { name: /^View / })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'View Sunday Negative' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Velvet Slide' })).toBeVisible();
  await page.getByRole('radio', { name: 'Last roll' }).click();
  await expect(page.getByRole('button', { name: /^View / })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'View Silver Retain' })).toBeVisible();
});
