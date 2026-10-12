import { BUILT_IN_DECKS, MAX_PARTICIPANTS, ROOM_UNLOAD_MS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { MAX_CONNECTIONS_PER_PARTICIPANT, RoomHost } from '../src/index.ts';
import { fakeClock, fakeConnection, fakeStore, flush } from './fakes.ts';

const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true } as const;
const ann = { id: 'a', name: 'Ann', role: 'voter', moderator: false } as const;

function setup() {
  const clock = fakeClock();
  const storage = fakeStore();
  const problems: string[] = [];
  let ids = 0;
  const host = new RoomHost(
    { deck: BUILT_IN_DECKS.fibonacci.deck, timerSeconds: 60, music: null },
    {
      store: storage.store,
      now: clock.now,
      newId: () => `round-${(ids += 1)}`,
      report: (problem) => problems.push(problem),
    },
  );
  const moTab = fakeConnection();
  const annTab = fakeConnection();
  host.connect(mo, moTab.connection);
  host.connect(ann, annTab.connection);
  return { host, clock, storage, problems, moTab, annTab };
}

async function reveal(context: ReturnType<typeof setup>) {
  context.host.receive('m', { type: 'reveal' });
  context.clock.advance(3_000);
  context.host.tick();
  await flush();
}

describe('RoomHost', () => {
  it('sends everyone a snapshot when someone joins', () => {
    const { moTab, annTab } = setup();
    expect(moTab.room().participants.map((p) => p.name)).toEqual(['Mo', 'Ann']);
    expect(annTab.room().you).toMatchObject({ id: 'a', name: 'Ann' });
  });

  it('shows a vote to its owner and only "has voted" to others', () => {
    const { host, moTab, annTab } = setup();
    host.receive('a', { type: 'vote', card: '8' });
    expect(annTab.room().you.vote).toBe('8');
    expect(moTab.room().participants.find((p) => p.id === 'a')).toMatchObject({
      hasVoted: true,
      vote: null,
    });
  });

  it('reveals after the count, saves the round and reports it saved', async () => {
    const context = setup();
    context.host.receive('m', { type: 'setTitle', title: 'PROJ-1' });
    context.host.receive('m', { type: 'vote', card: '3' });
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    expect(context.annTab.room()).toMatchObject({ phase: 'revealed', saveStatus: 'saved' });
    expect(context.annTab.room().result).toMatchObject({ low: '3', high: '8' });
    expect(context.storage.rounds).toEqual([
      {
        id: 'round-1',
        title: 'PROJ-1',
        votes: [
          { sessionId: 'm', name: 'Mo', card: '3' },
          { sessionId: 'a', name: 'Ann', card: '8' },
        ],
      },
    ]);
  });

  it('marks a round not saved when the store fails, then retries and saves it', async () => {
    const context = setup();
    context.storage.failSaves(1);
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    expect(context.annTab.room().saveStatus).toBe('failed');
    expect(context.problems).toContain('save round');

    context.clock.advance(4_999);
    context.host.tick();
    await flush();
    expect(context.storage.rounds).toHaveLength(0);

    context.clock.advance(1);
    context.host.tick();
    await flush();
    expect(context.storage.rounds).toHaveLength(1);
    expect(context.annTab.room().saveStatus).toBe('saved');
  });

  it('saves both rounds, in order, when a second is revealed before the store recovers', async () => {
    const context = setup();
    context.storage.failSaves(1);
    context.host.receive('m', { type: 'setTitle', title: 'first' });
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    context.host.receive('m', { type: 'newRound', keepTitle: false });
    context.host.receive('m', { type: 'setTitle', title: 'second' });
    context.host.receive('a', { type: 'vote', card: '5' });
    await reveal(context);
    expect(context.storage.rounds).toHaveLength(0);
    expect(context.annTab.room().saveStatus).toBe('failed');

    context.clock.advance(5_000);
    context.host.tick();
    await flush();
    expect(context.storage.rounds.map((round) => round.title)).toEqual(['first', 'second']);
    expect(new Set(context.storage.rounds.map((round) => round.id)).size).toBe(2);
    expect(context.annTab.room().saveStatus).toBe('saved');
  });

  it('keeps someone present while any of their tabs is open', () => {
    const { host, moTab, annTab } = setup();
    const secondTab = fakeConnection();
    host.connect(ann, secondTab.connection);
    expect(secondTab.room().you.id).toBe('a');
    expect(moTab.room().participants).toHaveLength(2);

    host.disconnect('a', annTab.connection);
    expect(moTab.room().participants.find((p) => p.id === 'a')?.present).toBe(true);
    host.disconnect('a', secondTab.connection);
    expect(moTab.room().participants.find((p) => p.id === 'a')?.present).toBe(false);
  });

  it('tells a removed participant, closes their connection and deletes their session', async () => {
    const { host, storage, moTab, annTab } = setup();
    host.receive('m', { type: 'removeParticipant', participantId: 'a' });
    await flush();
    expect(annTab.sent.at(-1)).toEqual({ type: 'removed' });
    expect(annTab.isClosed()).toBe(true);
    expect(storage.calls).toContain('delete:a');
    expect(moTab.room().participants.map((p) => p.id)).toEqual(['m']);
    // The socket layer reports the close afterwards; it must be harmless.
    host.disconnect('a', annTab.connection);
    expect(moTab.room().participants.map((p) => p.id)).toEqual(['m']);
  });

  it('saves role changes and promotions', async () => {
    const { host, storage } = setup();
    host.receive('a', { type: 'setRole', role: 'spectator' });
    host.receive('m', { type: 'promote', participantId: 'a' });
    await flush();
    expect(storage.calls).toEqual(['role:a:spectator', 'moderator:a']);
  });

  it('refuses a refused message with an error to the sender only', () => {
    const { host, moTab, annTab } = setup();
    const before = moTab.sent.length;
    host.receive('a', { type: 'reveal' });
    expect(annTab.sent.at(-1)).toEqual({ type: 'error', code: 'forbidden' });
    expect(moTab.sent).toHaveLength(before);
  });

  it('turns away a joiner when the room is full', () => {
    const { host } = setup();
    for (let i = 0; i < MAX_PARTICIPANTS; i += 1) {
      host.connect(
        { id: `p${i}`, name: `P${i}`, role: 'voter', moderator: false },
        fakeConnection().connection,
      );
    }
    const late = fakeConnection();
    host.connect({ id: 'late', name: 'Late', role: 'voter', moderator: false }, late.connection);
    expect(late.sent).toEqual([{ type: 'error', code: 'room_full' }]);
    expect(late.isClosed()).toBe(true);
  });

  it('announces timer expiry to everyone', () => {
    const { host, clock, moTab, annTab } = setup();
    host.receive('m', { type: 'startTimer' });
    clock.advance(60_000);
    host.tick();
    expect(moTab.sent.at(-1)).toEqual({ type: 'timerExpired' });
    expect(annTab.sent.at(-1)).toEqual({ type: 'timerExpired' });
  });

  it('applies settings, evictions and moderator grants from the server side', () => {
    const { host, moTab, annTab } = setup();
    expect(host.canChangeDeck()).toBe(true);
    host.applySettings({ deck: BUILT_IN_DECKS.tshirt.deck, timerSeconds: null, music: 'nocturne' });
    expect(moTab.room()).toMatchObject({ music: 'nocturne', timer: { seconds: null } });
    host.grantModerator('a');
    expect(annTab.room().you.moderator).toBe(true);
    host.evict(['a']);
    expect(annTab.isClosed()).toBe(true);
  });

  it('says whether settings took effect, and refuses a deck change once votes are in', () => {
    const { host, moTab } = setup();
    const tee = { deck: BUILT_IN_DECKS.tshirt.deck, timerSeconds: 30, music: null };
    host.receive('a', { type: 'vote', card: '5' });
    expect(host.applySettings(tee)).toBe(false);
    expect(moTab.room().timer.seconds).toBe(60);
    host.receive('a', { type: 'clearVote' });
    expect(host.applySettings(tee)).toBe(true);
    expect(moTab.room().timer.seconds).toBe(30);
  });

  it('keeps going when one connection throws', () => {
    const { host, moTab, problems } = setup();
    host.connect(
      { id: 'x', name: 'X', role: 'voter', moderator: false },
      {
        send: () => {
          throw new Error('socket gone');
        },
        close: () => undefined,
      },
    );
    host.receive('m', { type: 'setTitle', title: 'still works' });
    expect(moTab.room().title).toBe('still works');
    expect(problems).toContain('connection');
  });

  it('is ready to unload five minutes after the last connection closes', () => {
    const { host, clock, moTab, annTab } = setup();
    expect(host.shouldUnload()).toBe(false);
    host.disconnect('m', moTab.connection);
    host.disconnect('a', annTab.connection);
    clock.advance(ROOM_UNLOAD_MS - 1);
    expect(host.shouldUnload()).toBe(false);
    clock.advance(1);
    expect(host.shouldUnload()).toBe(true);
    host.connect(mo, fakeConnection().connection);
    expect(host.shouldUnload()).toBe(false);
  });

  it('does not unload while a round is still waiting to be saved', async () => {
    const context = setup();
    context.storage.failSaves(1);
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    context.host.disconnect('m', context.moTab.connection);
    context.host.disconnect('a', context.annTab.connection);
    context.clock.advance(ROOM_UNLOAD_MS);
    expect(context.host.shouldUnload()).toBe(false);
    context.host.tick();
    await flush();
    expect(context.host.shouldUnload()).toBe(true);
  });

  it('caps one participant at four connections, closing the oldest', () => {
    const { host, annTab } = setup();
    expect(MAX_CONNECTIONS_PER_PARTICIPANT).toBe(4);
    const extra = [fakeConnection(), fakeConnection(), fakeConnection()];
    for (const tab of extra) host.connect(ann, tab.connection);
    expect(annTab.isClosed()).toBe(false);
    const fifth = fakeConnection();
    host.connect(ann, fifth.connection);
    expect(annTab.isClosed()).toBe(true);
    expect(annTab.closeCode()).toBe(4001);
    expect(extra.every((tab) => !tab.isClosed())).toBe(true);
    expect(fifth.room().you.id).toBe('a');
  });

  it('gives each participant one message budget per window, whatever the number of tabs', () => {
    const { host, clock } = setup();
    const results = Array.from({ length: 31 }, () => host.allowMessage('a'));
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(results.at(-1)).toBe(false);
    expect(host.allowMessage('m')).toBe(true);
    clock.advance(10_000);
    expect(host.allowMessage('a')).toBe(true);
  });

  it('retries a failed session delete, and keeps the removed person out meanwhile', async () => {
    const { host, storage, clock } = setup();
    let failures = 1;
    const deleteSession = storage.store.deleteSession;
    storage.store.deleteSession = async (id) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('database unavailable');
      }
      await deleteSession(id);
    };
    host.receive('m', { type: 'removeParticipant', participantId: 'a' });
    await flush();
    expect(storage.calls).not.toContain('delete:a');

    const back = fakeConnection();
    host.connect(ann, back.connection);
    expect(back.sent).toEqual([{ type: 'removed' }]);
    expect(back.isClosed()).toBe(true);

    clock.advance(5_000);
    host.tick();
    await flush();
    expect(storage.calls).toContain('delete:a');
  });

  it('keeps an evicted person out', () => {
    const { host } = setup();
    host.evict(['a']);
    const back = fakeConnection();
    host.connect(ann, back.connection);
    expect(back.isClosed()).toBe(true);
  });

  it('gives up on a write that keeps failing, so the queue and the room are not stuck', async () => {
    const context = setup();
    context.storage.failSaves(10_000);
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    context.host.disconnect('m', context.moTab.connection);
    context.host.disconnect('a', context.annTab.connection);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      context.clock.advance(5_000);
      context.host.tick();
      await flush();
    }
    expect(context.storage.rounds).toHaveLength(0);
    expect(context.problems).toContain('write abandoned');
    expect(context.host.shouldUnload()).toBe(true);
  });

  it('saves what is queued on shutdown and refuses connections afterwards', async () => {
    const context = setup();
    context.storage.failSaves(1);
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    expect(context.storage.rounds).toHaveLength(0);

    await context.host.shutdown();
    expect(context.storage.rounds).toHaveLength(1);
    expect(context.annTab.isClosed()).toBe(true);

    const late = fakeConnection();
    context.host.connect(mo, late.connection);
    expect(late.isClosed()).toBe(true);
    expect(late.sent).toEqual([]);
  });

  it('closes every connection on closeAll', () => {
    const { host, moTab, annTab } = setup();
    host.closeAll();
    expect(moTab.isClosed()).toBe(true);
    expect(annTab.isClosed()).toBe(true);
  });
});
