import { describe, expect, it } from 'vitest';
import { generateCube, parseCube } from './cube';
import { generateXmp } from './xmp';
import { defaultAdjustments, mergeAdjustments } from '../schema/adjustments';

describe('.cube LUTs', () => {
  it('round-trips an identity LUT generated from default settings', () => {
    const cube = generateCube(defaultAdjustments(), 'Identity', 9);
    const parsed = parseCube(cube);
    expect(parsed.size).toBe(9);
    expect(parsed.data.length).toBe(9 ** 3 * 3);
    // Entry for (r=1,g=0,b=0) is index 8.
    expect(parsed.data[8 * 3]).toBeCloseTo(1, 2);
    expect(parsed.data[8 * 3 + 1]).toBeCloseTo(0, 2);
  });

  it('bakes adjustments into the LUT', () => {
    const adj = mergeAdjustments(defaultAdjustments(), { basic: { exposure: 1 } });
    const parsed = parseCube(generateCube(adj, 'Brighter', 5));
    const mid = (2 * 25 + 2 * 5 + 2) * 3; // r=g=b=0.5
    expect(parsed.data[mid]).toBeGreaterThan(0.6);
  });

  it('applies DOMAIN_MIN/MAX and rejects malformed files', () => {
    const text = ['LUT_3D_SIZE 2', 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 2 2 2', ...Array(8).fill('2 1 0')].join('\n');
    const p = parseCube(text);
    expect(Array.from(p.data.slice(0, 3))).toEqual([1, 0.5, 0]);
    expect(() => parseCube('LUT_1D_SIZE 1024')).toThrow(/1D/);
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0')).toThrow(/Expected 8/);
    expect(() => parseCube('LUT_3D_SIZE 2\n' + Array(8).fill('a b c').join('\n'))).toThrow();
    expect(() => parseCube('hello')).toThrow(/LUT_3D_SIZE/);
  });
});

describe('XMP export', () => {
  it('writes Camera Raw settings and lists omissions', () => {
    const adj = mergeAdjustments(defaultAdjustments(), {
      basic: { exposure: 0.5, contrast: 20, brightness: 10 },
      curves: { master: [[0, 0.1], [1, 1]] },
      mixer: { red: { r: 80, g: 20, b: 0 } },
    });
    const { xml, omitted } = generateXmp(adj, 'My <look> & "quotes"');
    expect(xml).toContain('crs:Exposure2012="+0.50"');
    expect(xml).toContain('crs:Contrast2012="+20"');
    expect(xml).toContain('<rdf:li>0, 26</rdf:li>');
    expect(xml).toContain('My &lt;look&gt; &amp; &quot;quotes&quot;');
    expect(omitted.join(' ')).toMatch(/Channel mixer/);
    expect(omitted.join(' ')).toMatch(/Brightness/);
  });
});
