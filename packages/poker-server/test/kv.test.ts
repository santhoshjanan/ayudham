import { createServer, type AddressInfo } from 'node:net';
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

  it('gives up on a command quickly when the server accepts connections and drops them', async () => {
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const kv = createKv(`redis://127.0.0.1:${port}`);
    const started = Date.now();
    await expect(kv.ping()).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
    kv.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }, 20_000);

  it('survives a listener that throws', async () => {
    const kv = createKv('redis://127.0.0.1:1', () => {
      throw new Error('reporting failed');
    });
    await expect(kv.ping()).rejects.toThrow();
    kv.disconnect();
  }, 20_000);
});
