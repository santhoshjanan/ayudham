import { KEY_PREFIX, type Kv } from './kv.ts';

export interface RoomLock {
  /** Extends the lock. False means another owner now holds it and this one must stop. */
  refresh(): Promise<boolean>;
  release(): Promise<void>;
}

// Extends the lock if we hold it; takes it back if it expired and nobody else has it.
const REFRESH = `
local holder = redis.call('GET', KEYS[1])
if holder == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if not holder then redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
return 0`;

const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

/** Claims a room for one server instance. Returns null when another instance has it. */
export async function acquireRoomLock(
  kv: Kv,
  roomId: string,
  owner: string,
  ttlMs = 15_000,
  prefix: string = KEY_PREFIX,
): Promise<RoomLock | null> {
  const key = `${prefix}lock:${roomId}`;
  const taken = await kv.set(key, owner, 'PX', ttlMs, 'NX');
  if (taken !== 'OK') return null;
  return {
    refresh: async () => (await kv.eval(REFRESH, 1, key, owner, ttlMs)) === 1,
    release: async () => {
      await kv.eval(RELEASE, 1, key, owner);
    },
  };
}
