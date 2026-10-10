import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import type { CreateMessage } from './anthropic.ts';
import { RateLimiter } from './rateLimit.ts';

const validInterpretation = {
  styleSummary: 'Muted cinematic editorial with cool cyan shadows and warm skin.',
  moodTags: ['cinematic', 'muted'],
  sceneType: 'portrait',
  contentWarnings: [],
  tone: { contrast: 'medium', blacks: 'lifted', highlights: 'controlled', exposureIntent: 'balanced' },
  color: {
    temperatureFeel: 'cool',
    saturationFeel: 'muted',
    shadowTint: { hue: 'cyan', strength: 'moderate' },
    midtoneTint: { hue: 'none', strength: 'none' },
    highlightTint: { hue: 'amber', strength: 'subtle' },
    greens: 'subdued',
    blues: 'natural',
    skin: 'natural',
  },
  texture: { grain: 'fine', vignette: 'subtle', softness: 'natural' },
  confidence: 'high',
  notes: [],
};

const body = {
  image: { mediaType: 'image/jpeg', data: 'A'.repeat(200) },
  measured: { meanLuminance: 0.4, contrast: 0.2, blackFloor: 0.05, whiteCeiling: 0.95, meanChroma: 0.05, warmth: 0.1, dominantColors: ['#112233'] },
};

function message(text: string, stop_reason = 'end_turn') {
  return { id: 'msg', type: 'message', role: 'assistant', model: 'test', stop_reason, content: [{ type: 'text', text }], usage: {} } as never;
}

let server: Server | null = null;
async function start(createMessage: CreateMessage | null, env: Record<string, string> = {}) {
  const app = createApp({ config: loadConfig({ ANTHROPIC_API_KEY: createMessage ? 'k' : '', ...env }), createMessage, staticDir: null });
  server = createServer((req, res) => void app(req, res));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}
const post = (url: string, payload: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  fetch(`${url}/api/analyze-style`, { method: 'POST', headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });

afterEach(async () => {
  await new Promise((r) => (server ? server.close(r) : r(null)));
  server = null;
});

describe('API server', () => {
  it('reports AI not configured when no key is set', async () => {
    const url = await start(null);
    const health = await (await fetch(`${url}/api/health`)).json();
    expect(health.ai.configured).toBe(false);
    const res = await post(url, body);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('not_configured');
  });

  it('returns a validated interpretation', async () => {
    let seenParams: Record<string, unknown> = {};
    const url = await start(async (params) => {
      seenParams = params as unknown as Record<string, unknown>;
      return message(JSON.stringify(validInterpretation));
    });
    const res = await post(url, body);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.interpretation.styleSummary).toMatch(/cinematic/);
    // Structured output schema is requested and the model is never asked for numbers (slider values).
    expect(JSON.stringify(seenParams.output_config)).toMatch(/json_schema/);
    expect(JSON.stringify(seenParams.output_config)).not.toMatch(/"type":"(number|integer)"/);
  });

  it('rejects malformed model output', async () => {
    const url = await start(async () => message('{"styleSummary": 5}'));
    const res = await post(url, body);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('invalid_model_output');
  });

  it('rejects non-JSON model output', async () => {
    const url = await start(async () => message('Sure! Here is the analysis...'));
    expect((await (await post(url, body)).json()).error.code).toBe('invalid_model_output');
  });

  it('reports refusals without content', async () => {
    const url = await start(async () => message('', 'refusal'));
    const res = await post(url, body);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('refused');
  });

  it('maps provider timeouts and auth errors', async () => {
    let url = await start(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    expect((await (await post(url, body)).json()).error.code).toBe('upstream_timeout');
    await new Promise((r) => server!.close(r));
    url = await start(async () => {
      throw new Anthropic.AuthenticationError(401, { error: { message: 'bad key' } }, 'bad key', new Headers());
    });
    const res = await post(url, body);
    expect((await res.json()).error.code).toBe('upstream_auth');
  });

  it('validates the request body', async () => {
    const url = await start(async () => message(JSON.stringify(validInterpretation)));
    expect((await post(url, { image: { mediaType: 'image/gif', data: 'x' } })).status).toBe(400);
    expect((await post(url, 'not json')).status).toBe(400);
    expect((await post(url, body, { 'content-type': 'text/plain' })).status).toBe(415);
  });

  it('rejects oversized bodies', async () => {
    const url = await start(async () => message(JSON.stringify(validInterpretation)));
    const res = await post(url, { ...body, image: { mediaType: 'image/jpeg', data: 'A'.repeat(7 * 1024 * 1024) } });
    expect(res.status).toBe(413);
  });

  it('rate limits per client', async () => {
    const url = await start(async () => message(JSON.stringify(validInterpretation)), { AI_RATE_LIMIT_PER_MINUTE: '2' });
    expect((await post(url, body)).status).toBe(200);
    expect((await post(url, body)).status).toBe(200);
    const res = await post(url, body);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('never serves files outside the static root', async () => {
    const app = createApp({ config: loadConfig({}), createMessage: null, staticDir: process.cwd() + '/public' });
    server = createServer((req, res) => void app(req, res));
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/..%2f..%2fpackage.json`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('rate limiter', () => {
  it('refills over time', () => {
    let t = 0;
    const rl = new RateLimiter(60, () => t);
    for (let i = 0; i < 60; i++) expect(rl.take('a')).toBe(0);
    expect(rl.take('a')).toBeGreaterThan(0);
    t += 1000;
    expect(rl.take('a')).toBe(0);
  });
});
