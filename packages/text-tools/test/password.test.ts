import { describe, expect, it } from 'vitest';
import {
  countAllowed,
  DIGITS,
  LOOKALIKES,
  LOWER,
  password,
  PASSWORD_DEFAULTS,
  passwordBits,
  refuse,
  SYMBOLS,
  UPPER,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const only = (on: Partial<typeof PASSWORD_DEFAULTS>) => ({
  ...PASSWORD_DEFAULTS,
  lower: false,
  upper: false,
  digits: false,
  symbols: false,
  ...on,
});

describe('password', () => {
  it('has the length asked for and a character of every class that is on', () => {
    const random = seeded();
    for (let i = 0; i < 200; i++) {
      const made = password(PASSWORD_DEFAULTS, random);
      if (!made.ok) throw new Error(made.problem);
      const chars = [...made.value];
      expect(chars).toHaveLength(20);
      for (const set of [LOWER, UPPER, DIGITS, SYMBOLS]) {
        expect(chars.some((char) => set.includes(char))).toBe(true);
      }
    }
  });

  it('uses only the classes that are on', () => {
    const made = password(only({ digits: true, length: 8 }), seeded());
    expect(made.ok && /^[0-9]{8}$/.test(made.value)).toBe(true);
  });

  it('leaves out look-alikes when asked', () => {
    const random = seeded();
    for (let i = 0; i < 200; i++) {
      const made = password({ ...PASSWORD_DEFAULTS, plain: true }, random);
      if (!made.ok) throw new Error(made.problem);
      for (const char of made.value) expect(LOOKALIKES.includes(char)).toBe(false);
    }
  });

  it('draws the whole password again when a class is missing', () => {
    // Lowercase and digits: 36 characters, 'a' at 0 and '0' at 26.
    // The first eight draws spell aaaaaaaa, which has no digit and is thrown away.
    const random = feed([...Array<number>(15).fill(0), 26]);
    expect(password(only({ lower: true, digits: true, length: 8 }), random)).toEqual({
      ok: true,
      value: 'aaaaaaa0',
    });
  });

  it('refuses a length outside 8 to 256, and no classes at all', () => {
    for (const length of [7, 257, 20.5, NaN]) {
      expect(password({ ...PASSWORD_DEFAULTS, length }, seeded())).toEqual(refuse('out-of-range'));
    }
    expect(password(only({}), seeded())).toEqual(refuse('no-classes'));
  });

  it('answers a failed source with a refusal', () => {
    expect(password(PASSWORD_DEFAULTS, feed([0xff]))).toEqual(refuse('no-random'));
  });
});

describe('countAllowed', () => {
  it('matches a count made by trying every password', () => {
    const cases: Array<[number[], number]> = [
      [[2, 1, 3], 4],
      [[1, 1], 3],
      [[3], 5],
      [[2, 2, 2, 2], 4],
      [[2, 3], 1],
    ];
    for (const [sizes, length] of cases) {
      const owner = sizes.flatMap((size, set) => Array<number>(size).fill(set));
      let allowed = 0;
      const total = owner.length ** length;
      for (let code = 0; code < total; code++) {
        const seen = new Set<number>();
        for (let rest = code, i = 0; i < length; i++, rest = Math.floor(rest / owner.length)) {
          seen.add(owner[rest % owner.length]!);
        }
        if (seen.size === sizes.length) allowed++;
      }
      expect(countAllowed(sizes, length), `${sizes} x ${length}`).toBe(BigInt(allowed));
    }
  });
});

describe('passwordBits', () => {
  it('is the whole number of bits in the count of allowed passwords', () => {
    expect(passwordBits(PASSWORD_DEFAULTS)).toEqual({ ok: true, value: 128 });
    expect(passwordBits({ ...PASSWORD_DEFAULTS, plain: true })).toEqual({ ok: true, value: 126 });
    expect(passwordBits(only({ digits: true, length: 8 }))).toEqual({ ok: true, value: 26 });
    expect(passwordBits({ ...PASSWORD_DEFAULTS, length: 256 })).toEqual({ ok: true, value: 1645 });
  });

  it('never claims more than length times the bits of one character', () => {
    for (const length of [8, 9, 12, 40]) {
      const bits = passwordBits({ ...PASSWORD_DEFAULTS, length });
      expect(bits.ok && bits.value <= length * Math.log2(86)).toBe(true);
    }
  });

  it('refuses what password refuses', () => {
    expect(passwordBits({ ...PASSWORD_DEFAULTS, length: 7 })).toEqual(refuse('out-of-range'));
    expect(passwordBits(only({}))).toEqual(refuse('no-classes'));
  });
});
