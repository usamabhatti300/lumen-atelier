import { defineConfig, devices } from '@playwright/test';

/**
 * Installable-app (PWA) tests. The service worker only exists in production builds, so this
 * suite builds the app and runs it on the production server (`npm run test:e2e:pwa`).
 * 127.0.0.1 counts as a secure origin, so service workers and install checks work over http.
 */
const port = process.env.E2E_PWA_PORT ?? '8797';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /pwa\.spec\.ts/,
  timeout: 600_000,
  expect: { timeout: 45_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://127.0.0.1:${port}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    actionTimeout: 60_000,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run build && node server/index.ts',
    env: { API_PORT: port, ANTHROPIC_API_KEY: '', AI_PROVIDER: 'none' },
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
