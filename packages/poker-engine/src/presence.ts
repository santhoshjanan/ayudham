import { AWAY_DROP_MS, MAX_PARTICIPANTS } from '@pokerji/protocol';
import { find, ok, patch, without } from './outcome.ts';
import type { Effect, Joiner, Outcome, RoomState } from './state.ts';

export function join(state: RoomState, joiner: Joiner): Outcome {
  if (find(state, joiner.id)) {
    return ok(patch(state, joiner.id, { present: true, awaySince: null }));
  }
  if (state.participants.length >= MAX_PARTICIPANTS) {
    return ok(state, [
      { type: 'send', to: joiner.id, message: { type: 'error', code: 'room_full' } },
      { type: 'close', id: joiner.id },
    ]);
  }
  return ok({
    ...state,
    participants: [
      ...state.participants,
      { ...joiner, present: true, awaySince: null, vote: null },
    ],
  });
}

export function disconnect(state: RoomState, id: string, now: number): Outcome {
  if (!find(state, id)) return ok(state);
  return ok(patch(state, id, { present: false, awaySince: now }));
}

/** Removes participants away for ten minutes. Never during the count, so locked votes survive. */
export function dropStale(state: RoomState, now: number): RoomState {
  if (state.phase === 'counting') return state;
  const stale = state.participants
    .filter((p) => !p.present && p.awaySince !== null && now - p.awaySince >= AWAY_DROP_MS)
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
