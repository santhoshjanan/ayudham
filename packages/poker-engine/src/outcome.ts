import type { Effect, Outcome, Participant, RoomState } from './state.ts';

export const ok = (state: RoomState, effects: Effect[] = []): Outcome => ({ state, effects });

/** Refuses a client message: state untouched, sender told. */
export const deny = (state: RoomState, to: string): Outcome =>
  ok(state, [{ type: 'send', to, message: { type: 'error', code: 'forbidden' } }]);

export const find = (state: RoomState, id: string): Participant | undefined =>
  state.participants.find((p) => p.id === id);

export function patch(state: RoomState, id: string, change: Partial<Participant>): RoomState {
  return {
    ...state,
    participants: state.participants.map((p) => (p.id === id ? { ...p, ...change } : p)),
  };
}

export function without(state: RoomState, ids: readonly string[]): RoomState {
  return { ...state, participants: state.participants.filter((p) => !ids.includes(p.id)) };
}

export function freshRound(state: RoomState, title: string): RoomState {
  return {
    ...state,
    title,
    phase: 'voting',
    revealAt: null,
    timerEndsAt: null,
    roundSeq: state.roundSeq + 1,
    result: null,
    saveStatus: 'none',
    participants: state.participants.map((p) => ({ ...p, vote: null })),
  };
}
