import { expect, test } from '@playwright/test';

test.describe('opening animation and app icon', () => {
  test('plays over the home screen, then leaves; a tap skips it; tests are not slowed by it', async ({ page }) => {
    // Under automation it stays out of the way unless asked for.
    await page.goto('/');
    await expect(page.getByTestId('gallery-file-input')).toBeAttached();
    await expect(page.getByTestId('intro')).toHaveCount(0);

    await page.goto('/?intro=full');
    const intro = page.getByTestId('intro');
    await expect(intro).toBeVisible();
    await expect(intro).toHaveAttribute('data-mode', 'full');
    // The mark spells out the name, then the overlay goes and the app is there.
    await expect(intro.locator('.intro-word')).toHaveText('lumen');
    await expect(intro).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('gallery-file-input')).toBeAttached();

    // A tap skips it.
    await page.goto('/?intro=full');
    await expect(intro).toBeVisible();
    await intro.dispatchEvent('pointerdown'); // (a click would wait for the moving overlay to hold still)
    await expect(intro).toHaveCount(0, { timeout: 15_000 });
  });

  test('the installed app uses the new icon files, and they exist', async ({ page, request }) => {
    await page.goto('/');
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    const srcs: string[] = manifest.icons.map((i: { src: string }) => i.src);
    expect(srcs.filter((s) => s.startsWith('/icons/lumen-')).length).toBe(4);
    expect(srcs.some((s) => /\/icons\/(icon|maskable)-/.test(s))).toBe(false);
    const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    for (const src of [...srcs, touch!]) {
      const res = await request.get(src);
      expect(res.status(), src).toBe(200);
      expect(res.headers()['content-type'], src).toMatch(/image\//);
    }
  });
});
