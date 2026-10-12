import { cardValue, type Deck, type RoundResult } from '@pokerji/protocol';

export interface CastVote {
  participantId: string;
  card: string;
}

export function computeResult(deck: Deck, votes: readonly CastVote[]): RoundResult {
  const distribution = [...deck.values, ...deck.specials]
    .map((card) => ({ card, count: votes.filter((vote) => vote.card === card).length }))
    .filter((entry) => entry.count > 0);

  const valued = votes.filter((vote) => deck.values.includes(vote.card));
  if (valued.length === 0) {
    return {
      average: null,
      low: null,
      high: null,
      unanimous: false,
      lowIds: [],
      highIds: [],
      distribution,
    };
  }

  const positions = valued.map((vote) => deck.values.indexOf(vote.card));
  const low = deck.values[Math.min(...positions)] as string;
  const high = deck.values[Math.max(...positions)] as string;
  const unanimous = low === high;

  const numbers = valued.map((vote) => cardValue(vote.card));
  const average = numbers.every((n): n is number => n !== null)
    ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length
    : null;

  const holders = (card: string) =>
    valued.filter((vote) => vote.card === card).map((vote) => vote.participantId);

  return {
    average,
    low,
    high,
    unanimous,
    lowIds: unanimous ? [] : holders(low),
    highIds: unanimous ? [] : holders(high),
    distribution,
  };
}
