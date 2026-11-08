import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The models and the engine are replaced: this tests when detection runs, stops and reports.
const h = vi.hoisted(() => ({
  active: 'p1' as string | null,
  segment: null as null | (() => Promise<unknown>),
  calls: 0,
}));

vi.mock('@/engine/controller', () => ({
  engine: {
    getActivePhotoId: () => h.active,
    getPreviewBitmap: () => ({ width: 100, height: 80, close() {} }),
    getFullSize: () => ({ width: 1000, height: 800 }),
    setPortraitData: vi.fn(),
  },
}));
vi.mock('@/lib/image/decode', () => ({ resizeBitmap: async () => ({ close() {} }) }));
vi.mock('@/lib/portrait/faceMask', () => ({ buildPortraitMask: () => null }));
vi.mock('@/lib/masks/rasterize', () => ({ maskCanvasSize: () => ({ width: 10, height: 8 }) }));
vi.mock('@/lib/portrait/mediapipe', () => ({
  ModelsMissingError: class extends Error {},
  segmentPerson: () => {
    h.calls++;
    return h.segment ? h.segment() : Promise.resolve({ maps: { subject: new Uint8Array([255, 255, 0, 0]) } });
  },
  detectFacesThorough: async () => [{}],
  regionsForFace: async () => ({}),
}));
vi.mock('@/state/editorStore', () => ({ useEditor: Object.assign(() => null, { getState: () => ({}) }) }));

const { autoDetectPortrait, cancelPortraitAnalysis, ensurePortraitAnalysis, redetectPortrait, usePortraitStore } = await import('./portraitState');
const { useSettings } = await import('@/state/settingsStore');

const status = (id: string) => usePortraitStore.getState().status[id];

beforeEach(() => {
  vi.useFakeTimers();
  h.active = 'p1';
  h.segment = null;
  h.calls = 0;
  usePortraitStore.setState({ status: {}, faces: {}, person: {}, message: {} });
  useSettings.setState({ autoDetectFaces: true });
});
afterEach(() => vi.useRealTimers());

describe('automatic face detection', () => {
  it('starts in the background once the photo is up, and enables the tools when it finishes', async () => {
    autoDetectPortrait('p1');
    expect(h.calls).toBe(0); // waits for an idle moment first
    await vi.advanceTimersByTimeAsync(1300);
    await vi.waitFor(() => expect(status('p1')).toBe('ready'));
    expect(usePortraitStore.getState().faces.p1).toBe(1);
    expect(usePortraitStore.getState().person.p1).toBe(true);
  });

  it('does nothing when turned off in Settings, already done, or the photo changed before it started', async () => {
    useSettings.setState({ autoDetectFaces: false });
    autoDetectPortrait('p1');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toBe(0);

    useSettings.setState({ autoDetectFaces: true });
    usePortraitStore.setState({ status: { p1: 'ready' } });
    autoDetectPortrait('p1');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toBe(0);

    usePortraitStore.setState({ status: {} });
    const cancel = autoDetectPortrait('p1');
    cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toBe(0);

    autoDetectPortrait('p1');
    h.active = 'p2';
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toBe(0);
  });

  it('can be stopped; a stopped photo is not restarted automatically, but the button runs it again', async () => {
    let release!: () => void;
    h.segment = () => new Promise((r) => (release = () => r({ maps: { subject: new Uint8Array(4) } })));
    const job = ensurePortraitAnalysis();
    await vi.waitFor(() => expect(status('p1')).toBe('running'));
    cancelPortraitAnalysis('p1');
    release();
    await job;
    expect(status('p1')).toBe('idle');
    expect(usePortraitStore.getState().message.p1).toMatch(/Stopped/);

    h.segment = null;
    autoDetectPortrait('p1');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toBe(1);

    await redetectPortrait();
    expect(status('p1')).toBe('ready');
  });

  it('leaving a photo stops its run quietly, so it can start again later', async () => {
    let release!: () => void;
    h.segment = () => new Promise((r) => (release = () => r({ maps: { subject: new Uint8Array(4) } })));
    const job = ensurePortraitAnalysis();
    await vi.waitFor(() => expect(status('p1')).toBe('running'));
    cancelPortraitAnalysis('p1', false);
    release();
    await job;
    expect(status('p1')).toBe('idle');
    expect(usePortraitStore.getState().message.p1).toBe('');
    h.segment = null;
    autoDetectPortrait('p1');
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(status('p1')).toBe('ready'));
  });

  it('runs detection again from a finished state (the retry)', async () => {
    await ensurePortraitAnalysis();
    expect(status('p1')).toBe('ready');
    await redetectPortrait();
    expect(h.calls).toBe(2);
    expect(status('p1')).toBe('ready');
  });
});
