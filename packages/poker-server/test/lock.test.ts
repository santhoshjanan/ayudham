import { afterAll, describe, expect, it } from 'vitest';
import { acquireRoomLock, createKv } from '../src/index.ts';
import { testPrefix, VALKEY_URL } from './services.ts';

const kv = createKv(VALKEY_URL);
const prefix = testPrefix();
afterAll(() => kv.quit());

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('acquireRoomLock', () => {
  it('gives the lock to one owner at a time', async () => {
    const mine = await acquireRoomLock(kv, 'r1', 'owner-a', 5_000, prefix);
    expect(mine).not.toBeNull();
    expect(await acquireRoomLock(kv, 'r1', 'owner-b', 5_000, prefix)).toBeNull();
    await mine?.release();
    expect(await acquireRoomLock(kv, 'r1', 'owner-b', 5_000, prefix)).not.toBeNull();
  });

  it('locks rooms independently', async () => {
    expect(await acquireRoomLock(kv, 'r2', 'owner-a', 5_000, prefix)).not.toBeNull();
    expect(await acquireRoomLock(kv, 'r3', 'owner-b', 5_000, prefix)).not.toBeNull();
  });

  it('keeps the lock alive while the owner refreshes it', async () => {
    const mine = await acquireRoomLock(kv, 'r4', 'owner-a', 300, prefix);
    await pause(200);
    expect(await mine?.refresh()).toBe(true);
    await pause(200);
    expect(await acquireRoomLock(kv, 'r4', 'owner-b', 300, prefix)).toBeNull();
  });

  it('lets the owner take back a lock that expired and nobody else took', async () => {
    const mine = await acquireRoomLock(kv, 'r5', 'owner-a', 100, prefix);
    await pause(200);
    expect(await mine?.refresh()).toBe(true);
    expect(await acquireRoomLock(kv, 'r5', 'owner-b', 5_000, prefix)).toBeNull();
  });

  it('tells the old owner when someone else has taken over, and protects the new lock', async () => {
    const old = await acquireRoomLock(kv, 'r6', 'owner-a', 100, prefix);
    await pause(200);
    const next = await acquireRoomLock(kv, 'r6', 'owner-b', 5_000, prefix);
    expect(next).not.toBeNull();
    expect(await old?.refresh()).toBe(false);
    await old?.release();
    expect(await acquireRoomLock(kv, 'r6', 'owner-c', 5_000, prefix)).toBeNull();
  });
});
