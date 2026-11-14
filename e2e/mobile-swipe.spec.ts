import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { makeImage, waitForRender } from './helpers.ts';

type Pt = { x: number; y: number };

async function photoCentre(page: Page): Promise<Pt> {
  const b = (await page.getByTestId('viewport').boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** One finger from `a` moving by (dx, dy) over `ms`, as real touch events. */
/** Few, large moves: under software rendering each touch event waits for a frame, so many small
 * moves make a quick swipe look slow by the browser's clock. */
async function drag(cdp: CDPSession, page: Page, a: Pt, dx: number, dy: number, ms = 60, steps = 3) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (dx * i) / steps, y: a.y + (dy * i) / steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const look = (page: Page) => page.getByTestId('edge-print');
/** After a look changes, software rendering keeps the page busy for ~3 s; a person looks at the result first anyway. */
const settle = (page: Page) => page.waitForTimeout(3000);

test('mobile: swipe on the photo steps through the open roll without breaking hold, pinch or pan', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'w.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 900, 600) });
  await waitForRender(page);
  // The Looks sheet opens on a fresh photo; open roll 01 so the swipe order is known.
  await page.getByRole('tab', { name: "Editor's Picks" }).click();
  await expect(page.getByRole('button', { name: 'Apply Daylight', exact: true })).toBeVisible();
  // Let the first previews fill: under software rendering the page is too busy for a while to
  // report a quick swipe as quick.
  await page.waitForFunction(() => [...document.querySelectorAll('button[aria-label^="Apply "] img')].filter((i) => (i as HTMLImageElement).src).length >= 4, null, { timeout: 120_000 });
  await page.waitForTimeout(1000);
  const c = await photoCentre(page);

  // Swipe left: the first look of the roll; again: the second; right: back to the first.
  await drag(cdp, page, c, -140, 6);
  await expect(look(page)).toContainText('Daylight');
  await settle(page);
  await drag(cdp, page, c, -140, -4);
  await expect(look(page)).toContainText('Clean Studio');
  await settle(page);
  await drag(cdp, page, c, 140, 0);
  await expect(look(page)).toContainText('Daylight');
  await settle(page);

  // A mostly vertical drag is not a swipe.
  await drag(cdp, page, c, 40, 160);
  await page.waitForTimeout(500);
  await expect(look(page)).toContainText('Daylight');

  // Press and hold still shows the original, and letting go doesn't change the look.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await expect(page.getByText('original', { exact: true })).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByText('original', { exact: true })).toHaveCount(0);
  await expect(look(page)).toContainText('Daylight');

  // A sideways two-finger pinch zooms; it never steps the look.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x - 30, y: c.y }, { x: c.x + 30, y: c.y }] });
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(25);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 30 - 20 * i, y: c.y }, { x: c.x + 30 + 20 * i, y: c.y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
  await expect(look(page)).toContainText('Daylight');

  // Zoomed in, a sideways drag pans the photo instead of changing the look.
  await drag(cdp, page, c, -140, 0);
  await page.waitForTimeout(500);
  await expect(look(page)).toContainText('Daylight');
});
