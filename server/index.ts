/**
 * Entry point for the local API server.
 *   npm run dev:api  → API only (Vite serves the frontend and proxies /api)
 *   npm start        → API + built frontend from dist/ (run `npm run build` first)
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnthropicCaller } from './anthropic.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const serveStatic = !process.argv.includes('--api-only') && existsSync(join(distDir, 'index.html'));

const app = createApp({
  config,
  createMessage: config.anthropicApiKey ? createAnthropicCaller(config.anthropicApiKey) : null,
  staticDir: serveStatic ? distDir : null,
});

const server = createServer((req, res) => {
  void app(req, res);
});
server.requestTimeout = 120_000;
server.listen(config.port, '127.0.0.1', () => {
  console.log(`[api] listening on http://127.0.0.1:${config.port}`);
  console.log(
    config.anthropicApiKey
      ? `[api] AI interpretation enabled (model ${config.model})`
      : '[api] ANTHROPIC_API_KEY not set — AI interpretation disabled; analysis runs on measured statistics only',
  );
  if (serveStatic) console.log(`[api] serving built app from ${distDir}`);
});
