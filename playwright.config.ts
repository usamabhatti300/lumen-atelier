import { defineConfig, devices } from '@playwright/test';

// Override with E2E_WEB_PORT / E2E_API_PORT to run several suites side by side (e.g. in worktrees).
const webPort = process.env.E2E_WEB_PORT ?? '5199';
const apiPort = process.env.E2E_API_PORT ?? '8799';

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
    baseURL: `http://localhost:${webPort}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    actionTimeout: 60_000,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    {
      command: 'node server/index.ts --api-only',
      // AI_PROVIDER=none: also ignore a local Ollama model if one happens to be running.
      env: { API_PORT: apiPort, ANTHROPIC_API_KEY: '', AI_PROVIDER: 'none' },
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${webPort} --strictPort`,
      env: { API_PORT: apiPort },
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile|pwa/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
});
