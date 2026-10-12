import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { MAX_MESSAGE_BYTES } from '@pokerji/protocol';
import { WebSocketServer, type WebSocket } from 'ws';
import type { App } from './app.ts';
import { resumeSession } from './flows.ts';
import { withinLimit } from './limiter.ts';
import { attachSocket, type Socket } from './socket.ts';

export const SESSION_COOKIE = 'pj_session';

/** The proxy variables @sveltejs/adapter-node reads; this module reads the same ones. */
export type ProxyEnv = Record<string, string | undefined>;

const SOCKET_PATH = /^\/poker\/r\/([A-Za-z0-9]{12})\/ws$/;
const UPGRADE_LIMIT = { max: 60, windowSeconds: 60 };
/** A connection this far behind is not reading; it is dropped rather than buffered for. */
const MAX_BUFFERED_BYTES = 1_000_000;

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/** The site's own origin as the browser sees it, or null when it cannot be worked out. */
export function requestOrigin(
  req: IncomingMessage,
  env: ProxyEnv,
  defaultProtocol: 'http' | 'https',
): string | null {
  const protocol = env.PROTOCOL_HEADER
    ? (header(req, env.PROTOCOL_HEADER) ?? defaultProtocol)
    : defaultProtocol;
  const host = env.HOST_HEADER ? header(req, env.HOST_HEADER) : header(req, 'host');
  return host ? `${protocol}://${host}` : null;
}

/** The client's address. Never throws; "unknown" when it cannot tell. */
export function requestAddress(req: IncomingMessage, env: ProxyEnv): string {
  if (!env.ADDRESS_HEADER) return req.socket.remoteAddress ?? 'unknown';
  const value = header(req, env.ADDRESS_HEADER);
  if (value === undefined) return 'unknown';
  if (env.ADDRESS_HEADER.toLowerCase() !== 'x-forwarded-for') return value.trim();
  // Read from the right: entries further left can be set by the client.
  const addresses = value.split(',').map((part) => part.trim());
  const depth = Math.max(1, Number.parseInt(env.XFF_DEPTH ?? '1', 10) || 1);
  return addresses[addresses.length - depth] ?? 'unknown';
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function refuse(socket: Duplex): void {
  try {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  } catch {
    // The socket is already gone.
  }
  socket.destroy();
}

function adapt(ws: WebSocket): Socket {
  ws.on('error', () => undefined);
  return {
    send: (text) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        ws.terminate();
        return;
      }
      ws.send(text);
    },
    close: (code) => ws.close(code),
    onMessage: (handler) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          ws.close(1003);
          return;
        }
        handler(data.toString());
      });
    },
    onClose: (handler) => {
      ws.on('close', handler);
    },
  };
}

/**
 * Decides whether an HTTP upgrade may become a room socket. The path must be a
 * room's socket path, the Origin must be this site, and the cookie must be a
 * session in that room. Every refusal is the same 403.
 */
export function createUpgradeHandler(
  app: App,
  options: { env: ProxyEnv; defaultProtocol: 'http' | 'https' },
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const server = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  async function serve(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://local').pathname;
    const code = SOCKET_PATH.exec(path)?.[1];
    const origin = requestOrigin(req, options.env, options.defaultProtocol);
    if (code === undefined || origin === null || req.headers.origin !== origin) {
      return refuse(socket);
    }

    // Authenticate first, then limit per session. A limit counted per address
    // before authentication would let anyone on the same network lock a team
    // out of its room by sending refused attempts.
    const resumed = await resumeSession(app.flows, {
      code,
      token: readCookie(req.headers.cookie, SESSION_COOKIE),
    });
    if (!resumed) return refuse(socket);
    const allowed = await withinLimit(
      app.kv,
      `ws:${resumed.session.id}`,
      UPGRADE_LIMIT,
      app.flows.keyPrefix,
    );
    if (!allowed) return refuse(socket);
    const host = await app.registry.open(resumed.room);
    if (!host) return refuse(socket);

    const { id, name, role, moderator } = resumed.session;
    server.handleUpgrade(req, socket, head, (ws) => {
      attachSocket(host, { id, name, role, moderator }, adapt(ws));
    });
  }

  return (req, socket, head) => {
    socket.on('error', () => undefined);
    serve(req, socket, head).catch(() => refuse(socket));
  };
}
