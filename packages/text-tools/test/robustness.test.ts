import { describe, expect, it } from 'vitest';
import {
  allCases,
  CASE_FORMS,
  checkAlphabet,
  coins,
  convertCase,
  count,
  decode,
  dice,
  encode,
  ENCODINGS,
  identifier,
  ID_KINDS,
  LINE_DEFAULTS,
  LINE_ORDERS,
  lines,
  many,
  numberBetween,
  passphrase,
  PASSPHRASE_DEFAULTS,
  password,
  PASSWORD_DEFAULTS,
  pick,
  pin,
  randomString,
  readWordList,
  refuse,
  slug,
  WORD_COUNT,
  type RandomSource,
  type Result,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const AWKWARD = [
  '',
  ' ',
  '\0',
  '\uD800',
  'a\uDC00b',
  '\uDBFF\uDBFF',
  '\r\n\r\n',
  '﻿',
  '%',
  '&',
  '&#xD800;',
  '=',
  '====',
  '😀👨‍👩‍👧🇮🇳',
  'é́́',
  'İSTANBUL ǅ ß',
  '‮evil',
  '!'.repeat(100_000),
  'aA'.repeat(50_000),
  '&#'.repeat(50_000),
  '%4'.repeat(50_000),
  'a\n'.repeat(50_000),
  'x'.repeat(100_001),
];

const NOT_WHOLE = [NaN, Infinity, -Infinity, 12.5, -1, 0, 1e21, '12', null, undefined, {}, []];
const asNumber = (value: unknown): number => value as number;

const LIST = Array.from({ length: WORD_COUNT }, (_, i) => `w${i}`);
const NOW = 1_700_000_000_000;

describe('typed text', () => {
  it('never makes a converter throw', () => {
    for (const text of AWKWARD) {
      const label = JSON.stringify(text.slice(0, 12));
      expect(() => {
        allCases(text);
        for (const form of CASE_FORMS) convertCase(text, form);
        slug(text);
        count(text);
        for (const order of LINE_ORDERS) {
          lines(text, { ...LINE_DEFAULTS, unique: true, ignoreCase: true, order }, seeded());
        }
        for (const form of ENCODINGS) {
          encode(text, form);
          decode(text, form);
        }
        pick(text, 3, seeded());
        checkAlphabet(text);
        readWordList(text);
        randomString({ kind: 'own', size: 8, letters: 'both', alphabet: text }, seeded());
      }, label).not.toThrow();
    }
  });

  it('is refused by every converter when it is over the limit', () => {
    const long = 'x'.repeat(100_001);
    const answers: Array<Result<unknown>> = [
      allCases(long),
      slug(long),
      count(long),
      lines(long, LINE_DEFAULTS, seeded()),
      pick(long, 1, seeded()),
      ...CASE_FORMS.map((form) => convertCase(long, form)),
      ...ENCODINGS.flatMap((form) => [encode(long, form), decode(long, form)]),
    ];
    for (const answer of answers) expect(answer).toEqual(refuse('too-long'));
  });

  it('stays quick at the limit', () => {
    const started = performance.now();
    for (const text of AWKWARD) {
      allCases(text);
      slug(text);
      count(text);
      lines(text, { ...LINE_DEFAULTS, unique: true, order: 'az' }, seeded());
      for (const form of ENCODINGS) decode(text, form);
    }
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});

describe('an option that is not a whole number', () => {
  it('is refused by every generator', () => {
    for (const bad of NOT_WHOLE) {
      const n = asNumber(bad);
      const label = String(bad);
      const out = refuse('out-of-range');
      expect(password({ ...PASSWORD_DEFAULTS, length: n }, seeded()), label).toEqual(out);
      expect(passphrase({ ...PASSPHRASE_DEFAULTS, words: n }, LIST, seeded()), label).toEqual(out);
      for (const kind of ['hex', 'digits'] as const) {
        expect(
          randomString({ kind, size: n, letters: 'both', alphabet: '' }, seeded()),
          label,
        ).toEqual(out);
      }
      expect(pin(n, seeded()), label).toEqual(out);
      expect(dice(n, 6, seeded()), label).toEqual(out);
      expect(dice(2, n, seeded()), label).toEqual(out);
      expect(coins(n, seeded()), label).toEqual(out);
      expect(pick('a\nb', n, seeded()), label).toEqual(out);
      expect(
        many(n, () => refuse('no-random')),
        label,
      ).toEqual(out);
      if (bad !== 0 && bad !== -1) {
        expect(numberBetween(n, 5, seeded()), label).toEqual(out);
        expect(numberBetween(5, n, seeded()), label).toEqual(out);
      }
      if (bad !== 0) expect(identifier('uuid7', n, seeded()), label).toEqual(out);
    }
  });
});

describe('a random source that misbehaves', () => {
  const broken: Array<[string, RandomSource]> = [
    [
      'throws',
      () => {
        throw new Error('no entropy');
      },
    ],
    ['returns too few', () => new Uint8Array(0)],
    ['returns too many', (wanted) => new Uint8Array(wanted + 1)],
    ['returns an array', (wanted) => Array<number>(wanted).fill(1) as unknown as Uint8Array],
    ['returns nothing', () => undefined as unknown as Uint8Array],
  ];

  for (const [name, random] of broken) {
    it(`${name}: every generator answers no-random`, () => {
      const out = refuse('no-random');
      expect(password(PASSWORD_DEFAULTS, random)).toEqual(out);
      expect(passphrase(PASSPHRASE_DEFAULTS, LIST, random)).toEqual(out);
      expect(randomString({ kind: 'hex', size: 8, letters: 'both', alphabet: '' }, random)).toEqual(
        out,
      );
      expect(
        randomString({ kind: 'digits', size: 8, letters: 'both', alphabet: '' }, random),
      ).toEqual(out);
      expect(pin(6, random)).toEqual(out);
      expect(numberBetween(1, 6, random)).toEqual(out);
      for (const kind of ID_KINDS) expect(identifier(kind, NOW, random)).toEqual(out);
      expect(dice(2, 6, random)).toEqual(out);
      expect(coins(2, random)).toEqual(out);
      expect(pick('a\nb\nc', 2, random)).toEqual(out);
      expect(lines('a\nb\nc', { ...LINE_DEFAULTS, order: 'shuffle' }, random)).toEqual(out);
    });
  }

  it('a source stuck on one value never yields a short or lopsided result', () => {
    const stuck = feed([0xff]);
    expect(password(PASSWORD_DEFAULTS, stuck)).toEqual(refuse('no-random'));
    expect(pin(6, stuck)).toEqual(refuse('no-random'));
    expect(numberBetween(1, 6, stuck)).toEqual(refuse('no-random'));
  });
});
