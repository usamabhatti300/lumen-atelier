import { describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-web';
import { MODELS, SAFE_MODEL_EXTENSIONS, findModelFile, isSafeModelPath, modelBytes, type ModelFile } from './registry';
import { ForeignRequestError, ModelIntegrityError, ModelMissingError, assertSameOrigin, fetchVerified, modelUrl, progressTracker, sha256Hex } from './verify';
import { SELFTEST_INPUT, buildSelfTestModel, selfTestPasses } from './selftest';
import { modelInstallState } from './client';

const ORIGIN = 'http://localhost:5174';

describe('model registry', () => {
  it('has unique ids and paths', () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    const paths = MODELS.flatMap((m) => m.files.map((f) => f.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('records size, SHA-256 and a pinned https source for every file', () => {
    for (const m of MODELS) {
      expect(m.files.length, m.id).toBeGreaterThan(0);
      expect(m.licence, m.id).toBeTruthy();
      for (const f of m.files) {
        expect(f.sha256, f.path).toMatch(/^[0-9a-f]{64}$/);
        expect(f.bytes, f.path).toBeGreaterThan(0);
        const u = new URL(f.url);
        expect(u.protocol).toBe('https:');
        if (u.hostname === 'huggingface.co') expect(u.pathname, f.path).toMatch(/\/resolve\/[0-9a-f]{40}\//);
        else expect(u.pathname, f.path).not.toContain('/latest/');
      }
    }
  });

  it('only lists safe, non-pickle formats', () => {
    for (const m of MODELS) for (const f of m.files) expect(isSafeModelPath(f.path), f.path).toBe(true);
    for (const bad of ['model.pth', 'w.pt', 'x.pkl', 'pytorch_model.bin', '../secret.onnx', '/abs.onnx', 'a/./b.onnx', 'a\\b.onnx', 'a//b.onnx', ''])
      expect(isSafeModelPath(bad), bad).toBe(false);
    expect(SAFE_MODEL_EXTENSIONS).not.toContain('.bin');
  });

  it('never lists the non-commercial Depth Anything V2 sizes', () => {
    const text = JSON.stringify(MODELS).toLowerCase();
    expect(text).not.toMatch(/depth-anything-v2-(base|large|giant)/);
  });

  it('looks files up by path and sums sizes', () => {
    const m = MODELS[0];
    expect(findModelFile(m.files[0].path)).toBe(m.files[0]);
    expect(findModelFile('nope.onnx')).toBeUndefined();
    expect(modelBytes(m)).toBe(m.files.reduce((s, f) => s + f.bytes, 0));
  });
});

function fileFor(data: Uint8Array, sha256: string, path = 'test/model.onnx'): ModelFile {
  return { path, url: 'https://example.invalid/x', bytes: data.length, sha256 };
}

function fakeFetch(body: Uint8Array | null, init: { status?: number; type?: string; chunk?: number } = {}): typeof fetch {
  return (async (_url: RequestInfo | URL, opts?: RequestInit) => {
    opts?.signal?.throwIfAborted();
    const chunk = init.chunk ?? 3;
    const stream =
      body &&
      new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < body.length; i += chunk) c.enqueue(body.slice(i, i + chunk));
          c.close();
        },
      });
    return new Response(stream, { status: init.status ?? 200, headers: { 'content-type': init.type ?? 'application/octet-stream' } });
  }) as typeof fetch;
}

describe('fetchVerified', () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  it('returns the bytes and reports real progress when size and hash match', async () => {
    const file = fileFor(data, await sha256Hex(data));
    const seen: number[] = [];
    const out = await fetchVerified(file, { origin: ORIGIN, fetchImpl: fakeFetch(data), onBytes: (n) => seen.push(n) });
    expect(Array.from(out)).toEqual(Array.from(data));
    expect(seen).toEqual([3, 6, 9, 10]);
  });

  it('rejects a checksum mismatch', async () => {
    const file = fileFor(data, '0'.repeat(64));
    await expect(fetchVerified(file, { origin: ORIGIN, fetchImpl: fakeFetch(data) })).rejects.toBeInstanceOf(ModelIntegrityError);
  });

  it('rejects truncated and oversized files', async () => {
    const sha = await sha256Hex(data);
    await expect(fetchVerified(fileFor(data, sha), { origin: ORIGIN, fetchImpl: fakeFetch(data.slice(0, 7)) })).rejects.toThrow(/incomplete/);
    const bigger = new Uint8Array([...data, 11]);
    await expect(fetchVerified(fileFor(data, sha), { origin: ORIGIN, fetchImpl: fakeFetch(bigger) })).rejects.toThrow(/larger than expected/);
  });

  it('treats 404s and the SPA HTML fallback as "not installed"', async () => {
    const file = fileFor(data, await sha256Hex(data));
    await expect(fetchVerified(file, { origin: ORIGIN, fetchImpl: fakeFetch(null, { status: 404 }) })).rejects.toBeInstanceOf(ModelMissingError);
    await expect(fetchVerified(file, { origin: ORIGIN, fetchImpl: fakeFetch(data, { type: 'text/html' }) })).rejects.toThrow(/setup:models/);
  });

  it('stops when cancelled', async () => {
    const file = fileFor(data, await sha256Hex(data));
    const ac = new AbortController();
    ac.abort();
    await expect(fetchVerified(file, { origin: ORIGIN, fetchImpl: fakeFetch(data), signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('refuses unsafe paths before any request', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response(data);
    }) as typeof fetch;
    await expect(fetchVerified(fileFor(data, await sha256Hex(data), 'weights.pth'), { origin: ORIGIN, fetchImpl: spy })).rejects.toBeInstanceOf(ModelIntegrityError);
    expect(called).toBe(false);
  });
});

describe('origin guard', () => {
  it('builds same-origin model URLs and blocks foreign hosts', () => {
    expect(modelUrl(fileFor(new Uint8Array(1), '0'.repeat(64), 'a/b.onnx'), ORIGIN)).toBe(`${ORIGIN}/models/a/b.onnx`);
    expect(assertSameOrigin('/models/x.json', ORIGIN).pathname).toBe('/models/x.json');
    expect(() => assertSameOrigin('https://huggingface.co/x/resolve/main/config.json', ORIGIN)).toThrow(ForeignRequestError);
    expect(() => assertSameOrigin('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/x.wasm', ORIGIN)).toThrow(ForeignRequestError);
  });
});

describe('progressTracker', () => {
  it('sums bytes across files against the registered total', () => {
    const a = fileFor(new Uint8Array(10), '0'.repeat(64), 'a.onnx');
    const b = fileFor(new Uint8Array(30), '0'.repeat(64), 'b.onnx');
    const calls: [number, number][] = [];
    const track = progressTracker([a, b], (l, t) => calls.push([l, t]));
    track(a, 5);
    track(b, 30);
    track(a, 10);
    expect(calls).toEqual([
      [5, 40],
      [35, 40],
      [40, 40],
    ]);
  });
});

describe('self-test model', () => {
  it('runs in onnxruntime-web and computes 2x + 1', async () => {
    const session = await ort.InferenceSession.create(buildSelfTestModel());
    expect(session.inputNames).toEqual(['x']);
    expect(session.outputNames).toEqual(['y']);
    const out = await session.run({ x: new ort.Tensor('float32', Float32Array.from(SELFTEST_INPUT), [SELFTEST_INPUT.length]) });
    expect(selfTestPasses(out.y.data as Float32Array)).toBe(true);
    await session.release();
  }, 60_000);
});

describe('modelInstallState', () => {
  const m = MODELS.find((x) => x.files.length > 1)!;
  it('requires every file at its registered size', () => {
    const all = Object.fromEntries(m.files.map((f) => [f.path, f.bytes]));
    expect(modelInstallState(m, all)).toBe('installed');
    expect(modelInstallState(m, { ...all, [m.files[0].path]: 5 })).toBe('partial');
    expect(modelInstallState(m, {})).toBe('missing');
    expect(modelInstallState(m, null)).toBe('unknown');
  });
});
