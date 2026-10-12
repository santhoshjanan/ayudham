import Valkey from 'iovalkey';

export type Kv = Valkey;

export const KEY_PREFIX = 'pokerji:';

/**
 * A Valkey client that gives up on a command after one retry, so callers find
 * out quickly when Valkey is down instead of queueing forever.
 */
export function createKv(url: string): Kv {
  const kv = new Valkey(url, { maxRetriesPerRequest: 1 });
  // Connection errors surface through failed commands; an unhandled 'error' event would crash.
  kv.on('error', () => undefined);
  return kv;
}
