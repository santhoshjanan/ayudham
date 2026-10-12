import { find, ok, patch } from './outcome.ts';
import { disconnect, dropStale, evict, join } from './presence.ts';
import type { Command, Outcome, RoomState } from './state.ts';

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
    case 'tick':
      return tick(state, now);
    default:
      return ok(state);
  }
}

function tick(state: RoomState, now: number): Outcome {
  return ok(dropStale(state, now));
}
