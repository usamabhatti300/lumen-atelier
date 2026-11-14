import { expect, test } from '@playwright/test';
import { imageStats, makeImage, setRange, waitForRender, withExifOrientation } from './helpers.ts';
import { readFileSync } from 'node:fs';

test.describe('editor', () => {
  test('rejects unsupported and corrupt files with clear errors', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('hello, this is not an image at all') });
    await expect(page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: 'not a supported image' })).toBeVisible();
    const good = await makeImage(page, 'target', 400, 300);
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'truncated.jpg', mimeType: 'image/jpeg', buffer: good.subarray(0, 400) });
    await expect(page.getByText(/could not be decoded|corrupt|truncated/).first()).toBeVisible();
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]);
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'phone.heic', mimeType: 'image/heic', buffer: heic });
    await expect(page.getByText(/HEIC\/HEIF/).first()).toBeVisible();
  });

  test('sliders change the image; undo and redo restore it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
    await waitForRender(page);
    const before = await page.locator('canvas.editor-canvas').screenshot();
    await setRange(page, 'Exposure', 1.5);
    await page.waitForTimeout(800);
    const after = await page.locator('canvas.editor-canvas').screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
    const brighter = await imageStats(page, after);
    const base = await imageStats(page, before);
    expect(brighter.mean[1]).toBeGreaterThan(base.mean[1] + 10);

    await page.keyboard.press('Control+z');
    await expect(page.getByRole('slider', { name: 'Exposure', exact: true })).toHaveValue('0');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByRole('slider', { name: 'Exposure', exact: true })).toHaveValue('1.5');

    // Press and hold the photo with the mouse to see the original; release to return to the edit.
    const box = (await page.locator('canvas.editor-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId('viewport').getByText('original', { exact: true })).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('viewport').getByText('original', { exact: true })).toBeHidden();
  });

  test('keyboard can operate sliders and the before/after split', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
    await waitForRender(page);
    const contrast = page.getByRole('slider', { name: 'Contrast', exact: true });
    await contrast.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(contrast).toHaveValue('2');
    await page.locator('body').click({ position: { x: 5, y: 500 } });
    await page.keyboard.press('y');
    await expect(page.getByRole('slider', { name: 'Before and after divider' })).toBeVisible();
  });

  test('applies EXIF orientation and exports rotated dimensions', async ({ page }) => {
    await page.goto('/');
    const jpeg = await makeImage(page, 'target', 600, 400);
    const rotated = withExifOrientation(jpeg, 6); // 90° clockwise
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'rotated.jpg', mimeType: 'image/jpeg', buffer: rotated });
    await waitForRender(page);
    // The size under the photo (the histogram's preview-size reading is now a tooltip).
    await expect(page.getByTestId('edge-print')).toContainText('400 × 600');
    await page.getByTestId('export-open').click();
    await expect(page.getByText('400 × 600px')).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-start').click();
    const file = readFileSync((await (await dl).path())!);
    const s = await imageStats(page, file);
    expect([s.width, s.height]).toEqual([400, 600]);
  });

  test('crop changes export dimensions; PNG keeps transparency', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 't.png', mimeType: 'image/png', buffer: await makeImage(page, 'transparent', 800, 600) });
    await waitForRender(page);
    await page.locator('#tab-geometry').click();
    await page.getByRole('button', { name: '1:1' }).click();
    await expect(page.getByText('Output 600 × 600 px')).toBeVisible();
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-start').click();
    const download = await dl;
    expect(download.suggestedFilename()).toBe('t-edited.png');
    const bytes = readFileSync((await download.path())!);
    const alpha = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]), { premultiplyAlpha: 'none' });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, corner: ctx.getImageData(0, 0, 1, 1).data[3] };
    }, bytes.toString('base64'));
    expect([alpha.w, alpha.h]).toEqual([600, 600]);
    expect(alpha.corner).toBe(0);
  });

  test('presets: real distinct previews, favourites and intensity', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
    await waitForRender(page);
    // One switch picks the collection; Rolls is the default, open on roll 01 (Editor's Picks).
    await expect(page.getByRole('radio', { name: 'Rolls' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('tab', { name: "Editor's Picks" })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /^Apply / })).toHaveCount(51);
    await page.getByRole('button', { name: 'Apply Velvet Slide' }).click();
    await expect(page.getByText(/^Applied /)).toBeVisible();
    await setRange(page, 'Amount', 40);
    await expect(page.getByRole('slider', { name: 'Amount' })).toHaveValue('40');
    await page.getByRole('button', { name: 'Add Velvet Slide to favourites' }).click();
    await page.getByRole('radio', { name: 'Kept' }).click();
    await expect(page.getByRole('button', { name: 'Apply Velvet Slide' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Apply / })).toHaveCount(1);
    // Search covers the whole library, not just the open tab. Rolls reopens the roll you were on.
    await page.getByRole('radio', { name: 'Rolls' }).click();
    await expect(page.getByRole('tab', { name: "Editor's Picks" })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('searchbox', { name: 'Search presets' }).fill('bleach');
    await expect(page.getByRole('button', { name: 'Apply Bleach Bypass' })).toBeVisible();
    // Roll tabs filter (Monochrome Diary, the black & white roll, holds the four monochrome recipes).
    await page.getByRole('searchbox', { name: 'Search presets' }).fill('');
    await page.getByRole('tab', { name: 'Monochrome Diary' }).click();
    await expect(page.getByRole('button', { name: /^Apply / })).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Apply Platinum Noir' })).toBeVisible();
  });

  test('masks: a radial mask affects only part of the image', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
    await waitForRender(page);
    await page.locator('#tab-masks').click();
    await page.getByRole('button', { name: 'New mask' }).click();
    await page.getByRole('button', { name: 'Radial', exact: true }).click();
    const box = (await page.getByTestId('viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('list', { name: 'Mask shapes' }).getByText('Radial gradient')).toBeVisible();
    const before = await page.locator('canvas.editor-canvas').screenshot();
    await setRange(page, 'Exposure', -3);
    await page.waitForTimeout(1000);
    const after = await page.locator('canvas.editor-canvas').screenshot();
    const b = await imageStats(page, before);
    const a = await imageStats(page, after);
    expect(a.mean[1]).toBeLessThan(b.mean[1] - 2); // centre darkened
    expect(a.mean[1]).toBeGreaterThan(b.mean[1] * 0.4); // but not the whole frame
  });
});
