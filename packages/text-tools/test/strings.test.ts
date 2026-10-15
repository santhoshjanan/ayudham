import { describe, expect, it } from 'vitest';
import {
  checkAlphabet,
  randomString,
  refuse,
  stringBits,
  STRING_KINDS,
  STRING_SIZES,
  type StringOptions,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const of = (kind: StringOptions['kind'], size: number, more: Partial<StringOptions> = {}) => ({
  kind,
  size,
  letters: 'both' as const,
  alphabet: '',
  ...more,
});

describe('randomString', () => {
  it('writes random bytes as hex, Base64 and Base64URL', () => {
    const DEADBEEF = [0xde, 0xad, 0xbe, 0xef];
    expect(randomString(of('hex', 4), feed(DEADBEEF))).toEqual({ ok: true, value: 'deadbeef' });
    expect(randomString(of('base64', 4), feed(DEADBEEF))).toEqual({ ok: true, value: '3q2+7w==' });
    expect(randomString(of('base64url', 4), feed(DEADBEEF))).toEqual({ ok: true, value: '3q2-7w' });
  });

  it('draws characters for the other kinds', () => {
    expect(randomString(of('digits', 5), feed([3, 1, 4, 1, 5]))).toEqual({
      ok: true,
      value: '31415',
    });
    expect(randomString(of('letters', 3, { letters: 'lower' }), feed([0, 1, 25]))).toEqual({
      ok: true,
      value: 'abz',
    });
    expect(randomString(of('letters', 3, { letters: 'upper' }), feed([0, 1, 25]))).toEqual({
      ok: true,
      value: 'ABZ',
    });
    expect(randomString(of('letters', 2), feed([0, 26]))).toEqual({ ok: true, value: 'Aa' });
    expect(randomString(of('alphanumeric', 3), feed([0, 26, 52]))).toEqual({
      ok: true,
      value: 'Aa0',
    });
    expect(randomString(of('own', 4, { alphabet: 'xy' }), feed([0, 1, 1, 0]))).toEqual({
      ok: true,
      value: 'xyyx',
    });
  });

  it('picks whole characters from an alphabet of emoji', () => {
    expect(randomString(of('own', 3, { alphabet: '😀😎' }), feed([1, 0, 1]))).toEqual({
      ok: true,
      value: '😎😀😎',
    });
  });

  it('holds to both ends of each size limit', () => {
    const hex = randomString(of('hex', 128), seeded());
    expect(hex.ok && hex.value).toHaveLength(256);
    expect(randomString(of('hex', 1), seeded()).ok).toBe(true);
    expect(randomString(of('hex', 129), seeded())).toEqual(refuse('out-of-range'));
    expect(randomString(of('hex', 0), seeded())).toEqual(refuse('out-of-range'));
    const digits = randomString(of('digits', 256), seeded());
    expect(digits.ok && digits.value).toHaveLength(256);
    expect(randomString(of('digits', 257), seeded())).toEqual(refuse('out-of-range'));
    expect(randomString(of('digits', 12.5), seeded())).toEqual(refuse('out-of-range'));
  });

  it('refuses an unknown kind and a bad alphabet', () => {
    expect(randomString(of('rot13' as 'hex', 4), seeded())).toEqual(refuse('out-of-range'));
    expect(randomString(of('own', 4, { alphabet: 'aa' }), seeded())).toEqual(
      refuse('alphabet-repeat'),
    );
  });

  it('has a default size for every kind', () => {
    for (const kind of STRING_KINDS) {
      expect(randomString(of(kind, STRING_SIZES[kind], { alphabet: 'abc' }), seeded()).ok).toBe(
        true,
      );
    }
  });
});

describe('checkAlphabet', () => {
  it('accepts distinct characters, counted as code points', () => {
    expect(checkAlphabet('ab')).toEqual({ ok: true, value: ['a', 'b'] });
    expect(checkAlphabet('😀😎')).toEqual({ ok: true, value: ['😀', '😎'] });
  });

  it('refuses too few, too many, repeats, white space and control characters', () => {
    expect(checkAlphabet('a')).toEqual(refuse('alphabet-size'));
    expect(checkAlphabet('')).toEqual(refuse('alphabet-size'));
    const wide = Array.from({ length: 257 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
    expect(checkAlphabet(wide)).toEqual(refuse('alphabet-size'));
    expect(checkAlphabet(wide.slice(0, 256)).ok).toBe(true);
    expect(checkAlphabet('aba')).toEqual(refuse('alphabet-repeat'));
    for (const bad of ['a b', 'a\tb', 'a\nb', 'a\0b', 'a​b', 'a\uD800b']) {
      expect(checkAlphabet(bad), JSON.stringify(bad)).toEqual(refuse('alphabet-space'));
    }
    expect(checkAlphabet(7)).toEqual(refuse('alphabet-size'));
  });
});

describe('stringBits', () => {
  it('is eight bits a byte, or the bits of each character, rounded down', () => {
    expect(stringBits(of('hex', 16))).toEqual({ ok: true, value: 128 });
    expect(stringBits(of('base64url', 32))).toEqual({ ok: true, value: 256 });
    expect(stringBits(of('digits', 16))).toEqual({ ok: true, value: 53 });
    expect(stringBits(of('alphanumeric', 24))).toEqual({ ok: true, value: 142 });
    expect(stringBits(of('own', 16, { alphabet: 'xy' }))).toEqual({ ok: true, value: 16 });
  });

  it('refuses what randomString refuses', () => {
    expect(stringBits(of('hex', 129))).toEqual(refuse('out-of-range'));
    expect(stringBits(of('own', 4, { alphabet: 'a' }))).toEqual(refuse('alphabet-size'));
  });
});
