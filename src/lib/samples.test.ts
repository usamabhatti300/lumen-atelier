import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_PHOTO, sampleFile } from './samples';

describe('sample photo', () => {
  it('is bundled at both sizes, small enough to ship', () => {
    for (const url of [SAMPLE_PHOTO.url, SAMPLE_PHOTO.thumbUrl]) {
      const file = `public${url}`;
      expect(existsSync(file), file).toBe(true);
    }
    expect(statSync(`public${SAMPLE_PHOTO.url}`).size).toBeLessThan(700_000);
    expect(statSync(`public${SAMPLE_PHOTO.thumbUrl}`).size).toBeLessThan(80_000);
    expect(SAMPLE_PHOTO.licence).toBe('CC0 1.0');
  });

  it('becomes a File for the normal import path', async () => {
    const fetcher = (async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } })) as typeof fetch;
    const f = await sampleFile(fetcher);
    expect(f.name).toBe(SAMPLE_PHOTO.name);
    expect(f.type).toBe('image/jpeg');
    expect(f.size).toBe(3);
  });

  it('fails clearly when the file is missing (an SPA fallback page is not a photo)', async () => {
    const html = (async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch;
    await expect(sampleFile(html)).rejects.toThrow(/sample photo/);
    const missing = (async () => new Response('', { status: 404 })) as typeof fetch;
    await expect(sampleFile(missing)).rejects.toThrow(/sample photo/);
  });
});
