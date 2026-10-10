/**
 * Keeps the preview's source image in sync with the edit's removals. When the
 * removals change, the preview-resolution original is copied to a canvas, the
 * removals are applied in order (cached patches are reused; missing ones run
 * MI-GAN in the ML worker), and the controller swaps that canvas in as the
 * renderer's source. Removals therefore sit before every adjustment, exactly
 * as on export.
 *
 * A change during processing does not abort the running inference: its patch
 * is cached and the loop restarts with the new removals.
 */
import { create } from 'zustand';
import type { Removal } from '@/lib/schema/adjustments';
import { createCanvas } from '@/lib/image/decode';
import { activeRemovals, removalChainKeys } from '@/lib/removal/removal';
import { RemovalRestart, applyRemovals } from '@/lib/removal/inpaint';

export type RemovalPhase = 'idle' | 'download' | 'inpaint' | 'error' | 'cancelled';

export interface RemovalStatus {
  phase: RemovalPhase;
  loaded: number;
  total: number;
  /** Removal being filled (0-based) and how many are active. */
  index: number;
  count: number;
  message: string | null;
  /** Ids of the active removals the preview currently shows as applied. */
  applied: string[];
}

export const useRemovalStatus = create<RemovalStatus>(() => ({
  phase: 'idle',
  loaded: 0,
  total: 0,
  index: 0,
  count: 0,
  message: null,
  applied: [],
}));

type Source = OffscreenCanvas | HTMLCanvasElement;

export class RemovalPreview {
  private photoId: string | null = null;
  private base: ImageBitmap | null = null;
  private removals: Removal[] = [];
  private appliedSig = '';
  private haltedSig: string | null = null;
  private running = false;
  private ac: AbortController | null = null;
  private generation = 0;

  private readonly onSource: (source: Source | null) => void;

  constructor(onSource: (source: Source | null) => void) {
    this.onSource = onSource;
  }

  /** New photo or new preview bitmap: start over. */
  setBase(photoId: string | null, base: ImageBitmap | null, removals: Removal[] | undefined) {
    this.generation++;
    this.ac?.abort(new DOMException('Photo changed', 'AbortError'));
    this.ac = null;
    this.photoId = photoId;
    this.base = base;
    this.removals = removals ?? [];
    this.appliedSig = '';
    this.haltedSig = null;
    useRemovalStatus.setState({ phase: 'idle', message: null, applied: [], index: 0, count: 0 });
    this.kick();
  }

  update(removals: Removal[] | undefined) {
    this.removals = removals ?? [];
    // A paused or failed state only holds while the removals stay the same.
    if (this.haltedSig !== null && this.signature() !== this.haltedSig) this.haltedSig = null;
    this.kick();
  }

  /** Stops loading/filling. The removals stay in the edit; `retry` resumes. */
  cancel() {
    this.haltedSig = this.signature();
    this.ac?.abort(new DOMException('Cancelled', 'AbortError'));
  }

  retry() {
    this.haltedSig = null;
    this.kick();
  }

  private signature(): string {
    if (!this.base || !this.photoId) return '';
    const list = activeRemovals(this.removals);
    return list.length ? `${this.photoId}|${removalChainKeys(list, this.base.width, this.base.height).join(',')}` : '';
  }

  private kick() {
    if (!this.running) void this.loop();
  }

  private async loop() {
    this.running = true;
    try {
      for (;;) {
        const sig = this.signature();
        if (sig === this.appliedSig) {
          useRemovalStatus.setState({ phase: 'idle', message: null });
          return;
        }
        if (sig === this.haltedSig) return;
        const gen = this.generation;
        const list = activeRemovals(this.removals);
        if (!sig || !this.base) {
          this.appliedSig = sig;
          this.onSource(null);
          useRemovalStatus.setState({ phase: 'idle', message: null, applied: [], count: 0 });
          continue;
        }
        const ac = new AbortController();
        this.ac = ac;
        const base = this.base;
        const canvas = createCanvas(base.width, base.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
        if (!ctx) throw new Error('Could not allocate the preview for object removal.');
        ctx.drawImage(base, 0, 0);
        try {
          await applyRemovals(ctx, base.width, base.height, list, {
            scope: `${this.photoId}/preview`,
            persist: true,
            signal: ac.signal,
            stale: () => this.signature() !== sig || gen !== this.generation,
            onProgress: (p) =>
              useRemovalStatus.setState(
                p.phase === 'download'
                  ? { phase: 'download', loaded: p.loaded, total: p.total, message: null }
                  : { phase: 'inpaint', index: p.index, count: p.count, message: null },
              ),
          });
        } catch (e) {
          if (gen !== this.generation) continue;
          if (e instanceof RemovalRestart) continue;
          if (e instanceof Error && e.name === 'AbortError') {
            useRemovalStatus.setState({ phase: 'cancelled', message: 'Removal paused. The painted areas are kept; resume to fill them.' });
            return;
          }
          this.haltedSig = sig;
          const message = e instanceof Error ? e.message : String(e);
          useRemovalStatus.setState({ phase: 'error', message });
          return;
        } finally {
          if (this.ac === ac) this.ac = null;
        }
        if (gen !== this.generation || this.signature() !== sig) continue;
        this.appliedSig = sig;
        this.onSource(canvas);
        useRemovalStatus.setState({ phase: 'idle', message: null, applied: list.map((r) => r.id), count: list.length });
      }
    } catch (e) {
      useRemovalStatus.setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.running = false;
    }
  }
}
