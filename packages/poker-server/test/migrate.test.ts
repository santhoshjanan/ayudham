import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, pendingMigrations, type Db } from '../src/index.ts';
import { DATABASE_URL, testDb, testSchema } from './services.ts';

let db: Db;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(() => drop());

const DECK = JSON.stringify({ values: ['1', '2'], specials: ['?'] });

async function seed() {
  const room = await db.query<{ id: string }>(
    `insert into rooms (code, deck, recovery_hash) values ($1, $2::jsonb, 'r') returning id`,
    [`code${Math.random()}`, DECK],
  );
  const roomId = room.rows[0]!.id;
  const session = await db.query<{ id: string }>(
    `insert into sessions (room_id, token_hash, name, role) values ($1, $2, 'Ann', 'voter') returning id`,
    [roomId, `hash${Math.random()}`],
  );
  const sessionId = session.rows[0]!.id;
  const round = await db.query<{ id: string }>(
    `insert into rounds (id, room_id, title) values (gen_random_uuid(), $1, 'T') returning id`,
    [roomId],
  );
  const roundId = round.rows[0]!.id;
  await db.query(
    `insert into votes (round_id, position, session_id, voter_name, card) values ($1, 1, $2, 'Ann', '5')`,
    [roundId, sessionId],
  );
  return { roomId, sessionId, roundId };
}

const count = async (table: string, column: string, id: string) =>
  (await db.query(`select 1 from ${table} where ${column} = $1`, [id])).rowCount;

describe('migrate', () => {
  it('creates the tables', async () => {
    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = current_schema() order by table_name`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      'rooms',
      'rounds',
      'schema_migrations',
      'sessions',
      'votes',
    ]);
  });

  it('applies nothing the second time', async () => {
    expect(await migrate(db)).toEqual([]);
  });

  it('deletes everything under a room when the room is deleted', async () => {
    const { roomId, sessionId, roundId } = await seed();
    await db.query('delete from rooms where id = $1', [roomId]);
    expect(await count('sessions', 'id', sessionId)).toBe(0);
    expect(await count('rounds', 'id', roundId)).toBe(0);
    expect(await count('votes', 'round_id', roundId)).toBe(0);
  });

  it('keeps a vote, without its session link, when the session is deleted', async () => {
    const { sessionId, roundId } = await seed();
    await db.query('delete from sessions where id = $1', [sessionId]);
    const votes = await db.query('select session_id, voter_name from votes where round_id = $1', [
      roundId,
    ]);
    expect(votes.rows).toEqual([{ session_id: null, voter_name: 'Ann' }]);
  });

  it('refuses a role other than voter or spectator', async () => {
    const { roomId } = await seed();
    await expect(
      db.query(
        `insert into sessions (room_id, token_hash, name, role) values ($1, 'h-admin', 'X', 'admin')`,
        [roomId],
      ),
    ).rejects.toThrow();
  });

  it('refuses two rooms with the same code', async () => {
    const insert = () =>
      db.query(`insert into rooms (code, deck, recovery_hash) values ('same', $1::jsonb, 'r')`, [
        DECK,
      ]);
    await insert();
    await expect(insert()).rejects.toThrow();
  });
});

describe('pendingMigrations', () => {
  it('lists every migration for an empty schema, in order, without creating anything', async () => {
    const empty = await testSchema();
    const pool = createPool(DATABASE_URL, empty.schema);
    try {
      const pending = await pendingMigrations(pool);
      expect(pending[0]).toBe('001_init.sql');
      expect(pending).toEqual([...pending].sort());
      expect(pending.length).toBeGreaterThanOrEqual(4);
      const tables = await pool.query(
        `select 1 from information_schema.tables where table_schema = current_schema()`,
      );
      expect(tables.rowCount).toBe(0);
    } finally {
      await pool.end();
      await empty.drop();
    }
  });

  it('lists nothing once every migration is applied', async () => {
    expect(await pendingMigrations(db)).toEqual([]);
  });
});
