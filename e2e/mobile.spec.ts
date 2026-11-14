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
  await nav.getByRole('button', { name: 'Looks' }).click();
  // The looks picked for this photo are the default tab in the mobile looks sheet too.
  await expect(page.getByRole('tab', { name: 'For this photo' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: "Editor's Picks" }).click();
  await page.getByRole('button', { name: 'Apply Clean Studio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply Clean Studio', exact: true })).toHaveAttribute('aria-pressed', 'true');
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

  // Looks sheet: the strip and the preset amount; the project's photos are in More → Photos.
  await nav.getByRole('button', { name: 'Looks' }).click();
  await page.getByRole('tab', { name: "Editor's Picks" }).click();
  await page.getByRole('button', { name: 'Apply Velvet Slide', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: 'Amount' })).toBeVisible();
  await nav.getByRole('button', { name: 'More' }).click();
  await sheet.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Photos in this project' })).toBeVisible();
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

  // Press and hold the photo to see the original; letting go returns to the edit.
  await touch(page, [{ type: 'pointerdown', id: 5, x: 180, y: 200 }]);
  await expect(page.getByTestId('viewport').getByText('original', { exact: true })).toBeVisible();
  await touch(page, [{ type: 'pointerup', id: 5, x: 180, y: 200 }]);
  await expect(page.getByTestId('viewport').getByText('original', { exact: true })).toBeHidden();

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
  await expect(page.getByRole('heading', { name: 'Match a look' })).toBeInViewport({ ratio: 1 });
  await expectFitsScreen(page);
});

/** Real touch input (Chrome DevTools Protocol), so scrolling and touch-action behave as on a phone. */
async function touchInput(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  return {
    async swipe(x: number, y: number, dx: number, dy: number) {
      await send('touchStart', x, y);
      for (let i = 1; i <= 8; i++) {
        await send('touchMove', x + (dx * i) / 8, y + (dy * i) / 8);
        await page.waitForTimeout(16);
      }
      await send('touchEnd');
      await page.waitForTimeout(400);
    },
    async tap(x: number, y: number) {
      await send('touchStart', x, y);
      await send('touchEnd');
      await page.waitForTimeout(300);
    },
  };
}

test('mobile touch: scrolling panels never changes edits; strip, curve and sliders respond to fingers', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  const t = await touchInput(page);
  const nav = page.getByRole('navigation', { name: 'Editing tools' });
  const scroller = page.locator('[data-testid="compact-sheet"] .overflow-y-auto').first();

  // Presets: a sideways strip of small film frames; a tap applies.
  await nav.getByRole('button', { name: 'Looks' }).click();
  const strip = page.locator('[data-testid="compact-sheet"] ul[aria-label="Looks"]');
  const sb = (await strip.boundingBox())!;
  expect(sb.height).toBeGreaterThan(70);
  await t.swipe(sb.x + sb.width * 0.8, sb.y + sb.height / 2, -sb.width * 0.5, 0);
  await expect.poll(() => strip.evaluate((e) => e.scrollLeft)).toBeGreaterThan(40);
  const card = strip.locator('li > button').first();
  // Let the swipe's momentum die before going back to the start (it would carry the strip on under the tap).
  await page.waitForTimeout(900);
  await strip.evaluate((e) => (e.scrollLeft = 0));
  await expect.poll(() => strip.evaluate((e) => e.scrollLeft)).toBe(0);
  // One atomic tap: two separate touch commands can arrive more than 380 ms apart on a slow machine, which is a press-and-hold (preview), not a tap.
  await card.tap();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close panel' }).click();

  // Light opens on a group (Tone): a short list of one-line sliders; the row picks the group.
  await nav.getByRole('button', { name: 'Light' }).click();
  const sheet = page.getByTestId('compact-sheet');
  await expect(page.getByTestId('focus-tools')).toBeVisible();
  await expect(sheet.getByRole('slider')).toHaveCount(4);
  const exposure = page.getByRole('slider', { name: 'Exposure', exact: true });
  const focusStart = await exposure.inputValue();
  let fb = (await exposure.boundingBox())!;
  await t.swipe(fb.x + fb.width * 0.3, fb.y + fb.height / 2, 0, -120); // vertical: no change
  expect(await exposure.inputValue()).toBe(focusStart);
  fb = (await exposure.boundingBox())!;
  await t.swipe(fb.x + fb.width * 0.5, fb.y + fb.height / 2, fb.width * 0.25, 0); // sideways: changes it
  expect(Number(await exposure.inputValue())).toBeGreaterThan(Number(focusStart));
  // The edited group is marked in the row; picking another group swaps the sliders.
  await expect(sheet.getByRole('tab', { name: /Tone.*edited/ })).toBeVisible();
  await sheet.getByRole('tab', { name: /^Whites & blacks/ }).click();
  await expect(page.getByRole('slider', { name: 'Whites', exact: true })).toBeVisible();
  await expect(exposure).toHaveCount(0);
  // Reset puts the group back to its defaults and clears the mark.
  await sheet.getByRole('tab', { name: /^Tone/ }).click();
  await sheet.getByRole('button', { name: 'Reset tone' }).click();
  await expect(sheet.getByRole('button', { name: 'Reset tone' })).toBeDisabled();
  await expect(sheet.getByRole('tab', { name: 'Tone', exact: true })).toBeVisible();

  // Colour opens on Mix: a band swatch shows that colour's Hue, Saturation and Luminance together.
  await nav.getByRole('button', { name: 'Colour' }).click();
  await sheet.getByRole('radio', { name: 'Blue', exact: true }).click();
  await expect(sheet.getByRole('radio', { name: 'Blue', exact: true })).toHaveAttribute('aria-checked', 'true');
  for (const name of ['Hue', 'Saturation', 'Luminance']) await expect(sheet.getByRole('slider', { name, exact: true })).toBeVisible();
  await sheet.getByRole('tab', { name: 'Grade', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: 'Luminance', exact: true })).toBeVisible();

  // "All" opens the full panel; there a vertical swipe over a slider scrolls and leaves it alone.
  await nav.getByRole('button', { name: 'Light' }).click();
  await sheet.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByTestId('focus-tools')).toHaveCount(0);
  await expect(sheet).toHaveAttribute('data-expanded', 'true');
  await exposure.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const before = await exposure.inputValue();
  const top0 = await scroller.evaluate((e) => e.scrollTop);
  let eb = (await exposure.boundingBox())!;
  await t.swipe(eb.x + eb.width * 0.3, eb.y + eb.height / 2, 0, -200);
  expect(await scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(top0 + 30);
  expect(await exposure.inputValue()).toBe(before);
  await exposure.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  eb = (await exposure.boundingBox())!;
  await t.swipe(eb.x + eb.width * 0.5, eb.y + eb.height / 2, eb.width * 0.25, 0);
  expect(Number(await exposure.inputValue())).toBeGreaterThan(Number(before));

  // Colour: a swipe on the curve scrolls without adding points; a tap adds one; double tap removes it.
  await nav.getByRole('button', { name: 'Colour' }).click();
  // Each tool opens at its own compact size (a sheet pulled tall for Light doesn't stay tall).
  await expect(sheet).toHaveAttribute('data-expanded', 'false');
  await sheet.getByRole('button', { name: 'All', exact: true }).click();
  await expect(sheet).toHaveAttribute('data-expanded', 'true');
  await scroller.evaluate((e) => (e.scrollTop = 0));
  const curve = page.locator('svg[aria-label="master tone curve"]');
  const handles = page.getByTestId('curve-point-handle');
  const n0 = await handles.count();
  const c = (await curve.boundingBox())!;
  // Start the swipe on the graph, away from every point (points capture the finger).
  const pts = await handles.evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2, e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2]));
  let start = [c.x + c.width / 2, c.y + c.height / 2];
  let far = -1;
  const view = (await scroller.boundingBox())!;
  for (let fx = 0.1; fx <= 0.9; fx += 0.05)
    for (let fy = 0.05; fy <= 0.95; fy += 0.05) {
      const p = [c.x + c.width * fx, c.y + c.height * fy];
      if (p[1] < view.y + 20 || p[1] > view.y + view.height - 20) continue; // only the visible part of the graph
      const d = Math.min(...pts.map(([x, y]) => Math.hypot(x - p[0], y - p[1])));
      if (d > far) [far, start] = [d, p];
    }
  await t.swipe(start[0], start[1], 0, -200);
  expect(await scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(30);
  expect(await handles.count()).toBe(n0);
  await scroller.evaluate((e) => (e.scrollTop = 0));
  const c2 = (await curve.boundingBox())!;
  const at = [start[0], start[1] - c.y + c2.y];
  await t.tap(at[0], at[1]);
  await expect(handles).toHaveCount(n0 + 1);
  // Double tap the new point (two taps within 350 ms).
  const added = await handles.evaluateAll((els, [x, y]) => {
    const r = els.map((e) => e.getBoundingClientRect()).sort((a, b) => Math.hypot(a.x + a.width / 2 - x, a.y + a.height / 2 - y) - Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y))[0];
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, at);
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 2; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: added[0], y: added[1] }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await expect(handles).toHaveCount(n0);
});
