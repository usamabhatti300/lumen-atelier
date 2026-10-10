import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against dedicated ports (API 8799, web 5199) with no
 * Anthropic key, so the AI path is exercised in its "not configured" state
 * deterministically. Headless Chromium renders WebGL2 via SwiftShader.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 45_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    actionTimeout: 60_000,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    {
      command: 'node server/index.ts --api-only',
      env: { API_PORT: '8799', ANTHROPIC_API_KEY: '' },
      url: 'http://127.0.0.1:8799/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5199 --strictPort',
      env: { API_PORT: '8799' },
      url: 'http://localhost:5199',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
});
