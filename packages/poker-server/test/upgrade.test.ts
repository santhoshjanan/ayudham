import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  createApp,
  createRoomFlow,
  createUpgradeHandler,
  readCookie,
  requestAddress,
  requestOrigin,
  SESSION_COOKIE,
  type App,
} from '../src/index.ts';
import { DATABASE_URL, testPrefix, testSchema, VALKEY_URL } from './services.ts';

let app: App;
let drop: () => Promise<void>;
let server: Server;
let port: number;

beforeAll(async () => {
  const made = await testSchema();
  drop = made.drop;
  app = createApp(
    {
      databaseUrl: DATABASE_URL,
      valkeyUrl: VALKEY_URL,
      addressHmacSecret: 's'.repeat(32),
      retentionDays: 30,
      keyPrefix: testPrefix(),
    },
    { schema: made.schema, report: () => undefined },
  );
  await app.start();
  server = createServer();
  server.on('upgrade', createUpgradeHandler(app, { env: {}, defaultProtocol: 'http' }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await app.stop();
  await drop();
});

async function room() {
  const created = await createRoomFlow(app.flows, {
    address: '203.0.113.1',
    name: 'Mo',
    deckId: 'fibonacci',
  });
  if (!created.ok) throw new Error('room was not created');
  return created;
}

type Outcome =
  { opened: true; socket: WebSocket; first: { type: string } } | { opened: false; status: number };

function connect(
  path: string,
  options: { token?: string; origin?: string | null } = {},
): Promise<Outcome> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers.Cookie = `${SESSION_COOKIE}=${options.token}`;
  const origin = options.origin === undefined ? `http://127.0.0.1:${port}` : options.origin;
  if (origin !== null) headers.Origin = origin;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    socket.once('message', (data) =>
      resolve({ opened: true, socket, first: JSON.parse(data.toString()) as { type: string } }),
    );
    socket.once('unexpected-response', (_request, response) => {
      resolve({ opened: false, status: response.statusCode ?? 0 });
      socket.terminate();
    });
    socket.once('error', (error) => {
      if (!/Unexpected server response/.test(error.message)) reject(error);
    });
  });
}

const closeCode = (socket: WebSocket) =>
  new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));

const fakeRequest = (headers: Record<string, string>, remoteAddress = '10.0.0.5') =>
  ({ headers, socket: { remoteAddress } }) as unknown as IncomingMessage;

describe('createUpgradeHandler', () => {
  it('opens a socket for a valid session and sends the room', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error(`refused with ${outcome.status}`);
    expect(outcome.first.type).toBe('snapshot');
    outcome.socket.close();
  });

  it('refuses every bad request the same way', async () => {
    const first = await room();
    const second = await room();
    const refused = { opened: false, status: 403 };
    const path = `/poker/r/${first.code}/ws`;
    expect(await connect(path)).toEqual(refused);
    expect(await connect(path, { token: 'wrong' })).toEqual(refused);
    expect(await connect(path, { token: second.sessionToken })).toEqual(refused);
    expect(await connect('/poker/r/AAAAAAAAAAAA/ws', { token: first.sessionToken })).toEqual(
      refused,
    );
    expect(await connect('/somewhere/else', { token: first.sessionToken })).toEqual(refused);
    expect(await connect(`${path}/extra`, { token: first.sessionToken })).toEqual(refused);
  });

  it('refuses a valid session coming from another origin, or from none', async () => {
    const { code, sessionToken } = await room();
    const path = `/poker/r/${code}/ws`;
    const refused = { opened: false, status: 403 };
    expect(await connect(path, { token: sessionToken, origin: 'https://evil.example' })).toEqual(
      refused,
    );
    expect(await connect(path, { token: sessionToken, origin: null })).toEqual(refused);
  });

  it('closes a socket that sends a binary frame', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error('refused');
    const closed = closeCode(outcome.socket);
    outcome.socket.send(Buffer.from([1, 2, 3]));
    expect(await closed).toBe(1003);
  });

  it('closes a socket that sends more than 2 KB', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error('refused');
    const closed = closeCode(outcome.socket);
    outcome.socket.send('x'.repeat(3_000));
    expect(await closed).toBe(1009);
  });

  it('carries a message through to the room', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error('refused');
    const next = new Promise<{ room: { title: string } }>((resolve) =>
      outcome.socket.once('message', (data) => resolve(JSON.parse(data.toString()))),
    );
    outcome.socket.send(JSON.stringify({ type: 'setTitle', title: 'PROJ-7' }));
    expect((await next).room.title).toBe('PROJ-7');
    outcome.socket.close();
  });
});

describe('requestOrigin', () => {
  it('uses the request host and the default protocol when no proxy headers are configured', () => {
    expect(requestOrigin(fakeRequest({ host: 'localhost:5173' }), {}, 'http')).toBe(
      'http://localhost:5173',
    );
    expect(requestOrigin(fakeRequest({ host: 'poker.example' }), {}, 'https')).toBe(
      'https://poker.example',
    );
  });

  it('uses the configured proxy headers', () => {
    const env = { PROTOCOL_HEADER: 'x-forwarded-proto', HOST_HEADER: 'x-forwarded-host' };
    const req = fakeRequest({
      host: 'web:3000',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'poker.example',
    });
    expect(requestOrigin(req, env, 'http')).toBe('https://poker.example');
  });

  it('returns nothing when the host is missing', () => {
    expect(requestOrigin(fakeRequest({}), {}, 'https')).toBeNull();
    expect(
      requestOrigin(fakeRequest({ host: 'a' }), { HOST_HEADER: 'x-forwarded-host' }, 'https'),
    ).toBeNull();
  });
});

describe('requestAddress', () => {
  it('uses the connection address when no header is configured', () => {
    expect(requestAddress(fakeRequest({}, '198.51.100.4'), {})).toBe('198.51.100.4');
  });

  it('reads the forwarded list from the right, by the number of trusted proxies', () => {
    const req = fakeRequest({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.0.0.1' });
    expect(requestAddress(req, { ADDRESS_HEADER: 'x-forwarded-for' })).toBe('10.0.0.1');
    expect(requestAddress(req, { ADDRESS_HEADER: 'x-forwarded-for', XFF_DEPTH: '2' })).toBe(
      '203.0.113.7',
    );
  });

  it('reads another configured header as is', () => {
    const req = fakeRequest({ 'true-client-ip': '203.0.113.7' });
    expect(requestAddress(req, { ADDRESS_HEADER: 'True-Client-IP' })).toBe('203.0.113.7');
  });

  it('answers unknown instead of throwing when it cannot tell', () => {
    expect(requestAddress(fakeRequest({}), { ADDRESS_HEADER: 'x-forwarded-for' })).toBe('unknown');
    const short = fakeRequest({ 'x-forwarded-for': '203.0.113.7' });
    expect(requestAddress(short, { ADDRESS_HEADER: 'x-forwarded-for', XFF_DEPTH: '3' })).toBe(
      'unknown',
    );
    expect(requestAddress({ headers: {}, socket: {} } as unknown as IncomingMessage, {})).toBe(
      'unknown',
    );
  });
});

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('a=1; pj_session=abc-_123; b=2', 'pj_session')).toBe('abc-_123');
    expect(readCookie('pj_session=abc', 'pj_session')).toBe('abc');
  });

  it('returns nothing when the cookie or the header is absent', () => {
    expect(readCookie('a=1; xpj_session=no', 'pj_session')).toBeUndefined();
    expect(readCookie(undefined, 'pj_session')).toBeUndefined();
    expect(readCookie('', 'pj_session')).toBeUndefined();
  });
});
