import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { computeResult } from '../src/index.ts';

const FIB = BUILT_IN_DECKS.fibonacci.deck;
const MOD = BUILT_IN_DECKS.modifiedFibonacci.deck;
const TEE = BUILT_IN_DECKS.tshirt.deck;
const v = (participantId: string, card: string) => ({ participantId, card });

describe('computeResult', () => {
  it('averages numeric votes and identifies who holds the extremes', () => {
    const result = computeResult(FIB, [v('a', '3'), v('b', '5'), v('c', '8'), v('d', '5')]);
    expect(result.average).toBeCloseTo(5.25);
    expect(result).toMatchObject({
      low: '3',
      high: '8',
      unanimous: false,
      lowIds: ['a'],
      highIds: ['c'],
      distribution: [
        { card: '3', count: 1 },
        { card: '5', count: 2 },
        { card: '8', count: 1 },
      ],
    });
  });

  it('flags everyone who shares an extreme', () => {
    const result = computeResult(FIB, [v('a', '3'), v('b', '3'), v('c', '8')]);
    expect(result.lowIds).toEqual(['a', 'b']);
    expect(result.highIds).toEqual(['c']);
  });

  it('reports a unanimous vote with nobody flagged', () => {
    expect(computeResult(FIB, [v('a', '5'), v('b', '5')])).toEqual({
      average: 5,
      low: '5',
      high: '5',
      unanimous: true,
      lowIds: [],
      highIds: [],
      distribution: [{ card: '5', count: 2 }],
    });
  });

  it('treats a single vote as unanimous', () => {
    expect(computeResult(FIB, [v('a', '13')])).toMatchObject({ average: 13, unanimous: true });
  });

  it('keeps special cards in the distribution and out of everything else', () => {
    expect(computeResult(FIB, [v('a', '5'), v('b', '?'), v('c', '☕')])).toEqual({
      average: 5,
      low: '5',
      high: '5',
      unanimous: true,
      lowIds: [],
      highIds: [],
      distribution: [
        { card: '5', count: 1 },
        { card: '?', count: 1 },
        { card: '☕', count: 1 },
      ],
    });
  });

  it('has no statistics when only special cards were voted', () => {
    expect(computeResult(FIB, [v('a', '?'), v('b', '?')])).toEqual({
      average: null,
      low: null,
      high: null,
      unanimous: false,
      lowIds: [],
      highIds: [],
      distribution: [{ card: '?', count: 2 }],
    });
  });

  it('handles a round with no votes', () => {
    expect(computeResult(FIB, [])).toMatchObject({ average: null, low: null, distribution: [] });
  });

  it('orders a non-numeric deck by position and gives no average', () => {
    expect(computeResult(TEE, [v('a', 'XL'), v('b', 'S'), v('c', 'M')])).toMatchObject({
      average: null,
      low: 'S',
      high: 'XL',
      unanimous: false,
      lowIds: ['b'],
      highIds: ['a'],
    });
  });

  it('counts the half card as 0.5', () => {
    expect(computeResult(MOD, [v('a', '½'), v('b', '1')]).average).toBeCloseTo(0.75);
  });
});
