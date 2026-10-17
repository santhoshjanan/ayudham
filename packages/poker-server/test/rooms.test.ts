import { randomUUID } from 'node:crypto';
import { BUILT_IN_DECKS } from '@ayudham/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deleteInactiveRooms,
  deleteRoom,
  findRoomByCode,
  insertRoom,
  setPasscodeHash,
  setRecoveryHash,
  touchRoom,
  updateRoomSettings,
  type Db,
} from '../src/index.ts';
import { testDb } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(() => drop());

const FIB = BUILT_IN_DECKS.fibonacci.deck;
const TEE = BUILT_IN_DECKS.tshirt.deck;
let n = 0;
const make = () => insertRoom(db, { code: `room${(n += 1)}`, deck: FIB, recoveryHash: 'rh' });

describe('rooms', () => {
  it('inserts a room with defaults and finds it by code', async () => {
    const room = await make();
    expect(room).toMatchObject({
      deck: FIB,
      timerSeconds: null,
      music: null,
      passcodeHash: null,
      recoveryHash: 'rh',
    });
    expect(room.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await findRoomByCode(db, room.code)).toEqual(room);
  });

  it('returns null for an unknown code', async () => {
    expect(await findRoomByCode(db, 'nope')).toBeNull();
  });

  it('treats codes as case-sensitive', async () => {
    const room = await make();
    expect(await findRoomByCode(db, room.code.toUpperCase())).toBeNull();
  });

  it('updates settings, passcode and recovery hash', async () => {
    const room = await make();
    await updateRoomSettings(db, room.id, { deck: TEE, timerSeconds: 90, music: 'nocturne' });
    await setPasscodeHash(db, room.id, 'ph');
    await setRecoveryHash(db, room.id, 'rh2');
    expect(await findRoomByCode(db, room.code)).toMatchObject({
      deck: TEE,
      timerSeconds: 90,
      music: 'nocturne',
      passcodeHash: 'ph',
      recoveryHash: 'rh2',
    });
    await setPasscodeHash(db, room.id, null);
    expect((await findRoomByCode(db, room.code))?.passcodeHash).toBeNull();
  });

  it('deletes a room', async () => {
    const room = await make();
    await deleteRoom(db, room.id);
    expect(await findRoomByCode(db, room.code)).toBeNull();
  });

  it('says whether a room was there to change or delete', async () => {
    const room = await make();
    const missing = randomUUID();
    expect(await setPasscodeHash(db, room.id, 'ph')).toBe(true);
    expect(await setPasscodeHash(db, missing, 'ph')).toBe(false);
    expect(await setRecoveryHash(db, room.id, 'rh3')).toBe(true);
    expect(await setRecoveryHash(db, missing, 'rh3')).toBe(false);
    expect(await deleteRoom(db, missing)).toBe(false);
    expect(await deleteRoom(db, room.id)).toBe(true);
  });

  it('refuses a retention period shorter than one day, which would delete live rooms', async () => {
    const room = await make();
    await expect(deleteInactiveRooms(db, 0)).rejects.toThrow(RangeError);
    await expect(deleteInactiveRooms(db, 0.5)).rejects.toThrow(RangeError);
    await expect(deleteInactiveRooms(db, Number.NaN)).rejects.toThrow(RangeError);
    expect(await findRoomByCode(db, room.code)).not.toBeNull();
  });

  it('deletes only rooms inactive for longer than the retention period', async () => {
    const stale = await make();
    const fresh = await make();
    const revived = await make();
    await db.query(
      `update rooms set last_active_at = now() - interval '31 days' where id = any($1::uuid[])`,
      [[stale.id, revived.id]],
    );
    await touchRoom(db, revived.id);
    expect(await deleteInactiveRooms(db, 30)).toBe(1);
    expect(await findRoomByCode(db, stale.code)).toBeNull();
    expect(await findRoomByCode(db, fresh.code)).not.toBeNull();
    expect(await findRoomByCode(db, revived.code)).not.toBeNull();
  });
});
