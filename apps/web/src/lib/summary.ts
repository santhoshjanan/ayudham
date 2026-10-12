import { computeResult } from '@pokerji/poker-engine';
import type { Deck } from '@pokerji/protocol';

/**
 * One line describing a saved round, using the room's current deck. Empty when
 * the cards no longer belong to the deck, as after the deck was changed.
 */
export function summarise(deck: Deck, cards: readonly string[]): string {
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
