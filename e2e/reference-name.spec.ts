import { expect, test } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

test('a matched look is named from what was measured, and the name and mood can be edited before saving', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'target.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  await page.getByTestId('open-reference').click();
  await page.getByTestId('reference-file-input').setInputFiles({ name: 'ref.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'reference', 900, 600) });
  await page.getByTestId('analyze').click();
  await expect(page.getByText(/look applied \(matched\)/)).toBeVisible({ timeout: 180_000 });

  // Two roll-style words instead of "Reference look 8 Nov", and a three-word mood.
  const name = page.getByLabel('Save as preset');
  await expect(name).toHaveValue(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  const suggested = await name.inputValue();
  const mood = page.getByTestId('reference-mood');
  await expect(mood).toHaveValue(/^[a-z &]+, [a-z &]+(, [a-z &]+)?$/);

  // Both are editable; the mood is saved as searchable tags.
  await mood.fill('dreamy, teal, faded');
  await page.getByTestId('save-reference-preset').click();
  await expect(page.getByText(`Saved as “${suggested}”.`)).toBeVisible();
  await expect(name).toHaveValue(suggested); // saving doesn't change the field
  const tags = await page.evaluate(
    (n) =>
      new Promise<string[]>((resolve, reject) => {
        const r = indexedDB.open('lumen-atelier');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const q = r.result.transaction('presets').objectStore('presets').getAll();
          q.onsuccess = () => resolve((q.result as { name: string; tags: string[] }[]).find((p) => p.name === n)?.tags ?? []);
        };
      }),
    suggested,
  );
  expect(tags).toEqual(['reference', 'dreamy', 'teal', 'faded']);
});
