import { BUILT_IN_DECKS, type ClientMessage } from '@ayudham/protocol';
import { apply, createRoom, type Command, type RoomState } from '../src/index.ts';

export const FIB = BUILT_IN_DECKS.fibonacci.deck;

export const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true, owner: true } as const;
export const ann = { id: 'a', name: 'Ann', role: 'voter', moderator: false } as const;
export const sam = { id: 's', name: 'Sam', role: 'spectator', moderator: false } as const;

export const msg = (from: string, message: ClientMessage): Command => ({
  type: 'client',
  from,
  message,
});

export const forbidden = (to: string) => ({
  type: 'send',
  to,
  message: { type: 'error', code: 'forbidden' },
});

/** Applies commands in order at one instant and returns the final state. */
export function run(state: RoomState, commands: readonly Command[], now = 0): RoomState {
  return commands.reduce((current, command) => apply(current, command, now).state, state);
}

/** A room with a 60-second timer holding Mo (moderator, voter), Ann (voter) and Sam (spectator). */
export function seeded(): RoomState {
  return run(createRoom({ deck: FIB, timerSeconds: 60, music: null }), [
    { type: 'join', participant: mo },
    { type: 'join', participant: ann },
    { type: 'join', participant: sam },
  ]);
}
