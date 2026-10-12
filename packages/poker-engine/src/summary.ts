import type { Deck } from '@pokerji/protocol';
import { computeResult } from './result.ts';

/**
 * One line describing a finished round: "Unanimous: 5", or "Low 3, High 8,
 * average 5.5". Empty when there is nothing to say, and also when any card is
 * not in the given deck: a round played with another deck cannot be described
 * truthfully with this one.
 */
export function summariseRound(deck: Deck, cards: readonly string[]): string {
  const known = new Set([...deck.values, ...deck.specials]);
  if (!cards.every((card) => known.has(card))) return '';
  const result = computeResult(
    deck,
    cards.map((card, index) => ({ participantId: String(index), card })),
  );
  if (result.low === null) return '';
  if (result.unanimous) return `Unanimous: ${result.low}`;
  const average =
    result.average === null ? '' : `, average ${Math.round(result.average * 10) / 10}`;
  return `Low ${result.low}, High ${result.high}${average}`;
}
