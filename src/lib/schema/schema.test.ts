import { describe, expect, it } from 'vitest';
import { AdjustmentsSchema, EditStateSchema, defaultEditState, normalizeCurve } from './adjustments';
import { parsePresetFile, serializePresets, type Preset } from './preset';
import { emptyHistory, record, redo, undo, HISTORY_LIMIT } from '../history';
import { reviveEdit } from '../storage/db';

let seq = 0;
const newId = () => `id${++seq}`;

describe('edit state schema', () => {
  it('round-trips the default edit state through JSON', () => {
    const e = defaultEditState();
    const parsed = EditStateSchema.parse(JSON.parse(JSON.stringify(e)));
    expect(parsed).toEqual(e);
  });

  it('clamps out-of-range values instead of rejecting', () => {
    const e = defaultEditState();
    (e.adjustments.basic as Record<string, number>).exposure = 99;
    (e.adjustments.basic as Record<string, number>).contrast = -500;
    const parsed = AdjustmentsSchema.parse(e.adjustments);
    expect(parsed.basic.exposure).toBe(5);
    expect(parsed.basic.contrast).toBe(-100);
  });

  it('rejects non-finite numbers', () => {
    const e = defaultEditState();
    (e.adjustments.basic as Record<string, number>).exposure = Number.NaN;
    expect(AdjustmentsSchema.safeParse(e.adjustments).success).toBe(false);
  });

  it('repairs a corrupted stored edit with defaults', () => {
    expect(reviveEdit({ junk: true })).toEqual({ edit: defaultEditState(), repaired: true });
  });

  it('normalizes curves (sorted, deduped)', () => {
    expect(normalizeCurve([[1, 1], [0.5, 0.4], [0, 0], [0.5, 0.6]])).toEqual([[0, 0], [0.5, 0.6], [1, 1]]);
  });
});

describe('preset import/export', () => {
  const preset: Preset = {
    id: 'x',
    name: 'Test look',
    category: 'custom',
    description: 'd',
    tags: [],
    origin: 'user',
    adjustments: { basic: { exposure: 0.5 } },
    createdAt: 1,
    updatedAt: 1,
  };

  it('round-trips through the versioned file format', () => {
    const { presets, warnings } = parsePresetFile(serializePresets([preset]), newId);
    expect(warnings).toEqual([]);
    expect(presets[0].name).toBe('Test look');
    expect(presets[0].adjustments.basic?.exposure).toBe(0.5);
    expect(presets[0].origin).toBe('user');
  });

  it('reports unsupported keys and clamped values', () => {
    const text = JSON.stringify({
      schema: 'lumen-atelier/presets',
      version: 1,
      presets: [{ name: 'X', adjustments: { basic: { exposure: 12, frobnicate: 3 }, sparkle: { a: 1 } } }],
    });
    const { presets, warnings } = parsePresetFile(text, newId);
    expect(presets[0].adjustments.basic?.exposure).toBe(5);
    expect(warnings.join(' ')).toMatch(/frobnicate/);
    expect(warnings.join(' ')).toMatch(/sparkle/);
    expect(warnings.join(' ')).toMatch(/clamped/);
  });

  it('rejects files that are not preset files', () => {
    expect(() => parsePresetFile('{"hello":1}', newId)).toThrow(/not a Lumen Atelier preset file/);
    expect(() => parsePresetFile('not json', newId)).toThrow(/not valid JSON/);
  });

  it('skips invalid entries but keeps valid ones', () => {
    const text = JSON.stringify({ schema: 'lumen-atelier/presets', version: 1, presets: [{ name: '' }, { name: 'ok', adjustments: {} }] });
    const r = parsePresetFile(text, newId);
    expect(r.presets).toHaveLength(1);
    expect(r.rejected).toBe(1);
  });

  it('treats code-like strings as inert data', () => {
    const text = JSON.stringify({ schema: 'lumen-atelier/presets', version: 1, presets: [{ name: '<script>alert(1)</script>', description: '${process.exit()}', adjustments: {} }] });
    const r = parsePresetFile(text, newId);
    expect(r.presets[0].name).toBe('<script>alert(1)</script>');
  });
});

describe('history', () => {
  it('undo and redo restore states in order', () => {
    let h = emptyHistory<number>();
    h = record(h, 1, 'a', 0);
    h = record(h, 2, 'b', 10_000);
    const u1 = undo(h, 3)!;
    expect(u1.state).toBe(2);
    const u2 = undo(u1.history, u1.state)!;
    expect(u2.state).toBe(1);
    const r1 = redo(u2.history, u2.state)!;
    expect(r1.state).toBe(2);
  });

  it('merges repeated actions within the window', () => {
    let h = emptyHistory<number>();
    h = record(h, 1, 'nudge', 0);
    h = record(h, 2, 'nudge', 100);
    expect(h.past).toHaveLength(1);
    expect(h.past[0].state).toBe(1);
  });

  it('is bounded', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 30; i++) h = record(h, i, `s${i}`, i * 10_000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].state).toBe(30);
  });

  it('a new change clears the redo stack', () => {
    let h = emptyHistory<number>();
    h = record(h, 1, 'a', 0);
    const u = undo(h, 2)!;
    const h2 = record(u.history, 1, 'c', 50_000);
    expect(h2.future).toHaveLength(0);
  });
});
