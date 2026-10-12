import pg from 'pg';

export type Db = pg.Pool;

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/** A connection pool. `schema` confines every query to one Postgres schema; tests use it. */
export function createPool(databaseUrl: string, schema?: string): Db {
  if (schema !== undefined && !SCHEMA_NAME.test(schema)) {
    throw new Error('Invalid schema name');
  }
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    ...(schema === undefined ? {} : { options: `-c search_path=${schema}` }),
  });
}
