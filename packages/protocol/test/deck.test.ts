import { describe, expect, it } from 'vitest';
import { BUILT_IN_DECKS, cardValue, deckSchema } from '../src/index.ts';

describe('built-in decks', () => {
  it('offers the four decks in the spec', () => {
    expect(Object.keys(BUILT_IN_DECKS)).toEqual([
      'fibonacci',
      'modifiedFibonacci',
      'tshirt',
      'powersOfTwo',
    ]);
  });

  it('are all valid and carry ? and a break card', () => {
    for (const { deck } of Object.values(BUILT_IN_DECKS)) {
      expect(deckSchema.safeParse(deck).success).toBe(true);
      expect(deck.specials).toEqual(['?', '☕']);
    }
  });
});

describe('deckSchema', () => {
  const parse = (values: string[], specials: string[] = []) =>
    deckSchema.safeParse({ values, specials }).success;

  it('accepts a custom deck of exactly 20 cards', () => {
    const eighteen = Array.from({ length: 18 }, (_, i) => String(i));
    expect(parse(eighteen, ['?', '☕'])).toBe(true);
  });

  it('rejects 21 cards', () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => String(i));
    expect(parse(nineteen, ['?', '☕'])).toBe(false);
  });

  it('rejects a card longer than 4 characters', () => {
    expect(parse(['1', '2', 'XXXXL'])).toBe(false);
  });

  it('rejects empty cards and cards containing whitespace', () => {
    expect(parse(['1', '', '3'])).toBe(false);
    expect(parse(['1', ' ', '3'])).toBe(false);
    expect(parse(['1', 'a b', '3'])).toBe(false);
  });

  it('rejects a card repeated across values and specials', () => {
    expect(parse(['1', '2', '?'], ['?'])).toBe(false);
    expect(parse(['1', '1', '2'])).toBe(false);
  });

  it('rejects control, invisible, direction-override, combining and broken characters', () => {
    for (const bad of ['\u0000', '\u200b', '\u2060', '\u202e', 'e\u0301', '\ud800', '\n']) {
      expect(parse(['1', bad, '3'])).toBe(false);
    }
  });

  it('rejects cards that look the same after Unicode normalisation', () => {
    expect(parse(['1', '\uff11', '2'])).toBe(false);
  });

  it('accepts letters, digits, punctuation and symbols from any script', () => {
    expect(parse(['\u00bd', '\u00e9', '\u5927', '+1'], ['?', '\u2615'])).toBe(true);
  });

  it('rejects fewer than two value cards', () => {
    expect(parse(['1'], ['?'])).toBe(false);
  });
});

describe('cardValue', () => {
  it('reads numbers, including the half card', () => {
    expect(cardValue('8')).toBe(8);
    expect(cardValue('0')).toBe(0);
    expect(cardValue('1.5')).toBe(1.5);
    expect(cardValue('½')).toBe(0.5);
  });

  it('returns null for anything else', () => {
    expect(cardValue('XL')).toBeNull();
    expect(cardValue('?')).toBeNull();
    expect(cardValue('-1')).toBeNull();
  });
});
