# Planning Poker: Release (Plan 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the finished app deployable on the owner's server: a container image, a compose file for Traefik, deployment notes, the code changes earlier reviews carried to release, and a final security audit of the whole app.

**Architecture:** One image holds the built SvelteKit app, `server.js`, the production dependencies and the SQL migrations. It runs as a non-root user on a read-only filesystem, publishes no ports, and is reached only through the existing Traefik. Schema changes are applied by a one-shot run of the same image under a database role that owns the schema; the long-running app uses a second role that cannot change the schema and refuses to start if the schema is behind.

**Tech Stack:** Unchanged. Adds Docker (multi-stage build on `node:24-bookworm-slim`) and Traefik v3 labels.

**Spec:** `docs/superpowers/specs/2026-10-12-planning-poker-design.md` ("Deployment", "Abuse limits", "Privacy").

## Where this plan sits

| Plan | Delivers | Status |
|---|---|---|
| 1. Core | Protocol and room engine | Done |
| 2. Server core | `packages/poker-server` | Done |
| 3. In a browser | Create, join, vote, reveal | Done |
| 4. Running a room | Every remaining behaviour | Done |
| Interface and sound | "Judges' Row", opt-in sound | Done |
| **5. Release (this plan)** | Image, deployment files and notes, carried hardening, final audit | This plan |

This plan stops at "ready to deploy". Nothing in it touches the owner's server, pushes an image anywhere, or changes DNS. The first deployment is the owner's action, following `docs/deploy.md`.

## Global Constraints

- Security and privacy outrank scope and speed. Nothing new is stored, logged or sent to a third party by this plan.
- `report(problem)` and every log line carry fixed strings only: never a room code, name, title, vote, token, client address, connection string or raw error.
- Join failures stay indistinguishable. A refusal added here (Argon2 queue full, creation ceiling) returns the same `REFUSED` the flow already returns.
- Rate limits fail closed when Valkey is unreachable.
- The session cookie stays `Secure` outside local development; no header may switch it off.
- `Referrer-Policy` stays `same-origin`.
- No `minimumReleaseAgeExclude`. If a dependency is needed and is too new, pin the previous release.
- TypeScript in `packages/*`: strict, `.ts` import extensions, `erasableSyntaxOnly` (no enums, no parameter properties).
- Package manager pnpm 11, Node 24 or later.
- The image runs as a non-root user, with a read-only root filesystem, all capabilities dropped, and no published ports.
- Development Postgres and Valkey must be running for the tests: `docker compose up -d --wait`.

## Review Focus

The inputs and conditions the spec implies that are most likely to hurt a person using or running the service, each pinned by a test in the task named:

1. **The app starts against a database whose schema is behind** (a deploy where the migrate job was skipped). Expected: it refuses to start with a fixed message, rather than serving errors. Task 1.
2. **A forged `X-Forwarded-Host` or `X-Forwarded-Proto` reaches the container** (Traefik misconfigured, or the container reached directly). Expected: with `ORIGIN` set, WebSocket upgrades and form posts are judged against `ORIGIN` only. Task 2.
3. **A burst of passcode guesses or joins to a passcode room.** Expected: at most four Argon2 computations at once, a bounded queue, and the overflow refused exactly like a wrong passcode; setting a passcode is never refused for load. Task 3.
4. **Room creation from many addresses at once** (a botnet, or one IPv6 customer rotating through /64s). Expected: a /48 limit and a global hourly ceiling refuse it, and ordinary visitors on other networks are affected only by the global ceiling. Task 4.
5. **The app's database role tries to change the schema, or its Valkey user tries to read another application's keys.** Expected: both are refused by the database and by Valkey. Task 6 proves it against the development services with the exact roles from the deployment notes.

---

### Task 1: Apply migrations in one place, check them everywhere else

The app currently migrates on every start, so its database role must own the schema. After this task `MIGRATIONS=check` makes the app verify the schema and refuse to start if it is behind, and `MIGRATE_ONLY=1` makes the same entry file apply migrations and exit.

**Files:**
- Modify: `packages/poker-server/src/migrate.ts`
- Modify: `packages/poker-server/src/config.ts`
- Modify: `packages/poker-server/src/app.ts`
- Modify: `apps/web/server.js`
- Modify: `apps/web/scripts/smoke.sh`
- Test: `packages/poker-server/test/migrate.test.ts`, `packages/poker-server/test/config.test.ts`, `packages/poker-server/test/app.test.ts`

**Interfaces:**
- Produces: `pendingMigrations(db: Db, directory?: string): Promise<string[]>`; `Config.migrations?: 'apply' | 'check'` (absent means `'apply'`); environment variables `MIGRATIONS` (`apply` or `check`, default `apply`) and `MIGRATE_ONLY` (`1`).
- Consumes: `migrate(db, directory)`, `testSchema()`, `createPool(url, schema)` as they exist.

- [ ] **Step 1: Write the failing tests**

Append to `packages/poker-server/test/migrate.test.ts` (add `createPool` and `pendingMigrations` to the import from `../src/index.ts`, and `DATABASE_URL`, `testSchema` to the import from `./services.ts`):

```ts
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
```

Append to `packages/poker-server/test/config.test.ts`, inside `describe('loadConfig', ...)`:

```ts
  it('applies migrations unless told to check only', () => {
    expect(loadConfig(valid).migrations).toBe('apply');
    expect(loadConfig({ ...valid, MIGRATIONS: 'check' }).migrations).toBe('check');
    expect(() => loadConfig({ ...valid, MIGRATIONS: 'sometimes' })).toThrow(/MIGRATIONS/);
  });
```

In the same file, add `migrations: 'apply',` to the object in the first test's `toEqual`.

Append to `packages/poker-server/test/app.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @pokerji/poker-server exec vitest run test/migrate.test.ts test/config.test.ts test/app.test.ts`
Expected: FAIL. `pendingMigrations` is not exported; `migrations` is `undefined`; the "behind" test resolves instead of rejecting.

- [ ] **Step 3: Implement**

Add to `packages/poker-server/src/migrate.ts`:

```ts
/**
 * The migrations not yet applied, in order. It only reads, so a database role
 * that cannot change the schema can run it.
 */
export async function pendingMigrations(
  db: Db,
  directory: string = MIGRATIONS,
): Promise<string[]> {
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
```

In `packages/poker-server/src/config.ts`, add to the schema `MIGRATIONS: z.enum(['apply', 'check']).default('apply'),`, add to `Config`:

```ts
  /** "check" for a database role that cannot change the schema: verify it, never alter it. */
  migrations?: 'apply' | 'check';
```

and add `migrations: parsed.data.MIGRATIONS,` to the returned object.

In `packages/poker-server/src/app.ts`, import `pendingMigrations` and replace the first line of `begin`:

```ts
    if (config.migrations === 'check') {
      const pending = await pendingMigrations(db, options.migrationsDir);
      if (pending.length > 0) {
        throw new Error(
          `Database schema is behind: ${pending.length} migration(s) not applied. Run the migrate job, then start again.`,
        );
      }
    } else {
      await migrate(db, options.migrationsDir);
    }
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: PASS, every file.

- [ ] **Step 5: The migrate-only run in `apps/web/server.js`**

Replace the block from `const insecure` down to the `await import` line with:

```js
const insecure = process.env.INSECURE_HTTP === '1';
const loopback = ['127.0.0.1', '::1', 'localhost'].includes(process.env.HOST ?? '');
// A one-shot run that applies database migrations and exits. It serves nothing.
const migrateOnly = process.env.MIGRATE_ONLY === '1';

if (insecure && !loopback) {
  console.error('INSECURE_HTTP is for local testing only: HOST must be a loopback address.');
  process.exit(1);
}
if (!insecure && !migrateOnly && !process.env.ADDRESS_HEADER) {
  // Without it every visitor looks like the proxy, and one person can use up everyone's limits.
  console.error('ADDRESS_HEADER is required (behind Traefik: x-forwarded-for, with XFF_DEPTH=1).');
  process.exit(1);
}
if (migrateOnly) process.env.MIGRATIONS = 'apply';

// Imported only after the checks above, because importing it starts the app.
// The error is never printed: it can carry connection details.
let handler;
try {
  ({ handler } = await import('./build/handler.js'));
  await globalThis[RUNTIME]?.started;
} catch {
  console.error(
    migrateOnly
      ? 'Migration failed. Check DATABASE_URL and that its role owns the schema.'
      : 'The app could not start. Check the configuration, the services, and that migrations are applied.',
  );
  process.exit(1);
}

if (migrateOnly) {
  await globalThis[RUNTIME]?.app.stop();
  console.log('Migrations applied.');
  process.exit(0);
}
```

- [ ] **Step 6: Extend the smoke check**

In `apps/web/scripts/smoke.sh`, after the two "must refuse" checks and before `node server.js &`, add:

```sh
# The migrate-only run applies migrations and exits without serving.
[ "$(MIGRATE_ONLY=1 node server.js)" = "Migrations applied." ] || fail "migrate-only run"
# A schema that is behind stops the app rather than letting it serve errors.
if MIGRATIONS=check MIGRATIONS_DIR="$(mktemp -d)/none" node server.js >/dev/null 2>&1; then
  fail "started with an unreadable migrations directory in check mode"
fi
export MIGRATIONS=check
```

Run: `pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke`
Expected: `SMOKE OK`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: check migrations at start, apply them in a one-shot run"
```

---

### Task 2: Judge WebSocket upgrades against `ORIGIN` and `PORT_HEADER`

SvelteKit's Node adapter uses `ORIGIN`, when set, in place of the forwarded headers, and `PORT_HEADER` beside them. The upgrade handler reads only `PROTOCOL_HEADER` and `HOST_HEADER`, so with `ORIGIN` set the two disagree. Production will set `ORIGIN`, which also removes any trust in forwarded host and protocol headers.

**Files:**
- Modify: `packages/poker-server/src/upgrade.ts` (`requestOrigin`)
- Test: `packages/poker-server/test/upgrade.test.ts`

**Interfaces:**
- Produces: `requestOrigin(req, env, defaultProtocol)` unchanged in signature; `env.ORIGIN` and `env.PORT_HEADER` now honoured.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('requestOrigin', ...)`:

```ts
  it('uses ORIGIN when it is set, whatever the request headers say', () => {
    const req = fakeRequest({
      host: 'web:3000',
      'x-forwarded-proto': 'http',
      'x-forwarded-host': 'evil.example',
    });
    const env = {
      ORIGIN: 'https://poker.example',
      PROTOCOL_HEADER: 'x-forwarded-proto',
      HOST_HEADER: 'x-forwarded-host',
    };
    expect(requestOrigin(req, env, 'http')).toBe('https://poker.example');
    expect(requestOrigin(fakeRequest({}), { ORIGIN: 'https://poker.example/' }, 'http')).toBe(
      'https://poker.example',
    );
  });

  it('returns nothing for an ORIGIN that is not a URL', () => {
    expect(requestOrigin(fakeRequest({ host: 'a' }), { ORIGIN: 'poker.example' }, 'https')).toBeNull();
  });

  it('adds the forwarded port, and leaves out the default one', () => {
    const env = {
      PROTOCOL_HEADER: 'x-forwarded-proto',
      HOST_HEADER: 'x-forwarded-host',
      PORT_HEADER: 'x-forwarded-port',
    };
    const at = (port: string) =>
      requestOrigin(
        fakeRequest({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'poker.example',
          'x-forwarded-port': port,
        }),
        env,
        'http',
      );
    expect(at('8443')).toBe('https://poker.example:8443');
    expect(at('443')).toBe('https://poker.example');
    expect(at('not a port')).toBeNull();
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @pokerji/poker-server exec vitest run test/upgrade.test.ts -t requestOrigin`
Expected: FAIL: the first returns `http://evil.example`, the port test returns `https://poker.example`.

- [ ] **Step 3: Implement**

Replace the body of `requestOrigin`:

```ts
  // A fixed origin, when configured, is the only answer: no request header is consulted.
  if (env.ORIGIN) return URL.canParse(env.ORIGIN) ? new URL(env.ORIGIN).origin : null;
  const protocol = env.PROTOCOL_HEADER
    ? (header(req, env.PROTOCOL_HEADER) ?? defaultProtocol)
    : defaultProtocol;
  const host = env.HOST_HEADER ? header(req, env.HOST_HEADER) : header(req, 'host');
  if (!host) return null;
  const port = env.PORT_HEADER ? header(req, env.PORT_HEADER) : undefined;
  if (port === undefined) return `${protocol}://${host}`;
  // Through URL, so a default port is left out exactly as a browser leaves it out of Origin.
  const withPort = `${protocol}://${host.replace(/:\d+$/, '')}:${port}`;
  return URL.canParse(withPort) ? new URL(withPort).origin : null;
```

- [ ] **Step 4: Run and watch them pass**

Run: `pnpm --filter @pokerji/poker-server exec vitest run test/upgrade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: judge socket upgrades against ORIGIN and the forwarded port, as the pages are"
```

---

### Task 3: Cap concurrent Argon2 work

Each Argon2 verification takes memory and a worker thread. Unbounded, a burst of joins to passcode rooms can exhaust both. After this task at most four run at once and at most 64 wait; a verification beyond that is refused as a wrong passcode. Hashing a new passcode always waits and is never refused.

**Files:**
- Create: `packages/poker-server/src/gate.ts`
- Modify: `packages/poker-server/src/secrets.ts`, `packages/poker-server/src/index.ts`
- Test: `packages/poker-server/test/gate.test.ts`, `packages/poker-server/test/secrets.test.ts`

**Interfaces:**
- Produces: `createGate(max: number, maxWaiting: number): Gate`, `Gate.run<T>(work: () => Promise<T>, options?: { mustRun?: boolean }): Promise<T>`, `class GateFull extends Error`; constants `ARGON2_CONCURRENT = 4`, `ARGON2_WAITING = 64` exported from `secrets.ts`.
- Consumes: `hashPasscode`, `passcodeMatches` keep their signatures.

- [ ] **Step 1: Write the failing tests**

Create `packages/poker-server/test/gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGate, GateFull } from '../src/index.ts';

/** Work that finishes only when told to. */
function job() {
  let finish!: (value: string) => void;
  let fail!: (error: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  let started = false;
  const work = () => {
    started = true;
    return done;
  };
  return { work, finish, fail, started: () => started };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createGate', () => {
  it('runs at most the allowed number at once and starts the next as one finishes', async () => {
    const gate = createGate(2, 10);
    const jobs = [job(), job(), job()];
    const results = jobs.map((j) => gate.run(j.work));
    await settle();
    expect(jobs.map((j) => j.started())).toEqual([true, true, false]);
    jobs[0]!.finish('a');
    await settle();
    expect(jobs[2]!.started()).toBe(true);
    jobs[1]!.finish('b');
    jobs[2]!.finish('c');
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c']);
  });

  it('refuses work when the queue is full, without running it', async () => {
    const gate = createGate(1, 1);
    const [running, waiting, extra] = [job(), job(), job()];
    const first = gate.run(running.work);
    const second = gate.run(waiting.work);
    await expect(gate.run(extra.work)).rejects.toBeInstanceOf(GateFull);
    expect(extra.started()).toBe(false);
    running.finish('a');
    waiting.finish('b');
    expect(await Promise.all([first, second])).toEqual(['a', 'b']);
  });

  it('lets work that must run wait however long the queue is', async () => {
    const gate = createGate(1, 0);
    const [running, important] = [job(), job()];
    const first = gate.run(running.work);
    const second = gate.run(important.work, { mustRun: true });
    await settle();
    expect(important.started()).toBe(false);
    running.finish('a');
    important.finish('b');
    expect(await Promise.all([first, second])).toEqual(['a', 'b']);
  });

  it('frees its place when the work fails', async () => {
    const gate = createGate(1, 5);
    const [broken, next] = [job(), job()];
    const first = gate.run(broken.work);
    const second = gate.run(next.work);
    broken.fail(new Error('boom'));
    await expect(first).rejects.toThrow('boom');
    await settle();
    expect(next.started()).toBe(true);
    next.finish('ok');
    expect(await second).toBe('ok');
  });
});
```

Append to `packages/poker-server/test/secrets.test.ts` (add `ARGON2_CONCURRENT`, `ARGON2_WAITING`, `hashPasscode`, `passcodeMatches` to its import if missing):

```ts
describe('Argon2 under load', () => {
  it('checks as many passcodes as may run or wait, and refuses the rest as wrong', async () => {
    const stored = await hashPasscode('correct horse');
    const room = ARGON2_CONCURRENT + ARGON2_WAITING;
    const results = await Promise.all(
      Array.from({ length: room + 12 }, () => passcodeMatches('correct horse', stored)),
    );
    expect(results.filter(Boolean)).toHaveLength(room);
    expect(results.slice(room)).toEqual(Array<boolean>(12).fill(false));
  }, 30_000);

  it('never refuses to hash a new passcode for load', async () => {
    const hashes = await Promise.all(
      Array.from({ length: ARGON2_CONCURRENT + ARGON2_WAITING + 5 }, () => hashPasscode('x'.repeat(12))),
    );
    expect(hashes.every((value) => value.startsWith('$argon2id$'))).toBe(true);
  }, 30_000);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @pokerji/poker-server exec vitest run test/gate.test.ts test/secrets.test.ts`
Expected: FAIL: `createGate` is not exported; in the load test every result is `true`.

- [ ] **Step 3: Implement**

Create `packages/poker-server/src/gate.ts`:

```ts
/** Thrown when work is turned away because too much is already waiting. */
export class GateFull extends Error {
  constructor() {
    super('too much work is waiting');
  }
}

export interface Gate {
  run<T>(work: () => Promise<T>, options?: { mustRun?: boolean }): Promise<T>;
}

/**
 * Lets at most `max` pieces of work run at once. Up to `maxWaiting` more wait
 * their turn in order; beyond that, work is refused unless it must run.
 */
export function createGate(max: number, maxWaiting: number): Gate {
  let running = 0;
  const waiting: (() => void)[] = [];
  return {
    async run(work, options = {}) {
      if (running >= max) {
        if (waiting.length >= maxWaiting && !options.mustRun) throw new GateFull();
        // The finishing job hands its place straight to this one.
        await new Promise<void>((resolve) => waiting.push(resolve));
      } else {
        running += 1;
      }
      try {
        return await work();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else running -= 1;
      }
    },
  };
}
```

Add `export * from './gate.ts';` to `packages/poker-server/src/index.ts`.

In `packages/poker-server/src/secrets.ts`, import `createGate` and replace the two passcode functions:

```ts
/** Argon2 takes memory and a worker thread each time, so only a few run at once. */
export const ARGON2_CONCURRENT = 4;
export const ARGON2_WAITING = 64;
const argon2 = createGate(ARGON2_CONCURRENT, ARGON2_WAITING);

/** Passcodes are chosen by people, so they get a slow, salted hash: Argon2id. */
export function hashPasscode(passcode: string): Promise<string> {
  // Setting a passcode is rare and already rate limited; it waits rather than fail.
  return argon2.run(() => hash(passcode), { mustRun: true });
}

/** False for a wrong passcode, a malformed hash, or a check refused because too many are waiting. */
export async function passcodeMatches(passcode: string, stored: string): Promise<boolean> {
  try {
    return await argon2.run(() => verify(stored, passcode));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cap concurrent Argon2 work, refusing the overflow as a wrong passcode"
```

---

### Task 4: A /48 limit and a global ceiling on room creation

Room creation is limited to 10 an hour per client, where an IPv6 client is a /64. Someone with a routed /48 has 65,536 of those, and a botnet has many addresses. Two more limits apply after the per-client one: 50 rooms an hour per IPv6 /48, and 1,000 rooms an hour for the whole service.

**Files:**
- Modify: `packages/poker-server/src/validate.ts`, `packages/poker-server/src/limiter.ts`, `packages/poker-server/src/flows.ts`
- Modify: `docs/superpowers/specs/2026-10-12-planning-poker-design.md` (limits table)
- Test: `packages/poker-server/test/validate.test.ts`, `packages/poker-server/test/flows.test.ts`

**Interfaces:**
- Produces: `widerNetwork(address: string): string | null`; `LIMITS.roomCreateWide`, `LIMITS.roomCreateAll`; `FlowDeps.roomCreateCeiling?: Limit`.
- Consumes: `normaliseAddress`, `addressKey`, `withinLimit`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/poker-server/test/validate.test.ts` (add `widerNetwork` to the import):

```ts
describe('widerNetwork', () => {
  it('gives the /48 an IPv6 address belongs to, however it is written', () => {
    expect(widerNetwork('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1::/48');
    expect(widerNetwork('2001:DB8:1:ffff::9')).toBe('2001:db8:1::/48');
    expect(widerNetwork('2001:db8::1')).toBe('2001:db8:0::/48');
  });

  it('gives nothing for IPv4, IPv4-mapped and unrecognised addresses', () => {
    expect(widerNetwork('203.0.113.7')).toBeNull();
    expect(widerNetwork('::ffff:203.0.113.7')).toBeNull();
    expect(widerNetwork('not an address')).toBeNull();
    expect(widerNetwork('unknown')).toBeNull();
  });
});
```

Append inside `describe('createRoomFlow', ...)` in `packages/poker-server/test/flows.test.ts`:

```ts
  it('refuses the fifty-first room from one IPv6 /48 in an hour, and not a neighbouring /48', async () => {
    const flow = deps();
    // Fifty different /64s inside one /48: each is a different client to the per-client limit.
    for (let n = 0; n < 50; n += 1) {
      expect((await create(flow, `2001:db8:7:${n.toString(16)}::1`)).ok).toBe(true);
    }
    expect(await create(flow, '2001:db8:7:ffff::1')).toEqual({ ok: false, reason: 'refused' });
    expect((await create(flow, '2001:db8:8::1')).ok).toBe(true);
  }, 30_000);

  it('refuses every new room once the whole service has made its hourly ceiling', async () => {
    const flow = deps({ roomCreateCeiling: { max: 2, windowSeconds: 3_600 } });
    expect((await create(flow, '198.51.100.1')).ok).toBe(true);
    expect((await create(flow, '198.51.100.2')).ok).toBe(true);
    expect(await create(flow, '198.51.100.3')).toEqual({ ok: false, reason: 'refused' });
  });

  it('does not count a room refused for its own client against the whole service', async () => {
    const flow = deps({ roomCreateCeiling: { max: 12, windowSeconds: 3_600 } });
    for (let n = 0; n < 10; n += 1) expect((await create(flow, '198.51.100.9')).ok).toBe(true);
    // Refused by the per-client limit, five times over.
    for (let n = 0; n < 5; n += 1) expect((await create(flow, '198.51.100.9')).ok).toBe(false);
    // The ceiling has counted ten, so two more clients still fit.
    expect((await create(flow, '198.51.100.10')).ok).toBe(true);
    expect((await create(flow, '198.51.100.11')).ok).toBe(true);
    expect((await create(flow, '198.51.100.12')).ok).toBe(false);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @pokerji/poker-server exec vitest run test/validate.test.ts test/flows.test.ts`
Expected: FAIL: `widerNetwork` is not exported; the fifty-first and the third room are created.

- [ ] **Step 3: Implement**

Add to `packages/poker-server/src/validate.ts`, after `normaliseAddress`:

```ts
/**
 * The /48 an IPv6 address belongs to: the block a provider commonly routes to
 * one customer, who can then use any of its 65,536 /64s. Null for anything
 * that is not plain IPv6.
 */
export function widerNetwork(address: string): string | null {
  const bare = address.split('%')[0] ?? '';
  if (!isIPv6(bare)) return null;
  const groups = expand(bare);
  if (!groups) return null;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return null;
  return `${[g0, g1, g2].map((group) => group.toString(16)).join(':')}::/48`;
}
```

Add to `LIMITS` in `packages/poker-server/src/limiter.ts`:

```ts
  /** One IPv6 /48, across all of its /64s. */
  roomCreateWide: { max: 50, windowSeconds: 3_600 },
  /** Every client together: what the whole service will create in an hour. */
  roomCreateAll: { max: 1_000, windowSeconds: 3_600 },
```

In `packages/poker-server/src/flows.ts`: import `widerNetwork` from `./validate.ts` and `type Limit` from `./limiter.ts`; add to `FlowDeps`:

```ts
  /** Rooms the whole service creates in a window. Tests lower it. */
  roomCreateCeiling?: Limit;
```

and in `createRoomFlow`, directly after the existing per-client `withinLimit` line:

```ts
  const wide = widerNetwork(input.address);
  if (
    wide !== null &&
    !(await withinLimit(
      deps.kv,
      `create48:${addressKey(deps.addressSecret, wide)}`,
      LIMITS.roomCreateWide,
      prefix,
    ))
  ) {
    return REFUSED;
  }
  // Last, so a request already refused above is not counted against everyone.
  const ceiling = deps.roomCreateCeiling ?? LIMITS.roomCreateAll;
  if (!(await withinLimit(deps.kv, 'create:all', ceiling, prefix))) return REFUSED;
```

- [ ] **Step 4: Run and watch them pass**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: PASS, every file.

- [ ] **Step 5: Record the limits in the spec**

In the limits table of `docs/superpowers/specs/2026-10-12-planning-poker-design.md`, under the row for room creation per client, add two rows in the table's own column layout: "Rooms created per IPv6 /48: 50 per hour" and "Rooms created by the whole service: 1,000 per hour". Under the table add: "The service-wide ceiling protects the database from a flood from many addresses. While it is reached, nobody can create a room until the hour's window ends; existing rooms are unaffected."

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: limit room creation per IPv6 /48 and for the whole service"
```

---

### Task 5: Security headers on every response, static files included

Pages get their headers in `hooks.server.ts`. Files served from the build's static folder (scripts, fonts, audio) do not pass through it. `server.js` sees every response, so it sets the base headers there; the page handler still sets its own on top.

**Files:**
- Modify: `apps/web/server.js`
- Modify: `apps/web/scripts/smoke.sh`

**Interfaces:**
- Produces: on every response `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: same-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`; on `/audio/*` also `Cache-Control: public, max-age=604800`.

- [ ] **Step 1: Write the failing check**

In `apps/web/scripts/smoke.sh`, before the `CROSS=` line, add:

```sh
# Static files do not pass through the page hooks; they must carry the base headers too.
AUDIO=$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/audio/bach-goldberg-var1.mp3")
echo "$AUDIO" | grep -qi "^HTTP/1.1 200" || fail "audio file not served"
echo "$AUDIO" | grep -qi "x-content-type-options: nosniff" || fail "nosniff on static files"
echo "$AUDIO" | grep -qi "cross-origin-resource-policy: same-origin" || fail "resource policy on static files"
echo "$AUDIO" | grep -qi "cache-control: public, max-age=604800" || fail "cache lifetime on audio"
RANGE=$(curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-99' "http://127.0.0.1:$PORT/audio/bach-goldberg-var1.mp3")
[ "$RANGE" = "206" ] || fail "audio does not answer range requests (got $RANGE)"
MISSING=$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/audio/nothing.mp3")
echo "$MISSING" | grep -qi "x-content-type-options: nosniff" || fail "nosniff on a missing file"
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke`
Expected: `SMOKE FAILED: nosniff on static files`.

- [ ] **Step 3: Implement**

In `apps/web/server.js`, add above `const server = createServer`:

```js
// The base headers for every response. Pages set their own on top in hooks.server.ts;
// files from the static folder never reach the hooks, so they get them here.
const harden = (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // The recordings never change under one name, and are large: let browsers keep them a week.
  if (req.url?.startsWith('/audio/')) res.setHeader('Cache-Control', 'public, max-age=604800');
};
```

and call it first in the request handler:

```js
const server = createServer((req, res) => {
  mark(req);
  harden(req, res);
  handler(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke && pnpm --filter @pokerji/web e2e`
Expected: `SMOKE OK`, and every browser test passes (the header test in `round.spec.ts` still sees `Cache-Control: no-store` on room pages, because the page handler's header replaces the base one).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: carry the base security headers on static files, and cache the recordings"
```

---

### Task 6: The image, proved against the roles it will run under

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Create: `deploy/check-image.sh`
- Create: `deploy/postgres-roles.sql`, `deploy/valkey-acl.txt`
- Modify: `package.json` (script `check:image`)

**Interfaces:**
- Produces: image `pokerji:check` built by the script; `deploy/postgres-roles.sql` and `deploy/valkey-acl.txt` are the exact statements the deployment notes (Task 7) tell the owner to run, so what is documented is what was tested.
- Consumes: `MIGRATE_ONLY`, `MIGRATIONS=check` (Task 1), `ORIGIN` (Task 2), the headers (Task 5).

- [ ] **Step 1: Write the check first**

Create `deploy/postgres-roles.sql`:

```sql
-- Two roles. The owner applies migrations and is used only by the one-shot migrate run.
-- The app role reads and writes rows and cannot change the schema.
-- Run as a Postgres superuser, with psql variables:
--   psql -v db=pokerji -v owner_password=... -v app_password=... -f postgres-roles.sql
create role :"db"_owner login password :'owner_password';
create role :"db"_app login password :'app_password';
create database :"db" owner :"db"_owner;
revoke all on database :"db" from public;
grant connect on database :"db" to :"db"_app;
\connect :"db"
revoke all on schema public from public;
grant usage on schema public to :"db"_app;
alter default privileges for role :"db"_owner in schema public
  grant select, insert, update, delete on tables to :"db"_app;
alter default privileges for role :"db"_owner in schema public
  grant usage, select on sequences to :"db"_app;
```

Create `deploy/valkey-acl.txt`:

```text
# One Valkey user that can touch only this app's keys, with only the commands it uses.
# Replace PREFIX with the app's KEY_PREFIX without its trailing colon (default: pokerji)
# and PASSWORD with a long random value, then run the line in valkey-cli as an admin:
ACL SETUSER PREFIX on >PASSWORD resetkeys ~PREFIX:* resetchannels -@all +get +set +del +incr +expire +pexpire +eval +evalsha +ping +info +hello +auth +client|setname +client|setinfo
```

Create `deploy/check-image.sh`:

```sh
#!/bin/sh
# Builds the image and proves it under the conditions of production: the roles from
# postgres-roles.sql and valkey-acl.txt, a read-only filesystem, no capabilities.
# Needs the development services: docker compose up -d --wait
# Run from the repository root: pnpm check:image
set -eu

IMAGE=pokerji:check
NET=pokerji-dev_default
DB="relcheck_$$"
KVUSER="relcheck$$"
PW="check-$(date +%s)-$$"
PORT=4393
PGPW="${POSTGRES_PASSWORD:-pokerji_dev}"
KVPW="${VALKEY_PASSWORD:-pokerji_dev}"

fail() { echo "IMAGE CHECK FAILED: $1"; exit 1; }
psql_admin() { docker compose exec -T -e PGPASSWORD="$PGPW" postgres psql -v ON_ERROR_STOP=1 -U pokerji "$@"; }
kv_admin() { docker compose exec -T valkey valkey-cli "$@"; }

cleanup() {
  docker rm -f pokerji-check >/dev/null 2>&1 || true
  psql_admin -d pokerji -c "drop database if exists $DB with (force)" >/dev/null 2>&1 || true
  psql_admin -d pokerji -c "drop role if exists ${DB}_app" -c "drop role if exists ${DB}_owner" >/dev/null 2>&1 || true
  kv_admin ACL DELUSER "$KVUSER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -t "$IMAGE" . >/dev/null || fail "build"

# The image itself.
[ "$(docker run --rm "$IMAGE" id -u)" != "0" ] || fail "runs as root"
docker run --rm "$IMAGE" sh -c 'test ! -e /app/.env && test ! -d /app/e2e && test ! -d /app/src' \
  || fail "the image carries files it should not"
docker run --rm "$IMAGE" sh -c 'ls /app/migrations/001_init.sql >/dev/null' || fail "migrations missing"

# The roles and the Valkey user, exactly as the deployment notes give them.
docker compose exec -T -e PGPASSWORD="$PGPW" postgres psql -v ON_ERROR_STOP=1 -U pokerji -d pokerji \
  -v db="$DB" -v owner_password="$PW" -v app_password="$PW" < deploy/postgres-roles.sql >/dev/null \
  || fail "postgres-roles.sql"
ACL=$(grep '^ACL SETUSER' deploy/valkey-acl.txt | sed "s/PREFIX/$KVUSER/g; s/PASSWORD/$PW/")
# shellcheck disable=SC2086
kv_admin $ACL >/dev/null || fail "valkey-acl.txt"

OWNER_URL="postgres://${DB}_owner:$PW@postgres:5432/$DB"
APP_URL="postgres://${DB}_app:$PW@postgres:5432/$DB"
KV_URL="redis://$KVUSER:$PW@valkey:6379"
COMMON="--network $NET --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  -e VALKEY_URL=$KV_URL -e ADDRESS_HMAC_SECRET=image-check-secret-of-32-characters -e KEY_PREFIX=$KVUSER:"

# Before migrating, the app must refuse to start.
# shellcheck disable=SC2086
if docker run --rm $COMMON -e DATABASE_URL="$APP_URL" -e MIGRATIONS=check \
  -e ADDRESS_HEADER=x-forwarded-for "$IMAGE" >/dev/null 2>&1; then
  fail "started against an empty database"
fi

# The app role cannot migrate; the owner can.
# shellcheck disable=SC2086
if docker run --rm $COMMON -e DATABASE_URL="$APP_URL" -e MIGRATE_ONLY=1 "$IMAGE" >/dev/null 2>&1; then
  fail "the app role was able to change the schema"
fi
# shellcheck disable=SC2086
[ "$(docker run --rm $COMMON -e DATABASE_URL="$OWNER_URL" -e MIGRATE_ONLY=1 "$IMAGE")" = "Migrations applied." ] \
  || fail "migrate run as owner"

# The app, as production runs it.
# shellcheck disable=SC2086
docker run -d --name pokerji-check $COMMON -p "127.0.0.1:$PORT:3000" \
  -e DATABASE_URL="$APP_URL" -e MIGRATIONS=check -e ORIGIN=https://poker.test \
  -e ADDRESS_HEADER=x-forwarded-for -e XFF_DEPTH=1 "$IMAGE" >/dev/null || fail "run"

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  [ "$(docker inspect -f '{{.State.Health.Status}}' pokerji-check 2>/dev/null)" = "healthy" ] && break
  sleep 1
done
[ "$(docker inspect -f '{{.State.Health.Status}}' pokerji-check)" = "healthy" ] || fail "never became healthy"

FWD="-H x-forwarded-for:203.0.113.9"
# shellcheck disable=SC2086
CREATED=$(curl -s -D - -o /dev/null $FWD -H 'Origin: https://poker.test' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
echo "$CREATED" | grep -qi "^set-cookie: pj_session=.*; Secure" || fail "room not created with a Secure cookie"
echo "$CREATED" | grep -qi "^set-cookie: pj_session=.*HttpOnly" || fail "cookie is readable by scripts"
# shellcheck disable=SC2086
CROSS=$(curl -s -o /dev/null -w '%{http_code}' $FWD -H 'Origin: https://evil.example' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$CROSS" = "403" ] || fail "cross-site post accepted (got $CROSS)"
# A forged forwarded host must not change what the app thinks its origin is.
# shellcheck disable=SC2086
FORGED=$(curl -s -o /dev/null -w '%{http_code}' $FWD -H 'Origin: https://evil.example' \
  -H 'x-forwarded-host: evil.example' -H 'x-forwarded-proto: https' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$FORGED" = "403" ] || fail "a forged forwarded host was believed (got $FORGED)"

# The app role cannot change the schema, and the Valkey user cannot leave its prefix.
if docker compose exec -T -e PGPASSWORD="$PW" postgres psql -U "${DB}_app" -d "$DB" \
  -c 'create table intruder (id int)' >/dev/null 2>&1; then
  fail "the app role created a table"
fi
kv_admin --user "$KVUSER" --pass "$PW" --no-auth-warning SET other:key 1 2>&1 | grep -q NOPERM \
  || fail "the Valkey user wrote outside its prefix"
kv_admin --user "$KVUSER" --pass "$PW" --no-auth-warning KEYS '*' 2>&1 | grep -q NOPERM \
  || fail "the Valkey user can list keys"

# Nothing private in the log, and a clean stop.
LOGS=$(docker logs pokerji-check 2>&1)
echo "$LOGS" | grep -Eqi "203\.0\.113\.9|$PW|pj_session" && fail "the log carries an address, a password or a cookie"
docker stop -t 10 pokerji-check >/dev/null
[ "$(docker inspect -f '{{.State.ExitCode}}' pokerji-check)" = "0" ] || fail "did not stop cleanly"

echo "IMAGE CHECK OK"
```

Run `chmod +x deploy/check-image.sh`, and add to the root `package.json` scripts: `"check:image": "sh deploy/check-image.sh"`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm check:image`
Expected: `IMAGE CHECK FAILED: build` (there is no Dockerfile).

- [ ] **Step 3: Write the image**

Create `.dockerignore`:

```text
.git
**/node_modules
**/build
**/.svelte-kit
**/test-results
**/coverage
.env
.env.*
docs
deploy
apps/web/e2e
apps/web/.impeccable
.impeccable
.superpowers
*.md
!apps/web/static/audio/LICENSES.md
```

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# Build: the whole workspace, to bundle the app.
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pokerji/web build
# The app's production dependencies only, in a folder of their own.
RUN pnpm --filter @pokerji/web deploy --prod --legacy /out

# Run: Node, the built app, its dependencies and the migrations. No compiler, no sources.
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/web/build ./build
COPY --from=build /repo/apps/web/server.js ./server.js
COPY --from=build /repo/packages/poker-server/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
```

- [ ] **Step 4: Run it until it passes**

Run: `docker compose up -d --wait && pnpm check:image`
Expected: `IMAGE CHECK OK`.

Two places where the first run may stop, and what to do. Rule and ledger whichever you meet:
- `pnpm deploy` rejects `--legacy` or the folder lacks a dependency the app imports at run time. The container then fails to become healthy with a module-not-found error in `docker logs`. Use the flags the installed pnpm documents for deploying one workspace package with production dependencies (`pnpm help deploy`); the requirement is only that `/out/node_modules` holds `pg`, `ws`, `iovalkey`, `zod` and `@node-rs/argon2` with its Linux binary.
- Valkey answers `NOPERM` for a command the client sends on connecting. The app then refuses every room creation (limits fail closed) and "room not created" fails. Read the command from `docker compose exec valkey valkey-cli ACL LOG`, add exactly that command to `deploy/valkey-acl.txt`, and run again. Do not widen to a category such as `+@all`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: the container image, checked under the database role and Valkey user it will run as"
```

---

### Task 7: Deployment files and notes

**Files:**
- Create: `deploy/compose.yaml`, `deploy/.env.example`
- Create: `docs/deploy.md`
- Modify: `CLAUDE.md` (Status, Commands), `.gitignore` (`deploy/.env`)

**Interfaces:**
- Consumes: the image and the two role files from Task 6.

- [ ] **Step 1: The compose file**

Create `deploy/compose.yaml`:

```yaml
# Production. Runs beside an existing Traefik, Postgres and Valkey.
#   docker compose --env-file .env --profile migrate run --rm migrate   apply migrations
#   docker compose --env-file .env up -d                                start or update the app
name: pokerji

x-app: &app
  image: ${POKERJI_IMAGE:?set POKERJI_IMAGE}
  init: true
  read_only: true
  tmpfs: [/tmp]
  cap_drop: [ALL]
  security_opt: ['no-new-privileges:true']
  pids_limit: 256
  mem_limit: 512m

services:
  # One-shot: applies migrations as the role that owns the schema, then exits.
  migrate:
    <<: *app
    profiles: [migrate]
    restart: 'no'
    environment:
      MIGRATE_ONLY: '1'
      DATABASE_URL: ${MIGRATE_DATABASE_URL:?set MIGRATE_DATABASE_URL}
      VALKEY_URL: ${VALKEY_URL:?set VALKEY_URL}
      ADDRESS_HMAC_SECRET: ${ADDRESS_HMAC_SECRET:?set ADDRESS_HMAC_SECRET}
      KEY_PREFIX: ${KEY_PREFIX:-pokerji:}
    networks: [data]

  web:
    <<: *app
    restart: unless-stopped
    stop_grace_period: 15s
    environment:
      DATABASE_URL: ${DATABASE_URL:?set DATABASE_URL}
      VALKEY_URL: ${VALKEY_URL:?set VALKEY_URL}
      ADDRESS_HMAC_SECRET: ${ADDRESS_HMAC_SECRET:?set ADDRESS_HMAC_SECRET}
      KEY_PREFIX: ${KEY_PREFIX:-pokerji:}
      # The app role cannot change the schema; it verifies it and refuses to start if behind.
      MIGRATIONS: check
      # The one origin the app answers to. Forwarded host and protocol headers are not consulted.
      ORIGIN: https://${POKERJI_HOST:?set POKERJI_HOST}
      # Traefik is the only hop, so the client is the last entry it wrote.
      ADDRESS_HEADER: x-forwarded-for
      XFF_DEPTH: '1'
      RETENTION_DAYS: ${RETENTION_DAYS:-30}
      BACKUP_ROTATION_DAYS: ${BACKUP_ROTATION_DAYS:-}
    # No ports: the container is reachable only from Traefik's network.
    networks: [proxy, data]
    labels:
      - traefik.enable=true
      - traefik.docker.network=${TRAEFIK_NETWORK:?set TRAEFIK_NETWORK}
      - traefik.http.routers.pokerji.rule=Host(`${POKERJI_HOST}`)
      - traefik.http.routers.pokerji.entrypoints=${TRAEFIK_ENTRYPOINT:-websecure}
      - traefik.http.routers.pokerji.tls=true
      - traefik.http.routers.pokerji.tls.certresolver=${TRAEFIK_CERT_RESOLVER:?set TRAEFIK_CERT_RESOLVER}
      - traefik.http.routers.pokerji.middlewares=pokerji-flood
      # Room codes are in the path, so this router writes no access log (Traefik 3.2 or later).
      - traefik.http.routers.pokerji.observability.accesslogs=false
      # Flood protection only; the app has its own limits per action. Sized so that a
      # whole team behind one office address can load the page at the same moment.
      - traefik.http.middlewares.pokerji-flood.ratelimit.average=100
      - traefik.http.middlewares.pokerji-flood.ratelimit.burst=400
      - traefik.http.middlewares.pokerji-flood.ratelimit.period=1s
      - traefik.http.services.pokerji.loadbalancer.server.port=3000

networks:
  proxy:
    external: true
    name: ${TRAEFIK_NETWORK}
  data:
    external: true
    name: ${DATA_NETWORK:?set DATA_NETWORK}
```

Create `deploy/.env.example`:

```sh
# Copy to deploy/.env on the server. Never commit the copy.
POKERJI_IMAGE=pokerji:1
POKERJI_HOST=poker.example.org

# Existing Docker networks: Traefik's, and the one shared with Postgres and Valkey.
TRAEFIK_NETWORK=traefik
DATA_NETWORK=shared-data
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt

# The app role (rows only) and the owner role (migrations only). See docs/deploy.md.
DATABASE_URL=postgres://pokerji_app:CHANGE-ME@postgres:5432/pokerji
MIGRATE_DATABASE_URL=postgres://pokerji_owner:CHANGE-ME@postgres:5432/pokerji
VALKEY_URL=redis://pokerji:CHANGE-ME@valkey:6379
KEY_PREFIX=pokerji:

# 32 or more random characters: openssl rand -base64 48
ADDRESS_HMAC_SECRET=

RETENTION_DAYS=30
# How many days your Postgres backups are kept. Shown on the privacy page. Leave empty if there are none.
BACKUP_ROTATION_DAYS=
```

Add `deploy/.env` to `.gitignore` (it is already covered by `.env`; add the explicit line so the intent is visible).

Validate: `POKERJI_IMAGE=x POKERJI_HOST=h TRAEFIK_NETWORK=a DATA_NETWORK=b TRAEFIK_CERT_RESOLVER=c DATABASE_URL=d MIGRATE_DATABASE_URL=e VALKEY_URL=f ADDRESS_HMAC_SECRET=g docker compose -f deploy/compose.yaml --profile migrate config >/dev/null && echo VALID`
Expected: `VALID`.

- [ ] **Step 2: The notes**

Create `docs/deploy.md` with these sections, in this order, written as numbered steps a person follows once. Every command is given in full; every value the owner must choose is named as a variable from `deploy/.env.example`.

1. **What you are deploying.** One container, no published ports, reached through Traefik; a dedicated Postgres database with two roles; a dedicated Valkey user.
2. **Before you start.** The requirements, each with the command that checks it: Traefik 3.2 or later (`docker exec <traefik> traefik version`); the names of Traefik's network and of the network shared with Postgres and Valkey (`docker network ls`); a DNS name pointing at the server; Traefik redirects HTTP to HTTPS on its `web` entrypoint (show the two static-configuration lines: `entryPoints.web.http.redirections.entryPoint.to=websecure` and `.scheme=https`).
3. **Traefik must be the only way in, and must write the forwarded headers itself.** State the rule and why: the app takes the client's address from the last `X-Forwarded-For` entry for rate limiting. Traefik's default does this (it discards forwarded headers from clients unless `forwardedHeaders.insecure` or `trustedIPs` is set on the entrypoint); say to confirm neither is set to trust the public. If another proxy or CDN sits in front of Traefik, `XFF_DEPTH` must be raised by one for each, and that proxy's addresses added to Traefik's `forwardedHeaders.trustedIPs`; otherwise every visitor shares one limit.
4. **Access logs.** The room code is in the path and is the room's secret. The router label turns this router's access log off. On a Traefik older than 3.2, either turn access logs off globally or drop the three fields that carry the path: `accesslog.fields.names.RequestPath=drop`, `accesslog.fields.names.RequestLine=drop` and `accesslog.fields.names.OriginalRequestPath=drop` (confirm the field names against the installed version's documentation). The privacy page says no log is kept of the pages a person opens; this section is what makes that true, so it is not optional.
5. **Postgres.** Run `deploy/postgres-roles.sql` with the `psql -v` line from its header. Explain the two roles in two sentences. Note that `pnpm check:image` proves the app role cannot change the schema.
6. **Valkey.** Run the line from `deploy/valkey-acl.txt`, and persist it (`ACL SAVE` when an ACL file is configured, or add the line to the configuration). State what Valkey holds for this app: rate-limit counters keyed by a keyed hash of the address, never the address itself, and room locks; nothing that needs to survive a restart. If the shared Valkey has persistence on, those counters are written to its disk for at most an hour past their window; say so plainly, since the privacy page describes them as short-lived.
7. **The image.** Build on the server from a checkout at a tagged commit: `docker build -t pokerji:1 .`. Run `pnpm check:image` on a development machine before tagging.
8. **Configure.** Copy `deploy/.env.example` to `deploy/.env`, fill it, `chmod 600`. A table of every variable: name, meaning, example, whether secret.
9. **First start.** `docker compose --env-file .env --profile migrate run --rm migrate` (expect `Migrations applied.`), then `docker compose --env-file .env up -d`, then the checks: `docker compose ps` shows `healthy`; `curl -sI https://$POKERJI_HOST/` shows the `content-security-policy` and `strict-transport-security` headers; open the site, create a room, open it in a second browser, vote, reveal.
10. **Updating.** Build the new tag, run the migrate job, `up -d`. Live rooms close and browsers reconnect by themselves; a round in progress keeps its votes only if it was already revealed (state it: an unrevealed round is lost on restart).
11. **Rolling back.** Set `POKERJI_IMAGE` to the previous tag and `up -d`. Migrations are forward-only: an older image started against a newer schema runs if the migration only added things; restore from backup otherwise.
12. **Backups.** Back up the `pokerji` database with the rest of Postgres. Set `BACKUP_ROTATION_DAYS` to the real retention, because the privacy page prints it: a deleted room lives on in backups for that long.
13. **Limits you should know.** The table from the spec, plus two notes: more than 30 people behind one address cannot all join within ten minutes although a room holds 50 (raise `LIMITS.join` in code if a large office needs it); the service creates at most 1,000 rooms an hour.
14. **Do not host untrusted apps on sibling subdomains.** A site on another subdomain of the same registrable domain could set a cookie that this site receives. Keep `POKERJI_HOST`'s parent domain to things you control.
15. **What is logged.** One JSON line per unexpected problem, with a fixed description and nothing else. No request log.

- [ ] **Step 3: Check the notes against the files**

Run: `grep -o '\${[A-Z_]*' deploy/compose.yaml | sort -u | tr -d '${' > /tmp/compose-vars && for v in $(cat /tmp/compose-vars); do grep -q "^$v=" deploy/.env.example || echo "MISSING in .env.example: $v"; grep -q "$v" docs/deploy.md || echo "MISSING in deploy.md: $v"; done; echo CHECKED`
Expected: `CHECKED` with no `MISSING` lines.

- [ ] **Step 4: Bring the spec's Deployment section in line**

In `docs/superpowers/specs/2026-10-12-planning-poker-design.md`, replace the bullet "The client address is read from Traefik's forwarded header, and only when the request comes from a configured trusted proxy address." with: "The client address is read from the last entry of Traefik's `X-Forwarded-For`. The container publishes no ports and sits only on Traefik's network and the data network, so Traefik is the only thing that can reach it; the app does not check the sender's address itself. The site's origin is fixed by `ORIGIN`, so forwarded host and protocol headers are never trusted." Add two bullets: "The app's database role cannot change the schema; migrations are applied by a one-shot run under a separate owner role." and "The image runs as a non-root user on a read-only filesystem with all capabilities dropped."

- [ ] **Step 5: Update `CLAUDE.md`**

In Status, replace "What remains is release (Dockerfile, Traefik notes, final security audit)." with "It is packaged for release: `Dockerfile`, `deploy/` and `docs/deploy.md`. Deployment is the owner's action." In Commands add: "- Check the image as production runs it: `pnpm check:image` (needs the development services)". In Architecture add: "- In production the app's database role cannot change the schema: `MIGRATIONS=check` makes it verify and refuse to start if behind, and migrations are applied by a one-shot run of the same image with `MIGRATE_ONLY=1` under the owner role. A new migration therefore needs the migrate job run before the new image starts." and "- `apps/web/server.js` sets the base security headers on every response, because static files never reach `hooks.server.ts`."

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: deployment files and notes for Traefik, Postgres and Valkey"
```

---

### Task 8: Final security audit of the whole app

The spec requires an Octopus security audit before first deployment. This task has no code of its own until the audit reports.

- [ ] **Step 1: Run everything once, clean**

Run: `pnpm format:check && pnpm typecheck && pnpm --filter @pokerji/web typecheck && pnpm test && pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke && pnpm --filter @pokerji/web e2e && pnpm check:image`
Expected: every command succeeds; `SMOKE OK`; `IMAGE CHECK OK`.

- [ ] **Step 2: Dispatch the audit**

Dispatch `octo:skills:octopus-security-audit` on the most capable model, read-only, with: the repository path; the spec and `docs/deploy.md`; every ledger in `docs/superpowers/reviews/` (so it can check that past findings stayed fixed and weigh the rulings); this plan's Review Focus verbatim; and this scope: the whole application as it will be deployed, not a diff. Ask it to cover, at least: vote secrecy before reveal on every path that sends room state; session and cookie handling; the join flow's indistinguishable refusals and its timing; passcode setting and the sign-out transaction; ownership and the moderator link; every rate limit and what happens when Valkey is down; WebSocket upgrade, message validation and resource bounds; the Content Security Policy and every header, on pages and on static files; what is logged; what is stored and for how long against the privacy page's claims, sentence by sentence; the container (user, filesystem, capabilities, what the image contains); the compose file and the Traefik labels; the Postgres roles and the Valkey ACL; and the dependency list (`pnpm audit --prod`). Findings as Critical, High, Medium, Low, each with a concrete attack or failure and the smallest fix.

Dispatch `octo:skills:octopus-code-review` in parallel on this branch's diff against `main`.

- [ ] **Step 3: Fix pass**

Re-grade each finding by what a person using or running the service would suffer. Critical, High and Medium (and the code review's Critical and Important) are fixed in one pass, each with a test that fails first, then the full run from Step 1 again. Low and Minor go to the ledger as deferred. A finding left unfixed is a ruling in the ledger with its cost.

- [ ] **Step 4: Write the ledger and the release checklist**

Create `docs/superpowers/reviews/2026-10-13-poker-release-ledger.md` with the audit's result, what was fixed (test names), rulings and deferred items. Append to `docs/deploy.md` a section "Before the first deployment" listing anything the audit says the owner must do or decide on the server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: record the final security audit and what it changed"
```

Then use superpowers:finishing-a-development-branch. Deployment itself is not part of this plan.
