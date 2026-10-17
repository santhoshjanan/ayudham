import type { Joiner } from '@ayudham/poker-engine';
import {
  CLOSE_TOO_MANY_CONNECTIONS,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  type ErrorCode,
} from '@ayudham/protocol';
import type { Connection, RoomHost } from './host.ts';
import { metrics, type CloseReason, type RejectReason } from './metrics.ts';

/** Unparseable or over-rate messages a socket may send before it is closed. */
export const MAX_STRIKES = 3;

export interface Socket {
  send(text: string): void;
  close(code?: number): void;
  onMessage(handler: (text: string) => void): void;
  /** `code` is the WebSocket close code, when the transport knows it. */
  onClose(handler: (code?: number) => void): void;
}

/**
 * Connects one authenticated socket to its room. The caller has already
 * checked the session and the Origin. Everything the socket sends is
 * untrusted: it is size-checked, rate-limited and parsed before the room
 * sees it. Actions the room refuses are not counted as abuse.
 */
export function attachSocket(host: RoomHost, joiner: Joiner, socket: Socket): void {
  // Why this side closed the socket, if it did. Only for the metrics.
  let closedFor: CloseReason | null = null;
  const connection: Connection = {
    send: (text) => socket.send(text),
    close: (code) => {
      closedFor ??=
        code === CLOSE_TOO_MANY_CONNECTIONS ? 'too_many_connections' : 'closed_by_server';
      socket.close(code);
    },
  };
  let strikes = 0;
  let closed = false;

  const strike = (code: ErrorCode, reason: RejectReason) => {
    metrics.messageRejected(reason);
    socket.send(JSON.stringify({ type: 'error', code }));
    strikes += 1;
    if (strikes >= MAX_STRIKES) {
      closed = true;
      closedFor ??= reason === 'rate_limited' ? 'rate_limited' : 'bad_message';
      socket.close();
    }
  };

  socket.onMessage((text) => {
    if (closed) return;
    // The budget belongs to the participant, so opening more sockets does not multiply it.
    if (!host.allowMessage(joiner.id)) return strike('rate_limited', 'rate_limited');
    if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) return strike('invalid', 'oversize');
    const message = parseClientMessage(text);
    if (!message) return strike('invalid', 'invalid');
    metrics.messageReceived(message.type);
    host.receive(joiner.id, message);
  });

  socket.onClose((code) => {
    closed = true;
    metrics.socketClosed(closedFor ?? closeReason(code));
    host.disconnect(joiner.id, connection);
  });

  metrics.socketOpened();
  host.connect(joiner, connection);
}

/** What a close code from the other side means, as one of a few fixed words. */
function closeReason(code: number | undefined): CloseReason {
  // 1000 and 1001: closed or navigated away. 1005: closed with no code. Undefined: unknown transport.
  if (code === undefined || code === 1000 || code === 1001 || code === 1005) return 'normal';
  if (code === 1009) return 'oversize';
  if (code === 1003) return 'bad_message';
  return 'abnormal';
}
