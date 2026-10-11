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
import { createOllamaInterpreter, isLoopbackUrl } from './ollama.ts';

const config = loadConfig();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const serveStatic = !process.argv.includes('--api-only') && existsSync(join(distDir, 'index.html'));

const app = createApp({
  config,
  createMessage: config.anthropicApiKey ? createAnthropicCaller(config.anthropicApiKey) : null,
  local: isLoopbackUrl(config.ollamaUrl) ? createOllamaInterpreter(config.ollamaUrl, config.ollamaModel) : null,
  staticDir: serveStatic ? distDir : null,
  modelsDir: join(serveStatic ? distDir : join(root, 'public'), 'models'),
});

const server = createServer((req, res) => {
  void app(req, res);
});
// Local models on a laptop CPU can take minutes per analysis.
server.requestTimeout = config.localTimeoutMs + 30_000;
server.listen(config.port, config.host, () => {
  console.log(`[api] listening on http://${config.host}:${config.port}`);
  if (config.anthropicApiKey && config.aiProvider !== 'ollama' && config.aiProvider !== 'none') {
    console.log(`[api] AI interpretation: Anthropic (model ${config.model})`);
  } else if (config.aiProvider === 'none') {
    console.log('[api] AI interpretation disabled (AI_PROVIDER=none); analysis runs on measured statistics only');
  } else if (!isLoopbackUrl(config.ollamaUrl)) {
    console.log(`[api] OLLAMA_URL ${config.ollamaUrl} is not on this computer; local AI disabled so references never leave the device`);
  } else {
    console.log(`[api] AI interpretation: local model ${config.ollamaModel} via Ollama (${config.ollamaUrl}) when it is running; otherwise measurements only`);
  }
  if (serveStatic) console.log(`[api] serving built app from ${distDir}`);
});
