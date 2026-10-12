import { BUILT_IN_DECKS, ROOM_UNLOAD_MS } from '@pokerji/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import { createKv, RoomHost, RoomRegistry, type RoomRow } from '../src/index.ts';
import { fakeClock, fakeConnection, fakeStore } from './fakes.ts';
import { testPrefix, VALKEY_URL } from './services.ts';

const kv = createKv(VALKEY_URL);
afterAll(() => kv.quit());

let n = 0;
const room = (): RoomRow => ({
  id: `room-${(n += 1)}`,
  code: `code${n}`,
  deck: BUILT_IN_DECKS.fibonacci.deck,
  timerSeconds: 45,
  music: null,
  passcodeHash: null,
  recoveryHash: 'rh',
  lastActiveAt: new Date(),
});

function registry(owner: string, prefix: string, clock = fakeClock()) {
  let made = 0;
  const instance = new RoomRegistry({
    kv,
    owner,
    now: clock.now,
    lockTtlMs: 3_000,
    lockPrefix: prefix,
    makeHost: (row) => {
      made += 1;
      return new RoomHost(
        { deck: row.deck, timerSeconds: row.timerSeconds, music: row.music },
        { store: fakeStore().store, now: clock.now, newId: () => 'id', report: () => undefined },
      );
    },
  });
  return { instance, clock, madeCount: () => made };
}

const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true } as const;

describe('RoomRegistry', () => {
  it('opens a room once and hands back the same host', async () => {
    const { instance, madeCount } = registry('a', testPrefix());
    const row = room();
    const host = await instance.open(row);
    expect(host).not.toBeNull();
    expect(await instance.open(row)).toBe(host);
    expect(instance.get(row.id)).toBe(host);
    expect(madeCount()).toBe(1);
  });

  it('builds the host from the room’s saved settings', async () => {
    const { instance } = registry('a', testPrefix());
    const host = await instance.open(room());
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    expect(tab.room().timer.seconds).toBe(45);
  });

  it('makes one host when the same room is opened twice at once', async () => {
    const { instance, madeCount } = registry('a', testPrefix());
    const row = room();
    const [first, second] = await Promise.all([instance.open(row), instance.open(row)]);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(madeCount()).toBe(1);
  });

  it('refuses a room another owner holds', async () => {
    const prefix = testPrefix();
    const row = room();
    await registry('a', prefix).instance.open(row);
    const other = registry('b', prefix);
    expect(await other.instance.open(row)).toBeNull();
    expect(other.instance.get(row.id)).toBeUndefined();
  });

  it('ticks its hosts on sweep', async () => {
    const { instance, clock } = registry('a', testPrefix());
    const host = await instance.open(room());
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    host?.receive('m', { type: 'reveal' });
    clock.advance(3_000);
    await instance.sweep();
    expect(tab.room().phase).toBe('revealed');
  });

  it('unloads an idle room and frees it for another owner', async () => {
    const prefix = testPrefix();
    const row = room();
    const first = registry('a', prefix);
    await first.instance.open(row);
    first.clock.advance(ROOM_UNLOAD_MS);
    await first.instance.sweep();
    expect(first.instance.get(row.id)).toBeUndefined();
    expect(await registry('b', prefix).instance.open(row)).not.toBeNull();
  });

  it('closes a room’s connections when another owner has taken its lock', async () => {
    const prefix = testPrefix();
    const row = room();
    const { instance, clock } = registry('a', prefix);
    const host = await instance.open(row);
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);

    await kv.set(`${prefix}lock:${row.id}`, 'someone-else');
    clock.advance(1_000);
    await instance.sweep();
    expect(tab.isClosed()).toBe(true);
    expect(instance.get(row.id)).toBeUndefined();
  });

  it('keeps a live room running when the lock cannot be checked', async () => {
    const row = room();
    const { instance, clock } = registry('a', testPrefix());
    const host = await instance.open(row);
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    // Make the lock check fail the way it does when Valkey is unreachable.
    const entry = (
      instance as unknown as { live: Map<string, { lock: { refresh: () => Promise<boolean> } }> }
    ).live.get(row.id);
    if (entry) entry.lock.refresh = () => Promise.reject(new Error('valkey unavailable'));
    clock.advance(1_000);
    await instance.sweep();
    expect(tab.isClosed()).toBe(false);
    expect(instance.get(row.id)).toBe(host);
  });

  it('keeps ticking every room while one room\u2019s lock check is slow', async () => {
    const { instance, clock } = registry('a', testPrefix());
    const slowRow = room();
    await instance.open(slowRow);
    const host = await instance.open(room());
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    const slow = (
      instance as unknown as { live: Map<string, { lock: { refresh: () => Promise<boolean> } }> }
    ).live.get(slowRow.id);
    if (slow) slow.lock.refresh = () => new Promise<boolean>(() => undefined);

    clock.advance(1_000);
    void instance.sweep();
    host?.receive('m', { type: 'reveal' });
    clock.advance(3_000);
    void instance.sweep();
    expect(tab.room().phase).toBe('revealed');
  });

  it('releases the lock when the host cannot be built', async () => {
    const prefix = testPrefix();
    const row = room();
    const broken = new RoomRegistry({
      kv,
      owner: 'a',
      now: () => 0,
      lockPrefix: prefix,
      makeHost: () => {
        throw new Error('cannot build');
      },
    });
    await expect(broken.open(row)).rejects.toThrow('cannot build');
    expect(await registry('b', prefix).instance.open(row)).not.toBeNull();
  });

  it('saves a room\u2019s queued rounds when it is closed', async () => {
    const prefix = testPrefix();
    const row = room();
    const clock = fakeClock();
    const storage = fakeStore();
    storage.failSaves(1);
    const instance = new RoomRegistry({
      kv,
      owner: 'a',
      now: clock.now,
      lockPrefix: prefix,
      makeHost: (made) =>
        new RoomHost(
          { deck: made.deck, timerSeconds: null, music: null },
          { store: storage.store, now: clock.now, newId: () => 'id', report: () => undefined },
        ),
    });
    const host = await instance.open(row);
    host?.connect(mo, fakeConnection().connection);
    host?.receive('m', { type: 'vote', card: '5' });
    host?.receive('m', { type: 'reveal' });
    clock.advance(3_000);
    await instance.sweep();
    expect(storage.rounds).toHaveLength(0);
    await instance.close(row.id);
    expect(storage.rounds).toHaveLength(1);
  });

  it('closes one room on request and releases its lock', async () => {
    const prefix = testPrefix();
    const row = room();
    const { instance } = registry('a', prefix);
    const host = await instance.open(row);
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    await instance.close(row.id);
    expect(tab.isClosed()).toBe(true);
    expect(instance.get(row.id)).toBeUndefined();
    expect(await registry('b', prefix).instance.open(row)).not.toBeNull();
  });

  it('closes everything on shutdown', async () => {
    const prefix = testPrefix();
    const { instance } = registry('a', prefix);
    const rows = [room(), room()];
    for (const row of rows) await instance.open(row);
    await instance.closeEverything();
    for (const row of rows) expect(instance.get(row.id)).toBeUndefined();
    expect(await registry('b', prefix).instance.open(rows[0] as RoomRow)).not.toBeNull();
  });
});
