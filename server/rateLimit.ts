/**
 * Minimal in-memory token bucket keyed by client address. Adequate for a
 * single-process local/self-hosted server; a multi-instance deployment would
 * need a shared store.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor(perMinute: number, now: () => number = Date.now) {
    this.capacity = perMinute;
    this.refillPerMs = perMinute / 60_000;
    this.now = now;
  }

  /** Returns 0 when allowed, otherwise the number of ms until a token is available. */
  take(key: string): number {
    const t = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updated: t };
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (t - bucket.updated) * this.refillPerMs);
    bucket.updated = t;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      this.prune(t);
      return 0;
    }
    this.buckets.set(key, bucket);
    return Math.ceil((1 - bucket.tokens) / this.refillPerMs);
  }

  private prune(t: number) {
    if (this.buckets.size < 1000) return;
    for (const [k, b] of this.buckets) if (t - b.updated > 120_000) this.buckets.delete(k);
  }
}
