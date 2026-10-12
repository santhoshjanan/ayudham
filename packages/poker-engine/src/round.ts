import { ok } from './outcome.ts';
import { computeResult } from './result.ts';
import type { Outcome, RoomState } from './state.ts';

/** Moves from counting to revealed once the count is over. */
export function revealIfDue(state: RoomState, now: number): Outcome {
  if (state.phase !== 'counting' || state.revealAt === null || now < state.revealAt) {
    return ok(state);
  }
  const votes = state.participants.flatMap((p) =>
    p.vote === null ? [] : [{ participantId: p.id, name: p.name, card: p.vote }],
  );
  const save = votes.length > 0;
  const next: RoomState = {
    ...state,
    phase: 'revealed',
    revealAt: null,
    result: computeResult(state.deck, votes),
    saveStatus: save ? 'pending' : 'none',
  };
  return ok(
    next,
    save ? [{ type: 'persistRound', seq: state.roundSeq, title: state.title, votes }] : [],
  );
}

/** Records the host's answer to a persistRound effect. Answers for other rounds are ignored. */
export function roundSaved(state: RoomState, seq: number, saved: boolean): Outcome {
  if (seq !== state.roundSeq || state.saveStatus === 'none') return ok(state);
  return ok({ ...state, saveStatus: saved ? 'saved' : 'failed' });
}
