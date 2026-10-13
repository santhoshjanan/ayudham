import { describe, expect, it } from 'vitest';
import { identifier, ID_KINDS, refuse, TIMED_IDS } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const NOW = 1_645_557_742_000;

describe('uuid4', () => {
  it('sets the version and variant bits and leaves the rest random', () => {
    expect(identifier('uuid4', NOW, feed([0xff]))).toEqual({
      ok: true,
      value: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    });
    expect(identifier('uuid4', NOW, feed([0]))).toEqual({
      ok: true,
      value: '00000000-0000-4000-8000-000000000000',
    });
  });
});

describe('uuid7', () => {
  it('matches the example in RFC 9562', () => {
    const random = feed([0x0c, 0xc3, 0x18, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f]);
    expect(identifier('uuid7', NOW, random)).toEqual({
      ok: true,
      value: '017f22e2-79b0-7cc3-98c4-dc0c0c07398f',
    });
  });

  it('carries the time in its first twelve hex digits', () => {
    const made = identifier('uuid7', 0xffff_ffff_ffff, feed([0]));
    expect(made).toEqual({ ok: true, value: 'ffffffff-ffff-7000-8000-000000000000' });
  });
});

describe('ulid', () => {
  it('writes the time in ten characters and the random part in sixteen', () => {
    expect(identifier('ulid', 1_469_918_176_385, feed([0]))).toEqual({
      ok: true,
      value: '01ARYZ6S410000000000000000',
    });
    expect(identifier('ulid', 0, feed([0xff]))).toEqual({
      ok: true,
      value: '0000000000ZZZZZZZZZZZZZZZZ',
    });
    expect(identifier('ulid', 0xffff_ffff_ffff, feed([0]))).toEqual({
      ok: true,
      value: '7ZZZZZZZZZ0000000000000000',
    });
  });

  it('spreads the random bytes five bits at a time', () => {
    // 0x08 0x42 0x10 0x84 0x21 is the bit pattern 00001 repeated: the character 1, eight times.
    const random = feed([0x08, 0x42, 0x10, 0x84, 0x21]);
    expect(identifier('ulid', 0, random)).toEqual({
      ok: true,
      value: '00000000001111111111111111',
    });
  });
});

describe('short id', () => {
  it('is 21 URL-safe characters', () => {
    expect(identifier('short', NOW, feed([0]))).toEqual({ ok: true, value: 'A'.repeat(21) });
    const made = identifier('short', NOW, seeded());
    expect(made.ok && /^[A-Za-z0-9_-]{21}$/.test(made.value)).toBe(true);
  });
});

describe('identifier', () => {
  it('says which kinds contain the time', () => {
    expect(TIMED_IDS).toEqual(['uuid7', 'ulid']);
  });

  it('refuses a time that does not fit 48 bits, for the kinds that use it', () => {
    for (const now of [-1, 2 ** 48, 1.5, NaN]) {
      expect(identifier('uuid7', now, seeded())).toEqual(refuse('out-of-range'));
      expect(identifier('ulid', now, seeded())).toEqual(refuse('out-of-range'));
      expect(identifier('uuid4', now, seeded()).ok).toBe(true);
    }
  });

  it('refuses an unknown kind and a failed source', () => {
    expect(identifier('guid' as 'uuid4', NOW, seeded())).toEqual(refuse('out-of-range'));
    for (const kind of ID_KINDS) {
      expect(identifier(kind, NOW, () => new Uint8Array(0))).toEqual(refuse('no-random'));
    }
  });

  it('makes a different value each time', () => {
    const random = seeded();
    for (const kind of ID_KINDS) {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const made = identifier(kind, NOW, random);
        if (made.ok) seen.add(made.value);
      }
      expect(seen.size).toBe(200);
    }
  });
});
