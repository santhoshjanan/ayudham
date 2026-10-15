import { describe, expect, it } from 'vitest';
import { explain, ok, PROBLEMS, refuse, whole } from '../src/index.ts';

describe('results', () => {
  it('wraps a value and a refusal', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(refuse('too-long')).toEqual({ ok: false, problem: 'too-long' });
  });

  it('has a sentence for every problem', () => {
    for (const problem of PROBLEMS) {
      expect(explain(problem), problem).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe('whole', () => {
  it('accepts only whole numbers inside the bounds', () => {
    expect(whole(8, 8, 256)).toBe(true);
    expect(whole(256, 8, 256)).toBe(true);
    for (const bad of [7, 257, 8.5, NaN, Infinity, -Infinity, '12', null, undefined, {}, 12n]) {
      expect(whole(bad, 8, 256), String(bad)).toBe(false);
    }
  });
});
