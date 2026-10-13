import { AWAY_DROP_MS, MAX_PARTICIPANTS, MODERATOR_HEADROOM } from '@pokerji/protocol';
import { find, ok, patch, without } from './outcome.ts';
import type { Effect, Joiner, Outcome, RoomState } from './state.ts';

export function join(state: RoomState, joiner: Joiner): Outcome {
  // The session a joiner arrives with is the stored truth about who owns the
  // room. If it says owner, nobody else in the live room is.
  const base: RoomState = joiner.owner
    ? {
        ...state,
        participants: state.participants.map((p) =>
          p.id === joiner.id ? { ...p, owner: true, moderator: true } : { ...p, owner: false },
        ),
      }
    : state;
  if (find(base, joiner.id)) {
    return ok(patch(base, joiner.id, { present: true, awaySince: null }));
  }
  const size = base.participants.length;
  const full = joiner.moderator
    ? size >= MAX_PARTICIPANTS + MODERATOR_HEADROOM
    : size >= MAX_PARTICIPANTS;
  if (full) {
    return ok(state, [
      { type: 'send', to: joiner.id, message: { type: 'error', code: 'room_full' } },
      { type: 'close', id: joiner.id },
    ]);
  }
  return ok({
    ...base,
    participants: [
      ...base.participants,
      { ...joiner, owner: joiner.owner ?? false, present: true, awaySince: null, vote: null },
    ],
  });
}

export function disconnect(state: RoomState, id: string, now: number): Outcome {
  if (!find(state, id)) return ok(state);
  return ok(patch(state, id, { present: false, awaySince: now }));
}

/**
 * Removes participants away for ten minutes. Never during the count, so locked
 * votes survive, and never someone whose revealed vote is still on show, so the
 * result can always name the people it refers to.
 */
export function dropStale(state: RoomState, now: number): RoomState {
  if (state.phase === 'counting') return state;
  const onShow = (p: { vote: string | null }) => state.phase === 'revealed' && p.vote !== null;
  const stale = state.participants
    .filter((p) => !p.present && p.awaySince !== null && now - p.awaySince >= AWAY_DROP_MS)
    .filter((p) => !onShow(p))
    .map((p) => p.id);
  return stale.length === 0 ? state : without(state, stale);
}

export function evict(state: RoomState, ids: readonly string[]): Outcome {
  const present = ids.filter((id) => find(state, id));
  if (present.length === 0) return ok(state);
  return ok(
    without(state, present),
    present.flatMap((id): Effect[] => [
      { type: 'send', to: id, message: { type: 'removed' } },
      { type: 'close', id },
    ]),
  );
}
