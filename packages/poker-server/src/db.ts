import pg from 'pg';

export type Db = pg.Pool;

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/** A connection pool. `schema` confines every query to one Postgres schema; tests use it. */
export function createPool(databaseUrl: string, schema?: string): Db {
  if (schema !== undefined && !SCHEMA_NAME.test(schema)) {
    throw new Error('Invalid schema name');
  }
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // Fail fast instead of queueing without limit while Postgres is down.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 10_000,
    ...(schema === undefined ? {} : { options: `-c search_path=${schema}` }),
  });
  // An idle connection dropped by Postgres (restart, failover) emits 'error' on the pool.
  // Without a listener that is an uncaught exception; the pool replaces the connection itself.
  pool.on('error', () => undefined);
  return pool;
}
