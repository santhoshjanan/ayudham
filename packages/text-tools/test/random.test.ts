import { describe, expect, it } from 'vitest';
import { many, ok, refuse } from '../src/index.ts';
import { below, bytes, guard, pickFrom, RandomFailure, shuffled } from '../src/random.ts';
import { ALL_BYTES, feed, seeded } from './helpers.ts';

describe('bytes', () => {
  it('returns what the source gave', () => {
    expect([...bytes(3, feed([1, 2, 3]))]).toEqual([1, 2, 3]);
  });

  it('refuses a source that throws, miscounts or returns the wrong thing', () => {
    expect(() =>
      bytes(4, () => {
        throw new Error('no');
      }),
    ).toThrow(RandomFailure);
    expect(() => bytes(4, () => new Uint8Array(3))).toThrow(RandomFailure);
    expect(() => bytes(4, () => new Uint8Array(5))).toThrow(RandomFailure);
    expect(() => bytes(4, () => [1, 2, 3, 4] as unknown as Uint8Array)).toThrow(RandomFailure);
  });
});

describe('below', () => {
  it('draws again instead of taking a remainder', () => {
    // 6 needs three bits: 7 and 6 are thrown away, 5 is kept.
    expect(below(6, feed([7, 6, 5]))).toBe(5);
  });

  it('uses the low bits of the first byte only', () => {
    expect(below(6, feed([0b1111_1010]))).toBe(2);
  });

  it('draws as many bytes as the number needs', () => {
    // 300 needs nine bits: 0x1ff is thrown away, 0x12b is 299.
    expect(below(300, feed([0xff, 0xff, 0x01, 0x2b]))).toBe(299);
  });

  it('needs no draw when there is one outcome', () => {
    expect(
      below(1, () => {
        throw new Error('not called');
      }),
    ).toBe(0);
  });

  it('gives every outcome equally often over every byte value', () => {
    const random = feed(ALL_BYTES);
    const seen = [0, 0, 0, 0, 0, 0];
    // Of 256 bytes, 192 are kept: 32 for each of the six outcomes.
    for (let i = 0; i < 192; i++) seen[below(6, random)]!++;
    expect(seen).toEqual([32, 32, 32, 32, 32, 32]);
  });

  it('reaches the largest bound the package uses', () => {
    const top = 2 * 1_000_000_000_000_000 + 1;
    const random = seeded();
    for (let i = 0; i < 500; i++) {
      const value = below(top, random);
      expect(Number.isSafeInteger(value) && value >= 0 && value < top).toBe(true);
    }
  });

  it('gives up on a source that never yields a usable value', () => {
    expect(() => below(6, feed([7]))).toThrow(RandomFailure);
  });

  it('refuses a bound that is not a whole number of at least one', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => below(bad, seeded())).toThrow(RandomFailure);
    }
  });
});

describe('pickFrom', () => {
  it('picks one character for each place', () => {
    expect(pickFrom(['x', 'y'], 4, feed([0, 1, 1, 0]))).toBe('xyyx');
  });
});

describe('shuffled', () => {
  it('swaps from the end, leaving the original alone', () => {
    const original = [1, 2, 3];
    expect(shuffled(original, feed([0, 1]))).toEqual([3, 2, 1]);
    expect(original).toEqual([1, 2, 3]);
  });

  it('gives each order about equally often', () => {
    const random = seeded();
    const seen = new Map<string, number>();
    for (let i = 0; i < 6_000; i++) {
      const order = shuffled(['a', 'b', 'c'], random).join('');
      seen.set(order, (seen.get(order) ?? 0) + 1);
    }
    expect(seen.size).toBe(6);
    for (const count of seen.values()) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1_150);
    }
  });
});

describe('guard', () => {
  it('turns a failed source into a refusal and lets other errors through', () => {
    expect(guard(() => 'fine')).toEqual(ok('fine'));
    expect(guard(() => below(6, feed([7])))).toEqual(refuse('no-random'));
    expect(() =>
      guard(() => {
        throw new TypeError('a bug');
      }),
    ).toThrow(TypeError);
  });
});

describe('many', () => {
  it('makes the number asked for', () => {
    let made = 0;
    expect(many(3, () => ok(++made))).toEqual(ok([1, 2, 3]));
  });

  it('refuses a number outside 1 to 100', () => {
    for (const bad of [0, 101, 2.5, NaN, '3']) {
      expect(many(bad, () => ok('x'))).toEqual(refuse('out-of-range'));
    }
  });

  it('stops at the first refusal', () => {
    let made = 0;
    expect(many(5, () => (++made === 2 ? refuse('no-random') : ok(made)))).toEqual(
      refuse('no-random'),
    );
    expect(made).toBe(2);
  });
});
