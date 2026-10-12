import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countSessions,
  deleteNonModeratorSessions,
  deleteSession,
  findSession,
  insertRoom,
  insertSession,
  setSessionModerator,
  setSessionRole,
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
