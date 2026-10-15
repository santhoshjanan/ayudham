import { describe, expect, it } from 'vitest';
import { LIMITS, numberBetween, pin, refuse } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

describe('pin', () => {
  it('is digits only and keeps leading zeros', () => {
    expect(pin(6, feed([1, 2, 3, 4, 5, 0]))).toEqual({ ok: true, value: '123450' });
    expect(pin(4, feed([0, 0, 0, 7]))).toEqual({ ok: true, value: '0007' });
  });

  it('refuses a length outside 4 to 12', () => {
    for (const digits of [3, 13, 4.5, NaN])
      expect(pin(digits, seeded())).toEqual(refuse('out-of-range'));
  });
});

describe('numberBetween', () => {
  it('includes both bounds', () => {
    expect(numberBetween(1, 6, feed([0]))).toEqual({ ok: true, value: 1 });
    expect(numberBetween(1, 6, feed([5]))).toEqual({ ok: true, value: 6 });
  });

  it('swaps bounds given the wrong way round', () => {
    expect(numberBetween(6, 1, feed([5]))).toEqual({ ok: true, value: 6 });
  });

  it('handles equal and negative bounds', () => {
    expect(numberBetween(5, 5, seeded())).toEqual({ ok: true, value: 5 });
    expect(numberBetween(-3, 3, feed([0]))).toEqual({ ok: true, value: -3 });
    expect(numberBetween(-3, 3, feed([6]))).toEqual({ ok: true, value: 3 });
  });

  it('stays whole and inside the widest range', () => {
    const random = seeded();
    for (let i = 0; i < 300; i++) {
      const made = numberBetween(-LIMITS.bound, LIMITS.bound, random);
      if (!made.ok) throw new Error(made.problem);
      expect(Number.isSafeInteger(made.value)).toBe(true);
      expect(Math.abs(made.value)).toBeLessThanOrEqual(LIMITS.bound);
    }
  });

  it('refuses a bound that is too large or not whole', () => {
    expect(numberBetween(0, LIMITS.bound + 1, seeded())).toEqual(refuse('out-of-range'));
    expect(numberBetween(-LIMITS.bound - 1, 0, seeded())).toEqual(refuse('out-of-range'));
    expect(numberBetween(1.5, 3, seeded())).toEqual(refuse('out-of-range'));
    expect(numberBetween(1, NaN, seeded())).toEqual(refuse('out-of-range'));
  });
});
