import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countSessions,
  deleteNonModeratorSessions,
  deleteSession,
  deleteStaleSessions,
  findSession,
  insertRoom,
  insertSession,
  setSessionModerator,
  setSessionRole,
  transferOwnership,
  clearSessionModerator,
  listCoModerators,
  type Db,
} from '../src/index.ts';
import { testDb } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(() => drop());

let n = 0;
const room = () =>
  insertRoom(db, {
    code: `room${(n += 1)}`,
    deck: BUILT_IN_DECKS.fibonacci.deck,
    recoveryHash: 'rh',
  });
const session = (roomId: string, moderator = false) =>
  insertSession(db, {
    roomId,
    tokenHash: `hash${(n += 1)}`,
    // Names are unique within a room.
    name: `Ann ${n}`,
    role: 'voter',
    moderator,
  });

describe('sessions', () => {
  it('inserts a session and finds it by room and token hash', async () => {
    const { id: roomId } = await room();
    const created = await insertSession(db, {
      roomId,
      tokenHash: 'th-1',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    expect(created).toEqual({
      id: created.id,
      roomId,
      name: 'Ann',
      role: 'voter',
      moderator: false,
      owner: false,
    });
    expect(await findSession(db, roomId, 'th-1')).toEqual(created);
  });

  it('does not find a session through another room or a wrong hash', async () => {
    const { id: roomId } = await room();
    const { id: otherRoomId } = await room();
    await insertSession(db, {
      roomId,
      tokenHash: 'th-2',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    expect(await findSession(db, otherRoomId, 'th-2')).toBeNull();
    expect(await findSession(db, roomId, 'th-wrong')).toBeNull();
  });

  it('changes role and moderator flag', async () => {
    const { id: roomId } = await room();
    const created = await insertSession(db, {
      roomId,
      tokenHash: 'th-3',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    expect(await setSessionRole(db, roomId, created.id, 'spectator')).toBe(true);
    expect(await setSessionModerator(db, roomId, created.id)).toBe(true);
    expect(await findSession(db, roomId, 'th-3')).toMatchObject({
      role: 'spectator',
      moderator: true,
    });
  });

  it('deletes one session', async () => {
    const { id: roomId } = await room();
    const created = await session(roomId);
    expect(await deleteSession(db, roomId, created.id)).toBe(true);
    expect(await countSessions(db, roomId)).toBe(0);
  });

  it('does not change or delete a session through another room', async () => {
    const { id: roomId } = await room();
    const { id: otherRoomId } = await room();
    const created = await insertSession(db, {
      roomId,
      tokenHash: 'th-scope',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    expect(await setSessionRole(db, otherRoomId, created.id, 'spectator')).toBe(false);
    expect(await setSessionModerator(db, otherRoomId, created.id)).toBe(false);
    expect(await deleteSession(db, otherRoomId, created.id)).toBe(false);
    expect(await findSession(db, roomId, 'th-scope')).toEqual(created);
  });

  it('has one owner per room, and moves ownership in one step', async () => {
    const { id: roomId } = await room();
    const first = await insertSession(db, {
      roomId,
      tokenHash: 'th-own-1',
      name: 'Mo',
      role: 'voter',
      moderator: true,
      owner: true,
    });
    const second = await insertSession(db, {
      roomId,
      tokenHash: 'th-own-2',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    await expect(
      insertSession(db, {
        roomId,
        tokenHash: 'th-own-3',
        name: 'Bo',
        role: 'voter',
        moderator: true,
        owner: true,
      }),
    ).rejects.toThrow();

    expect(await transferOwnership(db, roomId, second.id)).toBe(true);
    expect(await findSession(db, roomId, 'th-own-2')).toMatchObject({
      owner: true,
      moderator: true,
    });
    expect(await findSession(db, roomId, 'th-own-1')).toMatchObject({
      owner: false,
      moderator: true,
    });

    // The owner's session cannot be deleted, and the owner cannot be demoted; another moderator can.
    expect(await deleteSession(db, roomId, second.id)).toBe(false);
    expect(await listCoModerators(db, roomId)).toEqual([{ id: first.id, name: 'Mo' }]);
    expect(await clearSessionModerator(db, roomId, second.id)).toBe(false);
    expect(await clearSessionModerator(db, roomId, first.id)).toBe(true);
    expect(await findSession(db, roomId, 'th-own-1')).toMatchObject({ moderator: false });
  });

  it('keeps exactly one owner when two people take the room at the same moment', async () => {
    const { id: roomId } = await room();
    await insertSession(db, {
      roomId,
      tokenHash: 'th-race-0',
      name: 'Mo',
      role: 'voter',
      moderator: true,
      owner: true,
    });
    const people = [];
    for (const name of ['Ann', 'Bo', 'Cy', 'Di']) {
      people.push(
        await insertSession(db, {
          roomId,
          tokenHash: `th-race-${name}`,
          name,
          role: 'voter',
          moderator: false,
        }),
      );
    }
    const results = await Promise.all(people.map((p) => transferOwnership(db, roomId, p.id)));
    expect(results).toEqual([true, true, true, true]);
    const owners = await db.query('select 1 from sessions where room_id = $1 and owner', [roomId]);
    expect(owners.rowCount).toBe(1);
  });

  it('refuses a stored owner who is not a moderator', async () => {
    const { id: roomId } = await room();
    await expect(
      insertSession(db, {
        roomId,
        tokenHash: 'th-bad-owner',
        name: 'Zed',
        role: 'voter',
        moderator: false,
        owner: true,
      }),
    ).rejects.toThrow();
  });

  it('does not move ownership to a session of another room, and leaves the owner in place', async () => {
    const { id: roomId } = await room();
    const { id: otherRoomId } = await room();
    await insertSession(db, {
      roomId,
      tokenHash: 'th-own-4',
      name: 'Mo',
      role: 'voter',
      moderator: true,
      owner: true,
    });
    const stranger = await insertSession(db, {
      roomId: otherRoomId,
      tokenHash: 'th-own-5',
      name: 'Eve',
      role: 'voter',
      moderator: false,
    });
    expect(await transferOwnership(db, roomId, stranger.id)).toBe(false);
    expect(await findSession(db, roomId, 'th-own-4')).toMatchObject({ owner: true });
  });

  it('deletes everyone but moderators and reports who went', async () => {
    const { id: roomId } = await room();
    const moderator = await session(roomId, true);
    const first = await session(roomId);
    const second = await session(roomId);
    const removed = await deleteNonModeratorSessions(db, roomId);
    expect(removed.sort()).toEqual([first.id, second.id].sort());
    expect(await countSessions(db, roomId)).toBe(1);
    expect(removed).not.toContain(moderator.id);
  });
});

describe('deleteStaleSessions', () => {
  const seenDaysAgo = (id: string, days: number) =>
    db.query(`update sessions set last_seen_at = now() - make_interval(days => $2) where id = $1`, [
      id,
      days,
    ]);

  it('signs out people not seen for the retention period, and keeps the owner whatever their age', async () => {
    const made = await room();
    const recent = await session(made.id);
    const old = await session(made.id);
    const oldModerator = await session(made.id, true);
    const owner = await insertSession(db, {
      roomId: made.id,
      tokenHash: `hash${(n += 1)}`,
      name: 'Owner',
      role: 'voter',
      moderator: true,
      owner: true,
    });
    await seenDaysAgo(recent.id, 29);
    await seenDaysAgo(old.id, 31);
    await seenDaysAgo(oldModerator.id, 31);
    await seenDaysAgo(owner.id, 400);

    expect(await deleteStaleSessions(db, 30)).toBeGreaterThanOrEqual(2);
    const left = await db.query<{ id: string }>('select id from sessions where room_id = $1', [
      made.id,
    ]);
    expect(left.rows.map((row) => row.id).sort()).toEqual([recent.id, owner.id].sort());
  });

  it('refuses a period that is not a whole number of days', async () => {
    await expect(deleteStaleSessions(db, 0)).rejects.toThrow(RangeError);
    await expect(deleteStaleSessions(db, 1.5)).rejects.toThrow(RangeError);
  });
});
