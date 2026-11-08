/**
 * Critical journey (spec §17):
 * upload reference -> analyze -> generate preset -> upload target -> preview ->
 * refine -> save preset -> reload project -> reapply preset -> export edited
 * photograph. Verifies the export contains the adjustments, the original is
 * unchanged, and the project survives a reload.
 */
import { expect, test } from '@playwright/test';
import { imageStats, makeImage, setRange, sha256, waitForRender } from './helpers.ts';
import { readFileSync } from 'node:fs';

test('reference to preset to export', async ({ page }) => {
  // Headless Chromium renders WebGL in software (SwiftShader); this journey renders a lot.
  test.setTimeout(600_000);
  await page.goto('/');
  const target = await makeImage(page, 'target', 1200, 800);
  const reference = await makeImage(page, 'reference', 900, 600);
  const targetHash = await sha256(page, target);

  // Upload the target photo (creates a project).
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'target.jpg', mimeType: 'image/jpeg', buffer: target });
  await page.waitForURL(/\/project\//);
  await waitForRender(page);
  const projectUrl = page.url();

  // Upload the reference and analyse it.
  await page.getByTestId('open-reference').click();
  await page.getByTestId('reference-file-input').setInputFiles({ name: 'reference.jpg', mimeType: 'image/jpeg', buffer: reference });
  await page.getByTestId('analyze').click();
  const description = page.getByTestId('style-description');
  await expect(description).toBeVisible();
  await expect(description).not.toBeEmpty();
  // No API key in the test server: the AI stage is skipped honestly.
  await expect(page.getByText('No AI model is available (no API key, and the local model is not running). Using measurements only.')).toBeVisible();
  await expect(page.getByText('Written from measurements (no AI)')).toBeVisible();

  // The look is matched to the target (closed loop in the worker) and applied automatically; refine intensity.
  await expect(page.getByText(/look applied \(matched\)/)).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Intensity' })).toBeVisible();
  await setRange(page, 'Intensity', 80);
  await expect(page.getByRole('slider', { name: 'Intensity' })).toHaveValue('80');

  // Save the preset.
  await page.getByLabel('Save as preset').fill('E2E Reference Look');
  await page.getByTestId('save-reference-preset').click();
  await expect(page.getByText('Saved as “E2E Reference Look”.')).toBeVisible();
  await page.getByRole('button', { name: 'Refine in the editor' }).click();

  // Refine an individual control in the editor.
  await setRange(page, 'Exposure', 0.3);
  await expect(page.getByRole('slider', { name: 'Exposure', exact: true })).toHaveValue('0.3');
  await expect(page.getByTestId('save-state')).toHaveText(/Saved/, { timeout: 15_000 });

  // Reload: the project, its edit and the preset survive.
  await page.goto(projectUrl);
  await waitForRender(page);
  await expect(page.getByText(/^Applied /)).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Exposure', exact: true })).toHaveValue('0.3');

  // Remove the preset, then reapply the saved one from the library.
  await page.getByRole('button', { name: 'Remove preset' }).click();
  await page.getByRole('radio', { name: 'Yours' }).click();
  await page.getByRole('button', { name: 'Apply E2E Reference Look' }).click();
  await expect(page.getByText('E2E Reference Look', { exact: true }).first()).toBeVisible();
  // The saved reference preset carries the reference's statistics, so it can be matched to this photo.
  await page.getByTestId('match-preset-to-photo').click();
  await expect(page.getByText('E2E Reference Look · matched').first()).toBeVisible({ timeout: 60_000 });

  // Export and verify the file.
  await page.getByTestId('export-open').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-start').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('target-edited.jpg');
  const exported = readFileSync((await download.path())!);
  const exportedStats = await imageStats(page, exported);
  const originalStats = await imageStats(page, target);
  expect(exportedStats.width).toBe(1200);
  expect(exportedStats.height).toBe(800);
  const diff = exportedStats.mean.reduce((s, v, i) => s + Math.abs(v - originalStats.mean[i]), 0);
  expect(diff).toBeGreaterThan(6); // the look is really baked into the pixels

  // The stored original is byte-for-byte unchanged.
  const storedHash = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('lumen-atelier');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all: { id: string; blob: Blob }[] = await new Promise((res) => {
      const req = db.transaction('originals').objectStore('originals').getAll();
      req.onsuccess = () => res(req.result);
    });
    const buf = await all[0].blob.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
  });
  expect(storedHash).toBe(targetHash);
});
