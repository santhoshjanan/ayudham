import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { clientMessageSchema } from '@ayudham/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  createApp,
  createRoomFlow,
  createUpgradeHandler,
  findRoomByCode,
  joinRoomFlow,
  metrics,
  resumeSession,
  SESSION_COOKIE,
  type App,
} from '../src/index.ts';
import { DATABASE_URL, testPrefix, testSchema, VALKEY_URL } from './services.ts';

// Things a person typed, or that identify a room or a person. None may reach a scrape.
const NAME = 'Zebedee-Quux-91';
const SECOND_NAME = 'Ottoline-Vance-37';
const TITLE = 'PROJ-4242 Xyzzy plugh frobnicate';
const ADDRESS = '203.0.113.77';

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
      backupRotationDays: null,
      version: '9.8.7',
      metrics: true,
    },
    { schema: made.schema, report: () => undefined },
  );
  metrics.reset();
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

const value = (text: string, line: string) => {
  const found = text.split('\n').find((entry) => entry.startsWith(`${line} `));
  return found === undefined ? undefined : Number(found.slice(line.length + 1));
};

/** Waits until a sample reaches a value: socket events arrive a moment after the call. */
async function until(line: string, expected: number): Promise<string> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const text = await app.metrics.render();
    if (value(text, line) === expected) return text;
    if (Date.now() > deadline) {
      throw new Error(`${line} is ${value(text, line)}, expected ${expected}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function open(code: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/poker/r/${code}/ws`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}`, Origin: `http://127.0.0.1:${port}` },
    });
    socket.once('message', () => resolve(socket));
    socket.once('error', reject);
  });
}

const refusedStatus = (path: string, headers: Record<string, string>) =>
  new Promise<number>((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    socket.once('unexpected-response', (_request, response) => {
      resolve(response.statusCode ?? 0);
      socket.terminate();
    });
    socket.once('error', () => undefined);
  });

describe('metrics, against real services', () => {
  it('follows a room from loading to unloading, and gives away nothing about it', async () => {
    const created = await createRoomFlow(app.flows, {
      address: ADDRESS,
      name: NAME,
      deckId: 'fibonacci',
    });
    if (!created.ok) throw new Error('room was not created');
    const joined = await joinRoomFlow(app.flows, {
      address: '2001:db8:77:1::9',
      code: created.code,
      name: SECOND_NAME,
      role: 'voter',
      passcode: '',
    });
    if (!joined.ok) throw new Error('join failed');
    const room = await findRoomByCode(app.db, created.code);
    const owner = await resumeSession(app.flows, {
      code: created.code,
      token: created.sessionToken,
    });
    if (!room || !owner) throw new Error('room or session missing');

    // A room is loaded when its first socket arrives.
    const first = await open(created.code, created.sessionToken);
    const second = await open(created.code, joined.sessionToken);
    await until('ayudham_websocket_connections', 2);
    let text = await until('ayudham_rooms_active', 1);
    expect(value(text, 'ayudham_room_loads_total')).toBe(1);
    expect(value(text, 'ayudham_websocket_connections_total')).toBe(2);
    expect(value(text, 'ayudham_room_lock_wait_seconds_count')).toBe(1);

    // Messages: accepted ones by type, refused ones by reason.
    first.send(JSON.stringify({ type: 'setTitle', title: TITLE }));
    first.send(JSON.stringify({ type: 'vote', card: '5' }));
    second.send(JSON.stringify({ type: 'vote', card: '8' }));
    second.send(`not json ${NAME}`);
    await until('ayudham_websocket_messages_total{type="vote"}', 2);
    text = await until('ayudham_websocket_messages_rejected_total{reason="invalid"}', 1);
    expect(value(text, 'ayudham_websocket_messages_total{type="setTitle"}')).toBe(1);

    // Closes: a tab that goes away, and one that sends too much.
    second.close();
    await until('ayudham_websocket_closes_total{reason="normal"}', 1);
    first.send('x'.repeat(3_000));
    await until('ayudham_websocket_closes_total{reason="oversize"}', 1);
    await until('ayudham_websocket_connections', 0);

    // Refused upgrades: no session, and another site's origin.
    expect(
      await refusedStatus(`/poker/r/${created.code}/ws`, { Origin: `http://127.0.0.1:${port}` }),
    ).toBe(403);
    expect(
      await refusedStatus(`/poker/r/${created.code}/ws`, {
        Origin: 'https://evil.example',
        Cookie: `${SESSION_COOKIE}=${created.sessionToken}`,
      }),
    ).toBe(403);
    await until('ayudham_websocket_upgrades_refused_total{reason="auth"}', 1);
    await until('ayudham_websocket_upgrades_refused_total{reason="bad_request"}', 1);

    // A rate limit: the eleventh room from one address in an hour.
    for (let i = 0; i < 10; i += 1) {
      await createRoomFlow(app.flows, { address: ADDRESS, name: NAME, deckId: 'fibonacci' });
    }
    await until('ayudham_rate_limit_hits_total{bucket="create"}', 1);

    // Unloading.
    await app.registry.close(room.id);
    text = await until('ayudham_rooms_active', 0);
    expect(value(text, 'ayudham_room_unloads_total{reason="closed"}')).toBe(1);

    // The services answer, and the version is there.
    expect(value(text, 'ayudham_valkey_up')).toBe(1);
    expect(value(text, 'ayudham_postgres_up')).toBe(1);
    expect(value(text, 'ayudham_build_info{version="9.8.7"}')).toBe(1);
    // The standard Node process metrics are on once the app has started.
    expect(text).toContain('process_resident_memory_bytes');
    expect(text).toContain('nodejs_eventloop_lag_seconds');

    // Nothing typed, and nothing that identifies the room or anyone in it.
    for (const secret of [
      created.code,
      NAME,
      SECOND_NAME,
      TITLE,
      'Xyzzy',
      ADDRESS,
      '2001:db8:77',
      created.sessionToken,
      joined.sessionToken,
      created.recoveryToken,
      room.id,
      owner.session.id,
    ]) {
      expect(text, `the scrape must not contain ${secret.slice(0, 6)}…`).not.toContain(secret);
    }
    // Every label value in the whole output is a short lowercase word or a version.
    for (const [, labelValue] of text.matchAll(/[a-z_]+="([^"]*)"/g)) {
      expect(labelValue).toMatch(/^[A-Za-z0-9+._-]{1,40}$/);
    }
  }, 30_000);

  it('gives every message type the protocol knows its own label', async () => {
    metrics.reset();
    const types = clientMessageSchema.options.map((option) => option.shape.type.value);
    expect(types.length).toBeGreaterThan(5);
    for (const type of types) metrics.messageReceived(type);
    const text = await app.metrics.render();
    for (const type of types) {
      expect(value(text, `ayudham_websocket_messages_total{type="${type}"}`)).toBe(1);
    }
    expect(value(text, 'ayudham_websocket_messages_total{type="other"}')).toBeUndefined();
  });
});
