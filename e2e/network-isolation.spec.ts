import { expect, test, type Request } from '@playwright/test';
import { makeImage, setRange, waitForRender } from './helpers.ts';

/**
 * Privacy guarantee: running the on-device AI features must not send a single
 * request to any host other than this app. Every AI feature added to the app
 * is exercised here. (Reference analysis with the Claude API is the only
 * feature allowed to leave the device, and only server-side with consent; it
 * is not run here.)
 */
test('AI features make no requests to other hosts', async ({ page, context, baseURL }) => {
  test.setTimeout(1_500_000);
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const seen: string[] = [];
  const record = (r: Request) => {
    const url = r.url();
    seen.push(url);
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).origin !== origin) foreign.push(url);
  };
  context.on('request', record);
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  // MediaPipe face landmarks + person segmentation.
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target') });
  await waitForRender(page);
  await page.locator('#tab-portrait').click();
  await page.getByRole('button', { name: 'Detect faces & subject' }).click();
  await expect(page.getByText(/face(s)? found|No face found/)).toBeVisible({ timeout: 120_000 });
  const mediapipeReadyAt = Date.now();

  // Select object: SlimSAM through Transformers.js in the ML worker (model files, embedding, one decode).
  await page.locator('#tab-masks').click();
  await page.getByRole('button', { name: 'New mask' }).click();
  await page.getByRole('button', { name: /Select object/ }).click();
  const chip = page.getByTestId('select-object-chip');
  await expect(chip).toContainText('Click an object', { timeout: 720_000 });
  const canvas = (await page.locator('canvas.editor-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.12);
  await expect(page.getByText('Selected object (1 point)')).toBeVisible();
  await expect(chip).toContainText('Click an object', { timeout: 240_000 });
  expect(seen.some((u) => u.includes('/models/Xenova/slimsam-77-uniform/onnx/vision_encoder.onnx'))).toBe(true);

  // Remove tool: MI-GAN inpainting in the ML worker (ONNX Runtime, WASM here).
  await page.locator('#tab-remove').click();
  await page.mouse.move(canvas.x + canvas.width * 0.175, canvas.y + canvas.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.175, canvas.y + canvas.height * 0.4, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('removal-item')).toHaveCount(1);
  await expect(page.getByText(/filling…|not applied/)).toHaveCount(0, { timeout: 180_000 });
  await expect(page.getByTestId('remove-status')).toHaveCount(0);
  expect(seen.some((u) => u.includes('/models/andraniksargsyan/migan/migan_pipeline_v2.onnx'))).toBe(true);

  // MediaPipe batches usage logs and sends them every 60 s (disabled in src/lib/portrait/mediapipe.ts); stay long enough to catch it.
  await page.waitForTimeout(Math.max(0, 65_000 - (Date.now() - mediapipeReadyAt)));

  // Real-ESRGAN AI upscale on export (ML worker, ONNX Runtime). A small photo keeps it to a few tiles.
  await page.goto('/');
  await page.getByTestId('gallery-file-input').setInputFiles({ name: 'small.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 'target', 240, 160) });
  await waitForRender(page);
  await page.getByTestId('export-open').click();
  await page.getByRole('radiogroup', { name: 'AI upscale' }).getByRole('radio', { name: '2×' }).click();
  const dl = page.waitForEvent('download', { timeout: 300_000 });
  await page.getByTestId('export-start').click();
  expect((await dl).suggestedFilename()).toBe('small-edited.jpg');
  expect(seen.some((u) => u.endsWith('/models/jonathanst29/tinier-upscale-models/realesr-general-x4v3.onnx'))).toBe(true);
  await expect(page.getByText(/Exported 1 file/)).toBeVisible();

  // Depth Anything V2 Small (Transformers.js) for lens blur.
  await page.keyboard.press('Escape');
  await page.locator('#tab-detail').click();
  await setRange(page, 'Amount', 50);
  await expect(page.getByTestId('depth-status')).toContainText('Depth estimated on this device', { timeout: 1_200_000 });
  expect(seen.some((u) => u.endsWith('/models/onnx-community/depth-anything-v2-small/onnx/model_fp16.onnx'))).toBe(true);

  // ONNX Runtime (WebGPU + WASM) and Transformers.js via the runtime check.
  await page.goto('/settings');
  const models = page.getByRole('list', { name: 'AI models' });
  await expect(models.getByTestId('ai-model-state').filter({ hasText: 'Checking…' })).toHaveCount(0);
  await expect(page.getByTestId('ai-model-mediapipe-segmenter').getByTestId('ai-model-state')).toHaveText('Downloaded');
  await expect(page.getByTestId('ai-model-slimsam').getByTestId('ai-model-state')).toHaveText('Downloaded');
  await expect(page.getByTestId('ai-model-realesrgan-x4v3').getByTestId('ai-model-state')).toHaveText('Downloaded');
  await expect(page.getByTestId('ai-model-migan').getByTestId('ai-model-state')).toHaveText('Downloaded');
  await expect(page.getByTestId('ai-model-depth-anything-v2-small').getByTestId('ai-model-state')).toHaveText('Downloaded');
  await page.getByRole('button', { name: 'Check AI runtime' }).click();
  const status = page.getByTestId('ai-runtime-status');
  await expect(status).toContainText('CPU (WebAssembly)', { timeout: 120_000 });
  await expect(status).toContainText(/Working, \d+ threads?/);
  await expect(status).toContainText('Blocked (local files only)');
  await expect(status).toContainText('ONNX Runtime 1.30.0');

  expect(seen.some((u) => u.includes('/ort/ort-wasm-simd-threaded'))).toBe(true);
  expect(foreign, `requests left the device:\n${foreign.join('\n')}`).toEqual([]);
  expect(consoleErrors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
});
