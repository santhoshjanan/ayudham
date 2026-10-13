import { describe, expect, it } from 'vitest';
import { createKv } from '../src/index.ts';

describe('createKv', () => {
  it('says that Valkey is in trouble, and says it once, not on every failed attempt', async () => {
    let told = 0;
    // Nothing listens on this port, so every connection attempt fails.
    const kv = createKv('redis://127.0.0.1:1', () => (told += 1));
    await expect(kv.ping()).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    kv.disconnect();
    expect(told).toBe(1);
  }, 20_000);
});
