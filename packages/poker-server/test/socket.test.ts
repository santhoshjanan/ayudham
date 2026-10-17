import { BUILT_IN_DECKS, MAX_MESSAGE_BYTES, type ServerMessage } from '@ayudham/protocol';
import { describe, expect, it } from 'vitest';
import { attachSocket, MAX_STRIKES, MESSAGE_LIMIT, RoomHost, type Socket } from '../src/index.ts';
import { fakeClock, fakeConnection, fakeStore } from './fakes.ts';

const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true } as const;
const ann = { id: 'a', name: 'Ann', role: 'voter', moderator: false } as const;

function fakeSocket() {
  const sent: ServerMessage[] = [];
  const state = { closed: false };
  let message: (text: string) => void = () => undefined;
  let closed: () => void = () => undefined;
  const socket: Socket = {
    send: (text) => {
      sent.push(JSON.parse(text) as ServerMessage);
    },
    close: () => {
      state.closed = true;
    },
    onMessage: (handler) => {
      message = handler;
    },
    onClose: (handler) => {
      closed = handler;
    },
  };
  return {
    socket,
    sent,
    isClosed: () => state.closed,
    say: (value: unknown) => message(typeof value === 'string' ? value : JSON.stringify(value)),
    hangUp: () => closed(),
    errors: () => sent.flatMap((entry) => (entry.type === 'error' ? [entry.code] : [])),
  };
}

function setup() {
  const clock = fakeClock();
  const host = new RoomHost(
    { deck: BUILT_IN_DECKS.fibonacci.deck, timerSeconds: null, music: null },
    { store: fakeStore().store, now: clock.now, newId: () => 'id', report: () => undefined },
  );
  const moTab = fakeConnection();
  host.connect(mo, moTab.connection);
  const annSocket = fakeSocket();
  attachSocket(host, ann, annSocket.socket);
  return { host, clock, moTab, annSocket };
}

describe('attachSocket', () => {
  it('joins the room and receives a snapshot', () => {
    const { moTab, annSocket } = setup();
    expect(annSocket.sent.at(-1)).toMatchObject({ type: 'snapshot' });
    expect(moTab.room().participants.map((p) => p.id)).toEqual(['m', 'a']);
  });

  it('passes a valid message to the room', () => {
    const { moTab, annSocket } = setup();
    annSocket.say({ type: 'vote', card: '5' });
    expect(moTab.room().participants.find((p) => p.id === 'a')?.hasVoted).toBe(true);
  });

  it('marks the participant away when the socket closes', () => {
    const { moTab, annSocket } = setup();
    annSocket.hangUp();
    expect(moTab.room().participants.find((p) => p.id === 'a')?.present).toBe(false);
  });

  it('answers an unparseable message with an error and closes after three', () => {
    const { annSocket } = setup();
    annSocket.say('not json');
    annSocket.say({ type: 'nope' });
    expect(annSocket.errors()).toEqual(['invalid', 'invalid']);
    expect(annSocket.isClosed()).toBe(false);
    annSocket.say({ type: 'vote', card: '5', extra: true });
    expect(MAX_STRIKES).toBe(3);
    expect(annSocket.isClosed()).toBe(true);
  });

  it('rejects an oversized message without parsing it', () => {
    const { moTab, annSocket } = setup();
    const padded = JSON.stringify({ type: 'setTitle', title: 'x' }) + ' '.repeat(MAX_MESSAGE_BYTES);
    annSocket.say(padded);
    expect(annSocket.errors()).toEqual(['invalid']);
    expect(moTab.room().title).toBe('');
  });

  it('does not count a refused action as abuse', () => {
    const { annSocket } = setup();
    for (let i = 0; i < 10; i += 1) annSocket.say({ type: 'reveal' });
    expect(annSocket.errors()).toEqual(Array.from({ length: 10 }, () => 'forbidden'));
    expect(annSocket.isClosed()).toBe(false);
  });

  it('refuses messages over the rate limit, and allows them again in the next window', () => {
    const { clock, moTab, annSocket } = setup();
    for (let i = 0; i < MESSAGE_LIMIT.max; i += 1) annSocket.say({ type: 'vote', card: '5' });
    expect(annSocket.errors()).toEqual([]);
    annSocket.say({ type: 'vote', card: '8' });
    expect(annSocket.errors()).toEqual(['rate_limited']);
    expect(annSocket.isClosed()).toBe(false);

    clock.advance(MESSAGE_LIMIT.windowMs);
    annSocket.say({ type: 'clearVote' });
    expect(annSocket.errors()).toEqual(['rate_limited']);
    expect(moTab.room().participants.find((p) => p.id === 'a')?.hasVoted).toBe(false);
  });

  it('shares one budget between all of a participant\u2019s sockets', () => {
    const { host, annSocket } = setup();
    const second = fakeSocket();
    attachSocket(host, ann, second.socket);
    for (let i = 0; i < MESSAGE_LIMIT.max / 2; i += 1) {
      annSocket.say({ type: 'vote', card: '5' });
      second.say({ type: 'vote', card: '8' });
    }
    expect([...annSocket.errors(), ...second.errors()]).toEqual([]);
    second.say({ type: 'vote', card: '3' });
    expect(second.errors()).toEqual(['rate_limited']);
  });

  it('closes a socket that keeps flooding', () => {
    const { annSocket } = setup();
    for (let i = 0; i < MESSAGE_LIMIT.max + MAX_STRIKES; i += 1) {
      annSocket.say({ type: 'vote', card: '5' });
    }
    expect(annSocket.isClosed()).toBe(true);
  });

  it('ignores messages after it has closed the socket', () => {
    const { moTab, annSocket } = setup();
    for (let i = 0; i < MAX_STRIKES; i += 1) annSocket.say('junk');
    const before = moTab.sent.length;
    annSocket.say({ type: 'vote', card: '5' });
    expect(moTab.sent).toHaveLength(before);
  });
});
