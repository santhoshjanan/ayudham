import type { Role, ServerMessage } from '@pokerji/protocol';
import type { Connection, HostStore, RoundToSave } from '../src/index.ts';

export function fakeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/** An in-memory HostStore. `failSaves(n)` makes the next n round saves reject. */
export function fakeStore() {
  const rounds: RoundToSave[] = [];
  const calls: string[] = [];
  let failing = 0;
  const store: HostStore = {
    saveRound: async (round) => {
      if (failing > 0) {
        failing -= 1;
        throw new Error('database unavailable');
      }
      rounds.push(round);
    },
    setRole: async (id: string, role: Role) => {
      calls.push(`role:${id}:${role}`);
    },
    setModerator: async (id: string) => {
      calls.push(`moderator:${id}`);
    },
    deleteSession: async (id: string) => {
      calls.push(`delete:${id}`);
    },
  };
  return {
    store,
    rounds,
    calls,
    failSaves: (count: number) => {
      failing = count;
    },
  };
}

/** A connection that records what it was sent. */
export function fakeConnection() {
  const sent: ServerMessage[] = [];
  const state = { closed: false };
  const connection: Connection = {
    send: (text) => {
      sent.push(JSON.parse(text) as ServerMessage);
    },
    close: () => {
      state.closed = true;
    },
  };
  return {
    connection,
    sent,
    isClosed: () => state.closed,
    /** The room from the most recent snapshot. */
    room: () => {
      const snapshots = sent.filter((message) => message.type === 'snapshot');
      const last = snapshots.at(-1);
      if (!last || last.type !== 'snapshot') throw new Error('no snapshot received');
      return last.room;
    },
  };
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
