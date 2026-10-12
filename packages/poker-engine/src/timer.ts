import { ok } from './outcome.ts';
import type { Outcome, RoomState } from './state.ts';

/** Ends a running timer once its deadline passes. It never reveals. */
export function expireTimer(state: RoomState, now: number): Outcome {
  if (state.timerEndsAt === null || now < state.timerEndsAt) return ok(state);
  return ok({ ...state, timerEndsAt: null }, [
    { type: 'announce', message: { type: 'timerExpired' } },
  ]);
}
