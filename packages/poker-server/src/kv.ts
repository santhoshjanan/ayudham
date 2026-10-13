import Valkey from 'iovalkey';

export type Kv = Valkey;

export const KEY_PREFIX = 'pokerji:';
const TROUBLE_EVERY_MS = 60_000;

/**
 * A Valkey client that gives up on a command after one retry, so callers find
 * out quickly when Valkey is down instead of queueing forever.
 */
export function createKv(url: string, onTrouble?: () => void): Kv {
  // The client's ready check stays on. Without it a command can be answered before a
  // failed sign-in is noticed, and a server that accepts and drops connections is retried
  // for ever instead of failing the command.
  const kv = new Valkey(url, { maxRetriesPerRequest: 1 });
  // Connection errors also surface through failed commands, and an unhandled 'error' event
  // would crash. The client retries constantly while Valkey is away, so trouble is
  // passed on at most once a minute.
  let told = -Infinity;
  kv.on('error', () => {
    const now = Date.now();
    if (now - told < TROUBLE_EVERY_MS) return;
    told = now;
    try {
      onTrouble?.();
    } catch {
      // A listener that fails must not take the connection's event handling down with it.
    }
  });
  return kv;
}
