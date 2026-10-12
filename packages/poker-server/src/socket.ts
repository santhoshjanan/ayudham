import type { Joiner } from '@pokerji/poker-engine';
import { MAX_MESSAGE_BYTES, parseClientMessage, type ErrorCode } from '@pokerji/protocol';
import type { Connection, RoomHost } from './host.ts';

export const MESSAGE_LIMIT = { max: 30, windowMs: 10_000 };

/** Unparseable or over-rate messages a socket may send before it is closed. */
export const MAX_STRIKES = 3;

export interface Socket {
  send(text: string): void;
  close(): void;
  onMessage(handler: (text: string) => void): void;
  onClose(handler: () => void): void;
}

/**
 * Connects one authenticated socket to its room. The caller has already
 * checked the session and the Origin. Everything the socket sends is
 * untrusted: it is size-checked, rate-limited and parsed before the room
 * sees it. Actions the room refuses are not counted as abuse.
 */
export function attachSocket(
  host: RoomHost,
  joiner: Joiner,
  socket: Socket,
  now: () => number,
): void {
  const connection: Connection = {
    send: (text) => socket.send(text),
    close: () => socket.close(),
  };
  let windowStart = now();
  let inWindow = 0;
  let strikes = 0;
  let closed = false;

  const strike = (code: ErrorCode) => {
    socket.send(JSON.stringify({ type: 'error', code }));
    strikes += 1;
    if (strikes >= MAX_STRIKES) {
      closed = true;
      socket.close();
    }
  };

  socket.onMessage((text) => {
    if (closed) return;
    const time = now();
    if (time - windowStart >= MESSAGE_LIMIT.windowMs) {
      windowStart = time;
      inWindow = 0;
    }
    inWindow += 1;
    if (inWindow > MESSAGE_LIMIT.max) return strike('rate_limited');
    if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) return strike('invalid');
    const message = parseClientMessage(text);
    if (!message) return strike('invalid');
    host.receive(joiner.id, message);
  });

  socket.onClose(() => {
    closed = true;
    host.disconnect(joiner.id, connection);
  });

  host.connect(joiner, connection);
}
