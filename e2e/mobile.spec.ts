import { expect, test, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

/**
 * No horizontal scroll. Mobile browsers zoom the page out when content is wider than the
 * device, which also widens innerWidth, so compare with the device width, not innerWidth.
 */
async function expectFitsScreen(page: Page) {
  const device = page.viewportSize()!.width;
  const { inner, scroll } = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(inner).toBe(device);
  expect(scroll).toBeLessThanOrEqual(device + 1);
}

test('mobile: compact controls, presets sheet and reference entry point', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  const nav = page.getByRole('navigation', { name: 'Editing tools' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Presets' }).click();
  // The Signature Collection is the default tab in the mobile presets sheet too.
  await expect(page.getByRole('tab', { name: 'Signature Collection' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Apply Golden Hour Glow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply Golden Hour Glow', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await nav.getByRole('button', { name: 'Match look' }).click();
  await expect(page.getByText('Add a reference photo')).toBeVisible();
  await expectFitsScreen(page);
});

/** Dispatches touch pointer events on the viewport (Playwright's touchscreen only taps). */
async function touch(page: Page, events: { type: 'pointerdown' | 'pointermove' | 'pointerup'; id: number; x: number; y: number }[]) {
  await page.getByTestId('viewport').evaluate((el, list) => {
    const r = el.getBoundingClientRect();
    for (const e of list) {
      el.dispatchEvent(
        new PointerEvent(e.type, { pointerId: e.id, pointerType: 'touch', isPrimary: e.id === 1, clientX: r.left + e.x, clientY: r.top + e.y, bubbles: true, button: 0, buttons: e.type === 'pointerup' ? 0 : 1 }),
      );
    }
  }, events);
}

const photoWidth = (page: Page) => page.locator('canvas.editor-canvas').evaluate((c) => c.getBoundingClientRect().width);

test('mobile: every editor feature is reachable by touch', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  const nav = page.getByRole('navigation', { name: 'Editing tools' });

  // Panels dock under the photo instead of covering it.
  await nav.getByRole('button', { name: 'Light' }).click();
  const sheet = page.getByTestId('compact-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByText('Clipping', { exact: false }).or(page.locator('svg[viewBox="0 0 256 72"]')).first()).toBeVisible(); // histogram
  await expect
    .poll(async () => {
      const photo = await page.locator('canvas.editor-canvas').boundingBox();
      const panel = await sheet.boundingBox();
      return !!photo && !!panel && photo.y + photo.height <= panel.y + 1;
    })
    .toBe(true);

  // Presets sheet: the full left panel, including the Photos tab and the preset amount.
  await nav.getByRole('button', { name: 'Presets' }).click();
  await page.getByRole('button', { name: 'Apply Velvet Slide', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: 'Amount' })).toBeVisible();
  await sheet.getByRole('radio', { name: 'Photos' }).click();
  await expect(page.getByRole('list', { name: 'Photos in this project' })).toBeVisible();
  await sheet.getByRole('radio', { name: 'Presets' }).click();
  await page.getByRole('button', { name: 'Close panel' }).click();

  // Top-bar actions hidden on phones live in the "More actions" menu.
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'More actions' });
  await menu.getByRole('menuitem', { name: 'Copy settings' }).click();
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await expect(menu.getByRole('menuitem', { name: 'Paste settings' })).toBeEnabled();
  await menu.getByRole('menuitemcheckbox', { name: 'Side by side' }).click();
  await expect(page.getByText('Before', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await menu.getByRole('menuitemcheckbox', { name: 'Side by side' }).click();

  // Pinch to zoom, double-tap to fit.
  const fit = await photoWidth(page);
  await touch(page, [
    { type: 'pointerdown', id: 1, x: 150, y: 200 },
    { type: 'pointerdown', id: 2, x: 210, y: 200 },
    { type: 'pointermove', id: 2, x: 330, y: 200 },
    { type: 'pointerup', id: 1, x: 150, y: 200 },
    { type: 'pointerup', id: 2, x: 330, y: 200 },
  ]);
  await expect.poll(() => photoWidth(page)).toBeGreaterThan(fit * 1.5);
  await touch(page, [
    { type: 'pointerdown', id: 3, x: 180, y: 200 },
    { type: 'pointerup', id: 3, x: 180, y: 200 },
    { type: 'pointerdown', id: 4, x: 182, y: 201 },
    { type: 'pointerup', id: 4, x: 182, y: 201 },
  ]);
  await expect.poll(() => photoWidth(page)).toBeCloseTo(fit, 0);

  // Remove: Shift's job is an on-screen mode on touch screens; Done leaves the tool.
  await nav.getByRole('button', { name: 'More' }).click();
  await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
  const modes = page.getByTestId('touch-mode');
  await expect(modes).toBeVisible();
  await modes.getByRole('radio', { name: 'Add to last' }).click();
  await expect(modes.getByRole('radio', { name: 'Add to last' })).toHaveAttribute('aria-checked', 'true');
  // Switching to Crop drops the Remove brush.
  await sheet.getByRole('button', { name: 'Crop', exact: true }).click();
  await expect(modes).toBeHidden();
  await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
  await modes.getByRole('button', { name: 'Done' }).click();
  await expect(modes).toBeHidden();

  await expectFitsScreen(page);
});

test('mobile landscape: panels sit beside the photo and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  await expectFitsScreen(page);
  await page.getByRole('navigation', { name: 'Editing tools' }).getByRole('button', { name: 'Colour' }).click();
  const sheet = page.getByTestId('compact-sheet');
  await expect
    .poll(async () => {
      const photo = await page.locator('canvas.editor-canvas').boundingBox();
      const panel = await sheet.boundingBox();
      return !!photo && !!panel && photo.x + photo.width <= panel.x + 1 && panel.width > 250;
    })
    .toBe(true);
  await page.getByRole('navigation', { name: 'Editing tools' }).getByRole('button', { name: 'Match look' }).click();
  await expect(page.getByRole('heading', { name: 'Match a reference look' })).toBeInViewport({ ratio: 1 });
  await expectFitsScreen(page);
});
