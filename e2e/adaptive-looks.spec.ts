import { expect, test, type Page } from '@playwright/test';
import { waitForRender } from './helpers.ts';

/** A backlit portrait stand-in: a bright, nearly white sky with a darker figure. */
async function backlit(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(900, 600);
    const ctx = c.getContext('2d')!;
    const sky = ctx.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, '#fbf8f2');
    sky.addColorStop(1, '#e8e0d2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 900, 600);
    ctx.fillStyle = '#5a4436';
    ctx.beginPath();
    ctx.ellipse(450, 640, 200, 330, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5a48';
    ctx.beginPath();
    ctx.arc(450, 250, 85, 0, Math.PI * 2);
    ctx.fill();
    const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

test('adaptive looks: a backlit photo is evened out before the look, and the setting turns it off', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'backlit.jpg', mimeType: 'image/jpeg', buffer: await backlit(page) });
  await waitForRender(page);

  const apply = page.getByRole('button', { name: 'Apply Golden Portrait Negative', exact: true });
  await apply.click();
  const note = page.getByTestId('look-adapted');
  await expect(note).toContainText(/Fitted to this photo: exposure −\d\.\d\d/);

  // The exposure the user sees includes the offset (the look alone sets +0.10).
  await page.locator('#tab-adjust').click();
  const exposure = page.getByRole('slider', { name: 'Exposure' }).first();
  expect(Number(await exposure.inputValue())).toBeLessThan(0.1);

  // Off in Settings: the same look applies exactly as made.
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: /Adaptive looks/ });
  await expect(toggle).toBeChecked();
  await page.getByText('Adaptive looks', { exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await page.goBack();
  await waitForRender(page);
  await apply.click();
  await expect(page.getByRole('button', { name: 'Remove preset' }).first()).toBeVisible();
  await expect(note).toHaveCount(0);
  await page.locator('#tab-adjust').click();
  await expect(page.getByRole('slider', { name: 'Exposure' }).first()).toHaveValue('0.1');
});
