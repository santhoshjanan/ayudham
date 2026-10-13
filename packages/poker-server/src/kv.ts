import Valkey from 'iovalkey';

export type Kv = Valkey;

export const KEY_PREFIX = 'pokerji:';
const TROUBLE_EVERY_MS = 60_000;

/**
 * A Valkey client that gives up on a command after one retry, so callers find
 * out quickly when Valkey is down instead of queueing forever.
 */
export function createKv(url: string, onTrouble?: () => void): Kv {
  // No ready check: it asks the server for its statistics, which this app's user has no need
  // to be allowed to read.
  const kv = new Valkey(url, { maxRetriesPerRequest: 1, enableReadyCheck: false });
  // Connection errors also surface through failed commands, and an unhandled 'error' event
  // would crash. The client retries constantly while Valkey is away, so trouble is
  // passed on at most once a minute.
  let told = -Infinity;
  kv.on('error', () => {
    const now = Date.now();
    if (now - told < TROUBLE_EVERY_MS) return;
    told = now;
    onTrouble?.();
  });
  return kv;
}
