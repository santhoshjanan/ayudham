import { REVEAL_COUNT_MS, type ClientMessage } from '@pokerji/protocol';
import { deny, find, freshRound, ok, patch } from './outcome.ts';
import type { Outcome, RoomState } from './state.ts';

/** Checks a client message against the sender's role and the round's phase, then applies it. */
export function handleClient(
  state: RoomState,
  from: string,
  message: ClientMessage,
  now: number,
): Outcome {
  const actor = find(state, from);
  if (!actor) return ok(state);

  switch (message.type) {
    case 'vote': {
      const inDeck =
        state.deck.values.includes(message.card) || state.deck.specials.includes(message.card);
      if (actor.role !== 'voter' || state.phase !== 'voting' || !inDeck) return deny(state, from);
      return ok(patch(state, from, { vote: message.card }));
    }
    case 'clearVote':
      if (actor.role !== 'voter' || state.phase !== 'voting') return deny(state, from);
      return ok(patch(state, from, { vote: null }));
    case 'setRole': {
      if (state.phase === 'counting') return deny(state, from);
      if (actor.role === message.role) return ok(state);
      const vote = state.phase === 'voting' ? null : actor.vote;
      return ok(patch(state, from, { role: message.role, vote }), [
        { type: 'persistRole', id: from, role: message.role },
      ]);
    }
    case 'setTitle':
      if (!actor.moderator || state.phase !== 'voting') return deny(state, from);
      return ok({ ...state, title: message.title });
    case 'reveal':
      if (!actor.moderator || state.phase !== 'voting') return deny(state, from);
      return ok({
        ...state,
        phase: 'counting',
        revealAt: now + REVEAL_COUNT_MS,
        timerEndsAt: null,
      });
    case 'newRound':
      if (!actor.moderator || state.phase === 'counting') return deny(state, from);
      return ok(freshRound(state, message.keepTitle ? state.title : ''));
    default:
      return deny(state, from);
  }
}
