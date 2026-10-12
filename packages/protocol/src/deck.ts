import { z } from 'zod';
import { CARD_MAX_CHARS, DECK_MAX_CARDS } from './limits.ts';

/**
 * Letters, digits, punctuation and symbols only. This excludes spaces, control
 * and invisible characters, direction overrides, combining marks and unpaired
 * surrogates, so every card is visible and safe to store.
 */
const CARD_PATTERN = /^[\p{L}\p{N}\p{P}\p{S}]+$/u;

export const cardSchema = z
  .string()
  .refine(
    (card) => CARD_PATTERN.test(card) && [...card].length <= CARD_MAX_CHARS,
    'A card is 1 to 4 visible characters with no spaces',
  );

export const deckSchema = z
  .object({
    /** Estimate cards, lowest first. */
    values: z.array(cardSchema).min(2),
    /** Cards that are not estimates, such as "?" and a break card. */
    specials: z.array(cardSchema),
  })
  .refine((deck) => deck.values.length + deck.specials.length <= DECK_MAX_CARDS, 'Too many cards')
  .refine((deck) => {
    // Compared after compatibility normalisation, so look-alikes such as "1" and "１" collide.
    const all = [...deck.values, ...deck.specials].map((card) => card.normalize('NFKC'));
    return new Set(all).size === all.length;
  }, 'Cards must be unique');

export type Deck = z.infer<typeof deckSchema>;

export type BuiltInDeckId = 'fibonacci' | 'modifiedFibonacci' | 'tshirt' | 'powersOfTwo';

const SPECIALS = ['?', '☕'];

export const BUILT_IN_DECKS: Record<BuiltInDeckId, { name: string; deck: Deck }> = {
  fibonacci: {
    name: 'Fibonacci',
    deck: {
      values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'],
      specials: [...SPECIALS],
    },
  },
  modifiedFibonacci: {
    name: 'Modified Fibonacci',
    deck: {
      values: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100'],
      specials: [...SPECIALS],
    },
  },
  tshirt: {
    name: 'T-shirt sizes',
    deck: { values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], specials: [...SPECIALS] },
  },
  powersOfTwo: {
    name: 'Powers of two',
    deck: { values: ['1', '2', '4', '8', '16', '32', '64'], specials: [...SPECIALS] },
  },
};

/** The numeric worth of a card, or null when the card is not a number. */
export function cardValue(card: string): number | null {
  if (card === '½') return 0.5;
  return /^\d+(\.\d+)?$/.test(card) ? Number(card) : null;
}
