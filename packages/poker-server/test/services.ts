import { randomBytes } from 'node:crypto';
import { createPool, migrate, type Db } from '../src/index.ts';

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://ayudham:ayudham_dev@127.0.0.1:5432/ayudham';

export const VALKEY_URL = process.env.TEST_VALKEY_URL ?? 'redis://:ayudham_dev@127.0.0.1:6379';

/** A migrated database in a schema of its own. Call drop() when the test file is done. */
export async function testDb(): Promise<{ db: Db; drop: () => Promise<void> }> {
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const admin = createPool(DATABASE_URL);
  await admin.query(`create schema ${schema}`);
  const db = createPool(DATABASE_URL, schema);
  await migrate(db);
  return {
    db,
    drop: async () => {
      await db.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}

/** A key prefix no other test file shares. */
export const testPrefix = () => `test:${randomBytes(6).toString('hex')}:`;

/** An empty schema for code that runs its own migrations. */
export async function testSchema(): Promise<{ schema: string; drop: () => Promise<void> }> {
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const admin = createPool(DATABASE_URL);
  await admin.query(`create schema ${schema}`);
  return {
    schema,
    drop: async () => {
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}
