import { describe, expect, it } from 'vitest';
import { maskKey } from './rasterize';
import type { MaskComponent } from '../schema/adjustments';

describe('maskKey', () => {
  const comp = { id: 'c1', type: 'segment', target: 'subject' } as unknown as MaskComponent;

  it('is the same for equal components, cached or not, and follows the versions', () => {
    const a = [comp];
    const first = maskKey({ components: a }, 1, 2);
    expect(maskKey({ components: a }, 1, 2)).toBe(first); // served from the per-array cache
    expect(maskKey({ components: [{ ...comp }] }, 1, 2)).toBe(first);
    expect(maskKey({ components: a }, 2, 2)).not.toBe(first);
    expect(maskKey({ components: a }, 1, 3)).not.toBe(first);
  });

  it('changes when the store replaces the components array', () => {
    const a = [comp];
    const key = maskKey({ components: a }, 0);
    expect(maskKey({ components: [...a, { ...comp, id: 'c2' }] }, 0)).not.toBe(key);
  });
});
