import { afterAll, describe, expect, it } from 'vitest';
import { createKv, LIMITS, withinLimit } from '../src/index.ts';
import { testPrefix, VALKEY_URL } from './services.ts';

const kv = createKv(VALKEY_URL);
const prefix = testPrefix();
afterAll(() => kv.quit());

describe('withinLimit', () => {
  it('allows attempts up to the maximum, then refuses', async () => {
    const limit = { max: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await withinLimit(kv, 'k1', limit, prefix));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('counts each key separately', async () => {
    const limit = { max: 1, windowSeconds: 60 };
    expect(await withinLimit(kv, 'k2', limit, prefix)).toBe(true);
    expect(await withinLimit(kv, 'k3', limit, prefix)).toBe(true);
    expect(await withinLimit(kv, 'k2', limit, prefix)).toBe(false);
  });

  it('starts again when the window ends', async () => {
    const limit = { max: 1, windowSeconds: 1 };
    expect(await withinLimit(kv, 'k4', limit, prefix)).toBe(true);
    expect(await withinLimit(kv, 'k4', limit, prefix)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(await withinLimit(kv, 'k4', limit, prefix)).toBe(true);
  });

  it('stores only a counter that expires', async () => {
    await withinLimit(kv, 'k5', { max: 5, windowSeconds: 60 }, prefix);
    const key = `${prefix}rl:k5`;
    expect(await kv.get(key)).toBe('1');
    const ttl = await kv.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('refuses when Valkey cannot be reached', async () => {
    const unreachable = createKv('redis://127.0.0.1:1');
    try {
      expect(await withinLimit(unreachable, 'k6', { max: 100, windowSeconds: 60 }, prefix)).toBe(
        false,
      );
    } finally {
      unreachable.disconnect();
    }
  });

  it('carries the limits from the spec', () => {
    expect(LIMITS).toEqual({
      roomCreate: { max: 10, windowSeconds: 3_600 },
      join: { max: 30, windowSeconds: 600 },
      passcodeClient: { max: 5, windowSeconds: 600 },
      passcodeRoom: { max: 50, windowSeconds: 3_600 },
    });
  });
});
