import type { Deck } from '@ayudham/protocol';
import { freshRound, ok } from './outcome.ts';
import type { Outcome, RoomSettings, RoomState } from './state.ts';

/** A deck may change after a reveal, or during voting before anyone has voted. */
export function canChangeDeck(state: RoomState): boolean {
  return (
    state.phase === 'revealed' ||
    (state.phase === 'voting' && state.participants.every((p) => p.vote === null))
  );
}

const sameDeck = (a: Deck, b: Deck) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applies settings saved by a moderator. A deck change starts a new round and
 * keeps the title. If the deck may not change now, nothing is applied: the
 * host is expected to have checked canChangeDeck before saving.
 */
export function applySettings(state: RoomState, settings: RoomSettings): Outcome {
  const deckChanged = !sameDeck(state.deck, settings.deck);
  if (deckChanged && !canChangeDeck(state)) return ok(state);
  const next: RoomState = {
    ...state,
    timerSeconds: settings.timerSeconds,
    music: settings.music,
    timerEndsAt: settings.timerSeconds === null ? null : state.timerEndsAt,
  };
  return ok(deckChanged ? freshRound({ ...next, deck: settings.deck }, state.title) : next);
}
