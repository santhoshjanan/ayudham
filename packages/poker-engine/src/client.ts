import { REVEAL_COUNT_MS, type ClientMessage } from '@ayudham/protocol';
import { deny, find, freshRound, ok, patch, without } from './outcome.ts';
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
    case 'startTimer':
      if (!actor.moderator || state.phase !== 'voting' || state.timerSeconds === null) {
        return deny(state, from);
      }
      return ok({ ...state, timerEndsAt: now + state.timerSeconds * 1000 });
    case 'stopTimer':
      if (!actor.moderator || state.timerEndsAt === null) return deny(state, from);
      return ok({ ...state, timerEndsAt: null });
    case 'removeParticipant': {
      const target = find(state, message.participantId);
      // Not during the count: votes are locked, and removing a voter would alter the result.
      const locked = state.phase === 'counting';
      // The owner can never be removed; a moderator must be demoted by the owner first.
      const protectedTarget = target !== undefined && (target.moderator || target.owner);
      if (!actor.moderator || locked || !target || target.id === from || protectedTarget) {
        return deny(state, from);
      }
      return ok(without(state, [target.id]), [
        { type: 'send', to: target.id, message: { type: 'removed' } },
        { type: 'close', id: target.id },
        { type: 'deleteSession', id: target.id },
      ]);
    }
    case 'promote': {
      const target = find(state, message.participantId);
      if (!actor.moderator || !target) return deny(state, from);
      if (target.moderator) return ok(state);
      return ok(patch(state, target.id, { moderator: true }), [
        { type: 'persistModerator', id: target.id },
      ]);
    }
  }
}
