import { describe, expect, it } from 'vitest';
import {
  passphrase,
  PASSPHRASE_DEFAULTS,
  passphraseBits,
  refuse,
  WORD_COUNT,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const LIST = Array.from({ length: WORD_COUNT }, (_, i) => `w${i}`);
const three = { ...PASSPHRASE_DEFAULTS, words: 3 };
// A word is two bytes: 7,776 needs thirteen bits.
const WORDS_012 = [0, 0, 0, 1, 0, 2];

describe('passphrase', () => {
  it('joins the words drawn with the separator', () => {
    expect(passphrase(three, LIST, feed(WORDS_012))).toEqual({ ok: true, value: 'w0-w1-w2' });
    expect(passphrase({ ...three, separator: ' ' }, LIST, feed(WORDS_012))).toEqual({
      ok: true,
      value: 'w0 w1 w2',
    });
  });

  it('can draw the last word of the list', () => {
    // 0x1e5f is 7,775.
    expect(passphrase(three, LIST, feed([0x1e, 0x5f]))).toEqual({
      ok: true,
      value: 'w7775-w7775-w7775',
    });
  });

  it('gives each word a capital when asked', () => {
    expect(passphrase({ ...three, capitals: true }, LIST, feed(WORDS_012))).toEqual({
      ok: true,
      value: 'W0-W1-W2',
    });
  });

  it('puts one digit after one word chosen at random', () => {
    // After the words: 1 picks the second word, 7 is the digit.
    expect(passphrase({ ...three, digit: true }, LIST, feed([...WORDS_012, 1, 7]))).toEqual({
      ok: true,
      value: 'w0-w17-w2',
    });
  });

  it('makes six words by default', () => {
    const made = passphrase(PASSPHRASE_DEFAULTS, LIST, seeded());
    expect(made.ok && made.value.split('-')).toHaveLength(6);
  });

  it('refuses a word count outside 3 to 12 and an unknown separator', () => {
    for (const words of [2, 13, 4.5, NaN]) {
      expect(passphrase({ ...three, words }, LIST, seeded())).toEqual(refuse('out-of-range'));
    }
    expect(passphrase({ ...three, separator: '' as '-' }, LIST, seeded())).toEqual(
      refuse('out-of-range'),
    );
  });

  it('refuses a list of the wrong length', () => {
    expect(passphrase(three, LIST.slice(1), seeded())).toEqual(refuse('bad-word-list'));
    expect(passphrase(three, 'abacus' as unknown as string[], seeded())).toEqual(
      refuse('bad-word-list'),
    );
  });

  it('answers a failed source with a refusal', () => {
    expect(passphrase(three, LIST, feed([0xff]))).toEqual(refuse('no-random'));
  });
});

describe('passphraseBits', () => {
  it('is words times the bits of one word, rounded down', () => {
    expect(passphraseBits(three)).toEqual({ ok: true, value: 38 });
    expect(passphraseBits(PASSPHRASE_DEFAULTS)).toEqual({ ok: true, value: 77 });
    expect(passphraseBits({ ...PASSPHRASE_DEFAULTS, words: 12 })).toEqual({ ok: true, value: 155 });
  });

  it('adds the digit and its place, and nothing for capitals', () => {
    expect(passphraseBits({ ...PASSPHRASE_DEFAULTS, digit: true })).toEqual({
      ok: true,
      value: 83,
    });
    expect(passphraseBits({ ...PASSPHRASE_DEFAULTS, capitals: true })).toEqual({
      ok: true,
      value: 77,
    });
  });

  it('refuses what passphrase refuses', () => {
    expect(passphraseBits({ ...three, words: 2 })).toEqual(refuse('out-of-range'));
  });
});
