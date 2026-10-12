import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { summariseRound } from '../src/index.ts';

const FIB = BUILT_IN_DECKS.fibonacci.deck;
const TEE = BUILT_IN_DECKS.tshirt.deck;
const POW = BUILT_IN_DECKS.powersOfTwo.deck;

describe('summariseRound', () => {
  it('describes a spread, a unanimous round and a non-numeric deck', () => {
    expect(summariseRound(FIB, ['3', '8'])).toBe('Low 3, High 8, average 5.5');
    expect(summariseRound(FIB, ['5', '5', '?'])).toBe('Unanimous: 5');
    expect(summariseRound(TEE, ['S', 'XL'])).toBe('Low S, High XL');
  });

  it('says nothing when there is nothing to say', () => {
    expect(summariseRound(FIB, [])).toBe('');
    expect(summariseRound(FIB, ['?', '?'])).toBe('');
  });

  it('says nothing, rather than something false, when a card is not in this deck', () => {
    // Voted with Fibonacci; the room has since changed to powers of two.
    expect(summariseRound(POW, ['8', '13', '21'])).toBe('');
    expect(summariseRound(POW, ['1', '2', '3', '5'])).toBe('');
  });
});
