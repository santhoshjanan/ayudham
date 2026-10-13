import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.ts';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));
const LOCK_ID = 7_265_001;

/**
 * Applies every .sql file not yet recorded, in name order, each in its own
 * transaction. An advisory lock keeps two processes from migrating at once.
 */
export async function migrate(db: Db, directory: string = MIGRATIONS): Promise<string[]> {
  const client = await db.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const done = await client.query<{ name: string }>('select name from schema_migrations');
    const applied = new Set(done.rows.map((row) => row.name));
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(directory, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
      ran.push(file);
    }
    return ran;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

/**
 * The migrations not yet applied, in order. It only reads, so a database role
 * that cannot change the schema can run it.
 */
export async function pendingMigrations(db: Db, directory: string = MIGRATIONS): Promise<string[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  let applied: Set<string>;
  try {
    const done = await db.query<{ name: string }>('select name from schema_migrations');
    applied = new Set(done.rows.map((row) => row.name));
  } catch (error) {
    // 42P01: the table is not there, so nothing has been applied yet.
    if ((error as { code?: unknown }).code !== '42P01') throw error;
    applied = new Set();
  }
  return files.filter((file) => !applied.has(file));
}
