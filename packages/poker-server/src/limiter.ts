import { KEY_PREFIX, type Kv } from './kv.ts';
import { metrics } from './metrics.ts';

export interface Limit {
  max: number;
  windowSeconds: number;
}

/** Defaults from the spec. Keys are built by the caller from an addressKey and/or a room id. */
export const LIMITS = {
  roomCreate: { max: 10, windowSeconds: 3_600 },
  /** One IPv6 /48, across all of its /64s. */
  roomCreateWide: { max: 50, windowSeconds: 3_600 },
  /** Every client together: what the whole service will create in an hour. */
  roomCreateAll: { max: 1_000, windowSeconds: 3_600 },
  join: { max: 30, windowSeconds: 600 },
  /** One IPv6 /48, across all of its /64s. */
  joinWide: { max: 150, windowSeconds: 600 },
  passcodeClient: { max: 5, windowSeconds: 600 },
  passcodeRoom: { max: 50, windowSeconds: 3_600 },
} as const satisfies Record<string, Limit>;

const COUNT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

/**
 * Counts one attempt against a fixed window and says whether it is allowed.
 * Refuses when Valkey cannot be reached: a limit that cannot be checked is not a pass.
 */
export async function withinLimit(
  kv: Kv,
  key: string,
  limit: Limit,
  prefix: string = KEY_PREFIX,
): Promise<boolean> {
  try {
    const count = await kv.eval(COUNT, 1, `${prefix}rl:${key}`, limit.windowSeconds);
    const allowed = typeof count === 'number' && count <= limit.max;
    // Only the fixed first part of the key is recorded, never the rest.
    if (!allowed) metrics.rateLimitHit(key);
    return allowed;
  } catch {
    metrics.rateLimitError();
    return false;
  }
}

/**
 * Says whether a counter has already reached its limit, without adding to it.
 * Used where only failures should count. Unreachable Valkey reads as over the limit.
 */
export async function overLimit(
  kv: Kv,
  key: string,
  limit: Limit,
  prefix: string = KEY_PREFIX,
): Promise<boolean> {
  try {
    const count = Number((await kv.get(`${prefix}rl:${key}`)) ?? 0);
    return !(count < limit.max);
  } catch {
    metrics.rateLimitError();
    return true;
  }
}

/** Forgets a counter, as when the thing it protected has been replaced. */
export async function clearLimit(kv: Kv, key: string, prefix: string = KEY_PREFIX): Promise<void> {
  try {
    await kv.del(`${prefix}rl:${key}`);
  } catch {
    // The counter expires on its own.
  }
}
