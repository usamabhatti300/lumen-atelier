import { describe, expect, it } from 'vitest';
import { planTiles } from './exporter';

describe('export tiles', () => {
  it('adds the lens blur reach to the other blurs (they run one after the other)', () => {
    const p = planTiles({ tileSize: 2048, maxTexture: 16384, blurReach: 300, lensReach: 200 });
    expect(p.pad).toBe(508);
    expect(p.tile).toBe(2048);
    expect(p.reduced).toBe(false);
  });

  it('shrinks the tile so a padded, rotated tile still fits one texture', () => {
    // Glow plus a long streak on a 6000 px photo, on a GPU limited to 4096 px.
    const p = planTiles({ tileSize: 2048, maxTexture: 4096, blurReach: 1590, lensReach: 0 });
    expect(p.pad).toBe(1598);
    expect(p.reduced).toBe(false);
    expect(Math.ceil(p.tile * Math.SQRT2) + 2 * p.pad).toBeLessThanOrEqual(4096);
    expect(p.tile).toBeGreaterThanOrEqual(256);
  });

  it('cuts the padding only when even a small tile cannot hold it', () => {
    const p = planTiles({ tileSize: 2048, maxTexture: 2048, blurReach: 1590, lensReach: 400 });
    expect(p.reduced).toBe(true);
    expect(p.tile).toBeLessThan(300);
    expect(Math.ceil(p.tile * Math.SQRT2) + 2 * p.pad).toBeLessThanOrEqual(2048);
  });

  it('leaves an ordinary export as it was', () => {
    const p = planTiles({ tileSize: 2048, maxTexture: 8192, blurReach: 450, lensReach: 0 });
    expect(p).toEqual({ tile: 2048, pad: 458, reduced: false });
  });
});
