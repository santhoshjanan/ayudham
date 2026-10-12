import { handleClient } from './client.ts';
import { find, ok, patch } from './outcome.ts';
import { disconnect, dropStale, evict, join } from './presence.ts';
import { revealIfDue, roundSaved } from './round.ts';
import { applySettings } from './settings.ts';
import type { Command, Outcome, RoomState } from './state.ts';
import { expireTimer } from './timer.ts';

/** The engine's single entry point. Pure: same inputs, same outputs. */
export function apply(state: RoomState, command: Command, now: number): Outcome {
  switch (command.type) {
    case 'join':
      return join(state, command.participant);
    case 'disconnect':
      return disconnect(state, command.id, now);
    case 'evict':
      return evict(state, command.ids);
    case 'grantModerator':
      return find(state, command.id)
        ? ok(patch(state, command.id, { moderator: true }))
        : ok(state);
    case 'transferOwnership':
      // The new owner is also a moderator. The previous owner keeps moderator rights.
      if (!find(state, command.id)) return ok(state);
      return ok({
        ...state,
        participants: state.participants.map((p) => ({
          ...p,
          owner: p.id === command.id,
          moderator: p.id === command.id ? true : p.moderator,
        })),
      });
    case 'client':
      return handleClient(state, command.from, command.message, now);
    case 'roundSaved':
      return roundSaved(state, command.seq, command.ok);
    case 'settings':
      return applySettings(state, command.settings);
    case 'tick':
      return tick(state, now);
  }
}

/** Time-driven changes, in order: finish the count, expire the timer, drop the long-absent. */
function tick(state: RoomState, now: number): Outcome {
  const revealed = revealIfDue(state, now);
  const timed = expireTimer(revealed.state, now);
  return ok(dropStale(timed.state, now), [...revealed.effects, ...timed.effects]);
}
