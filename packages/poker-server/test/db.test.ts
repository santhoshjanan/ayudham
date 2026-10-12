import { describe, expect, it } from 'vitest';
import { createPool } from '../src/index.ts';
import { DATABASE_URL } from './services.ts';

describe('createPool', () => {
  it('survives its idle connections being terminated, as in a Postgres restart', async () => {
    const pool = createPool(DATABASE_URL);
    const admin = createPool(DATABASE_URL);
    try {
      const client = await pool.connect();
      const pid = (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]
        ?.pid;
      client.release();
      await admin.query('select pg_terminate_backend($1)', [pid]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect((await pool.query('select 1 as ok')).rows).toEqual([{ ok: 1 }]);
    } finally {
      await pool.end();
      await admin.end();
    }
  });

  it('bounds how long a statement or an idle transaction may run', async () => {
    const pool = createPool(DATABASE_URL);
    try {
      const statement = await pool.query<{ statement_timeout: string }>('show statement_timeout');
      const idle = await pool.query<{ idle_in_transaction_session_timeout: string }>(
        'show idle_in_transaction_session_timeout',
      );
      expect(statement.rows[0]?.statement_timeout).toBe('10s');
      expect(idle.rows[0]?.idle_in_transaction_session_timeout).toBe('10s');
    } finally {
      await pool.end();
    }
  });

  it('rejects a schema name that is not a plain identifier', () => {
    expect(() => createPool(DATABASE_URL, 'x; drop schema public')).toThrow('Invalid schema name');
  });
});
