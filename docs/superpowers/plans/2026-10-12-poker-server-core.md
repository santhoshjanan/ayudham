# Planning Poker Server Core (Plan 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side core that runs a room: secrets, the Postgres schema and data access, Valkey rate limits and room locks, the room host that drives the engine, and the socket handler — all without any web framework.

**Architecture:** A new package, `packages/poker-server`, holds everything that touches Postgres, Valkey, the clock or a socket. Each live room is one `RoomHost` that owns the engine state, sends each connection its own snapshot, and carries out the engine's effects. A `RoomRegistry` loads hosts under a Valkey lock and unloads idle ones. Sockets and storage are reached through small interfaces, so the host is tested with in-memory fakes and the data access against real services.

**Tech Stack:** Node 24+, TypeScript 7, `pg` 8.23, `iovalkey` 0.4, `@node-rs/argon2` 2.2, Zod 4.6.5, Vitest 5.0.3, Postgres 18 and Valkey 9 from `compose.yaml`.

**Spec:** `docs/superpowers/specs/2026-10-12-planning-poker-design.md`.

## Where this plan sits

| Plan | Delivers | Status |
|---|---|---|
| 1. Core | Protocol and room engine | Done, on `main` |
| **2. Server core (this plan)** | `packages/poker-server` | This plan |
| 3. Web app and release | SvelteKit 3 app: custom Node entry with `ws`, cookies and sessions, create/join/recover/settings/history flows, CSP and headers, retention schedule, logging; then the Impeccable interface in both themes, audio, Playwright, Dockerfile, deployment notes, Octopus security audit | Written after this plan lands; likely split in two when written |

Why SvelteKit is not in this plan: SvelteKit 3 moved configuration into `vite.config`, replaced `$lib` with `#lib`, and has no built-in WebSocket support in its Node adapter docs (checked 2026-10-12). Keeping the server core framework-free means none of that can affect it, and Plan 3 becomes a thin shell over tested code.

## Global Constraints

- All of Plan 1's constraints still apply: Node `>=24`, pnpm only, TypeScript `strict` with `erasableSyntaxOnly` (no enums, no parameter properties), relative imports end in `.ts`, immutable engine state.
- Work happens on branch `feat/poker-server-core`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests need the development services: run `docker compose up -d --wait` first. Tests read `TEST_DATABASE_URL` (default `postgres://pokerji:pokerji_dev@127.0.0.1:5432/pokerji`) and `TEST_VALKEY_URL` (default `redis://:pokerji_dev@127.0.0.1:6379`).
- Every database test file works in its own throwaway Postgres schema; every Valkey test file uses its own random key prefix. Tests never touch the `public` schema or the `pokerji:` prefix.
- SQL is always parameterised. Never build SQL from input by string concatenation. The one interpolated identifier (the test schema name) is validated against `^[a-z_][a-z0-9_]*$`.
- Secrets are stored only as hashes: SHA-256 for random tokens, Argon2id for passcodes. Compare hashes in constant time.
- Nothing in this package logs or reports room codes, display names, story titles, vote values, tokens or client addresses. The `report` callback receives fixed strings only.
- Client addresses are used only through `addressKey`, an HMAC with a server secret. They are never stored in Postgres.
- Valkey holds rate-limit counters and room locks only. No names, titles or votes.
- When Valkey cannot be reached, rate-limit checks refuse (fail closed). Rooms already live keep running.
- Do not add `minimumReleaseAgeExclude` entries to install a just-published dependency; pin the previous release.
- `pg`, `iovalkey` and `@node-rs/argon2` are written here from their documented APIs. If a call does not exist as written, check that package's current documentation and use the equivalent; record the change as a ruling.

Carried over from the Plan 1 review as requirements on this package:

- A participant's `disconnect` is sent to the engine only when their last connection closes.
- A message the engine refuses (`forbidden`) is not counted as abuse; only unparseable or over-rate messages are.
- A round that failed to save is kept and retried; a later round must not displace it.
- The engine's `roundSeq` is not a durable key. Saved rounds get their own generated id.
- The host ticks at least every 250 ms.

## Review Focus

1. Postgres is down when a round is revealed, and a second round is revealed before it recovers: both rounds are saved, in order, once it does. (Task 5)
2. A session is deleted between a reveal and its save: the round is still saved, with the voter's name and no session link. (Task 3)
3. Valkey is unreachable: the rate limiter refuses. (Task 4)
4. One person has the room open in two tabs and closes one: they are still shown as present. (Task 5)
5. A room's lock is taken by another owner: the registry closes that room's connections instead of running two authorities. (Task 6)

## File Structure

```
packages/poker-server/
  package.json  tsconfig.json  vitest.config.ts
  migrations/001_init.sql        tables: rooms, sessions, rounds, votes
  src/config.ts                  environment parsing
  src/secrets.ts                 room codes, tokens, hashes, passcodes, address keys
  src/db.ts                      connection pool
  src/migrate.ts                 migration runner
  src/rooms.ts                   room rows
  src/sessions.ts                session rows
  src/history.ts                 saved rounds and votes
  src/kv.ts                      Valkey client
  src/limiter.ts                 rate limits
  src/lock.ts                    per-room lock
  src/host.ts                    RoomHost: one live room
  src/registry.ts                RoomRegistry: loading and unloading hosts
  src/socket.ts                  attachSocket: one connection
  src/index.ts                   re-exports
  test/services.ts               throwaway schema and key-prefix helpers
  test/fakes.ts                  in-memory store, connection, clock
  test/*.test.ts                 one per source file
```

---

### Task 1: Package shell, configuration and secrets

**Files:**
- Create: `packages/poker-server/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/poker-server/src/config.ts`, `src/secrets.ts`, `src/index.ts`
- Test: `packages/poker-server/test/config.test.ts`, `test/secrets.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, from `@pokerji/poker-server`:
  - `interface Config { databaseUrl: string; valkeyUrl: string; addressHmacSecret: string; retentionDays: number }`
  - `loadConfig(env: Record<string, string | undefined>): Config` — throws an `Error` naming the invalid variables, never their values.
  - `ROOM_CODE_LENGTH = 12`, `newRoomCode(): string`, `newToken(): string`, `hashToken(token: string): string`, `tokenMatches(token: string, expectedHash: string): boolean`
  - `addressKey(secret: string, address: string): string`
  - `hashPasscode(passcode: string): Promise<string>`, `passcodeMatches(passcode: string, stored: string): Promise<boolean>`

- [ ] **Step 1: Branch and create the package shell**

```bash
git switch -c feat/poker-server-core
mkdir -p packages/poker-server/src packages/poker-server/test packages/poker-server/migrations
```

`packages/poker-server/package.json`:

```json
{
  "name": "@pokerji/poker-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@node-rs/argon2": "^2.2.1",
    "@pokerji/poker-engine": "workspace:*",
    "@pokerji/protocol": "workspace:*",
    "iovalkey": "^0.4.0",
    "pg": "^8.23.1",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/pg": "^8.23.1"
  }
}
```

`packages/poker-server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

`packages/poker-server/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@pokerji/protocol': source('../protocol/src/index.ts'),
      '@pokerji/poker-engine': source('../poker-engine/src/index.ts'),
    },
  },
  test: { testTimeout: 15_000 },
});
```

`packages/poker-server/src/index.ts`:

```ts
export * from './config.ts';
export * from './secrets.ts';
```

Then:

```bash
pnpm install
```

Expected: install completes. If pnpm reports that it added `minimumReleaseAgeExclude` entries, remove them from `pnpm-workspace.yaml`, pin the named package to its previous release, and reinstall.

- [ ] **Step 2: Write the failing tests**

`packages/poker-server/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/index.ts';

const valid = {
  DATABASE_URL: 'postgres://app:pw@db:5432/pokerji',
  VALKEY_URL: 'redis://app:pw@valkey:6379',
  ADDRESS_HMAC_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('reads the environment and defaults retention to 30 days', () => {
    expect(loadConfig(valid)).toEqual({
      databaseUrl: valid.DATABASE_URL,
      valkeyUrl: valid.VALKEY_URL,
      addressHmacSecret: valid.ADDRESS_HMAC_SECRET,
      retentionDays: 30,
    });
  });

  it('accepts a retention override', () => {
    expect(loadConfig({ ...valid, RETENTION_DAYS: '7' }).retentionDays).toBe(7);
  });

  it('names every missing or invalid variable', () => {
    expect(() => loadConfig({ VALKEY_URL: 'not a url', RETENTION_DAYS: '0' })).toThrow(
      /DATABASE_URL.*VALKEY_URL.*ADDRESS_HMAC_SECRET.*RETENTION_DAYS/s,
    );
  });

  it('rejects a short HMAC secret without echoing it', () => {
    const attempt = () => loadConfig({ ...valid, ADDRESS_HMAC_SECRET: 'too-short-secret' });
    expect(attempt).toThrow(/ADDRESS_HMAC_SECRET/);
    expect(attempt).not.toThrow(/too-short-secret/);
  });
});
```

`packages/poker-server/test/secrets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addressKey,
  hashPasscode,
  hashToken,
  newRoomCode,
  newToken,
  passcodeMatches,
  ROOM_CODE_LENGTH,
  tokenMatches,
} from '../src/index.ts';

describe('room codes', () => {
  it('are 12 letters and digits', () => {
    expect(ROOM_CODE_LENGTH).toBe(12);
    for (let i = 0; i < 200; i += 1) expect(newRoomCode()).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it('do not repeat', () => {
    const codes = new Set(Array.from({ length: 2_000 }, newRoomCode));
    expect(codes.size).toBe(2_000);
  });
});

describe('tokens', () => {
  it('are 256 random bits, URL-safe, and do not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, newToken));
    expect(tokens.size).toBe(500);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hash to 64 hex characters, the same every time', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('match only their own hash', () => {
    const token = newToken();
    expect(tokenMatches(token, hashToken(token))).toBe(true);
    expect(tokenMatches(newToken(), hashToken(token))).toBe(false);
    expect(tokenMatches(token, 'not-a-hash')).toBe(false);
    expect(tokenMatches(token, '')).toBe(false);
  });
});

describe('addressKey', () => {
  it('is stable for one secret, different for another, and does not contain the address', () => {
    const key = addressKey('secret-one', '203.0.113.9');
    expect(key).toBe(addressKey('secret-one', '203.0.113.9'));
    expect(key).not.toBe(addressKey('secret-two', '203.0.113.9'));
    expect(key).not.toBe(addressKey('secret-one', '203.0.113.10'));
    expect(key).not.toContain('203.0.113.9');
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe('passcodes', () => {
  it('are stored as Argon2id hashes that verify', async () => {
    const stored = await hashPasscode('correct horse');
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).not.toContain('correct horse');
    expect(await passcodeMatches('correct horse', stored)).toBe(true);
    expect(await passcodeMatches('wrong horse', stored)).toBe(false);
  });

  it('do not match a stored value that is not a hash', async () => {
    expect(await passcodeMatches('anything', 'not-a-hash')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL, because `./config.ts` does not exist.

- [ ] **Step 4: Implement configuration and secrets**

`packages/poker-server/src/config.ts`:

```ts
import { z } from 'zod';

const url = z.string().refine((value) => URL.canParse(value));

const schema = z.object({
  DATABASE_URL: url,
  VALKEY_URL: url,
  ADDRESS_HMAC_SECRET: z.string().min(32),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export interface Config {
  databaseUrl: string;
  valkeyUrl: string;
  /** Keys the HMAC that turns a client address into a rate-limit key. */
  addressHmacSecret: string;
  retentionDays: number;
}

/** Reads configuration. The error names bad variables and never includes their values. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid or missing configuration: ${names.join(', ')}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    valkeyUrl: parsed.data.VALKEY_URL,
    addressHmacSecret: parsed.data.ADDRESS_HMAC_SECRET,
    retentionDays: parsed.data.RETENTION_DAYS,
  };
}
```

`packages/poker-server/src/secrets.ts`:

```ts
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const ROOM_CODE_LENGTH = 12;

/** A room's public link code: 12 characters, about 71 bits, from the system CSPRNG. */
export function newRoomCode(): string {
  return Array.from(
    { length: ROOM_CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
}

/** A 256-bit secret for a session cookie or a moderator recovery link. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are high-entropy, so a plain SHA-256 is the right storage hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Turns a client address into an opaque rate-limit key. The address itself is never stored. */
export function addressKey(secret: string, address: string): string {
  return createHmac('sha256', secret).update(address).digest('base64url').slice(0, 22);
}

/** Passcodes are chosen by people, so they get a slow, salted hash: Argon2id. */
export function hashPasscode(passcode: string): Promise<string> {
  return hash(passcode);
}

export async function passcodeMatches(passcode: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, passcode);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors. If the Argon2id prefix test fails because the library's default algorithm differs, pass the library's documented option for Argon2id to `hash` and record a ruling.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add server package with configuration and secrets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database schema and migrations

**Files:**
- Create: `packages/poker-server/migrations/001_init.sql`
- Create: `packages/poker-server/src/db.ts`, `src/migrate.ts`
- Modify: `packages/poker-server/src/index.ts`
- Create: `packages/poker-server/test/services.ts`
- Test: `packages/poker-server/test/migrate.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `type Db = pg.Pool`, `createPool(databaseUrl: string, schema?: string): Db`
  - `migrate(db: Db, directory?: string): Promise<string[]>` — returns the file names it applied.
  - Tables `rooms`, `sessions`, `rounds`, `votes`, `schema_migrations` (columns in Step 3).
  - Test helper `testDb(): Promise<{ db: Db; drop: () => Promise<void> }>` in `test/services.ts`.

- [ ] **Step 1: Write the test helper**

`packages/poker-server/test/services.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { createPool, migrate, type Db } from '../src/index.ts';

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://pokerji:pokerji_dev@127.0.0.1:5432/pokerji';

export const VALKEY_URL = process.env.TEST_VALKEY_URL ?? 'redis://:pokerji_dev@127.0.0.1:6379';

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
```

- [ ] **Step 2: Write the failing tests**

`packages/poker-server/test/migrate.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../src/index.ts';
import { testDb } from './services.ts';

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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL, because `createPool` and `migrate` are not exported. Tests from Task 1 still pass.

- [ ] **Step 4: Write the schema**

`packages/poker-server/migrations/001_init.sql`:

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  deck jsonb not null,
  timer_seconds integer,
  music text,
  passcode_hash text,
  recovery_hash text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index rooms_last_active_at on rooms (last_active_at);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  token_hash text not null unique,
  name text not null,
  role text not null check (role in ('voter', 'spectator')),
  moderator boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index sessions_room_id on sessions (room_id);

create table rounds (
  id uuid primary key,
  room_id uuid not null references rooms (id) on delete cascade,
  title text not null,
  revealed_at timestamptz not null default now()
);

create index rounds_room_id_revealed_at on rounds (room_id, revealed_at desc);

-- voter_name is a copy, so history survives the session being removed.
-- Clearing it is how a participant removes their name from history.
create table votes (
  round_id uuid not null references rounds (id) on delete cascade,
  position integer not null,
  session_id uuid references sessions (id) on delete set null,
  voter_name text,
  card text not null,
  primary key (round_id, position)
);

create index votes_session_id on votes (session_id);
```

- [ ] **Step 5: Implement the pool and the migration runner**

`packages/poker-server/src/db.ts`:

```ts
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
```

`packages/poker-server/src/migrate.ts`:

```ts
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
```

Replace `packages/poker-server/src/index.ts` with:

```ts
export * from './config.ts';
export * from './db.ts';
export * from './migrate.ts';
export * from './secrets.ts';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors. A connection error means the development services are not running: `docker compose up -d --wait`.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add database schema and migration runner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Data access for rooms, sessions and history

**Files:**
- Create: `packages/poker-server/src/rooms.ts`, `src/sessions.ts`, `src/history.ts`
- Modify: `packages/poker-server/src/index.ts`
- Test: `packages/poker-server/test/rooms.test.ts`, `test/sessions.test.ts`, `test/history.test.ts`

**Interfaces:**
- Consumes: `type Db`, `testDb()`; `type Deck`, `type Role`, `BUILT_IN_DECKS` from `@pokerji/protocol`; `type RoomSettings` from `@pokerji/poker-engine`.
- Produces:
  - `interface RoomRow { id: string; code: string; deck: Deck; timerSeconds: number | null; music: string | null; passcodeHash: string | null; recoveryHash: string; lastActiveAt: Date }`
  - `insertRoom(db, room: { code: string; deck: Deck; recoveryHash: string }): Promise<RoomRow>`
  - `findRoomByCode(db, code: string): Promise<RoomRow | null>`
  - `updateRoomSettings(db, id: string, settings: RoomSettings): Promise<void>`
  - `setPasscodeHash(db, id: string, hash: string | null): Promise<void>`
  - `setRecoveryHash(db, id: string, hash: string): Promise<void>`
  - `touchRoom(db, id: string): Promise<void>`, `deleteRoom(db, id: string): Promise<void>`
  - `deleteInactiveRooms(db, olderThanDays: number): Promise<number>`
  - `interface SessionRow { id: string; roomId: string; name: string; role: Role; moderator: boolean }`
  - `insertSession(db, session: { roomId: string; tokenHash: string; name: string; role: Role; moderator: boolean }): Promise<SessionRow>`
  - `findSession(db, roomId: string, tokenHash: string): Promise<SessionRow | null>`
  - `setSessionRole(db, id, role)`, `setSessionModerator(db, id)`, `deleteSession(db, id)`: all `Promise<void>`
  - `deleteNonModeratorSessions(db, roomId: string): Promise<string[]>` — returns the deleted ids.
  - `countSessions(db, roomId: string): Promise<number>`
  - `interface RoundToSave { id: string; title: string; votes: { sessionId: string; name: string; card: string }[] }`
  - `interface SavedRound { id: string; title: string; revealedAt: Date; votes: { sessionId: string | null; name: string | null; card: string }[] }`
  - `saveRound(db, roomId: string, round: RoundToSave): Promise<void>` — safe to call twice with the same round id.
  - `listRounds(db, roomId: string): Promise<SavedRound[]>` — newest first.
  - `deleteRound(db, roomId: string, roundId: string): Promise<boolean>`, `clearHistory(db, roomId: string): Promise<number>`, `anonymiseSession(db, sessionId: string): Promise<number>`

- [ ] **Step 1: Write the failing room tests**

`packages/poker-server/test/rooms.test.ts`:

```ts
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deleteInactiveRooms,
  deleteRoom,
  findRoomByCode,
  insertRoom,
  setPasscodeHash,
  setRecoveryHash,
  touchRoom,
  updateRoomSettings,
  type Db,
} from '../src/index.ts';
import { testDb } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(() => drop());

const FIB = BUILT_IN_DECKS.fibonacci.deck;
const TEE = BUILT_IN_DECKS.tshirt.deck;
let n = 0;
const make = () => insertRoom(db, { code: `room${(n += 1)}`, deck: FIB, recoveryHash: 'rh' });

describe('rooms', () => {
  it('inserts a room with defaults and finds it by code', async () => {
    const room = await make();
    expect(room).toMatchObject({
      deck: FIB,
      timerSeconds: null,
      music: null,
      passcodeHash: null,
      recoveryHash: 'rh',
    });
    expect(room.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await findRoomByCode(db, room.code)).toEqual(room);
  });

  it('returns null for an unknown code', async () => {
    expect(await findRoomByCode(db, 'nope')).toBeNull();
  });

  it('treats codes as case-sensitive', async () => {
    const room = await make();
    expect(await findRoomByCode(db, room.code.toUpperCase())).toBeNull();
  });

  it('updates settings, passcode and recovery hash', async () => {
    const room = await make();
    await updateRoomSettings(db, room.id, { deck: TEE, timerSeconds: 90, music: 'nocturne' });
    await setPasscodeHash(db, room.id, 'ph');
    await setRecoveryHash(db, room.id, 'rh2');
    expect(await findRoomByCode(db, room.code)).toMatchObject({
      deck: TEE,
      timerSeconds: 90,
      music: 'nocturne',
      passcodeHash: 'ph',
      recoveryHash: 'rh2',
    });
    await setPasscodeHash(db, room.id, null);
    expect((await findRoomByCode(db, room.code))?.passcodeHash).toBeNull();
  });

  it('deletes a room', async () => {
    const room = await make();
    await deleteRoom(db, room.id);
    expect(await findRoomByCode(db, room.code)).toBeNull();
  });

  it('deletes only rooms inactive for longer than the retention period', async () => {
    const stale = await make();
    const fresh = await make();
    const revived = await make();
    await db.query(
      `update rooms set last_active_at = now() - interval '31 days' where id = any($1::uuid[])`,
      [[stale.id, revived.id]],
    );
    await touchRoom(db, revived.id);
    expect(await deleteInactiveRooms(db, 30)).toBe(1);
    expect(await findRoomByCode(db, stale.code)).toBeNull();
    expect(await findRoomByCode(db, fresh.code)).not.toBeNull();
    expect(await findRoomByCode(db, revived.code)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing session tests**

`packages/poker-server/test/sessions.test.ts`:

```ts
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countSessions,
  deleteNonModeratorSessions,
  deleteSession,
  findSession,
  insertRoom,
  insertSession,
  setSessionModerator,
  setSessionRole,
  type Db,
} from '../src/index.ts';
import { testDb } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(() => drop());

let n = 0;
const room = () =>
  insertRoom(db, {
    code: `room${(n += 1)}`,
    deck: BUILT_IN_DECKS.fibonacci.deck,
    recoveryHash: 'rh',
  });
const session = (roomId: string, moderator = false) =>
  insertSession(db, {
    roomId,
    tokenHash: `hash${(n += 1)}`,
    name: 'Ann',
    role: 'voter',
    moderator,
  });

describe('sessions', () => {
  it('inserts a session and finds it by room and token hash', async () => {
    const { id: roomId } = await room();
    const created = await insertSession(db, {
      roomId,
      tokenHash: 'th-1',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    expect(created).toEqual({
      id: created.id,
      roomId,
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    expect(await findSession(db, roomId, 'th-1')).toEqual(created);
  });

  it('does not find a session through another room or a wrong hash', async () => {
    const { id: roomId } = await room();
    const { id: otherRoomId } = await room();
    await insertSession(db, {
      roomId,
      tokenHash: 'th-2',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    expect(await findSession(db, otherRoomId, 'th-2')).toBeNull();
    expect(await findSession(db, roomId, 'th-wrong')).toBeNull();
  });

  it('changes role and moderator flag', async () => {
    const { id: roomId } = await room();
    const created = await insertSession(db, {
      roomId,
      tokenHash: 'th-3',
      name: 'Ann',
      role: 'voter',
      moderator: false,
    });
    await setSessionRole(db, created.id, 'spectator');
    await setSessionModerator(db, created.id);
    expect(await findSession(db, roomId, 'th-3')).toMatchObject({
      role: 'spectator',
      moderator: true,
    });
  });

  it('deletes one session', async () => {
    const { id: roomId } = await room();
    const created = await session(roomId);
    await deleteSession(db, created.id);
    expect(await countSessions(db, roomId)).toBe(0);
  });

  it('deletes everyone but moderators and reports who went', async () => {
    const { id: roomId } = await room();
    const moderator = await session(roomId, true);
    const first = await session(roomId);
    const second = await session(roomId);
    const removed = await deleteNonModeratorSessions(db, roomId);
    expect(removed.sort()).toEqual([first.id, second.id].sort());
    expect(await countSessions(db, roomId)).toBe(1);
    expect(removed).not.toContain(moderator.id);
  });
});
```

- [ ] **Step 3: Write the failing history tests**

`packages/poker-server/test/history.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymiseSession,
  clearHistory,
  deleteRound,
  deleteSession,
  findRoomByCode,
  insertRoom,
  insertSession,
  listRounds,
  saveRound,
  type Db,
} from '../src/index.ts';
import { testDb } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(() => drop());

let n = 0;
async function setup() {
  const room = await insertRoom(db, {
    code: `room${(n += 1)}`,
    deck: BUILT_IN_DECKS.fibonacci.deck,
    recoveryHash: 'rh',
  });
  const person = (name: string) =>
    insertSession(db, {
      roomId: room.id,
      tokenHash: `hash${(n += 1)}`,
      name,
      role: 'voter',
      moderator: false,
    });
  return { room, ann: await person('Ann'), bo: await person('Bo') };
}

describe('history', () => {
  it('saves a round with its votes in order and lists newest first', async () => {
    const { room, ann, bo } = await setup();
    const first = randomUUID();
    const second = randomUUID();
    await saveRound(db, room.id, {
      id: first,
      title: 'PROJ-1',
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    await saveRound(db, room.id, {
      id: second,
      title: 'PROJ-2',
      votes: [{ sessionId: bo.id, name: 'Bo', card: '5' }],
    });
    const rounds = await listRounds(db, room.id);
    expect(rounds.map((round) => round.title)).toEqual(['PROJ-2', 'PROJ-1']);
    expect(rounds[1]).toMatchObject({
      id: first,
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    expect(rounds[1]?.revealedAt).toBeInstanceOf(Date);
  });

  it('saves a round only once when asked twice', async () => {
    const { room, ann } = await setup();
    const round = {
      id: randomUUID(),
      title: 'PROJ-1',
      votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
    };
    await saveRound(db, room.id, round);
    await saveRound(db, room.id, round);
    const rounds = await listRounds(db, room.id);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.votes).toHaveLength(1);
  });

  it('still saves a vote whose session was deleted before the save', async () => {
    const { room, ann, bo } = await setup();
    await deleteSession(db, ann.id);
    await saveRound(db, room.id, {
      id: randomUUID(),
      title: 'PROJ-1',
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    expect((await listRounds(db, room.id))[0]?.votes).toEqual([
      { sessionId: null, name: 'Ann', card: '3' },
      { sessionId: bo.id, name: 'Bo', card: '8' },
    ]);
  });

  it('counts saving a round as room activity', async () => {
    const { room, ann } = await setup();
    await db.query(`update rooms set last_active_at = now() - interval '5 days' where id = $1`, [
      room.id,
    ]);
    await saveRound(db, room.id, {
      id: randomUUID(),
      title: 'T',
      votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
    });
    const reloaded = await findRoomByCode(db, room.code);
    expect(Date.now() - (reloaded?.lastActiveAt.getTime() ?? 0)).toBeLessThan(60_000);
  });

  it('returns an empty list for a room with no rounds', async () => {
    const { room } = await setup();
    expect(await listRounds(db, room.id)).toEqual([]);
  });

  it('deletes one round, but only through its own room', async () => {
    const { room, ann } = await setup();
    const other = await setup();
    const id = randomUUID();
    await saveRound(db, room.id, {
      id,
      title: 'T',
      votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
    });
    expect(await deleteRound(db, other.room.id, id)).toBe(false);
    expect(await listRounds(db, room.id)).toHaveLength(1);
    expect(await deleteRound(db, room.id, id)).toBe(true);
    expect(await listRounds(db, room.id)).toEqual([]);
  });

  it('clears all history for a room', async () => {
    const { room, ann } = await setup();
    for (const title of ['A', 'B']) {
      await saveRound(db, room.id, {
        id: randomUUID(),
        title,
        votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
      });
    }
    expect(await clearHistory(db, room.id)).toBe(2);
    expect(await listRounds(db, room.id)).toEqual([]);
  });

  it('removes one person’s name from their votes and leaves others alone', async () => {
    const { room, ann, bo } = await setup();
    await saveRound(db, room.id, {
      id: randomUUID(),
      title: 'T',
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    expect(await anonymiseSession(db, ann.id)).toBe(1);
    expect((await listRounds(db, room.id))[0]?.votes).toEqual([
      { sessionId: ann.id, name: null, card: '3' },
      { sessionId: bo.id, name: 'Bo', card: '8' },
    ]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in the three new files, because the functions are not exported.

- [ ] **Step 5: Implement rooms and sessions**

`packages/poker-server/src/rooms.ts`:

```ts
import type { RoomSettings } from '@pokerji/poker-engine';
import type { Deck } from '@pokerji/protocol';
import type { Db } from './db.ts';

export interface RoomRow {
  id: string;
  code: string;
  deck: Deck;
  timerSeconds: number | null;
  music: string | null;
  passcodeHash: string | null;
  recoveryHash: string;
  lastActiveAt: Date;
}

const COLUMNS = `id, code, deck, timer_seconds as "timerSeconds", music,
  passcode_hash as "passcodeHash", recovery_hash as "recoveryHash",
  last_active_at as "lastActiveAt"`;

export async function insertRoom(
  db: Db,
  room: { code: string; deck: Deck; recoveryHash: string },
): Promise<RoomRow> {
  const result = await db.query<RoomRow>(
    `insert into rooms (code, deck, recovery_hash) values ($1, $2::jsonb, $3) returning ${COLUMNS}`,
    [room.code, JSON.stringify(room.deck), room.recoveryHash],
  );
  return result.rows[0] as RoomRow;
}

export async function findRoomByCode(db: Db, code: string): Promise<RoomRow | null> {
  const result = await db.query<RoomRow>(`select ${COLUMNS} from rooms where code = $1`, [code]);
  return result.rows[0] ?? null;
}

export async function updateRoomSettings(
  db: Db,
  id: string,
  settings: RoomSettings,
): Promise<void> {
  await db.query(
    `update rooms set deck = $2::jsonb, timer_seconds = $3, music = $4, last_active_at = now()
     where id = $1`,
    [id, JSON.stringify(settings.deck), settings.timerSeconds, settings.music],
  );
}

export async function setPasscodeHash(db: Db, id: string, hash: string | null): Promise<void> {
  await db.query('update rooms set passcode_hash = $2 where id = $1', [id, hash]);
}

export async function setRecoveryHash(db: Db, id: string, hash: string): Promise<void> {
  await db.query('update rooms set recovery_hash = $2 where id = $1', [id, hash]);
}

export async function touchRoom(db: Db, id: string): Promise<void> {
  await db.query('update rooms set last_active_at = now() where id = $1', [id]);
}

export async function deleteRoom(db: Db, id: string): Promise<void> {
  await db.query('delete from rooms where id = $1', [id]);
}

/** The retention job: removes rooms, and everything under them, unused for too long. */
export async function deleteInactiveRooms(db: Db, olderThanDays: number): Promise<number> {
  const result = await db.query(
    'delete from rooms where last_active_at < now() - make_interval(days => $1)',
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}
```

`packages/poker-server/src/sessions.ts`:

```ts
import type { Role } from '@pokerji/protocol';
import type { Db } from './db.ts';

export interface SessionRow {
  id: string;
  roomId: string;
  name: string;
  role: Role;
  moderator: boolean;
}

const COLUMNS = `id, room_id as "roomId", name, role, moderator`;

export async function insertSession(
  db: Db,
  session: { roomId: string; tokenHash: string; name: string; role: Role; moderator: boolean },
): Promise<SessionRow> {
  const result = await db.query<SessionRow>(
    `insert into sessions (room_id, token_hash, name, role, moderator)
     values ($1, $2, $3, $4, $5) returning ${COLUMNS}`,
    [session.roomId, session.tokenHash, session.name, session.role, session.moderator],
  );
  return result.rows[0] as SessionRow;
}

/** Looks a session up by its token hash, within one room, and records that it was seen. */
export async function findSession(
  db: Db,
  roomId: string,
  tokenHash: string,
): Promise<SessionRow | null> {
  const result = await db.query<SessionRow>(
    `update sessions set last_seen_at = now()
     where room_id = $1 and token_hash = $2 returning ${COLUMNS}`,
    [roomId, tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function setSessionRole(db: Db, id: string, role: Role): Promise<void> {
  await db.query('update sessions set role = $2 where id = $1', [id, role]);
}

export async function setSessionModerator(db: Db, id: string): Promise<void> {
  await db.query('update sessions set moderator = true where id = $1', [id]);
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.query('delete from sessions where id = $1', [id]);
}

/** Signs out everyone except moderators. Used when a passcode is set or changed. */
export async function deleteNonModeratorSessions(db: Db, roomId: string): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    'delete from sessions where room_id = $1 and not moderator returning id',
    [roomId],
  );
  return result.rows.map((row) => row.id);
}

export async function countSessions(db: Db, roomId: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    'select count(*)::int as count from sessions where room_id = $1',
    [roomId],
  );
  return result.rows[0]?.count ?? 0;
}
```

- [ ] **Step 6: Implement history**

`packages/poker-server/src/history.ts`:

```ts
import type { Db } from './db.ts';

export interface RoundToSave {
  /** Generated by the caller, so a retried save cannot store the round twice. */
  id: string;
  title: string;
  votes: { sessionId: string; name: string; card: string }[];
}

export interface SavedRound {
  id: string;
  title: string;
  revealedAt: Date;
  votes: { sessionId: string | null; name: string | null; card: string }[];
}

export async function saveRound(db: Db, roomId: string, round: RoundToSave): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const inserted = await client.query(
      'insert into rounds (id, room_id, title) values ($1, $2, $3) on conflict (id) do nothing',
      [round.id, roomId, round.title],
    );
    if (inserted.rowCount === 1) {
      // The left join drops the link, not the vote, if a session has gone since the reveal.
      await client.query(
        `insert into votes (round_id, position, session_id, voter_name, card)
         select $1, v.position, s.id, v.name, v.card
         from unnest($2::uuid[], $3::text[], $4::text[])
           with ordinality as v(session_id, name, card, position)
         left join sessions s on s.id = v.session_id`,
        [
          round.id,
          round.votes.map((vote) => vote.sessionId),
          round.votes.map((vote) => vote.name),
          round.votes.map((vote) => vote.card),
        ],
      );
      await client.query('update rooms set last_active_at = now() where id = $1', [roomId]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listRounds(db: Db, roomId: string): Promise<SavedRound[]> {
  const result = await db.query<SavedRound>(
    `select r.id, r.title, r.revealed_at as "revealedAt",
       coalesce(
         json_agg(
           json_build_object('sessionId', v.session_id, 'name', v.voter_name, 'card', v.card)
           order by v.position
         ) filter (where v.round_id is not null),
         '[]'::json
       ) as votes
     from rounds r
     left join votes v on v.round_id = r.id
     where r.room_id = $1
     group by r.id
     order by r.revealed_at desc, r.id`,
    [roomId],
  );
  return result.rows;
}

export async function deleteRound(db: Db, roomId: string, roundId: string): Promise<boolean> {
  const result = await db.query('delete from rounds where id = $1 and room_id = $2', [
    roundId,
    roomId,
  ]);
  return result.rowCount === 1;
}

export async function clearHistory(db: Db, roomId: string): Promise<number> {
  const result = await db.query('delete from rounds where room_id = $1', [roomId]);
  return result.rowCount ?? 0;
}

/** "Remove my name from history": the votes stay, the name goes. */
export async function anonymiseSession(db: Db, sessionId: string): Promise<number> {
  const result = await db.query(
    'update votes set voter_name = null where session_id = $1 and voter_name is not null',
    [sessionId],
  );
  return result.rowCount ?? 0;
}
```

Replace `packages/poker-server/src/index.ts` with:

```ts
export * from './config.ts';
export * from './db.ts';
export * from './history.ts';
export * from './migrate.ts';
export * from './rooms.ts';
export * from './secrets.ts';
export * from './sessions.ts';
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add data access for rooms, sessions and history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rate limits and the room lock

**Files:**
- Create: `packages/poker-server/src/kv.ts`, `src/limiter.ts`, `src/lock.ts`
- Modify: `packages/poker-server/src/index.ts`
- Test: `packages/poker-server/test/limiter.test.ts`, `test/lock.test.ts`

**Interfaces:**
- Consumes: `VALKEY_URL`, `testPrefix()` from `test/services.ts`.
- Produces:
  - `type Kv` (the Valkey client), `createKv(url: string): Kv`
  - `KEY_PREFIX = 'pokerji:'`
  - `interface Limit { max: number; windowSeconds: number }`
  - `LIMITS = { roomCreate: {10, 3600}, join: {30, 600}, passcodeClient: {5, 600}, passcodeRoom: {50, 3600} }`
  - `withinLimit(kv: Kv, key: string, limit: Limit, prefix?: string): Promise<boolean>` — counts one attempt; `false` when over the limit or when Valkey cannot be reached.
  - `interface RoomLock { refresh(): Promise<boolean>; release(): Promise<void> }`
  - `acquireRoomLock(kv: Kv, roomId: string, owner: string, ttlMs?: number, prefix?: string): Promise<RoomLock | null>` — `null` when another owner holds it.

- [ ] **Step 1: Write the failing limiter tests**

`packages/poker-server/test/limiter.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { createKv, LIMITS, withinLimit } from '../src/index.ts';
import { testPrefix, VALKEY_URL } from './services.ts';

const kv = createKv(VALKEY_URL);
const prefix = testPrefix();
afterAll(() => kv.quit());

describe('withinLimit', () => {
  it('allows attempts up to the maximum, then refuses', async () => {
    const limit = { max: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await withinLimit(kv, 'k1', limit, prefix));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('counts each key separately', async () => {
    const limit = { max: 1, windowSeconds: 60 };
    expect(await withinLimit(kv, 'k2', limit, prefix)).toBe(true);
    expect(await withinLimit(kv, 'k3', limit, prefix)).toBe(true);
    expect(await withinLimit(kv, 'k2', limit, prefix)).toBe(false);
  });

  it('starts again when the window ends', async () => {
    const limit = { max: 1, windowSeconds: 1 };
    expect(await withinLimit(kv, 'k4', limit, prefix)).toBe(true);
    expect(await withinLimit(kv, 'k4', limit, prefix)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(await withinLimit(kv, 'k4', limit, prefix)).toBe(true);
  });

  it('stores only a counter that expires', async () => {
    await withinLimit(kv, 'k5', { max: 5, windowSeconds: 60 }, prefix);
    const key = `${prefix}rl:k5`;
    expect(await kv.get(key)).toBe('1');
    const ttl = await kv.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('refuses when Valkey cannot be reached', async () => {
    const unreachable = createKv('redis://127.0.0.1:1');
    try {
      expect(await withinLimit(unreachable, 'k6', { max: 100, windowSeconds: 60 }, prefix)).toBe(
        false,
      );
    } finally {
      unreachable.disconnect();
    }
  });

  it('carries the limits from the spec', () => {
    expect(LIMITS).toEqual({
      roomCreate: { max: 10, windowSeconds: 3_600 },
      join: { max: 30, windowSeconds: 600 },
      passcodeClient: { max: 5, windowSeconds: 600 },
      passcodeRoom: { max: 50, windowSeconds: 3_600 },
    });
  });
});
```

- [ ] **Step 2: Write the failing lock tests**

`packages/poker-server/test/lock.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { acquireRoomLock, createKv } from '../src/index.ts';
import { testPrefix, VALKEY_URL } from './services.ts';

const kv = createKv(VALKEY_URL);
const prefix = testPrefix();
afterAll(() => kv.quit());

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('acquireRoomLock', () => {
  it('gives the lock to one owner at a time', async () => {
    const mine = await acquireRoomLock(kv, 'r1', 'owner-a', 5_000, prefix);
    expect(mine).not.toBeNull();
    expect(await acquireRoomLock(kv, 'r1', 'owner-b', 5_000, prefix)).toBeNull();
    await mine?.release();
    expect(await acquireRoomLock(kv, 'r1', 'owner-b', 5_000, prefix)).not.toBeNull();
  });

  it('locks rooms independently', async () => {
    expect(await acquireRoomLock(kv, 'r2', 'owner-a', 5_000, prefix)).not.toBeNull();
    expect(await acquireRoomLock(kv, 'r3', 'owner-b', 5_000, prefix)).not.toBeNull();
  });

  it('keeps the lock alive while the owner refreshes it', async () => {
    const mine = await acquireRoomLock(kv, 'r4', 'owner-a', 300, prefix);
    await pause(200);
    expect(await mine?.refresh()).toBe(true);
    await pause(200);
    expect(await acquireRoomLock(kv, 'r4', 'owner-b', 300, prefix)).toBeNull();
  });

  it('lets the owner take back a lock that expired and nobody else took', async () => {
    const mine = await acquireRoomLock(kv, 'r5', 'owner-a', 100, prefix);
    await pause(200);
    expect(await mine?.refresh()).toBe(true);
    expect(await acquireRoomLock(kv, 'r5', 'owner-b', 5_000, prefix)).toBeNull();
  });

  it('tells the old owner when someone else has taken over, and protects the new lock', async () => {
    const old = await acquireRoomLock(kv, 'r6', 'owner-a', 100, prefix);
    await pause(200);
    const next = await acquireRoomLock(kv, 'r6', 'owner-b', 5_000, prefix);
    expect(next).not.toBeNull();
    expect(await old?.refresh()).toBe(false);
    await old?.release();
    expect(await acquireRoomLock(kv, 'r6', 'owner-c', 5_000, prefix)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in the two new files, because `createKv` is not exported.

- [ ] **Step 4: Implement the client, limiter and lock**

`packages/poker-server/src/kv.ts`:

```ts
import Valkey from 'iovalkey';

export type Kv = Valkey;

export const KEY_PREFIX = 'pokerji:';

/**
 * A Valkey client that gives up on a command after one retry, so callers find
 * out quickly when Valkey is down instead of queueing forever.
 */
export function createKv(url: string): Kv {
  const kv = new Valkey(url, { maxRetriesPerRequest: 1 });
  // Connection errors surface through failed commands; an unhandled 'error' event would crash.
  kv.on('error', () => undefined);
  return kv;
}
```

`packages/poker-server/src/limiter.ts`:

```ts
import { KEY_PREFIX, type Kv } from './kv.ts';

export interface Limit {
  max: number;
  windowSeconds: number;
}

/** Defaults from the spec. Keys are built by the caller from an addressKey and/or a room id. */
export const LIMITS = {
  roomCreate: { max: 10, windowSeconds: 3_600 },
  join: { max: 30, windowSeconds: 600 },
  passcodeClient: { max: 5, windowSeconds: 600 },
  passcodeRoom: { max: 50, windowSeconds: 3_600 },
} as const satisfies Record<string, Limit>;

const COUNT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

/**
 * Counts one attempt against a fixed window and says whether it is allowed.
 * Refuses when Valkey cannot be reached: a limit that cannot be checked is not a pass.
 */
export async function withinLimit(
  kv: Kv,
  key: string,
  limit: Limit,
  prefix: string = KEY_PREFIX,
): Promise<boolean> {
  try {
    const count = await kv.eval(COUNT, 1, `${prefix}rl:${key}`, limit.windowSeconds);
    return typeof count === 'number' && count <= limit.max;
  } catch {
    return false;
  }
}
```

`packages/poker-server/src/lock.ts`:

```ts
import { KEY_PREFIX, type Kv } from './kv.ts';

export interface RoomLock {
  /** Extends the lock. False means another owner now holds it and this one must stop. */
  refresh(): Promise<boolean>;
  release(): Promise<void>;
}

// Extends the lock if we hold it; takes it back if it expired and nobody else has it.
const REFRESH = `
local holder = redis.call('GET', KEYS[1])
if holder == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if not holder then redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
return 0`;

const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

/** Claims a room for one server instance. Returns null when another instance has it. */
export async function acquireRoomLock(
  kv: Kv,
  roomId: string,
  owner: string,
  ttlMs = 15_000,
  prefix: string = KEY_PREFIX,
): Promise<RoomLock | null> {
  const key = `${prefix}lock:${roomId}`;
  const taken = await kv.set(key, owner, 'PX', ttlMs, 'NX');
  if (taken !== 'OK') return null;
  return {
    refresh: async () => (await kv.eval(REFRESH, 1, key, owner, ttlMs)) === 1,
    release: async () => {
      await kv.eval(RELEASE, 1, key, owner);
    },
  };
}
```

Replace `packages/poker-server/src/index.ts` with:

```ts
export * from './config.ts';
export * from './db.ts';
export * from './history.ts';
export * from './kv.ts';
export * from './limiter.ts';
export * from './lock.ts';
export * from './migrate.ts';
export * from './rooms.ts';
export * from './secrets.ts';
export * from './sessions.ts';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors. If the "cannot be reached" test hangs instead of returning `false`, the client is retrying the connection without failing the command: consult the `iovalkey` options for failing fast and record a ruling.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add rate limiter and room lock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The room host

**Files:**
- Create: `packages/poker-server/src/host.ts`
- Modify: `packages/poker-server/src/index.ts`
- Create: `packages/poker-server/test/fakes.ts`
- Test: `packages/poker-server/test/host.test.ts`

**Interfaces:**
- Consumes: `apply`, `canChangeDeck`, `createRoom`, `snapshotFor`, types `Command`, `Effect`, `Joiner`, `RoomSettings`, `RoomState` from `@pokerji/poker-engine`; `ROOM_UNLOAD_MS`, types `ClientMessage`, `Role`, `ServerMessage` from `@pokerji/protocol`; `type RoundToSave` from `src/history.ts`.
- Produces:
  - `interface Connection { send(text: string): void; close(): void }`
  - `interface HostStore { saveRound(round: RoundToSave): Promise<void>; setRole(sessionId: string, role: Role): Promise<void>; setModerator(sessionId: string): Promise<void>; deleteSession(sessionId: string): Promise<void> }`
  - `interface HostDeps { store: HostStore; now: () => number; newId: () => string; report: (problem: string) => void }`
  - `class RoomHost` with `constructor(settings: RoomSettings, deps: HostDeps)` and methods `connect(joiner: Joiner, connection: Connection): void`, `disconnect(id: string, connection: Connection): void`, `receive(id: string, message: ClientMessage): void`, `applySettings(settings: RoomSettings): void`, `evict(ids: readonly string[]): void`, `grantModerator(id: string): void`, `canChangeDeck(): boolean`, `tick(): void`, `shouldUnload(): boolean`, `closeAll(): void`.
  - A participant's id is their session id.
  - Test fakes in `test/fakes.ts`: `fakeClock()`, `fakeStore()`, `fakeConnection()`, `flush()`.

- [ ] **Step 1: Write the fakes**

`packages/poker-server/test/fakes.ts`:

```ts
import type { Role, ServerMessage } from '@pokerji/protocol';
import type { Connection, HostStore, RoundToSave } from '../src/index.ts';

export function fakeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/** An in-memory HostStore. `failSaves(n)` makes the next n round saves reject. */
export function fakeStore() {
  const rounds: RoundToSave[] = [];
  const calls: string[] = [];
  let failing = 0;
  const store: HostStore = {
    saveRound: async (round) => {
      if (failing > 0) {
        failing -= 1;
        throw new Error('database unavailable');
      }
      rounds.push(round);
    },
    setRole: async (id: string, role: Role) => {
      calls.push(`role:${id}:${role}`);
    },
    setModerator: async (id: string) => {
      calls.push(`moderator:${id}`);
    },
    deleteSession: async (id: string) => {
      calls.push(`delete:${id}`);
    },
  };
  return {
    store,
    rounds,
    calls,
    failSaves: (count: number) => {
      failing = count;
    },
  };
}

/** A connection that records what it was sent. */
export function fakeConnection() {
  const sent: ServerMessage[] = [];
  const state = { closed: false };
  const connection: Connection = {
    send: (text) => {
      sent.push(JSON.parse(text) as ServerMessage);
    },
    close: () => {
      state.closed = true;
    },
  };
  return {
    connection,
    sent,
    isClosed: () => state.closed,
    /** The room from the most recent snapshot. */
    room: () => {
      const snapshots = sent.filter((message) => message.type === 'snapshot');
      const last = snapshots.at(-1);
      if (!last || last.type !== 'snapshot') throw new Error('no snapshot received');
      return last.room;
    },
  };
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
```

- [ ] **Step 2: Write the failing tests**

`packages/poker-server/test/host.test.ts`:

```ts
import { BUILT_IN_DECKS, MAX_PARTICIPANTS, ROOM_UNLOAD_MS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { RoomHost } from '../src/index.ts';
import { fakeClock, fakeConnection, fakeStore, flush } from './fakes.ts';

const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true } as const;
const ann = { id: 'a', name: 'Ann', role: 'voter', moderator: false } as const;

function setup() {
  const clock = fakeClock();
  const storage = fakeStore();
  const problems: string[] = [];
  let ids = 0;
  const host = new RoomHost(
    { deck: BUILT_IN_DECKS.fibonacci.deck, timerSeconds: 60, music: null },
    {
      store: storage.store,
      now: clock.now,
      newId: () => `round-${(ids += 1)}`,
      report: (problem) => problems.push(problem),
    },
  );
  const moTab = fakeConnection();
  const annTab = fakeConnection();
  host.connect(mo, moTab.connection);
  host.connect(ann, annTab.connection);
  return { host, clock, storage, problems, moTab, annTab };
}

async function reveal(context: ReturnType<typeof setup>) {
  context.host.receive('m', { type: 'reveal' });
  context.clock.advance(3_000);
  context.host.tick();
  await flush();
}

describe('RoomHost', () => {
  it('sends everyone a snapshot when someone joins', () => {
    const { moTab, annTab } = setup();
    expect(moTab.room().participants.map((p) => p.name)).toEqual(['Mo', 'Ann']);
    expect(annTab.room().you).toMatchObject({ id: 'a', name: 'Ann' });
  });

  it('shows a vote to its owner and only "has voted" to others', () => {
    const { host, moTab, annTab } = setup();
    host.receive('a', { type: 'vote', card: '8' });
    expect(annTab.room().you.vote).toBe('8');
    expect(moTab.room().participants.find((p) => p.id === 'a')).toMatchObject({
      hasVoted: true,
      vote: null,
    });
  });

  it('reveals after the count, saves the round and reports it saved', async () => {
    const context = setup();
    context.host.receive('m', { type: 'setTitle', title: 'PROJ-1' });
    context.host.receive('m', { type: 'vote', card: '3' });
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    expect(context.annTab.room()).toMatchObject({ phase: 'revealed', saveStatus: 'saved' });
    expect(context.annTab.room().result).toMatchObject({ low: '3', high: '8' });
    expect(context.storage.rounds).toEqual([
      {
        id: 'round-1',
        title: 'PROJ-1',
        votes: [
          { sessionId: 'm', name: 'Mo', card: '3' },
          { sessionId: 'a', name: 'Ann', card: '8' },
        ],
      },
    ]);
  });

  it('marks a round not saved when the store fails, then retries and saves it', async () => {
    const context = setup();
    context.storage.failSaves(1);
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    expect(context.annTab.room().saveStatus).toBe('failed');
    expect(context.problems).toContain('save round');

    context.clock.advance(4_999);
    context.host.tick();
    await flush();
    expect(context.storage.rounds).toHaveLength(0);

    context.clock.advance(1);
    context.host.tick();
    await flush();
    expect(context.storage.rounds).toHaveLength(1);
    expect(context.annTab.room().saveStatus).toBe('saved');
  });

  it('saves both rounds, in order, when a second is revealed before the store recovers', async () => {
    const context = setup();
    context.storage.failSaves(2);
    context.host.receive('m', { type: 'setTitle', title: 'first' });
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    context.host.receive('m', { type: 'newRound', keepTitle: false });
    context.host.receive('m', { type: 'setTitle', title: 'second' });
    context.host.receive('a', { type: 'vote', card: '5' });
    await reveal(context);
    expect(context.storage.rounds).toHaveLength(0);

    context.clock.advance(5_000);
    context.host.tick();
    await flush();
    expect(context.storage.rounds.map((round) => round.title)).toEqual(['first', 'second']);
    expect(new Set(context.storage.rounds.map((round) => round.id)).size).toBe(2);
    expect(context.annTab.room().saveStatus).toBe('saved');
  });

  it('keeps someone present while any of their tabs is open', () => {
    const { host, moTab, annTab } = setup();
    const secondTab = fakeConnection();
    host.connect(ann, secondTab.connection);
    expect(secondTab.room().you.id).toBe('a');
    expect(moTab.room().participants).toHaveLength(2);

    host.disconnect('a', annTab.connection);
    expect(moTab.room().participants.find((p) => p.id === 'a')?.present).toBe(true);
    host.disconnect('a', secondTab.connection);
    expect(moTab.room().participants.find((p) => p.id === 'a')?.present).toBe(false);
  });

  it('tells a removed participant, closes their connection and deletes their session', async () => {
    const { host, storage, moTab, annTab } = setup();
    host.receive('m', { type: 'removeParticipant', participantId: 'a' });
    await flush();
    expect(annTab.sent.at(-1)).toEqual({ type: 'removed' });
    expect(annTab.isClosed()).toBe(true);
    expect(storage.calls).toContain('delete:a');
    expect(moTab.room().participants.map((p) => p.id)).toEqual(['m']);
    // The socket layer reports the close afterwards; it must be harmless.
    host.disconnect('a', annTab.connection);
    expect(moTab.room().participants.map((p) => p.id)).toEqual(['m']);
  });

  it('saves role changes and promotions', async () => {
    const { host, storage } = setup();
    host.receive('a', { type: 'setRole', role: 'spectator' });
    host.receive('m', { type: 'promote', participantId: 'a' });
    await flush();
    expect(storage.calls).toEqual(['role:a:spectator', 'moderator:a']);
  });

  it('refuses a refused message with an error to the sender only', () => {
    const { host, moTab, annTab } = setup();
    const before = moTab.sent.length;
    host.receive('a', { type: 'reveal' });
    expect(annTab.sent.at(-1)).toEqual({ type: 'error', code: 'forbidden' });
    expect(moTab.sent).toHaveLength(before);
  });

  it('turns away a joiner when the room is full', () => {
    const { host } = setup();
    for (let i = 0; i < MAX_PARTICIPANTS; i += 1) {
      host.connect(
        { id: `p${i}`, name: `P${i}`, role: 'voter', moderator: false },
        fakeConnection().connection,
      );
    }
    const late = fakeConnection();
    host.connect({ id: 'late', name: 'Late', role: 'voter', moderator: false }, late.connection);
    expect(late.sent).toEqual([{ type: 'error', code: 'room_full' }]);
    expect(late.isClosed()).toBe(true);
  });

  it('announces timer expiry to everyone', () => {
    const { host, clock, moTab, annTab } = setup();
    host.receive('m', { type: 'startTimer' });
    clock.advance(60_000);
    host.tick();
    expect(moTab.sent.at(-1)).toEqual({ type: 'timerExpired' });
    expect(annTab.sent.at(-1)).toEqual({ type: 'timerExpired' });
  });

  it('applies settings, evictions and moderator grants from the server side', () => {
    const { host, moTab, annTab } = setup();
    expect(host.canChangeDeck()).toBe(true);
    host.applySettings({ deck: BUILT_IN_DECKS.tshirt.deck, timerSeconds: null, music: 'nocturne' });
    expect(moTab.room()).toMatchObject({ music: 'nocturne', timer: { seconds: null } });
    host.grantModerator('a');
    expect(annTab.room().you.moderator).toBe(true);
    host.evict(['a']);
    expect(annTab.isClosed()).toBe(true);
  });

  it('keeps going when one connection throws', () => {
    const { host, moTab, problems } = setup();
    host.connect(
      { id: 'x', name: 'X', role: 'voter', moderator: false },
      {
        send: () => {
          throw new Error('socket gone');
        },
        close: () => undefined,
      },
    );
    host.receive('m', { type: 'setTitle', title: 'still works' });
    expect(moTab.room().title).toBe('still works');
    expect(problems).toContain('connection');
  });

  it('is ready to unload five minutes after the last connection closes', () => {
    const { host, clock, moTab, annTab } = setup();
    expect(host.shouldUnload()).toBe(false);
    host.disconnect('m', moTab.connection);
    host.disconnect('a', annTab.connection);
    clock.advance(ROOM_UNLOAD_MS - 1);
    expect(host.shouldUnload()).toBe(false);
    clock.advance(1);
    expect(host.shouldUnload()).toBe(true);
    host.connect(mo, fakeConnection().connection);
    expect(host.shouldUnload()).toBe(false);
  });

  it('does not unload while a round is still waiting to be saved', async () => {
    const context = setup();
    context.storage.failSaves(1);
    context.host.receive('a', { type: 'vote', card: '8' });
    await reveal(context);
    context.host.disconnect('m', context.moTab.connection);
    context.host.disconnect('a', context.annTab.connection);
    context.clock.advance(ROOM_UNLOAD_MS);
    expect(context.host.shouldUnload()).toBe(false);
    context.host.tick();
    await flush();
    expect(context.host.shouldUnload()).toBe(true);
  });

  it('closes every connection on closeAll', () => {
    const { host, moTab, annTab } = setup();
    host.closeAll();
    expect(moTab.isClosed()).toBe(true);
    expect(annTab.isClosed()).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `host.test.ts`, because `RoomHost` is not exported.

- [ ] **Step 4: Implement the host**

`packages/poker-server/src/host.ts`:

```ts
import {
  apply,
  canChangeDeck,
  createRoom,
  snapshotFor,
  type Command,
  type Effect,
  type Joiner,
  type RoomSettings,
  type RoomState,
} from '@pokerji/poker-engine';
import {
  ROOM_UNLOAD_MS,
  type ClientMessage,
  type Role,
  type ServerMessage,
} from '@pokerji/protocol';
import type { RoundToSave } from './history.ts';

const SAVE_RETRY_MS = 5_000;

export interface Connection {
  send(text: string): void;
  close(): void;
}

export interface HostStore {
  saveRound(round: RoundToSave): Promise<void>;
  setRole(sessionId: string, role: Role): Promise<void>;
  setModerator(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export interface HostDeps {
  store: HostStore;
  now: () => number;
  /** Generates the durable id for a saved round. */
  newId: () => string;
  /** Receives a fixed description of a problem. Never room content. */
  report: (problem: string) => void;
}

/**
 * One live room. Owns the engine state, gives every connection its own
 * snapshot after each change, and carries out the engine's effects.
 * A participant's id is their session id.
 */
export class RoomHost {
  private state: RoomState;
  private readonly deps: HostDeps;
  private readonly connections = new Map<string, Set<Connection>>();
  private readonly saveQueue: { seq: number; round: RoundToSave }[] = [];
  private saving = false;
  private nextSaveAt = 0;
  private emptySince: number | null;

  constructor(settings: RoomSettings, deps: HostDeps) {
    this.state = createRoom(settings);
    this.deps = deps;
    this.emptySince = deps.now();
  }

  connect(joiner: Joiner, connection: Connection): void {
    const open = this.connections.get(joiner.id) ?? new Set<Connection>();
    open.add(connection);
    this.connections.set(joiner.id, open);
    this.emptySince = null;
    this.dispatch({ type: 'join', participant: joiner });
  }

  /** The engine hears of a disconnect only when the participant's last connection closes. */
  disconnect(id: string, connection: Connection): void {
    const open = this.connections.get(id);
    if (!open || !open.delete(connection) || open.size > 0) return;
    this.connections.delete(id);
    this.noteIfEmpty();
    this.dispatch({ type: 'disconnect', id });
  }

  receive(id: string, message: ClientMessage): void {
    this.dispatch({ type: 'client', from: id, message });
  }

  applySettings(settings: RoomSettings): void {
    this.dispatch({ type: 'settings', settings });
  }

  evict(ids: readonly string[]): void {
    this.dispatch({ type: 'evict', ids });
  }

  grantModerator(id: string): void {
    this.dispatch({ type: 'grantModerator', id });
  }

  canChangeDeck(): boolean {
    return canChangeDeck(this.state);
  }

  /** Call at least every 250 ms. Advances time-driven state and retries failed saves. */
  tick(): void {
    this.dispatch({ type: 'tick' });
    if (this.saveQueue.length > 0 && !this.saving && this.deps.now() >= this.nextSaveAt) {
      void this.drainSaves();
    }
  }

  shouldUnload(): boolean {
    return (
      this.emptySince !== null &&
      this.saveQueue.length === 0 &&
      this.deps.now() - this.emptySince >= ROOM_UNLOAD_MS
    );
  }

  closeAll(): void {
    for (const id of [...this.connections.keys()]) this.drop(id);
  }

  private dispatch(command: Command): void {
    const before = this.state;
    const outcome = apply(before, command, this.deps.now());
    this.state = outcome.state;
    if (this.state !== before) this.broadcast();
    for (const effect of outcome.effects) this.perform(effect);
  }

  private perform(effect: Effect): void {
    switch (effect.type) {
      case 'send':
        this.sendTo(effect.to, effect.message);
        return;
      case 'announce':
        for (const id of [...this.connections.keys()]) this.sendTo(id, effect.message);
        return;
      case 'close':
        this.drop(effect.id);
        return;
      case 'persistRound':
        this.saveQueue.push({
          seq: effect.seq,
          round: {
            id: this.deps.newId(),
            title: effect.title,
            votes: effect.votes.map((vote) => ({
              sessionId: vote.participantId,
              name: vote.name,
              card: vote.card,
            })),
          },
        });
        void this.drainSaves();
        return;
      case 'persistRole':
        this.inBackground(this.deps.store.setRole(effect.id, effect.role), 'save role');
        return;
      case 'persistModerator':
        this.inBackground(this.deps.store.setModerator(effect.id), 'save moderator');
        return;
      case 'deleteSession':
        this.inBackground(this.deps.store.deleteSession(effect.id), 'delete session');
        return;
    }
  }

  /** Saves queued rounds oldest first. A failure stops the drain; tick() retries later. */
  private async drainSaves(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      while (this.saveQueue.length > 0) {
        const next = this.saveQueue[0] as { seq: number; round: RoundToSave };
        try {
          await this.deps.store.saveRound(next.round);
        } catch {
          this.deps.report('save round');
          this.nextSaveAt = this.deps.now() + SAVE_RETRY_MS;
          this.dispatch({ type: 'roundSaved', seq: next.seq, ok: false });
          return;
        }
        this.saveQueue.shift();
        this.dispatch({ type: 'roundSaved', seq: next.seq, ok: true });
      }
    } finally {
      this.saving = false;
    }
  }

  private broadcast(): void {
    const now = this.deps.now();
    for (const id of [...this.connections.keys()]) {
      const room = snapshotFor(this.state, id, now);
      if (room) this.sendTo(id, { type: 'snapshot', room });
    }
  }

  private sendTo(id: string, message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const connection of this.connections.get(id) ?? []) {
      this.safely(() => connection.send(text));
    }
  }

  private drop(id: string): void {
    const open = this.connections.get(id);
    if (!open) return;
    this.connections.delete(id);
    for (const connection of open) this.safely(() => connection.close());
    this.noteIfEmpty();
  }

  private noteIfEmpty(): void {
    if (this.connections.size === 0 && this.emptySince === null) {
      this.emptySince = this.deps.now();
    }
  }

  private safely(action: () => void): void {
    try {
      action();
    } catch {
      this.deps.report('connection');
    }
  }

  private inBackground(work: Promise<void>, problem: string): void {
    work.catch(() => this.deps.report(problem));
  }
}
```

Add this line to `packages/poker-server/src/index.ts`, keeping the list alphabetical:

```ts
export * from './host.ts';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the room host" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The room registry

**Files:**
- Create: `packages/poker-server/src/registry.ts`
- Modify: `packages/poker-server/src/index.ts`
- Test: `packages/poker-server/test/registry.test.ts`

**Interfaces:**
- Consumes: `RoomHost` from Task 5; `acquireRoomLock`, `type RoomLock`, `type Kv`, `KEY_PREFIX` from Task 4; `type RoomRow` from Task 3; fakes from `test/fakes.ts`; `VALKEY_URL`, `testPrefix()` from `test/services.ts`.
- Produces:
  - `interface RegistryDeps { kv: Kv; owner: string; now: () => number; makeHost: (room: RoomRow) => RoomHost; lockTtlMs?: number; lockPrefix?: string }`
  - `class RoomRegistry` with `constructor(deps: RegistryDeps)` and methods `get(roomId: string): RoomHost | undefined`, `open(room: RoomRow): Promise<RoomHost | null>` (`null` when another owner holds the room), `sweep(): Promise<void>` (call at least every 250 ms), `close(roomId: string): Promise<void>`, `closeEverything(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`packages/poker-server/test/registry.test.ts`:

```ts
import { BUILT_IN_DECKS, ROOM_UNLOAD_MS } from '@pokerji/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import { createKv, RoomHost, RoomRegistry, type RoomRow } from '../src/index.ts';
import { fakeClock, fakeConnection, fakeStore } from './fakes.ts';
import { testPrefix, VALKEY_URL } from './services.ts';

const kv = createKv(VALKEY_URL);
afterAll(() => kv.quit());

let n = 0;
const room = (): RoomRow => ({
  id: `room-${(n += 1)}`,
  code: `code${n}`,
  deck: BUILT_IN_DECKS.fibonacci.deck,
  timerSeconds: 45,
  music: null,
  passcodeHash: null,
  recoveryHash: 'rh',
  lastActiveAt: new Date(),
});

function registry(owner: string, prefix: string, clock = fakeClock()) {
  let made = 0;
  const instance = new RoomRegistry({
    kv,
    owner,
    now: clock.now,
    lockTtlMs: 3_000,
    lockPrefix: prefix,
    makeHost: (row) => {
      made += 1;
      return new RoomHost(
        { deck: row.deck, timerSeconds: row.timerSeconds, music: row.music },
        { store: fakeStore().store, now: clock.now, newId: () => 'id', report: () => undefined },
      );
    },
  });
  return { instance, clock, madeCount: () => made };
}

const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true } as const;

describe('RoomRegistry', () => {
  it('opens a room once and hands back the same host', async () => {
    const { instance, madeCount } = registry('a', testPrefix());
    const row = room();
    const host = await instance.open(row);
    expect(host).not.toBeNull();
    expect(await instance.open(row)).toBe(host);
    expect(instance.get(row.id)).toBe(host);
    expect(madeCount()).toBe(1);
  });

  it('builds the host from the room’s saved settings', async () => {
    const { instance } = registry('a', testPrefix());
    const host = await instance.open(room());
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    expect(tab.room().timer.seconds).toBe(45);
  });

  it('makes one host when the same room is opened twice at once', async () => {
    const { instance, madeCount } = registry('a', testPrefix());
    const row = room();
    const [first, second] = await Promise.all([instance.open(row), instance.open(row)]);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(madeCount()).toBe(1);
  });

  it('refuses a room another owner holds', async () => {
    const prefix = testPrefix();
    const row = room();
    await registry('a', prefix).instance.open(row);
    const other = registry('b', prefix);
    expect(await other.instance.open(row)).toBeNull();
    expect(other.instance.get(row.id)).toBeUndefined();
  });

  it('ticks its hosts on sweep', async () => {
    const { instance, clock } = registry('a', testPrefix());
    const host = await instance.open(room());
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    host?.receive('m', { type: 'reveal' });
    clock.advance(3_000);
    await instance.sweep();
    expect(tab.room().phase).toBe('revealed');
  });

  it('unloads an idle room and frees it for another owner', async () => {
    const prefix = testPrefix();
    const row = room();
    const first = registry('a', prefix);
    await first.instance.open(row);
    first.clock.advance(ROOM_UNLOAD_MS);
    await first.instance.sweep();
    expect(first.instance.get(row.id)).toBeUndefined();
    expect(await registry('b', prefix).instance.open(row)).not.toBeNull();
  });

  it('closes a room’s connections when another owner has taken its lock', async () => {
    const prefix = testPrefix();
    const row = room();
    const { instance, clock } = registry('a', prefix);
    const host = await instance.open(row);
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);

    await kv.set(`${prefix}lock:${row.id}`, 'someone-else');
    clock.advance(1_000);
    await instance.sweep();
    expect(tab.isClosed()).toBe(true);
    expect(instance.get(row.id)).toBeUndefined();
  });

  it('keeps a live room running when the lock cannot be checked', async () => {
    const row = room();
    const { instance, clock } = registry('a', testPrefix());
    const host = await instance.open(row);
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    // Make the lock check fail the way it does when Valkey is unreachable.
    const entry = (
      instance as unknown as { live: Map<string, { lock: { refresh: () => Promise<boolean> } }> }
    ).live.get(row.id);
    if (entry) entry.lock.refresh = () => Promise.reject(new Error('valkey unavailable'));
    clock.advance(1_000);
    await instance.sweep();
    expect(tab.isClosed()).toBe(false);
    expect(instance.get(row.id)).toBe(host);
  });

  it('closes one room on request and releases its lock', async () => {
    const prefix = testPrefix();
    const row = room();
    const { instance } = registry('a', prefix);
    const host = await instance.open(row);
    const tab = fakeConnection();
    host?.connect(mo, tab.connection);
    await instance.close(row.id);
    expect(tab.isClosed()).toBe(true);
    expect(instance.get(row.id)).toBeUndefined();
    expect(await registry('b', prefix).instance.open(row)).not.toBeNull();
  });

  it('closes everything on shutdown', async () => {
    const prefix = testPrefix();
    const { instance } = registry('a', prefix);
    const rows = [room(), room()];
    for (const row of rows) await instance.open(row);
    await instance.closeEverything();
    for (const row of rows) expect(instance.get(row.id)).toBeUndefined();
    expect(await registry('b', prefix).instance.open(rows[0] as RoomRow)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `registry.test.ts`, because `RoomRegistry` is not exported.

- [ ] **Step 3: Implement the registry**

`packages/poker-server/src/registry.ts`:

```ts
import type { RoomHost } from './host.ts';
import { KEY_PREFIX, type Kv } from './kv.ts';
import { acquireRoomLock, type RoomLock } from './lock.ts';
import type { RoomRow } from './rooms.ts';

export interface RegistryDeps {
  kv: Kv;
  /** Identifies this server instance to the lock. */
  owner: string;
  now: () => number;
  makeHost: (room: RoomRow) => RoomHost;
  lockTtlMs?: number;
  lockPrefix?: string;
}

interface LiveRoom {
  host: RoomHost;
  lock: RoomLock;
  refreshedAt: number;
}

/**
 * The live rooms on this instance. A room is loaded under a Valkey lock, so
 * only one instance is ever its authority, and unloaded once it has been idle.
 */
export class RoomRegistry {
  private readonly deps: RegistryDeps;
  private readonly ttlMs: number;
  private readonly live = new Map<string, LiveRoom>();
  private readonly opening = new Map<string, Promise<RoomHost | null>>();

  constructor(deps: RegistryDeps) {
    this.deps = deps;
    this.ttlMs = deps.lockTtlMs ?? 15_000;
  }

  get(roomId: string): RoomHost | undefined {
    return this.live.get(roomId)?.host;
  }

  /** The host for a room, loading it if needed. Null when another instance holds the room. */
  open(room: RoomRow): Promise<RoomHost | null> {
    const existing = this.live.get(room.id);
    if (existing) return Promise.resolve(existing.host);
    const pending = this.opening.get(room.id);
    if (pending) return pending;
    const attempt = this.load(room).finally(() => this.opening.delete(room.id));
    this.opening.set(room.id, attempt);
    return attempt;
  }

  /** Call at least every 250 ms: ticks hosts, keeps locks alive, unloads idle rooms. */
  async sweep(): Promise<void> {
    for (const [roomId, entry] of [...this.live]) {
      entry.host.tick();
      if (entry.host.shouldUnload()) {
        this.live.delete(roomId);
        await entry.lock.release().catch(() => undefined);
        continue;
      }
      if (this.deps.now() - entry.refreshedAt < this.ttlMs / 3) continue;
      entry.refreshedAt = this.deps.now();
      // If Valkey cannot be reached the room keeps running; only a lost lock stops it.
      const held = await entry.lock.refresh().catch(() => true);
      if (!held) {
        this.live.delete(roomId);
        entry.host.closeAll();
      }
    }
  }

  async close(roomId: string): Promise<void> {
    const entry = this.live.get(roomId);
    if (!entry) return;
    this.live.delete(roomId);
    entry.host.closeAll();
    await entry.lock.release().catch(() => undefined);
  }

  async closeEverything(): Promise<void> {
    for (const roomId of [...this.live.keys()]) await this.close(roomId);
  }

  private async load(room: RoomRow): Promise<RoomHost | null> {
    const lock = await acquireRoomLock(
      this.deps.kv,
      room.id,
      this.deps.owner,
      this.ttlMs,
      this.deps.lockPrefix ?? KEY_PREFIX,
    );
    if (!lock) return null;
    const host = this.deps.makeHost(room);
    this.live.set(room.id, { host, lock, refreshedAt: this.deps.now() });
    return host;
  }
}
```

Add this line to `packages/poker-server/src/index.ts`, keeping the list alphabetical:

```ts
export * from './registry.ts';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the room registry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The socket handler

**Files:**
- Create: `packages/poker-server/src/socket.ts`
- Modify: `packages/poker-server/src/index.ts`, `CLAUDE.md`
- Test: `packages/poker-server/test/socket.test.ts`

**Interfaces:**
- Consumes: `RoomHost`, `type Connection` from Task 5; `parseClientMessage`, `MAX_MESSAGE_BYTES`, `type Joiner` (from `@pokerji/poker-engine`); fakes from `test/fakes.ts`.
- Produces:
  - `MESSAGE_LIMIT = { max: 30, windowMs: 10_000 }`, `MAX_STRIKES = 3`
  - `interface Socket { send(text: string): void; close(): void; onMessage(handler: (text: string) => void): void; onClose(handler: () => void): void }`
  - `attachSocket(host: RoomHost, joiner: Joiner, socket: Socket, now: () => number): void`
- Note for Plan 3: the `ws` server must also be created with `maxPayload: MAX_MESSAGE_BYTES`; the size check here is a second line of defence. The caller authenticates the session and checks `Origin` before calling `attachSocket`.

- [ ] **Step 1: Write the failing tests**

`packages/poker-server/test/socket.test.ts`:

```ts
import { BUILT_IN_DECKS, MAX_MESSAGE_BYTES, type ServerMessage } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { attachSocket, MAX_STRIKES, MESSAGE_LIMIT, RoomHost, type Socket } from '../src/index.ts';
import { fakeClock, fakeConnection, fakeStore } from './fakes.ts';

const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true } as const;
const ann = { id: 'a', name: 'Ann', role: 'voter', moderator: false } as const;

function fakeSocket() {
  const sent: ServerMessage[] = [];
  const state = { closed: false };
  let message: (text: string) => void = () => undefined;
  let closed: () => void = () => undefined;
  const socket: Socket = {
    send: (text) => {
      sent.push(JSON.parse(text) as ServerMessage);
    },
    close: () => {
      state.closed = true;
    },
    onMessage: (handler) => {
      message = handler;
    },
    onClose: (handler) => {
      closed = handler;
    },
  };
  return {
    socket,
    sent,
    isClosed: () => state.closed,
    say: (value: unknown) => message(typeof value === 'string' ? value : JSON.stringify(value)),
    hangUp: () => closed(),
    errors: () =>
      sent.flatMap((entry) => (entry.type === 'error' ? [entry.code] : [])),
  };
}

function setup() {
  const clock = fakeClock();
  const host = new RoomHost(
    { deck: BUILT_IN_DECKS.fibonacci.deck, timerSeconds: null, music: null },
    { store: fakeStore().store, now: clock.now, newId: () => 'id', report: () => undefined },
  );
  const moTab = fakeConnection();
  host.connect(mo, moTab.connection);
  const annSocket = fakeSocket();
  attachSocket(host, ann, annSocket.socket, clock.now);
  return { host, clock, moTab, annSocket };
}

describe('attachSocket', () => {
  it('joins the room and receives a snapshot', () => {
    const { moTab, annSocket } = setup();
    expect(annSocket.sent.at(-1)).toMatchObject({ type: 'snapshot' });
    expect(moTab.room().participants.map((p) => p.id)).toEqual(['m', 'a']);
  });

  it('passes a valid message to the room', () => {
    const { moTab, annSocket } = setup();
    annSocket.say({ type: 'vote', card: '5' });
    expect(moTab.room().participants.find((p) => p.id === 'a')?.hasVoted).toBe(true);
  });

  it('marks the participant away when the socket closes', () => {
    const { moTab, annSocket } = setup();
    annSocket.hangUp();
    expect(moTab.room().participants.find((p) => p.id === 'a')?.present).toBe(false);
  });

  it('answers an unparseable message with an error and closes after three', () => {
    const { annSocket } = setup();
    annSocket.say('not json');
    annSocket.say({ type: 'nope' });
    expect(annSocket.errors()).toEqual(['invalid', 'invalid']);
    expect(annSocket.isClosed()).toBe(false);
    annSocket.say({ type: 'vote', card: '5', extra: true });
    expect(MAX_STRIKES).toBe(3);
    expect(annSocket.isClosed()).toBe(true);
  });

  it('rejects an oversized message without parsing it', () => {
    const { moTab, annSocket } = setup();
    const padded = JSON.stringify({ type: 'setTitle', title: 'x' }) + ' '.repeat(MAX_MESSAGE_BYTES);
    annSocket.say(padded);
    expect(annSocket.errors()).toEqual(['invalid']);
    expect(moTab.room().title).toBe('');
  });

  it('does not count a refused action as abuse', () => {
    const { annSocket } = setup();
    for (let i = 0; i < 10; i += 1) annSocket.say({ type: 'reveal' });
    expect(annSocket.errors()).toEqual(Array.from({ length: 10 }, () => 'forbidden'));
    expect(annSocket.isClosed()).toBe(false);
  });

  it('refuses messages over the rate limit, and allows them again in the next window', () => {
    const { clock, moTab, annSocket } = setup();
    for (let i = 0; i < MESSAGE_LIMIT.max; i += 1) annSocket.say({ type: 'vote', card: '5' });
    expect(annSocket.errors()).toEqual([]);
    annSocket.say({ type: 'vote', card: '8' });
    expect(annSocket.errors()).toEqual(['rate_limited']);
    expect(annSocket.isClosed()).toBe(false);

    clock.advance(MESSAGE_LIMIT.windowMs);
    annSocket.say({ type: 'clearVote' });
    expect(annSocket.errors()).toEqual(['rate_limited']);
    expect(moTab.room().participants.find((p) => p.id === 'a')?.hasVoted).toBe(false);
  });

  it('closes a socket that keeps flooding', () => {
    const { annSocket } = setup();
    for (let i = 0; i < MESSAGE_LIMIT.max + MAX_STRIKES; i += 1) {
      annSocket.say({ type: 'vote', card: '5' });
    }
    expect(annSocket.isClosed()).toBe(true);
  });

  it('ignores messages after it has closed the socket', () => {
    const { moTab, annSocket } = setup();
    for (let i = 0; i < MAX_STRIKES; i += 1) annSocket.say('junk');
    const before = moTab.sent.length;
    annSocket.say({ type: 'vote', card: '5' });
    expect(moTab.sent).toHaveLength(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `socket.test.ts`, because `attachSocket` is not exported.

- [ ] **Step 3: Implement the socket handler**

`packages/poker-server/src/socket.ts`:

```ts
import type { Joiner } from '@pokerji/poker-engine';
import { MAX_MESSAGE_BYTES, parseClientMessage, type ErrorCode } from '@pokerji/protocol';
import type { Connection, RoomHost } from './host.ts';

export const MESSAGE_LIMIT = { max: 30, windowMs: 10_000 };

/** Unparseable or over-rate messages a socket may send before it is closed. */
export const MAX_STRIKES = 3;

export interface Socket {
  send(text: string): void;
  close(): void;
  onMessage(handler: (text: string) => void): void;
  onClose(handler: () => void): void;
}

/**
 * Connects one authenticated socket to its room. The caller has already
 * checked the session and the Origin. Everything the socket sends is
 * untrusted: it is size-checked, rate-limited and parsed before the room
 * sees it. Actions the room refuses are not counted as abuse.
 */
export function attachSocket(
  host: RoomHost,
  joiner: Joiner,
  socket: Socket,
  now: () => number,
): void {
  const connection: Connection = {
    send: (text) => socket.send(text),
    close: () => socket.close(),
  };
  let windowStart = now();
  let inWindow = 0;
  let strikes = 0;
  let closed = false;

  const strike = (code: ErrorCode) => {
    socket.send(JSON.stringify({ type: 'error', code }));
    strikes += 1;
    if (strikes >= MAX_STRIKES) {
      closed = true;
      socket.close();
    }
  };

  socket.onMessage((text) => {
    if (closed) return;
    const time = now();
    if (time - windowStart >= MESSAGE_LIMIT.windowMs) {
      windowStart = time;
      inWindow = 0;
    }
    inWindow += 1;
    if (inWindow > MESSAGE_LIMIT.max) return strike('rate_limited');
    if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) return strike('invalid');
    const message = parseClientMessage(text);
    if (!message) return strike('invalid');
    host.receive(joiner.id, message);
  });

  socket.onClose(() => {
    closed = true;
    host.disconnect(joiner.id, connection);
  });

  host.connect(joiner, connection);
}
```

Replace `packages/poker-server/src/index.ts` with:

```ts
export * from './config.ts';
export * from './db.ts';
export * from './history.ts';
export * from './host.ts';
export * from './kv.ts';
export * from './limiter.ts';
export * from './lock.ts';
export * from './migrate.ts';
export * from './registry.ts';
export * from './rooms.ts';
export * from './secrets.ts';
export * from './sessions.ts';
export * from './socket.ts';
```

- [ ] **Step 4: Run the whole suite, typecheck and format check**

Run: `pnpm test && pnpm typecheck && pnpm format:check`
Expected: every test in all three packages PASSES, typecheck prints no errors, and the format check reports no files. If the format check lists files, run `pnpm format` and re-run it.

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`, replace the first paragraph under `## Status` with:

```markdown
Early build. `packages/protocol`, `packages/poker-engine` and `packages/poker-server` exist; the SvelteKit app and UI do not yet. The behaviour spec and design direction are in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, product facts in `PRODUCT.md`.
```

Add this line to the `## Commands` list, after the "Dev Postgres and Valkey" line:

```markdown
- `packages/poker-server` tests need those services running. Each test file uses its own throwaway Postgres schema and Valkey key prefix, so they never touch development data.
```

Add these bullets to the end of `## Architecture`:

```markdown
- `packages/poker-server`: everything that touches Postgres, Valkey, the clock or a socket, with no web framework. `RoomHost` is one live room: it owns the engine state, sends each connection its own snapshot, and carries out engine effects. `RoomRegistry` loads hosts under a Valkey lock and unloads idle ones. `attachSocket` puts one untrusted socket behind size, rate and parse checks.
- A participant's id is their session id. Saved rounds get their own generated id so a retried save cannot store a round twice.
- `report(problem)` receives fixed strings only. Never pass it, or log, room codes, names, titles, votes, tokens or client addresses.
- Rate limits fail closed when Valkey is unreachable; live rooms keep running.
```

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the socket handler" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

1. Run `pnpm test && pnpm typecheck` once more from the repository root and confirm both pass.
2. Request an Octopus review of the `feat/poker-server-core` branch. Because this package holds secrets, SQL and rate limits, run both `octo:skills:octopus-code-review` and `octo:skills:octopus-security-audit`. Address findings using superpowers:receiving-code-review.
3. Use superpowers:finishing-a-development-branch to decide how the branch is integrated.
4. Write Plan 3 (web app and release) against the interfaces that now exist and the current SvelteKit 3 documentation.
