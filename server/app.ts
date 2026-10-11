/**
 * HTTP request handler for the API (and, in production, the built frontend).
 * Built on node:http directly to keep the server dependency-free apart from
 * the Anthropic SDK and zod.
 *
 * Privacy: reference images are held in memory only for the duration of a
 * request, are never written to disk, and are never logged.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import {
  AnalyzeRequestSchema,
  type AnalyzeResponse,
  type ApiError,
  type ApiErrorCode,
  type HealthResponse,
  type AnalyzeRequest,
  type StyleInterpretation,
} from '../shared/ai-schema.ts';
import { AnalysisError, interpretStyle, type CreateMessage } from './anthropic.ts';
import type { LocalInterpreter } from './ollama.ts';
import type { ServerConfig } from './config.ts';
import { RateLimiter } from './rateLimit.ts';

export interface AppDeps {
  config: ServerConfig;
  /** Null when no API key is configured. */
  createMessage: CreateMessage | null;
  /** Local vision model (Ollama), used when no Anthropic key is configured. */
  local?: LocalInterpreter | null;
  /** Directory of the built frontend to serve, or null in development. */
  staticDir: string | null;
  /** Where on-device model files live (public/models or dist/models), for the install-state endpoint. */
  modelsDir?: string | null;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // With COOP this makes the page cross-origin isolated, which multi-threaded WASM (ONNX Runtime) needs.
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.onnx': 'application/octet-stream',
  '.map': 'application/json',
};

export function createApp(deps: AppDeps) {
  const limiter = new RateLimiter(deps.config.rateLimitPerMinute);

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        const ai = await activeProvider(deps);
        const body: HealthResponse = {
          ok: true,
          ai: ai
            ? { configured: true, provider: ai.provider, model: ai.model, local: ai.provider === 'ollama', maxImageSide: ai.maxImageSide, timeoutMs: ai.timeoutMs }
            : { configured: false, provider: 'anthropic', model: deps.config.model, local: false, maxImageSide: 1024, timeoutMs: deps.config.requestTimeoutMs + 20_000 },
        };
        return sendJson(res, 200, body);
      }

      if (url.pathname === '/api/models' && req.method === 'GET') {
        return sendJson(res, 200, { files: deps.modelsDir ? listModelFiles(deps.modelsDir) : {} });
      }

      if (url.pathname === '/api/analyze-style') {
        if (req.method !== 'POST') return sendError(res, 405, 'invalid_request', 'Use POST.', false);
        return await handleAnalyze(req, res, deps, limiter);
      }

      if (url.pathname.startsWith('/api/')) {
        return sendError(res, 404, 'invalid_request', 'Unknown endpoint.', false);
      }

      if (deps.staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
        return serveStatic(url.pathname, deps.staticDir, res);
      }
      res.statusCode = 404;
      res.end('Not found');
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof AnalysisError) {
          return sendError(res, error.status, error.code, error.message, error.retryable);
        }
        console.error('[api] unexpected error', error instanceof Error ? error.message : error);
        return sendError(res, 500, 'internal', 'Unexpected server error.', true);
      }
    }
  };
}

interface ActiveProvider {
  provider: 'anthropic' | 'ollama';
  model: string;
  maxImageSide: number;
  timeoutMs: number;
  interpret(request: AnalyzeRequest, signal: AbortSignal): Promise<StyleInterpretation>;
}

/** Claude when a key is configured; otherwise the local model if Ollama is running with it. */
async function activeProvider(deps: AppDeps): Promise<ActiveProvider | null> {
  const { config } = deps;
  if (deps.createMessage && config.aiProvider !== 'ollama' && config.aiProvider !== 'none') {
    const create = deps.createMessage;
    return {
      provider: 'anthropic',
      model: config.model,
      maxImageSide: 1024,
      timeoutMs: config.requestTimeoutMs + 20_000,
      interpret: (request, signal) => interpretStyle(create, config.model, request, signal, config.requestTimeoutMs),
    };
  }
  const local = deps.local;
  if (local && config.aiProvider !== 'anthropic' && config.aiProvider !== 'none' && (await local.available())) {
    return {
      provider: 'ollama',
      model: local.model,
      maxImageSide: 640,
      timeoutMs: config.localTimeoutMs + 20_000,
      interpret: (request, signal) => local.interpret(request, signal, config.localTimeoutMs),
    };
  }
  return null;
}

async function handleAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AppDeps,
  limiter: RateLimiter,
): Promise<void> {
  const ai = await activeProvider(deps);
  if (!ai) {
    return sendError(
      res,
      503,
      'not_configured',
      'AI interpretation is not configured on this server (no ANTHROPIC_API_KEY, and no local Ollama model is running).',
      false,
    );
  }
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.startsWith('application/json')) {
    return sendError(res, 415, 'invalid_request', 'Expected application/json.', false);
  }

  const clientKey = req.socket.remoteAddress ?? 'unknown';
  const waitMs = limiter.take(clientKey);
  if (waitMs > 0) {
    res.setHeader('Retry-After', String(Math.ceil(waitMs / 1000)));
    return sendError(res, 429, 'rate_limited', 'Too many analysis requests. Try again shortly.', true);
  }

  const raw = await readBody(req, deps.config.maxBodyBytes);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return sendError(res, 400, 'invalid_request', 'Body is not valid JSON.', false);
  }
  const parsed = AnalyzeRequestSchema.safeParse(json);
  if (!parsed.success) {
    return sendError(res, 400, 'invalid_request', 'Request body failed validation.', false);
  }

  // Cancel the upstream call when the browser disconnects or aborts.
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);
  try {
    const interpretation = await ai.interpret(parsed.data, controller.signal);
    const body: AnalyzeResponse = { interpretation, model: ai.model };
    return sendJson(res, 200, body);
  } finally {
    res.off('close', onClose);
  }
}

class BodyTooLargeError extends AnalysisError {
  constructor() {
    super('payload_too_large', 413, 'The image is too large to analyze.', false);
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) {
      reject(new BodyTooLargeError());
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new BodyTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendError(
  res: ServerResponse,
  status: number,
  code: ApiErrorCode,
  message: string,
  retryable: boolean,
) {
  const body: ApiError = { error: { code, message, retryable } };
  sendJson(res, status, body);
}

function serveStatic(pathname: string, root: string, res: ServerResponse) {
  const rootResolved = resolve(root);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  let filePath = resolve(join(rootResolved, normalize(decoded)));
  if (filePath !== rootResolved && !filePath.startsWith(rootResolved + sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback for client-side routes (only for extension-less paths).
    if (extname(decoded)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    filePath = join(rootResolved, 'index.html');
  }
  const ext = extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  if (ext === '.html') {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cache-Control', 'no-cache');
  } else if (filePath.includes(`${sep}assets${sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  createReadStream(filePath).pipe(res);
}

/** Sizes of the files under the models folder, keyed by path relative to it (so Settings can show what is installed). */
export function listModelFiles(dir: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (abs: string, rel: string, depth: number) => {
    if (depth > 6 || !existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel, depth + 1);
      else if (entry.isFile() && !entry.name.endsWith('.part')) out[childRel] = statSync(join(abs, entry.name)).size;
    }
  };
  walk(dir, '', 0);
  return out;
}
