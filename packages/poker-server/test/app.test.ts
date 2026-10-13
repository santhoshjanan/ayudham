import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createApp,
  createRoomFlow,
  findRoomByCode,
  insertRoom,
  listRounds,
  resumeSession,
  type App,
  type Config,
} from '../src/index.ts';
import { fakeConnection } from './fakes.ts';
import { DATABASE_URL, testPrefix, testSchema, VALKEY_URL } from './services.ts';

let schema: string;
let drop: () => Promise<void>;
let app: App;
const problems: string[] = [];

const config = (): Config => ({
  databaseUrl: DATABASE_URL,
  valkeyUrl: VALKEY_URL,
  addressHmacSecret: 's'.repeat(32),
  retentionDays: 30,
  keyPrefix: testPrefix(),
  backupRotationDays: null,
});

beforeAll(async () => {
  ({ schema, drop } = await testSchema());
  app = createApp(config(), { schema, report: (problem) => problems.push(problem) });
  await app.start();
});
afterAll(async () => {
  await app.stop();
  await drop();
});

const until = async (check: () => Promise<boolean>, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition not met in time');
};

describe('createApp', () => {
  it('migrates the database on start', async () => {
    const tables = await app.db.query(
      `select 1 from information_schema.tables
       where table_schema = current_schema() and table_name = 'rooms'`,
    );
    expect(tables.rowCount).toBe(1);
  });

  it('runs a whole round through real services and saves it', async () => {
    const created = await createRoomFlow(app.flows, {
      address: '203.0.113.1',
      name: 'Mo',
      deckId: 'fibonacci',
    });
    if (!created.ok) throw new Error('room was not created');
    const resumed = await resumeSession(app.flows, {
      code: created.code,
      token: created.sessionToken,
    });
    if (!resumed) throw new Error('session did not resume');

    const host = await app.registry.open(resumed.room);
    const tab = fakeConnection();
    host?.connect(
      { id: resumed.session.id, name: 'Mo', role: 'voter', moderator: true },
      tab.connection,
    );
    host?.receive(resumed.session.id, { type: 'setTitle', title: 'PROJ-1' });
    host?.receive(resumed.session.id, { type: 'vote', card: '5' });
    host?.receive(resumed.session.id, { type: 'reveal' });

    await until(async () => (await listRounds(app.db, resumed.room.id)).length === 1);
    const [round] = await listRounds(app.db, resumed.room.id);
    expect(round).toMatchObject({
      title: 'PROJ-1',
      votes: [{ sessionId: resumed.session.id, name: 'Mo', card: '5' }],
    });
    await until(async () => tab.room().saveStatus === 'saved');
    expect(problems).toEqual([]);
  });

  it('saves a role change made in the room', async () => {
    const created = await createRoomFlow(app.flows, {
      address: '203.0.113.2',
      name: 'Mo',
      deckId: 'fibonacci',
    });
    if (!created.ok) throw new Error('room was not created');
    const lookup = () =>
      resumeSession(app.flows, { code: created.code, token: created.sessionToken });
    const resumed = await lookup();
    if (!resumed) throw new Error('session did not resume');
    const host = await app.registry.open(resumed.room);
    host?.connect(
      { id: resumed.session.id, name: 'Mo', role: 'voter', moderator: true },
      fakeConnection().connection,
    );
    host?.receive(resumed.session.id, { type: 'setRole', role: 'spectator' });
    await until(async () => (await lookup())?.session.role === 'spectator');
  });

  it('can be started and stopped more than once without failing', async () => {
    const extra = createApp(config(), { schema, report: () => undefined });
    await extra.start();
    await extra.start();
    await extra.stop();
    await expect(extra.stop()).resolves.toBeUndefined();
  });

  it('deletes rooms past the retention period when it starts', async () => {
    const stale = await insertRoom(app.db, {
      code: 'StaleRoom001',
      deck: { values: ['1', '2'], specials: [] },
      recoveryHash: 'rh',
    });
    await app.db.query(
      `update rooms set last_active_at = now() - interval '31 days' where id = $1`,
      [stale.id],
    );
    const second = createApp(config(), { schema, report: () => undefined });
    await second.start();
    try {
      expect(await findRoomByCode(second.db, 'StaleRoom001')).toBeNull();
    } finally {
      await second.stop();
    }
  });
});

describe('start with MIGRATIONS=check', () => {
  it('refuses to start when the schema is behind, and creates nothing', async () => {
    const empty = await testSchema();
    const behind = createApp(
      { ...config(), migrations: 'check' },
      { schema: empty.schema, report: () => undefined },
    );
    await expect(behind.start()).rejects.toThrow('Database schema is behind');
    const tables = await behind.db.query(
      `select 1 from information_schema.tables where table_schema = current_schema()`,
    );
    expect(tables.rowCount).toBe(0);
    await behind.stop();
    await empty.drop();
  });

  it('starts when the schema is current', async () => {
    const current = createApp(
      { ...config(), migrations: 'check' },
      { schema, report: () => undefined },
    );
    await expect(current.start()).resolves.toBeUndefined();
    await current.stop();
  });
});
