import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createOllamaInterpreter, isLoopbackUrl, readChatContent } from './ollama.ts';

const interpretation = {
  styleSummary: 'Moody forest with muted teal greens and soft fog.',
  moodTags: ['moody', 'muted'],
  sceneType: 'portrait',
  contentWarnings: [],
  tone: { contrast: 'medium', blacks: 'lifted', highlights: 'controlled', exposureIntent: 'balanced' },
  color: {
    temperatureFeel: 'cool',
    saturationFeel: 'muted',
    shadowTint: { hue: 'cyan', strength: 'moderate' },
    midtoneTint: { hue: 'none', strength: 'none' },
    highlightTint: { hue: 'none', strength: 'none' },
    greens: 'shifted_teal',
    blues: 'natural',
    skin: 'not_present',
  },
  texture: { grain: 'fine', vignette: 'subtle', softness: 'natural' },
  confidence: 'high',
  notes: [],
};

const request = {
  image: { mediaType: 'image/jpeg' as const, data: 'A'.repeat(200) },
  measured: { meanLuminance: 0.3, contrast: 0.15, blackFloor: 0.08, whiteCeiling: 0.85, meanChroma: 0.03, warmth: -0.05, dominantColors: ['#2f3d3a'] },
};

/** A fake Ollama: lists `models` and answers /api/chat with `content`. Records chat bodies. */
function fakeOllama(models: string[], content: string, status = 200) {
  const chats: Record<string, unknown>[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/api/tags')) return Response.json({ models: models.map((name) => ({ name, model: name })) });
    if (u.endsWith('/api/chat')) {
      chats.push(JSON.parse(String(init?.body)));
      return status === 200 ? Response.json({ message: { role: 'assistant', content } }) : new Response('boom', { status });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, chats };
}

describe('local model (Ollama)', () => {
  it('joins a streamed answer, including lines split across chunks', async () => {
    const lines = [
      { message: { content: '{"a":' } },
      { message: { content: ' 1}' } },
      { message: { content: '' }, done: true },
    ].map((l) => JSON.stringify(l) + '\n').join('');
    const bytes = new TextEncoder().encode(lines);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    expect(await readChatContent(new Response(stream))).toBe('{"a": 1}');
    expect(await readChatContent(Response.json({ message: { content: 'x' } }))).toBe('x');
    await expect(readChatContent(new Response('{"error":"model crashed"}\n'))).rejects.toThrow('model crashed');
  });

  it('only accepts servers on this computer', () => {
    expect(isLoopbackUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackUrl('http://localhost:11434')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:11434')).toBe(true);
    expect(isLoopbackUrl('http://192.168.1.20:11434')).toBe(false);
    expect(isLoopbackUrl('https://ollama.example.com')).toBe(false);
    expect(isLoopbackUrl('not a url')).toBe(false);
    expect(() => createOllamaInterpreter('http://10.0.0.5:11434', 'qwen3-vl:4b')).toThrow(/this computer/);
  });

  it('is available only when the model is installed', async () => {
    expect(await createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fakeOllama(['qwen3-vl:4b'], '').fetchImpl).available()).toBe(true);
    expect(await createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fakeOllama(['qwen2.5:7b'], '').fetchImpl).available()).toBe(false);
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', down).available()).toBe(false);
  });

  it('sends the image with the structured-output schema and validates the answer', async () => {
    const fake = fakeOllama(['qwen3-vl:4b'], JSON.stringify(interpretation));
    const local = createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fake.fetchImpl);
    const result = await local.interpret(request, new AbortController().signal, 5_000);
    expect(result.color.greens).toBe('shifted_teal');
    const chat = fake.chats[0] as { model: string; stream: boolean; format?: unknown; messages: { content: string; images?: string[] }[] };
    expect(chat.model).toBe('qwen3-vl:4b');
    expect(chat.stream).toBe(true);
    // No grammar-constrained format (it made Qwen3-VL emit whitespace for minutes); a template instead.
    expect(chat.format).toBeUndefined();
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0].images).toEqual([request.image.data]);
    expect(chat.messages[0].content).toContain('"contrast": "very_low|low|medium|high|very_high"');
  });

  it('accepts an answer wrapped in a code fence and drops warnings the small model gets wrong', async () => {
    const answer = '```json\n' + JSON.stringify({ ...interpretation, contentWarnings: ['screenshot_ui', 'not_a_photo', 'monochrome'] }) + '\n```';
    const local = createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fakeOllama(['qwen3-vl:4b'], answer).fetchImpl);
    const result = await local.interpret(request, new AbortController().signal, 5_000);
    expect(result.contentWarnings).toEqual(['monochrome']);
  });

  it('rejects malformed or invalid model output', async () => {
    const bad = createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fakeOllama(['qwen3-vl:4b'], 'not json').fetchImpl);
    await expect(bad.interpret(request, new AbortController().signal, 5_000)).rejects.toMatchObject({ code: 'invalid_model_output' });
    const wrong = createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fakeOllama(['qwen3-vl:4b'], '{"styleSummary":1}').fetchImpl);
    await expect(wrong.interpret(request, new AbortController().signal, 5_000)).rejects.toMatchObject({ code: 'invalid_model_output' });
    const err = createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fakeOllama(['qwen3-vl:4b'], '', 500).fetchImpl);
    await expect(err.interpret(request, new AbortController().signal, 5_000)).rejects.toMatchObject({ code: 'upstream_error' });
  });
});

let server: Server | null = null;
afterEach(async () => {
  await new Promise((r) => (server ? server.close(r) : r(null)));
  server = null;
});

async function startWithLocal(models: string[], env: Record<string, string> = {}) {
  const local = createOllamaInterpreter('http://127.0.0.1:11434', 'qwen3-vl:4b', fakeOllama(models, JSON.stringify(interpretation)).fetchImpl);
  const app = createApp({ config: loadConfig({ ANTHROPIC_API_KEY: '', ...env }), createMessage: null, local, staticDir: null });
  server = createServer((req, res) => void app(req, res));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('API server with a local model', () => {
  it('uses the local model when no API key is set, and reports it as local', async () => {
    const url = await startWithLocal(['qwen3-vl:4b']);
    const health = await (await fetch(`${url}/api/health`)).json();
    expect(health.ai).toMatchObject({ configured: true, provider: 'ollama', model: 'qwen3-vl:4b', local: true });
    expect(health.ai.maxImageSide).toBeLessThan(1024);
    const res = await fetch(`${url}/api/analyze-style`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe('qwen3-vl:4b');
    expect(body.interpretation.styleSummary).toContain('forest');
  });

  it('falls back to measurements only when the model is not installed or AI is turned off', async () => {
    let url = await startWithLocal(['qwen2.5:7b']);
    expect((await (await fetch(`${url}/api/health`)).json()).ai.configured).toBe(false);
    await new Promise((r) => server!.close(r));
    url = await startWithLocal(['qwen3-vl:4b'], { AI_PROVIDER: 'none' });
    expect((await (await fetch(`${url}/api/health`)).json()).ai.configured).toBe(false);
  });
});
