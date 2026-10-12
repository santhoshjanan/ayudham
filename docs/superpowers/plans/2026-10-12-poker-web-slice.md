# Planning Poker in a Browser (Plan 3 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a full round playable in a browser: create a room, join it from a second browser, vote, reveal, and see the result, with the security headers, cookie and WebSocket checks in place.

**Architecture:** The server logic that remains (input validation, the create/join/resume flows, wiring the pieces into one app object, and the WebSocket upgrade check) goes into `packages/poker-server`, framework-free and tested against real services. A new SvelteKit 3 app in `apps/web` is a thin shell over it: three pages, one hook, and a custom Node entry that hands WebSocket upgrades to the server package. The pages use plain semantic markup; the visual design comes in Plan 4.

**Tech Stack:** SvelteKit 3.0, Svelte 5.57, Vite 8, `@sveltejs/adapter-node` 6, `ws` 8.22, Playwright 1.63, plus everything from Plans 1 and 2.

**Spec:** `docs/superpowers/specs/2026-10-12-planning-poker-design.md`.

## Where this plan sits

| Plan | Delivers | Status |
|---|---|---|
| 1. Core | Protocol and room engine | Done |
| 2. Server core | `packages/poker-server` | Done |
| **3. In a browser (this plan)** | Flows, upgrade handler, SvelteKit app with home, create and room pages, end-to-end test | This plan |
| 4. Interface and release | Settings, history, recovery, passcode and privacy pages; the Impeccable interface in both themes; audio; Dockerfile and deployment notes; Octopus security audit of the whole app | After this plan lands |

Not in this plan, by design: any page for settings, history, recovery, passcodes or deletion. The join flow already honours a passcode, so nothing built here has to change when those pages arrive.

## Verified against SvelteKit 3.0.1 on 2026-10-12

A throwaway project confirmed each of these. The plan relies on them.

- Configuration lives in `vite.config.ts`, passed to `sveltekit({...})`. There is no `svelte.config.js`.
- Hook types come from `@sveltejs/kit/hooks` (`Handle`, `ServerInit`), not `@sveltejs/kit`. `fail`, `redirect`, `Actions` and `RequestEvent` still come from `@sveltejs/kit`.
- The library alias is `#lib`, declared under `imports` in `package.json`, and imports through it carry the file extension (`#lib/server/pokerji.ts`).
- `$app/env` exports `dev`.
- The `init` hook runs when `build/handler.js` is imported, before the server listens.
- A module-level value stored on `globalThis` under `Symbol.for(...)` is shared between SvelteKit's bundled server code and a custom entry file. That is how the entry file reaches the WebSocket handler.
- In dev, a Vite plugin can serve upgrades with `server.ssrLoadModule(...)` and sees the same module state as SvelteKit's own requests.
- `csp: { mode: 'nonce', directives }` adds a per-request nonce to `script-src`.
- Behind a proxy, form posts are accepted only when the adapter can work out the public origin: set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`. Without them the adapter assumes `https` and every form post over plain HTTP returns 403.
- `event.getClientAddress()` throws when `ADDRESS_HEADER` is set and the header is missing, as on a health check from inside the container network.

## Global Constraints

- All constraints from Plans 1 and 2 still apply, including: no room codes, names, titles, votes, tokens or client addresses in logs or `report(...)`; SQL always parameterised; rate limits fail closed.
- Work happens on branch `feat/poker-web-slice`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `packages/*` keep TypeScript 7 from the root. `apps/web` uses the TypeScript version the SvelteKit template pins (`^6.0.3`), because `svelte-check` is tied to it.
- Tests in `packages/poker-server` need `docker compose up -d --wait`.
- Never log a raw `pg` or `iovalkey` error: they can carry token hashes, names and keys. Catch at the boundary and call `report` with a fixed string.
- Join failures are indistinguishable: an unknown room, a wrong passcode, a locked-out client and a full room all produce the same result and take the same path through one Argon2 verification.
- The session cookie is `pj_session`, scoped to `Path=/poker/r/<code>`, `HttpOnly`, `SameSite=Lax`, `Secure` whenever the page was served over HTTPS, with a 30-day lifetime refreshed on each visit.
- A WebSocket upgrade is accepted only when the path matches, the `Origin` header equals the site's own origin, and the cookie resolves to a session in that room. Every refusal is the same `403`.
- The `ws` server is created with `maxPayload: 2048`. Binary frames close the socket.
- No inline `style` attributes and no Svelte `transition:`/`animate:` directives in `apps/web`: the Content Security Policy forbids inline styles.
- No third-party origins: no external fonts, scripts, images or analytics.
- Do not add `minimumReleaseAgeExclude` entries to install a just-published dependency; pin the previous release.

## Review Focus

1. Joining an unknown room, joining with a wrong passcode, and joining while rate-limited return results that cannot be told apart. (Task 2)
2. A WebSocket opened from another site with a valid cookie is refused. (Task 4)
3. A request with no client-address header does not crash; it is treated as one shared "unknown" client. (Tasks 1 and 4)
4. A session cookie from one room presented to another room is refused, over HTTP and over WebSocket. (Tasks 2 and 4)
5. Reloading the room page keeps you in the room and shows the current state. (Task 7)

## File Structure

```
packages/poker-server/
  src/validate.ts        display name, room code, deck id and passcode schemas; address normalisation
  src/flows.ts           createRoomFlow, joinRoomFlow, resumeSession
  src/app.ts             createApp: pool, Valkey, registry, timers, hostStore
  src/upgrade.ts         createUpgradeHandler and its request helpers
  src/config.ts          (modified) adds keyPrefix
  src/limiter.ts         (modified) adds overLimit
  test/validate.test.ts  test/flows.test.ts  test/app.test.ts  test/upgrade.test.ts
apps/web/
  package.json  tsconfig.json  vite.config.ts  server.js  playwright.config.ts
  src/app.html  src/app.d.ts  src/hooks.server.ts
  src/lib/server/pokerji.ts    the one shared runtime object
  src/lib/server/address.ts    client address that never throws
  src/lib/server/cookie.ts     session cookie options
  src/routes/+layout.svelte  src/routes/+page.svelte
  src/routes/healthz/+server.ts
  src/routes/poker/+page.server.ts  src/routes/poker/+page.svelte
  src/routes/poker/r/[code]/+page.server.ts  +page.svelte  Room.svelte
  e2e/round.spec.ts
```

---

### Task 1: Input validation and address normalisation

**Files:**
- Create: `packages/poker-server/src/validate.ts`
- Modify: `packages/poker-server/src/index.ts`
- Test: `packages/poker-server/test/validate.test.ts`

**Interfaces:**
- Consumes: `NAME_MIN`, `NAME_MAX`, `PASSCODE_MIN`, `PASSCODE_MAX` from `@pokerji/protocol`.
- Produces, from `@pokerji/poker-server`:
  - `nameSchema` (trimmed, 1–30 characters, one line), `roomCodeSchema` (exactly 12 letters and digits), `deckIdSchema` (the four built-in ids), `passcodeSchema` (4–64 characters)
  - `normaliseAddress(address: string): string` — an IPv4 address as is; an IPv4-mapped IPv6 address as its IPv4 form; any other IPv6 address as its `/64` prefix; anything else as `'unknown'`.

- [ ] **Step 1: Branch and write the failing tests**

```bash
git switch -c feat/poker-web-slice
```

`packages/poker-server/test/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  deckIdSchema,
  nameSchema,
  normaliseAddress,
  passcodeSchema,
  roomCodeSchema,
} from '../src/index.ts';

const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('nameSchema', () => {
  it('accepts a name and trims it', () => {
    expect(nameSchema.parse('  Ann  ')).toBe('Ann');
    expect(ok(nameSchema, 'x'.repeat(30))).toBe(true);
    expect(ok(nameSchema, 'Zoë 山田')).toBe(true);
  });

  it('rejects empty, too long, multi-line and trick names', () => {
    for (const bad of ['', '   ', 'x'.repeat(31), 'a\nb', 'a\u0000b', 'a‮b', 12, null]) {
      expect(ok(nameSchema, bad)).toBe(false);
    }
  });
});

describe('roomCodeSchema', () => {
  it('accepts exactly 12 letters and digits', () => {
    expect(ok(roomCodeSchema, 'AbCdEf123456')).toBe(true);
    for (const bad of ['', 'AbCdEf12345', 'AbCdEf1234567', 'AbCdEf12345!', 'AbCdEf 12345', 7]) {
      expect(ok(roomCodeSchema, bad)).toBe(false);
    }
  });
});

describe('deckIdSchema and passcodeSchema', () => {
  it('accept only the built-in deck ids', () => {
    for (const id of ['fibonacci', 'modifiedFibonacci', 'tshirt', 'powersOfTwo']) {
      expect(ok(deckIdSchema, id)).toBe(true);
    }
    expect(ok(deckIdSchema, 'custom')).toBe(false);
  });

  it('bound the passcode length', () => {
    expect(ok(passcodeSchema, 'abcd')).toBe(true);
    expect(ok(passcodeSchema, 'x'.repeat(64))).toBe(true);
    expect(ok(passcodeSchema, 'abc')).toBe(false);
    expect(ok(passcodeSchema, 'x'.repeat(65))).toBe(false);
  });
});

describe('normaliseAddress', () => {
  it('keeps an IPv4 address and unwraps an IPv4-mapped one', () => {
    expect(normaliseAddress('203.0.113.7')).toBe('203.0.113.7');
    expect(normaliseAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('reduces an IPv6 address to its /64, so one network is one client', () => {
    expect(normaliseAddress('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(normaliseAddress('2001:db8:1:2::9')).toBe('2001:db8:1:2::/64');
    expect(normaliseAddress('2001:DB8::1')).toBe('2001:db8:0:0::/64');
    expect(normaliseAddress('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(normaliseAddress('::1')).toBe('0:0:0:0::/64');
  });

  it('treats anything else as one unknown client', () => {
    for (const odd of ['', 'unknown', 'not an address', '999.1.1.1', '1.2.3']) {
      expect(normaliseAddress(odd)).toBe('unknown');
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `validate.test.ts`, because the schemas are not exported.

- [ ] **Step 3: Implement**

`packages/poker-server/src/validate.ts`:

```ts
import { isIPv4, isIPv6 } from 'node:net';
import { NAME_MAX, NAME_MIN, PASSCODE_MAX, PASSCODE_MIN } from '@pokerji/protocol';
import { z } from 'zod';

/** One line of text: no control characters, direction overrides or unpaired surrogates. */
const ONE_LINE = /^[^\p{Cc}\p{Cs}‪-‮⁦-⁩]*$/u;

export const nameSchema = z.string().trim().min(NAME_MIN).max(NAME_MAX).regex(ONE_LINE);

export const roomCodeSchema = z.string().regex(/^[A-Za-z0-9]{12}$/);

export const deckIdSchema = z.enum(['fibonacci', 'modifiedFibonacci', 'tshirt', 'powersOfTwo']);

export const passcodeSchema = z.string().min(PASSCODE_MIN).max(PASSCODE_MAX);

function prefix64(bare: string): string {
  const [head = '', tail = ''] = bare.split('::');
  const leading = head === '' ? [] : head.split(':');
  const trailing = tail === '' ? [] : tail.split(':');
  const groups = bare.includes('::')
    ? [...leading, ...Array<string>(Math.max(0, 8 - leading.length - trailing.length)).fill('0')]
    : leading;
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}

/**
 * The form of a client address used for rate limiting. One IPv6 /64 counts as
 * one client, because a single subscriber usually controls the whole prefix.
 * Anything unrecognised becomes one shared "unknown" client.
 */
export function normaliseAddress(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped !== undefined && isIPv4(mapped)) return mapped;
  if (isIPv4(address)) return address;
  // A link-local address may carry a zone ("fe80::1%eth0"); the zone is not part of the address.
  const bare = address.split('%')[0] ?? '';
  if (isIPv6(bare)) return prefix64(bare);
  return 'unknown';
}
```

Add this line to `packages/poker-server/src/index.ts`, keeping the list alphabetical:

```ts
export * from './validate.ts';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add input validation and address normalisation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Create, join and resume flows

**Files:**
- Create: `packages/poker-server/src/flows.ts`
- Modify: `packages/poker-server/src/limiter.ts`, `packages/poker-server/src/index.ts`
- Test: `packages/poker-server/test/flows.test.ts`, `packages/poker-server/test/limiter.test.ts`

**Interfaces:**
- Consumes: Task 1's schemas and `normaliseAddress`; from Plan 2: `Db`, `Kv`, `KEY_PREFIX`, `LIMITS`, `withinLimit`, `addressKey`, `newRoomCode`, `newToken`, `hashToken`, `hashPasscode`, `passcodeMatches`, `insertRoom`, `findRoomByCode`, `touchRoom`, `insertSession`, `findSession`, `countSessions`, `RoomRow`, `SessionRow`; `BUILT_IN_DECKS`, `PASSCODE_MAX`, `roleSchema` from `@pokerji/protocol`.
- Produces:
  - `overLimit(kv: Kv, key: string, limit: Limit, prefix?: string): Promise<boolean>` — reads a counter without adding to it; `true` when Valkey cannot be reached.
  - `interface FlowDeps { db: Db; kv: Kv; addressSecret: string; keyPrefix?: string; maxSessionsPerRoom?: number }`
  - `createRoomFlow(deps, input: { address: string; name: unknown; deckId: unknown }): Promise<{ ok: true; code: string; sessionToken: string; recoveryToken: string } | { ok: false; reason: 'invalid' | 'refused' }>`
  - `joinRoomFlow(deps, input: { address: string; code: unknown; name: unknown; role: unknown; passcode: unknown }): Promise<{ ok: true; sessionToken: string } | { ok: false; reason: 'invalid' | 'refused' }>`
  - `resumeSession(deps: { db: Db }, input: { code: unknown; token: unknown }): Promise<{ room: RoomRow; session: SessionRow } | null>`

- [ ] **Step 1: Write the failing tests**

Add to `packages/poker-server/test/limiter.test.ts`, inside the existing `describe('withinLimit', ...)` block's file, as a new top-level block at the end. Also add `overLimit` to that file's import from `'../src/index.ts'`.

```ts
describe('overLimit', () => {
  it('reads a counter without adding to it', async () => {
    const limit = { max: 2, windowSeconds: 60 };
    expect(await overLimit(kv, 'o1', limit, prefix)).toBe(false);
    await withinLimit(kv, 'o1', limit, prefix);
    expect(await overLimit(kv, 'o1', limit, prefix)).toBe(false);
    await withinLimit(kv, 'o1', limit, prefix);
    expect(await overLimit(kv, 'o1', limit, prefix)).toBe(true);
    expect(await overLimit(kv, 'o1', limit, prefix)).toBe(true);
    expect(await kv.get(`${prefix}rl:o1`)).toBe('2');
  });

  it('says over the limit when Valkey cannot be reached', async () => {
    const unreachable = createKv('redis://127.0.0.1:1');
    try {
      expect(await overLimit(unreachable, 'o2', { max: 100, windowSeconds: 60 }, prefix)).toBe(
        true,
      );
    } finally {
      unreachable.disconnect();
    }
  });
});
```

`packages/poker-server/test/flows.test.ts`:

```ts
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createKv,
  createRoomFlow,
  findRoomByCode,
  hashPasscode,
  joinRoomFlow,
  resumeSession,
  setPasscodeHash,
  type Db,
  type FlowDeps,
} from '../src/index.ts';
import { testDb, testPrefix, VALKEY_URL } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
const kv = createKv(VALKEY_URL);
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(async () => {
  await drop();
  await kv.quit();
});

/** Fresh rate-limit counters for each test. */
const deps = (extra: Partial<FlowDeps> = {}): FlowDeps => ({
  db,
  kv,
  addressSecret: 's'.repeat(32),
  keyPrefix: testPrefix(),
  ...extra,
});

const create = (flow: FlowDeps, address = '203.0.113.1') =>
  createRoomFlow(flow, { address, name: 'Mo', deckId: 'fibonacci' });

async function room(flow: FlowDeps) {
  const created = await create(flow);
  if (!created.ok) throw new Error('room was not created');
  return created;
}

const join = (flow: FlowDeps, code: unknown, extra: Record<string, unknown> = {}) =>
  joinRoomFlow(flow, {
    address: '203.0.113.2',
    code,
    name: 'Ann',
    role: 'voter',
    passcode: '',
    ...extra,
  });

describe('createRoomFlow', () => {
  it('creates a room and a moderator session, and returns secrets that resolve', async () => {
    const flow = deps();
    const created = await room(flow);
    expect(created.code).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(created.recoveryToken).not.toBe(created.sessionToken);

    const stored = await findRoomByCode(db, created.code);
    expect(stored?.deck).toEqual(BUILT_IN_DECKS.fibonacci.deck);
    expect(stored?.recoveryHash).not.toContain(created.recoveryToken);

    const resumed = await resumeSession(flow, { code: created.code, token: created.sessionToken });
    expect(resumed?.session).toMatchObject({ name: 'Mo', role: 'voter', moderator: true });
  });

  it('rejects a bad name or deck without creating anything', async () => {
    const flow = deps();
    expect(await createRoomFlow(flow, { address: 'a', name: '', deckId: 'fibonacci' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await createRoomFlow(flow, { address: 'a', name: 'Mo', deckId: 'nope' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('refuses the eleventh room from one client in an hour, and not another client', async () => {
    const flow = deps();
    for (let i = 0; i < 10; i += 1) expect((await create(flow)).ok).toBe(true);
    expect(await create(flow)).toEqual({ ok: false, reason: 'refused' });
    expect((await create(flow, '203.0.113.99')).ok).toBe(true);
  });

  it('counts one IPv6 /64 as one client', async () => {
    const flow = deps();
    for (let i = 0; i < 10; i += 1) await create(flow, `2001:db8:1:2::${i + 1}`);
    expect(await create(flow, '2001:db8:1:2:ffff::1')).toEqual({ ok: false, reason: 'refused' });
  });
});

describe('joinRoomFlow', () => {
  it('admits someone to an open room', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const joined = await join(flow, code, { role: 'spectator' });
    if (!joined.ok) throw new Error('join failed');
    const resumed = await resumeSession(flow, { code, token: joined.sessionToken });
    expect(resumed?.session).toMatchObject({ name: 'Ann', role: 'spectator', moderator: false });
  });

  it('rejects a bad name or role as invalid', async () => {
    const flow = deps();
    const { code } = await room(flow);
    expect(await join(flow, code, { name: '' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await join(flow, code, { role: 'moderator' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('gives the same answer for an unknown room, a malformed code and a wrong passcode', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));

    const refused = { ok: false, reason: 'refused' };
    expect(await join(flow, 'AAAAAAAAAAAA')).toEqual(refused);
    expect(await join(flow, 'not-a-code')).toEqual(refused);
    expect(await join(flow, 42)).toEqual(refused);
    expect(await join(flow, code, { passcode: 'wrong' })).toEqual(refused);
    expect(await join(flow, code, { passcode: '' })).toEqual(refused);
    expect(await join(flow, code, { passcode: 12345 })).toEqual(refused);
  });

  it('admits someone with the right passcode', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));
    expect((await join(flow, code, { passcode: 'open sesame' })).ok).toBe(true);
  });

  it('locks one client out after five wrong passcodes, and nobody else', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));

    for (let i = 0; i < 5; i += 1) await join(flow, code, { passcode: `guess ${i}` });
    expect(await join(flow, code, { passcode: 'open sesame' })).toEqual({
      ok: false,
      reason: 'refused',
    });
    const other = await join(flow, code, { passcode: 'open sesame', address: '203.0.113.50' });
    expect(other.ok).toBe(true);
  });

  it('does not count a correct passcode as a failure', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));
    for (let i = 0; i < 7; i += 1) {
      expect((await join(flow, code, { passcode: 'open sesame' })).ok).toBe(true);
    }
  });

  it('refuses the thirty-first join attempt from one client in ten minutes', async () => {
    const flow = deps();
    const { code } = await room(flow);
    for (let i = 0; i < 30; i += 1) await join(flow, 'AAAAAAAAAAAA');
    expect(await join(flow, code)).toEqual({ ok: false, reason: 'refused' });
  });

  it('refuses a join when the room already holds its maximum of sessions', async () => {
    const flow = deps({ maxSessionsPerRoom: 2 });
    const { code } = await room(flow);
    expect((await join(flow, code)).ok).toBe(true);
    expect(await join(flow, code)).toEqual({ ok: false, reason: 'refused' });
  });
});

describe('resumeSession', () => {
  it('returns nothing for a wrong, missing or malformed token or code', async () => {
    const flow = deps();
    const { code, sessionToken } = await room(flow);
    expect(await resumeSession(flow, { code, token: 'wrong' })).toBeNull();
    expect(await resumeSession(flow, { code, token: undefined })).toBeNull();
    expect(await resumeSession(flow, { code, token: 'x'.repeat(5_000) })).toBeNull();
    expect(await resumeSession(flow, { code: 'not-a-code', token: sessionToken })).toBeNull();
    expect(await resumeSession(flow, { code: 'AAAAAAAAAAAA', token: sessionToken })).toBeNull();
  });

  it('does not accept one room’s session in another room', async () => {
    const flow = deps();
    const first = await room(flow);
    const second = await room(flow);
    expect(await resumeSession(flow, { code: second.code, token: first.sessionToken })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `flows.test.ts` and in the new `overLimit` block, because those functions are not exported.

- [ ] **Step 3: Add overLimit**

Append to `packages/poker-server/src/limiter.ts`:

```ts
/**
 * Says whether a counter has already reached its limit, without adding to it.
 * Used where only failures should count. Unreachable Valkey reads as over the limit.
 */
export async function overLimit(
  kv: Kv,
  key: string,
  limit: Limit,
  prefix: string = KEY_PREFIX,
): Promise<boolean> {
  try {
    const count = Number((await kv.get(`${prefix}rl:${key}`)) ?? 0);
    return !(count < limit.max);
  } catch {
    return true;
  }
}
```

- [ ] **Step 4: Implement the flows**

`packages/poker-server/src/flows.ts`:

```ts
import { BUILT_IN_DECKS, PASSCODE_MAX, roleSchema } from '@pokerji/protocol';
import type { Db } from './db.ts';
import { KEY_PREFIX, type Kv } from './kv.ts';
import { LIMITS, overLimit, withinLimit } from './limiter.ts';
import { findRoomByCode, insertRoom, touchRoom, type RoomRow } from './rooms.ts';
import {
  addressKey,
  hashPasscode,
  hashToken,
  newRoomCode,
  newToken,
  passcodeMatches,
} from './secrets.ts';
import { countSessions, findSession, insertSession, type SessionRow } from './sessions.ts';
import { deckIdSchema, nameSchema, normaliseAddress, roomCodeSchema } from './validate.ts';

export interface FlowDeps {
  db: Db;
  kv: Kv;
  /** Keys the HMAC that turns a client address into a rate-limit key. */
  addressSecret: string;
  keyPrefix?: string;
  /** Sessions one room may hold. Bounds what a single link can make the database store. */
  maxSessionsPerRoom?: number;
}

const DEFAULT_MAX_SESSIONS = 200;
const INVALID = { ok: false, reason: 'invalid' } as const;
/** One answer for every reason a request is turned away, so nothing can be inferred from it. */
const REFUSED = { ok: false, reason: 'refused' } as const;

const clientKey = (deps: FlowDeps, address: string) =>
  addressKey(deps.addressSecret, normaliseAddress(address));

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

let dummyHash: Promise<string> | undefined;
/** A real Argon2 hash that no passcode matches, verified against when there is nothing else to check. */
const dummy = () => (dummyHash ??= hashPasscode('pokerji: there is no such passcode'));

export type CreateResult =
  | { ok: true; code: string; sessionToken: string; recoveryToken: string }
  | { ok: false; reason: 'invalid' | 'refused' };

export async function createRoomFlow(
  deps: FlowDeps,
  input: { address: string; name: unknown; deckId: unknown },
): Promise<CreateResult> {
  const name = nameSchema.safeParse(input.name);
  const deckId = deckIdSchema.safeParse(input.deckId);
  if (!name.success || !deckId.success) return INVALID;

  const prefix = deps.keyPrefix ?? KEY_PREFIX;
  const client = clientKey(deps, input.address);
  if (!(await withinLimit(deps.kv, `create:${client}`, LIMITS.roomCreate, prefix))) return REFUSED;

  const recoveryToken = newToken();
  let room: RoomRow | undefined;
  for (let attempt = 0; attempt < 3 && !room; attempt += 1) {
    try {
      room = await insertRoom(deps.db, {
        code: newRoomCode(),
        deck: BUILT_IN_DECKS[deckId.data].deck,
        recoveryHash: hashToken(recoveryToken),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (!room) return REFUSED;

  const sessionToken = newToken();
  await insertSession(deps.db, {
    roomId: room.id,
    tokenHash: hashToken(sessionToken),
    name: name.data,
    role: 'voter',
    moderator: true,
  });
  return { ok: true, code: room.code, sessionToken, recoveryToken };
}

export type JoinResult =
  | { ok: true; sessionToken: string }
  | { ok: false; reason: 'invalid' | 'refused' };

export async function joinRoomFlow(
  deps: FlowDeps,
  input: { address: string; code: unknown; name: unknown; role: unknown; passcode: unknown },
): Promise<JoinResult> {
  const name = nameSchema.safeParse(input.name);
  const role = roleSchema.safeParse(input.role);
  if (!name.success || !role.success) return INVALID;

  const prefix = deps.keyPrefix ?? KEY_PREFIX;
  const client = clientKey(deps, input.address);
  if (!(await withinLimit(deps.kv, `join:${client}`, LIMITS.join, prefix))) return REFUSED;

  const code = roomCodeSchema.safeParse(input.code);
  const room = code.success ? await findRoomByCode(deps.db, code.data) : null;
  const passcode = typeof input.passcode === 'string' ? input.passcode.slice(0, PASSCODE_MAX) : '';

  // Exactly one Argon2 verification on every path, so timing does not reveal
  // whether the room exists or has a passcode.
  const matches = await passcodeMatches(passcode, room?.passcodeHash ?? (await dummy()));

  let admitted = room !== null && room.passcodeHash === null;
  if (room && room.passcodeHash !== null) {
    const perClient = `pass:${room.id}:${client}`;
    const perRoom = `pass:${room.id}`;
    const locked =
      (await overLimit(deps.kv, perClient, LIMITS.passcodeClient, prefix)) ||
      (await overLimit(deps.kv, perRoom, LIMITS.passcodeRoom, prefix));
    admitted = matches && !locked;
    if (!matches && !locked) {
      // Only failures count, so the right passcode never locks its owner out.
      await withinLimit(deps.kv, perClient, LIMITS.passcodeClient, prefix);
      await withinLimit(deps.kv, perRoom, LIMITS.passcodeRoom, prefix);
    }
  }
  if (!room || !admitted) return REFUSED;

  const limit = deps.maxSessionsPerRoom ?? DEFAULT_MAX_SESSIONS;
  if ((await countSessions(deps.db, room.id)) >= limit) return REFUSED;

  const sessionToken = newToken();
  await insertSession(deps.db, {
    roomId: room.id,
    tokenHash: hashToken(sessionToken),
    name: name.data,
    role: role.data,
    moderator: false,
  });
  await touchRoom(deps.db, room.id);
  return { ok: true, sessionToken };
}

/** Resolves a room code and a session cookie value to a room and a session, or nothing. */
export async function resumeSession(
  deps: { db: Db },
  input: { code: unknown; token: unknown },
): Promise<{ room: RoomRow; session: SessionRow } | null> {
  const code = roomCodeSchema.safeParse(input.code);
  if (!code.success || typeof input.token !== 'string' || input.token.length > 128) return null;
  const room = await findRoomByCode(deps.db, code.data);
  if (!room) return null;
  const session = await findSession(deps.db, room.id, hashToken(input.token));
  return session ? { room, session } : null;
}
```

Add this line to `packages/poker-server/src/index.ts`, keeping the list alphabetical:

```ts
export * from './flows.ts';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors. The flow tests take several seconds: each join performs a real Argon2 verification.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add create, join and resume flows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The app object

**Files:**
- Create: `packages/poker-server/src/app.ts`
- Modify: `packages/poker-server/src/config.ts`, `packages/poker-server/src/index.ts`, `packages/poker-server/test/config.test.ts`, `packages/poker-server/test/services.ts`, `.env.example`
- Test: `packages/poker-server/test/app.test.ts`

**Interfaces:**
- Consumes: everything from Plan 2; `FlowDeps` from Task 2.
- Produces:
  - `Config` gains `keyPrefix: string`, read from `KEY_PREFIX` (default `'pokerji:'`; lower-case letters, digits, `:`, `_`, `-`; 1–32 characters; must end in `:`).
  - `hostStore(db: Db, roomId: string): HostStore`
  - `interface AppOptions { report?: (problem: string) => void; schema?: string; migrationsDir?: string }`
  - `interface App { db: Db; kv: Kv; registry: RoomRegistry; flows: FlowDeps; start(): Promise<void>; stop(): Promise<void> }`
  - `createApp(config: Config, options?: AppOptions): App` — `start()` migrates, runs retention once, then sweeps every 250 ms and runs retention hourly. `stop()` ends the timers, closes every room and both clients.
  - Test helper `testSchema(): Promise<{ schema: string; drop: () => Promise<void> }>` in `test/services.ts`.

- [ ] **Step 1: Write the failing tests**

In `packages/poker-server/test/config.test.ts`, replace the first two tests' expectations and add one test. The file's `describe` block becomes:

```ts
describe('loadConfig', () => {
  it('reads the environment, defaulting retention to 30 days and the key prefix to pokerji:', () => {
    expect(loadConfig(valid)).toEqual({
      databaseUrl: valid.DATABASE_URL,
      valkeyUrl: valid.VALKEY_URL,
      addressHmacSecret: valid.ADDRESS_HMAC_SECRET,
      retentionDays: 30,
      keyPrefix: 'pokerji:',
    });
  });

  it('accepts a retention override and a key prefix', () => {
    const config = loadConfig({ ...valid, RETENTION_DAYS: '7', KEY_PREFIX: 'e2e-1:' });
    expect(config.retentionDays).toBe(7);
    expect(config.keyPrefix).toBe('e2e-1:');
  });

  it('rejects a key prefix that could collide with or escape its namespace', () => {
    for (const bad of ['', 'pokerji', 'Has Space:', '*:', 'x'.repeat(40) + ':']) {
      expect(() => loadConfig({ ...valid, KEY_PREFIX: bad })).toThrow(/KEY_PREFIX/);
    }
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

Append to `packages/poker-server/test/services.ts`:

```ts
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
```

`packages/poker-server/test/app.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `app.test.ts` (`createApp` is not exported) and in `config.test.ts` (`keyPrefix` is missing).

- [ ] **Step 3: Add the key prefix to configuration**

In `packages/poker-server/src/config.ts`, add this line to the `z.object({...})` schema after `RETENTION_DAYS`:

```ts
  KEY_PREFIX: z
    .string()
    .regex(/^[a-z0-9:_-]{0,31}:$/)
    .default('pokerji:'),
```

Add this field to the `Config` interface:

```ts
  /** Namespace for this app's Valkey keys. The production ACL user is limited to it. */
  keyPrefix: string;
```

Add this line to the object `loadConfig` returns:

```ts
    keyPrefix: parsed.data.KEY_PREFIX,
```

- [ ] **Step 4: Implement the app object**

`packages/poker-server/src/app.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Config } from './config.ts';
import { createPool, type Db } from './db.ts';
import type { FlowDeps } from './flows.ts';
import { saveRound } from './history.ts';
import { RoomHost, type HostStore } from './host.ts';
import { createKv, type Kv } from './kv.ts';
import { migrate } from './migrate.ts';
import { RoomRegistry } from './registry.ts';
import { deleteInactiveRooms } from './rooms.ts';
import { deleteSession, setSessionModerator, setSessionRole } from './sessions.ts';

const SWEEP_MS = 250;
const RETENTION_MS = 60 * 60 * 1_000;

export interface AppOptions {
  /** Receives fixed descriptions of problems. Defaults to one JSON line on stderr. */
  report?: (problem: string) => void;
  /** Confines the database to one Postgres schema. Tests use it. */
  schema?: string;
  migrationsDir?: string;
}

export interface App {
  db: Db;
  kv: Kv;
  registry: RoomRegistry;
  flows: FlowDeps;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** The store a room host writes through, bound to its own room. */
export function hostStore(db: Db, roomId: string): HostStore {
  return {
    saveRound: (round) => saveRound(db, roomId, round),
    setRole: async (sessionId, role) => {
      await setSessionRole(db, roomId, sessionId, role);
    },
    setModerator: async (sessionId) => {
      await setSessionModerator(db, roomId, sessionId);
    },
    deleteSession: async (sessionId) => {
      await deleteSession(db, roomId, sessionId);
    },
  };
}

/** Wires the pieces into one object. Nothing connects or runs until start(). */
export function createApp(config: Config, options: AppOptions = {}): App {
  const report =
    options.report ??
    ((problem: string) => console.error(JSON.stringify({ level: 'error', problem })));
  const db = createPool(config.databaseUrl, options.schema);
  const kv = createKv(config.valkeyUrl);
  const registry = new RoomRegistry({
    kv,
    owner: randomUUID(),
    now: Date.now,
    lockPrefix: config.keyPrefix,
    makeHost: (room) =>
      new RoomHost(
        { deck: room.deck, timerSeconds: room.timerSeconds, music: room.music },
        { store: hostStore(db, room.id), now: Date.now, newId: randomUUID, report },
      ),
  });

  let timers: NodeJS.Timeout[] = [];
  const retain = () =>
    deleteInactiveRooms(db, config.retentionDays).then(
      () => undefined,
      () => report('retention'),
    );

  return {
    db,
    kv,
    registry,
    flows: { db, kv, addressSecret: config.addressHmacSecret, keyPrefix: config.keyPrefix },
    async start() {
      await migrate(db, options.migrationsDir);
      await retain();
      timers = [
        // Not awaited: a slow sweep must never delay the next tick.
        setInterval(() => {
          registry.sweep().catch(() => report('sweep'));
        }, SWEEP_MS),
        setInterval(() => {
          void retain();
        }, RETENTION_MS),
      ];
      for (const timer of timers) timer.unref();
    },
    async stop() {
      for (const timer of timers) clearInterval(timer);
      timers = [];
      await registry.closeEverything();
      await db.end();
      kv.disconnect();
    },
  };
}
```

Add this line to `packages/poker-server/src/index.ts`, keeping the list alphabetical:

```ts
export * from './app.ts';
```

Append to `.env.example` at the repository root:

```
# The app itself (apps/web). These match the development services above.
DATABASE_URL=postgres://pokerji:pokerji_dev@127.0.0.1:5432/pokerji
VALKEY_URL=redis://:pokerji_dev@127.0.0.1:6379
# Any 32+ characters. Development only: generate a fresh random value for production.
ADDRESS_HMAC_SECRET=development-only-address-hmac-secret
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors. The round test waits about three seconds for the real reveal count.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the app object that wires the server together" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The WebSocket upgrade handler

**Files:**
- Create: `packages/poker-server/src/upgrade.ts`
- Modify: `packages/poker-server/package.json`, `packages/poker-server/src/index.ts`
- Test: `packages/poker-server/test/upgrade.test.ts`

**Interfaces:**
- Consumes: `App` from Task 3; `resumeSession` from Task 2; `normaliseAddress` from Task 1; `attachSocket`, `type Socket`, `withinLimit`, `addressKey` from Plan 2; `MAX_MESSAGE_BYTES` from `@pokerji/protocol`.
- Produces:
  - `SESSION_COOKIE = 'pj_session'`
  - `type ProxyEnv = Record<string, string | undefined>` (reads `PROTOCOL_HEADER`, `HOST_HEADER`, `ADDRESS_HEADER`, `XFF_DEPTH`, the same variables `@sveltejs/adapter-node` reads)
  - `requestOrigin(req: IncomingMessage, env: ProxyEnv, defaultProtocol: 'http' | 'https'): string | null`
  - `requestAddress(req: IncomingMessage, env: ProxyEnv): string` — never throws; `'unknown'` when it cannot tell.
  - `readCookie(header: string | undefined, name: string): string | undefined`
  - `createUpgradeHandler(app: App, options: { env: ProxyEnv; defaultProtocol: 'http' | 'https' }): (req: IncomingMessage, socket: Duplex, head: Buffer) => void`

- [ ] **Step 1: Add the dependency**

In `packages/poker-server/package.json`, add `"ws": "^8.22.0"` to `dependencies` and `"@types/ws": "^8.18.2"` to `devDependencies`, keeping each list alphabetical. Then:

```bash
pnpm install
```

- [ ] **Step 2: Write the failing tests**

`packages/poker-server/test/upgrade.test.ts`:

```ts
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  createApp,
  createRoomFlow,
  createUpgradeHandler,
  readCookie,
  requestAddress,
  requestOrigin,
  SESSION_COOKIE,
  type App,
} from '../src/index.ts';
import { DATABASE_URL, testPrefix, testSchema, VALKEY_URL } from './services.ts';

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
    },
    { schema: made.schema, report: () => undefined },
  );
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

async function room() {
  const created = await createRoomFlow(app.flows, {
    address: '203.0.113.1',
    name: 'Mo',
    deckId: 'fibonacci',
  });
  if (!created.ok) throw new Error('room was not created');
  return created;
}

type Outcome =
  | { opened: true; socket: WebSocket; first: { type: string } }
  | { opened: false; status: number };

function connect(
  path: string,
  options: { token?: string; origin?: string | null } = {},
): Promise<Outcome> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers.Cookie = `${SESSION_COOKIE}=${options.token}`;
  const origin = options.origin === undefined ? `http://127.0.0.1:${port}` : options.origin;
  if (origin !== null) headers.Origin = origin;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    socket.once('message', (data) =>
      resolve({ opened: true, socket, first: JSON.parse(data.toString()) as { type: string } }),
    );
    socket.once('unexpected-response', (_request, response) => {
      resolve({ opened: false, status: response.statusCode ?? 0 });
      socket.terminate();
    });
    socket.once('error', (error) => {
      if (!/Unexpected server response/.test(error.message)) reject(error);
    });
  });
}

const closeCode = (socket: WebSocket) =>
  new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));

const fakeRequest = (headers: Record<string, string>, remoteAddress = '10.0.0.5') =>
  ({ headers, socket: { remoteAddress } }) as unknown as IncomingMessage;

describe('createUpgradeHandler', () => {
  it('opens a socket for a valid session and sends the room', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error(`refused with ${outcome.status}`);
    expect(outcome.first.type).toBe('snapshot');
    outcome.socket.close();
  });

  it('refuses every bad request the same way', async () => {
    const first = await room();
    const second = await room();
    const refused = { opened: false, status: 403 };
    const path = `/poker/r/${first.code}/ws`;
    expect(await connect(path)).toEqual(refused);
    expect(await connect(path, { token: 'wrong' })).toEqual(refused);
    expect(await connect(path, { token: second.sessionToken })).toEqual(refused);
    expect(await connect('/poker/r/AAAAAAAAAAAA/ws', { token: first.sessionToken })).toEqual(
      refused,
    );
    expect(await connect('/somewhere/else', { token: first.sessionToken })).toEqual(refused);
    expect(await connect(`${path}/extra`, { token: first.sessionToken })).toEqual(refused);
  });

  it('refuses a valid session coming from another origin, or from none', async () => {
    const { code, sessionToken } = await room();
    const path = `/poker/r/${code}/ws`;
    const refused = { opened: false, status: 403 };
    expect(await connect(path, { token: sessionToken, origin: 'https://evil.example' })).toEqual(
      refused,
    );
    expect(await connect(path, { token: sessionToken, origin: null })).toEqual(refused);
  });

  it('closes a socket that sends a binary frame', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error('refused');
    const closed = closeCode(outcome.socket);
    outcome.socket.send(Buffer.from([1, 2, 3]));
    expect(await closed).toBe(1003);
  });

  it('closes a socket that sends more than 2 KB', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error('refused');
    const closed = closeCode(outcome.socket);
    outcome.socket.send('x'.repeat(3_000));
    expect(await closed).toBe(1009);
  });

  it('carries a message through to the room', async () => {
    const { code, sessionToken } = await room();
    const outcome = await connect(`/poker/r/${code}/ws`, { token: sessionToken });
    if (!outcome.opened) throw new Error('refused');
    const next = new Promise<{ room: { title: string } }>((resolve) =>
      outcome.socket.once('message', (data) => resolve(JSON.parse(data.toString()))),
    );
    outcome.socket.send(JSON.stringify({ type: 'setTitle', title: 'PROJ-7' }));
    expect((await next).room.title).toBe('PROJ-7');
    outcome.socket.close();
  });
});

describe('requestOrigin', () => {
  it('uses the request host and the default protocol when no proxy headers are configured', () => {
    expect(requestOrigin(fakeRequest({ host: 'localhost:5173' }), {}, 'http')).toBe(
      'http://localhost:5173',
    );
    expect(requestOrigin(fakeRequest({ host: 'poker.example' }), {}, 'https')).toBe(
      'https://poker.example',
    );
  });

  it('uses the configured proxy headers', () => {
    const env = { PROTOCOL_HEADER: 'x-forwarded-proto', HOST_HEADER: 'x-forwarded-host' };
    const req = fakeRequest({
      host: 'web:3000',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'poker.example',
    });
    expect(requestOrigin(req, env, 'http')).toBe('https://poker.example');
  });

  it('returns nothing when the host is missing', () => {
    expect(requestOrigin(fakeRequest({}), {}, 'https')).toBeNull();
    expect(requestOrigin(fakeRequest({ host: 'a' }), { HOST_HEADER: 'x-forwarded-host' }, 'https'))
      .toBeNull();
  });
});

describe('requestAddress', () => {
  it('uses the connection address when no header is configured', () => {
    expect(requestAddress(fakeRequest({}, '198.51.100.4'), {})).toBe('198.51.100.4');
  });

  it('reads the forwarded list from the right, by the number of trusted proxies', () => {
    const req = fakeRequest({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.0.0.1' });
    expect(requestAddress(req, { ADDRESS_HEADER: 'x-forwarded-for' })).toBe('10.0.0.1');
    expect(requestAddress(req, { ADDRESS_HEADER: 'x-forwarded-for', XFF_DEPTH: '2' })).toBe(
      '203.0.113.7',
    );
  });

  it('reads another configured header as is', () => {
    const req = fakeRequest({ 'true-client-ip': '203.0.113.7' });
    expect(requestAddress(req, { ADDRESS_HEADER: 'True-Client-IP' })).toBe('203.0.113.7');
  });

  it('answers unknown instead of throwing when it cannot tell', () => {
    expect(requestAddress(fakeRequest({}), { ADDRESS_HEADER: 'x-forwarded-for' })).toBe('unknown');
    const short = fakeRequest({ 'x-forwarded-for': '203.0.113.7' });
    expect(requestAddress(short, { ADDRESS_HEADER: 'x-forwarded-for', XFF_DEPTH: '3' })).toBe(
      'unknown',
    );
    expect(requestAddress({ headers: {}, socket: {} } as unknown as IncomingMessage, {})).toBe(
      'unknown',
    );
  });
});

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('a=1; pj_session=abc-_123; b=2', 'pj_session')).toBe('abc-_123');
    expect(readCookie('pj_session=abc', 'pj_session')).toBe('abc');
  });

  it('returns nothing when the cookie or the header is absent', () => {
    expect(readCookie('a=1; xpj_session=no', 'pj_session')).toBeUndefined();
    expect(readCookie(undefined, 'pj_session')).toBeUndefined();
    expect(readCookie('', 'pj_session')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `upgrade.test.ts`, because `createUpgradeHandler` is not exported.

- [ ] **Step 4: Implement the upgrade handler**

`packages/poker-server/src/upgrade.ts`:

```ts
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { MAX_MESSAGE_BYTES } from '@pokerji/protocol';
import { WebSocketServer, type WebSocket } from 'ws';
import type { App } from './app.ts';
import { resumeSession } from './flows.ts';
import { withinLimit } from './limiter.ts';
import { addressKey } from './secrets.ts';
import { attachSocket, type Socket } from './socket.ts';
import { normaliseAddress } from './validate.ts';

export const SESSION_COOKIE = 'pj_session';

/** The proxy variables @sveltejs/adapter-node reads; this module reads the same ones. */
export type ProxyEnv = Record<string, string | undefined>;

const SOCKET_PATH = /^\/poker\/r\/([A-Za-z0-9]{12})\/ws$/;
const UPGRADE_LIMIT = { max: 60, windowSeconds: 60 };
/** A connection this far behind is not reading; it is dropped rather than buffered for. */
const MAX_BUFFERED_BYTES = 1_000_000;

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/** The site's own origin as the browser sees it, or null when it cannot be worked out. */
export function requestOrigin(
  req: IncomingMessage,
  env: ProxyEnv,
  defaultProtocol: 'http' | 'https',
): string | null {
  const protocol = env.PROTOCOL_HEADER
    ? (header(req, env.PROTOCOL_HEADER) ?? defaultProtocol)
    : defaultProtocol;
  const host = env.HOST_HEADER ? header(req, env.HOST_HEADER) : header(req, 'host');
  return host ? `${protocol}://${host}` : null;
}

/** The client's address. Never throws; "unknown" when it cannot tell. */
export function requestAddress(req: IncomingMessage, env: ProxyEnv): string {
  if (!env.ADDRESS_HEADER) return req.socket.remoteAddress ?? 'unknown';
  const value = header(req, env.ADDRESS_HEADER);
  if (value === undefined) return 'unknown';
  if (env.ADDRESS_HEADER.toLowerCase() !== 'x-forwarded-for') return value.trim();
  // Read from the right: entries further left can be set by the client.
  const addresses = value.split(',').map((part) => part.trim());
  const depth = Math.max(1, Number.parseInt(env.XFF_DEPTH ?? '1', 10) || 1);
  return addresses[addresses.length - depth] ?? 'unknown';
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function refuse(socket: Duplex): void {
  try {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  } catch {
    // The socket is already gone.
  }
  socket.destroy();
}

function adapt(ws: WebSocket): Socket {
  ws.on('error', () => undefined);
  return {
    send: (text) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        ws.terminate();
        return;
      }
      ws.send(text);
    },
    close: () => ws.close(),
    onMessage: (handler) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          ws.close(1003);
          return;
        }
        handler(data.toString());
      });
    },
    onClose: (handler) => {
      ws.on('close', handler);
    },
  };
}

/**
 * Decides whether an HTTP upgrade may become a room socket. The path must be a
 * room's socket path, the Origin must be this site, and the cookie must be a
 * session in that room. Every refusal is the same 403.
 */
export function createUpgradeHandler(
  app: App,
  options: { env: ProxyEnv; defaultProtocol: 'http' | 'https' },
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const server = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  async function serve(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://local').pathname;
    const code = SOCKET_PATH.exec(path)?.[1];
    const origin = requestOrigin(req, options.env, options.defaultProtocol);
    if (code === undefined || origin === null || req.headers.origin !== origin) {
      return refuse(socket);
    }

    const client = addressKey(
      app.flows.addressSecret,
      normaliseAddress(requestAddress(req, options.env)),
    );
    if (!(await withinLimit(app.kv, `ws:${client}`, UPGRADE_LIMIT, app.flows.keyPrefix))) {
      return refuse(socket);
    }

    const resumed = await resumeSession(app.flows, {
      code,
      token: readCookie(req.headers.cookie, SESSION_COOKIE),
    });
    if (!resumed) return refuse(socket);
    const host = await app.registry.open(resumed.room);
    if (!host) return refuse(socket);

    const { id, name, role, moderator } = resumed.session;
    server.handleUpgrade(req, socket, head, (ws) => {
      attachSocket(host, { id, name, role, moderator }, adapt(ws));
    });
  }

  return (req, socket, head) => {
    socket.on('error', () => undefined);
    serve(req, socket, head).catch(() => refuse(socket));
  };
}
```

Add this line to `packages/poker-server/src/index.ts`, keeping the list alphabetical:

```ts
export * from './upgrade.ts';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-server test && pnpm --filter @pokerji/poker-server typecheck`
Expected: all tests PASS, typecheck prints no errors.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the WebSocket upgrade handler" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The SvelteKit app shell

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/server.js`, `apps/web/.gitignore`
- Create: `apps/web/src/app.html`, `apps/web/src/app.d.ts`, `apps/web/src/hooks.server.ts`
- Create: `apps/web/src/lib/server/pokerji.ts`, `apps/web/src/lib/server/address.ts`, `apps/web/src/lib/server/cookie.ts`
- Create: `apps/web/src/routes/+layout.svelte`, `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/healthz/+server.ts`
- Create: `apps/web/scripts/smoke.sh`
- Modify: `.prettierignore`

**Interfaces:**
- Consumes: `createApp`, `createUpgradeHandler`, `loadConfig`, `type App`, `SESSION_COOKIE` from `@pokerji/poker-server`.
- Produces:
  - `runtime(): { app: App; upgrade: (req, socket, head) => void; started: Promise<void> }` from `#lib/server/pokerji.ts` — one object per process, stored on `globalThis` under `Symbol.for('pokerji.runtime')`.
  - `clientAddress(event: RequestEvent): string` from `#lib/server/address.ts` — never throws.
  - `sessionCookie(url: URL, code: string)` from `#lib/server/cookie.ts` — the cookie options.
  - `apps/web/server.js`: the production entry. Reads `PORT` (default 3000) and `HOST` (default `0.0.0.0`). With `INSECURE_HTTP=1` it marks every request as plain HTTP for local testing.
  - Scripts in `apps/web`: `dev`, `build`, `start`, `typecheck`, `smoke`.

- [ ] **Step 1: Create the package and configuration**

`apps/web/package.json`:

```json
{
  "name": "@pokerji/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node server.js",
    "prepare": "svelte-kit sync || echo ''",
    "typecheck": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "smoke": "sh scripts/smoke.sh"
  },
  "imports": {
    "#lib": "./src/lib/index.js",
    "#lib/*": "./src/lib/*"
  },
  "dependencies": {
    "@node-rs/argon2": "^2.2.1",
    "iovalkey": "^0.4.0",
    "pg": "^8.23.1",
    "ws": "^8.22.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@pokerji/poker-engine": "workspace:*",
    "@pokerji/poker-server": "workspace:*",
    "@pokerji/protocol": "workspace:*",
    "@sveltejs/adapter-node": "^6.0.0",
    "@sveltejs/kit": "^3.0.0",
    "@sveltejs/vite-plugin-svelte": "^7.2.0",
    "@types/node": "^24.0.0",
    "svelte": "^5.57.1",
    "svelte-check": "^4.6.0",
    "typescript": "^6.0.3",
    "vite": "^8.3.0"
  }
}
```

Why the split: the adapter bundles `devDependencies` into the build and leaves `dependencies` to be loaded from `node_modules` at run time. The workspace packages are source code, so they are bundled; the five runtime libraries, one of which has a native binary, are not.

`apps/web/tsconfig.json`:

```json
{
  "extends": "$app/tsconfig",
  "compilerOptions": {
    "strict": true,
    "types": ["$app/types", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/web/.gitignore`:

```
build/
.svelte-kit/
test-results/
playwright-report/
```

`apps/web/vite.config.ts`:

```ts
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Serves room WebSockets during `vite dev`. In production `server.js` does this.
 * Loading the module through Vite gives the same runtime object the pages use.
 */
const devSockets = (): Plugin => ({
  name: 'pokerji-dev-sockets',
  configureServer(server) {
    server.httpServer?.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/poker/r/')) return;
      server
        .ssrLoadModule('/src/lib/server/pokerji.ts')
        .then((module) => module.runtime().upgrade(req, socket, head))
        .catch(() => socket.destroy());
    });
  },
});

export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    // Development only: read the repository's .env so the app finds the dev services.
    Object.assign(process.env, loadEnv(mode, '../..', ''), process.env);
  }
  return {
    plugins: [
      sveltekit({
        compilerOptions: {
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
        },
        adapter: adapter(),
        // Vite's dev client needs inline styles, so the policy applies to builds only.
        // The end-to-end tests run against a build, so the policy is always tested.
        ...(command === 'build'
          ? {
              csp: {
                mode: 'nonce' as const,
                directives: {
                  'default-src': ['self'],
                  'script-src': ['self'],
                  'style-src': ['self'],
                  // The one inline style allowed: SvelteKit's own route announcer, the visually
                  // hidden region that tells screen readers a navigation happened. Allowed by
                  // exact hash, so no other inline style can run. If a SvelteKit upgrade changes
                  // that style, the end-to-end policy test fails and prints the new hash.
                  'style-src-attr': [
                    'unsafe-hashes',
                    'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=',
                  ],
                  'img-src': ['self', 'data:'],
                  'font-src': ['self'],
                  'media-src': ['self'],
                  'connect-src': ['self'],
                  'object-src': ['none'],
                  'base-uri': ['none'],
                  'form-action': ['self'],
                  'frame-ancestors': ['none'],
                },
              },
            }
          : {}),
      }),
      devSockets(),
    ],
  };
});
```

Add these lines to `.prettierignore` at the repository root:

```
apps/web/build/
apps/web/.svelte-kit/
apps/web/test-results/
apps/web/playwright-report/
```

- [ ] **Step 2: Create the server-side pieces**

`apps/web/src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body>
    <div class="app">%sveltekit.body%</div>
  </body>
</html>
```

(The SvelteKit template puts `style="display: contents"` on that `div`. It is removed here because the policy forbids inline styles; the layout sets it from a stylesheet.)

`apps/web/src/app.d.ts`:

```ts
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
```

`apps/web/src/lib/server/pokerji.ts`:

```ts
import { resolve } from 'node:path';
import { dev } from '$app/env';
import { createApp, createUpgradeHandler, loadConfig, type App } from '@pokerji/poker-server';

export interface Runtime {
  app: App;
  upgrade: ReturnType<typeof createUpgradeHandler>;
  /** Resolves when the database is migrated and the timers are running. */
  started: Promise<void>;
}

const KEY = Symbol.for('pokerji.runtime');
type Holder = typeof globalThis & { [KEY]?: Runtime };

/**
 * The one runtime object for this process. It lives on globalThis so the
 * production entry (server.js) and the dev plugin reach the same instance as
 * the pages, and so a dev reload does not open a second set of connections.
 */
export function runtime(): Runtime {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    const app = createApp(loadConfig(process.env), {
      migrationsDir:
        process.env.MIGRATIONS_DIR ??
        resolve(process.cwd(), '../../packages/poker-server/migrations'),
    });
    holder[KEY] = {
      app,
      upgrade: createUpgradeHandler(app, {
        env: process.env,
        defaultProtocol: dev ? 'http' : 'https',
      }),
      started: app.start(),
    };
  }
  return holder[KEY];
}
```

`apps/web/src/lib/server/address.ts`:

```ts
import type { RequestEvent } from '@sveltejs/kit';

/**
 * The client's address for rate limiting. The adapter throws when its
 * configured address header is missing, as on a request that did not come
 * through the proxy; that case becomes one shared "unknown" client.
 */
export function clientAddress(event: RequestEvent): string {
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}
```

`apps/web/src/lib/server/cookie.ts`:

```ts
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Options for the session cookie. It is scoped to one room and unreadable by scripts. */
export function sessionCookie(url: URL, code: string) {
  return {
    path: `/poker/r/${code}`,
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax' as const,
    maxAge: THIRTY_DAYS,
  };
}
```

`apps/web/src/hooks.server.ts`:

```ts
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { runtime } from '#lib/server/pokerji.ts';

export const init: ServerInit = async () => {
  await runtime().started;
};

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (event.url.pathname.startsWith('/poker')) {
    // Room links are secrets and create responses carry one: never cache or index them.
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
};
```

`apps/web/src/routes/healthz/+server.ts`:

```ts
import { runtime } from '#lib/server/pokerji.ts';

/** Liveness for the container: answers once the app has started. Touches no room data. */
export const GET = async () => {
  await runtime().started;
  return new Response('ok', { headers: { 'content-type': 'text/plain' } });
};
```

`apps/web/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

{@render children()}

<style>
  :global(.app) {
    display: contents;
  }
</style>
```

`apps/web/src/routes/+page.svelte`:

```svelte
<svelte:head>
  <title>pokerji</title>
</svelte:head>

<main>
  <h1>pokerji</h1>
  <p>Small tools for teams. No accounts, no trackers.</p>
  <ul>
    <li><a href="/poker">Planning poker</a></li>
  </ul>
</main>
```

- [ ] **Step 3: Create the production entry**

`apps/web/server.js`:

```js
// The production entry. SvelteKit's handler serves pages; WebSocket upgrades go to
// the runtime object the app's init hook put on globalThis when handler.js was imported.
import { createServer } from 'node:http';
import { handler } from './build/handler.js';

const RUNTIME = Symbol.for('pokerji.runtime');

// Local testing only. Marks every request as plain HTTP so form posts and
// sockets pass the origin checks without a TLS proxy. Needs PROTOCOL_HEADER=x-forwarded-proto.
const insecure = process.env.INSECURE_HTTP === '1';
const mark = (req) => {
  if (insecure) req.headers['x-forwarded-proto'] = 'http';
};

const server = createServer((req, res) => {
  mark(req);
  handler(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});

server.on('upgrade', (req, socket, head) => {
  mark(req);
  const runtime = globalThis[RUNTIME];
  if (!runtime) {
    socket.destroy();
    return;
  }
  runtime.upgrade(req, socket, head);
});

server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0');

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
    const stopping = globalThis[RUNTIME]?.app.stop() ?? Promise.resolve();
    stopping.finally(() => process.exit(0));
  });
}
```

- [ ] **Step 4: Write the smoke check**

`apps/web/scripts/smoke.sh`:

```sh
#!/bin/sh
# Starts the built app and checks that it answers with the right headers.
# Run from apps/web after `pnpm build`, with the development services up.
set -eu

PORT=4391
export PORT HOST=127.0.0.1 INSECURE_HTTP=1 PROTOCOL_HEADER=x-forwarded-proto
export DATABASE_URL="${DATABASE_URL:-postgres://pokerji:pokerji_dev@127.0.0.1:5432/pokerji}"
export VALKEY_URL="${VALKEY_URL:-redis://:pokerji_dev@127.0.0.1:6379}"
export ADDRESS_HMAC_SECRET="${ADDRESS_HMAC_SECRET:-development-only-address-hmac-secret}"
export KEY_PREFIX="smoke-$$:"

node server.js &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

fail() { echo "SMOKE FAILED: $1"; exit 1; }

[ "$(curl -fs "http://127.0.0.1:$PORT/healthz")" = "ok" ] || fail "healthz"

HEADERS=$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/poker/r/AAAAAAAAAAAA")
echo "$HEADERS" | grep -qi "content-security-policy: default-src 'self'" || fail "content security policy"
echo "$HEADERS" | grep -qi "script-src 'self' 'nonce-" || fail "script nonce"
echo "$HEADERS" | grep -qi "frame-ancestors 'none'" || fail "frame-ancestors"
echo "$HEADERS" | grep -qi "x-content-type-options: nosniff" || fail "nosniff"
echo "$HEADERS" | grep -qi "referrer-policy: same-origin" || fail "referrer policy"
echo "$HEADERS" | grep -qi "cache-control: no-store" || fail "no-store on room pages"
echo "$HEADERS" | grep -qi "x-robots-tag: noindex" || fail "noindex on room pages"

CROSS=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$CROSS" = "403" ] || fail "cross-origin form post was not refused (got $CROSS)"

echo "SMOKE OK"
```

The room and create pages do not exist yet, so the room URL returns 404 for now. The header checks still apply: the hook sets them on every response. The cross-origin check passes because SvelteKit refuses the post before routing.

- [ ] **Step 5: Install, typecheck, build and run the smoke check**

```bash
pnpm install
pnpm --filter @pokerji/web typecheck
pnpm --filter @pokerji/web build
pnpm --filter @pokerji/web smoke
```

Expected: `svelte-check` reports 0 errors; the build ends with `✔ done`; the smoke check prints `SMOKE OK`. If pnpm reports that it added `minimumReleaseAgeExclude` entries, remove them, pin the named package one release back, and reinstall.

If the Content Security Policy line is missing a nonce on `script-src`, the page had no inline script to protect: that check is only meaningful once a page with client code exists. In that case move the `script nonce` line of `smoke.sh` to Task 6, Step 5, and record a ruling.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the SvelteKit app shell with security headers and the production entry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The create page and the room page

**Files:**
- Create: `apps/web/src/routes/poker/+page.server.ts`, `apps/web/src/routes/poker/+page.svelte`
- Create: `apps/web/src/routes/poker/r/[code]/+page.server.ts`, `apps/web/src/routes/poker/r/[code]/+page.svelte`, `apps/web/src/routes/poker/r/[code]/Room.svelte`

**Interfaces:**
- Consumes: `runtime()`, `clientAddress()`, `sessionCookie()` from Task 5; `createRoomFlow`, `joinRoomFlow`, `resumeSession`, `SESSION_COOKIE` from `@pokerji/poker-server`; `BUILT_IN_DECKS` and the types `ClientMessage`, `RoomSnapshot`, `ServerMessage` from `@pokerji/protocol`.
- Produces: the pages `/poker` and `/poker/r/<code>`. Controls carry the labels the end-to-end test in Task 7 uses: "Your name", "Deck", "Create room", "Open the room", "Join", "Story title", "Set title", "Reveal", "New round", and one button per card named "Vote <card>". Test ids: `participants`, `countdown`, `result`, `status`.

The markup is deliberately plain. Plan 4 replaces the presentation; the labels, test ids and behaviour stay.

- [ ] **Step 1: The create page**

`apps/web/src/routes/poker/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { createRoomFlow, SESSION_COOKIE } from '@pokerji/poker-server';
import { clientAddress } from '#lib/server/address.ts';
import { sessionCookie } from '#lib/server/cookie.ts';
import { runtime } from '#lib/server/pokerji.ts';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const result = await createRoomFlow(runtime().app.flows, {
      address: clientAddress(event),
      name: form.get('name'),
      deckId: form.get('deck'),
    });
    if (!result.ok) {
      return result.reason === 'invalid'
        ? fail(400, { message: 'Enter a name of 1 to 30 characters and choose a deck.' })
        : fail(429, { message: 'A room could not be created right now. Try again later.' });
    }
    event.cookies.set(
      SESSION_COOKIE,
      result.sessionToken,
      sessionCookie(event.url, result.code),
    );
    // Shown once. It is never stored in readable form and cannot be shown again.
    return { created: { code: result.code, recoveryToken: result.recoveryToken } };
  },
};
```

`apps/web/src/routes/poker/+page.svelte`:

```svelte
<script lang="ts">
  import { BUILT_IN_DECKS } from '@pokerji/protocol';
  import type { PageProps } from './$types';

  let { form }: PageProps = $props();
  const decks = Object.entries(BUILT_IN_DECKS);
</script>

<svelte:head>
  <title>Planning poker · pokerji</title>
</svelte:head>

<main>
  <h1>Planning poker</h1>

  {#if form?.created}
    <h2>Your room is ready</h2>
    <p><a href="/poker/r/{form.created.code}">Open the room</a></p>
    <p>Share that link with your team. Anyone who has it can join.</p>

    <h3>Save your moderator link</h3>
    <p>
      You run this room from this browser. To run it from another device, or if you clear your
      cookies, you need this link. It is shown only once.
    </p>
    <p>
      <code data-testid="recovery-link"
        >/poker/r/{form.created.code}/recover#m={form.created.recoveryToken}</code
      >
    </p>
  {:else}
    {#if form?.message}
      <p role="alert">{form.message}</p>
    {/if}
    <form method="POST">
      <p>
        <label for="name">Your name</label>
        <input id="name" name="name" required maxlength="30" autocomplete="nickname" />
      </p>
      <p>
        <label for="deck">Deck</label>
        <select id="deck" name="deck">
          {#each decks as [id, deck] (id)}
            <option value={id}>{deck.name}: {deck.deck.values.join(', ')}</option>
          {/each}
        </select>
      </p>
      <p>
        Votes are recorded under the name you enter and kept for 30 days after the room was last
        used.
      </p>
      <button>Create room</button>
    </form>
  {/if}
</main>
```

- [ ] **Step 2: The room page's server side**

`apps/web/src/routes/poker/r/[code]/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { joinRoomFlow, resumeSession, SESSION_COOKIE } from '@pokerji/poker-server';
import { clientAddress } from '#lib/server/address.ts';
import { sessionCookie } from '#lib/server/cookie.ts';
import { runtime } from '#lib/server/pokerji.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const token = event.cookies.get(SESSION_COOKIE);
  const resumed = await resumeSession(runtime().app.flows, { code: event.params.code, token });
  // An unknown room and a room you have not joined look exactly the same: a join form.
  if (!resumed || token === undefined) return { joined: false as const };
  // Each visit renews the cookie's 30 days.
  event.cookies.set(SESSION_COOKIE, token, sessionCookie(event.url, resumed.room.code));
  return { joined: true as const, code: resumed.room.code };
};

export const actions: Actions = {
  join: async (event) => {
    const form = await event.request.formData();
    const result = await joinRoomFlow(runtime().app.flows, {
      address: clientAddress(event),
      code: event.params.code,
      name: form.get('name'),
      role: form.get('role'),
      passcode: form.get('passcode'),
    });
    if (!result.ok) {
      return result.reason === 'invalid'
        ? fail(400, { message: 'Enter a name of 1 to 30 characters.' })
        : fail(403, {
            message: 'Could not join. Check the link and the passcode, then try again.',
          });
    }
    event.cookies.set(
      SESSION_COOKIE,
      result.sessionToken,
      sessionCookie(event.url, event.params.code),
    );
    redirect(303, event.url.pathname);
  },
};
```

- [ ] **Step 3: The room page and the live room**

`apps/web/src/routes/poker/r/[code]/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageProps } from './$types';
  import Room from './Room.svelte';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>Planning poker · pokerji</title>
</svelte:head>

<main>
  {#if data.joined}
    <Room code={data.code} />
  {:else}
    <h1>Join the room</h1>
    {#if form?.message}
      <p role="alert">{form.message}</p>
    {/if}
    <form method="POST" action="?/join">
      <p>
        <label for="name">Your name</label>
        <input id="name" name="name" required maxlength="30" autocomplete="nickname" />
      </p>
      <fieldset>
        <legend>Take part as</legend>
        <label><input type="radio" name="role" value="voter" checked /> Voter</label>
        <label><input type="radio" name="role" value="spectator" /> Spectator</label>
      </fieldset>
      <p>
        <label for="passcode">Passcode, if the room has one</label>
        <input id="passcode" name="passcode" type="password" maxlength="64" autocomplete="off" />
      </p>
      <p>
        Votes are recorded under the name you enter and kept for 30 days after the room was last
        used.
      </p>
      <button>Join</button>
    </form>
  {/if}
</main>
```

`apps/web/src/routes/poker/r/[code]/Room.svelte`:

```svelte
<script lang="ts">
  import type { ClientMessage, RoomSnapshot, ServerMessage } from '@pokerji/protocol';

  let { code }: { code: string } = $props();

  let room = $state<RoomSnapshot | null>(null);
  let status = $state<'connecting' | 'open' | 'reconnecting' | 'removed'>('connecting');
  let notice = $state('');
  let now = $state(Date.now());
  let titleDraft = $state('');

  let socket: WebSocket | null = null;
  // The server's clock minus this browser's, so countdowns agree on every screen.
  let clockOffset = 0;

  const send = (message: ClientMessage) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  $effect(() => {
    const path = `/poker/r/${code}/ws`;
    let stopped = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${location.host}${path}`);
      socket = ws;
      ws.onopen = () => {
        failures = 0;
        status = 'open';
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'snapshot') {
          room = message.room;
          clockOffset = message.room.serverNow - Date.now();
          notice = '';
        } else if (message.type === 'removed') {
          stopped = true;
          status = 'removed';
        } else if (message.type === 'timerExpired') {
          notice = 'Time is up.';
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        failures += 1;
        // The session is no longer accepted: go back to the join form.
        if (failures > 5) {
          location.reload();
          return;
        }
        status = 'reconnecting';
        retry = setTimeout(connect, Math.min(500 * 2 ** failures, 10_000));
      };
    };

    connect();
    const clock = setInterval(() => {
      now = Date.now() + clockOffset;
    }, 200);

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(clock);
      socket?.close();
    };
  });

  const count = $derived(
    room?.phase === 'counting' && room.revealAt !== null
      ? Math.max(1, Math.ceil((room.revealAt - now) / 1000))
      : null,
  );
  const cards = $derived(room ? [...room.deck.values, ...room.deck.specials] : []);
  const voters = $derived(room ? room.participants.filter((p) => p.role === 'voter') : []);
  const spectators = $derived(room ? room.participants.filter((p) => p.role === 'spectator') : []);

  const setTitle = (event: SubmitEvent) => {
    event.preventDefault();
    send({ type: 'setTitle', title: titleDraft });
    titleDraft = '';
  };
</script>

{#if status === 'removed'}
  <h1>You were removed from this room</h1>
  <p>Ask the moderator if you think this was a mistake.</p>
{:else if !room}
  <p data-testid="status" role="status">Connecting…</p>
{:else}
  {#if status === 'reconnecting'}
    <p data-testid="status" role="status">Connection lost. Reconnecting…</p>
  {/if}
  {#if notice}
    <p role="status">{notice}</p>
  {/if}

  <h1>{room.title || 'No story yet'}</h1>

  {#if count !== null}
    <p data-testid="countdown" aria-live="assertive">{count}</p>
  {/if}

  {#if room.phase === 'revealed' && room.result}
    <section data-testid="result" aria-live="polite">
      <h2>Result</h2>
      {#if room.result.low === null}
        <p>No estimates were given.</p>
      {:else if room.result.unanimous}
        <p>Unanimous: {room.result.low}</p>
      {:else}
        <p>Low {room.result.low}, High {room.result.high}</p>
      {/if}
      {#if room.result.average !== null}
        <p>Average {Math.round(room.result.average * 10) / 10}</p>
      {/if}
      <ul>
        {#each room.result.distribution as entry (entry.card)}
          <li>{entry.card} × {entry.count}</li>
        {/each}
      </ul>
      {#if room.saveStatus === 'failed'}
        <p role="status">This round is not saved yet. Retrying.</p>
      {/if}
    </section>
  {/if}

  <section>
    <h2>Voters</h2>
    <ul data-testid="participants">
      {#each voters as person (person.id)}
        <li>
          {#if room.phase === 'revealed'}
            {person.name}: {person.vote ?? 'no vote'}
            {#if room.result?.highIds.includes(person.id)}(High){/if}
            {#if room.result?.lowIds.includes(person.id)}(Low){/if}
          {:else}
            {person.name}
            {person.hasVoted ? 'voted' : 'not voted'}
          {/if}
          {#if person.moderator}· moderator{/if}
          {#if !person.present}· away{/if}
        </li>
      {/each}
    </ul>
    {#if spectators.length > 0}
      <h2>Watching</h2>
      <ul>
        {#each spectators as person (person.id)}
          <li>{person.name}{person.moderator ? ' · moderator' : ''}</li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if room.you.role === 'voter'}
    <section>
      <h2>Your hand</h2>
      {#each cards as card (card)}
        <button
          type="button"
          aria-label="Vote {card}"
          aria-pressed={room.you.vote === card}
          disabled={room.phase !== 'voting'}
          onclick={() => send({ type: 'vote', card })}>{card}</button
        >
      {/each}
    </section>
  {:else}
    <p>You are watching.</p>
  {/if}

  {#if room.you.moderator}
    <section>
      <h2>Moderator</h2>
      <form onsubmit={setTitle}>
        <label for="title">Story title</label>
        <input id="title" bind:value={titleDraft} maxlength="200" />
        <button disabled={room.phase !== 'voting'}>Set title</button>
      </form>
      <button
        type="button"
        disabled={room.phase !== 'voting'}
        onclick={() => send({ type: 'reveal' })}>Reveal</button
      >
      <button
        type="button"
        disabled={room.phase === 'counting'}
        onclick={() => send({ type: 'newRound', keepTitle: false })}>New round</button
      >
    </section>
  {/if}
{/if}
```

- [ ] **Step 4: Typecheck and build**

```bash
pnpm --filter @pokerji/web typecheck
pnpm --filter @pokerji/web build
pnpm --filter @pokerji/web smoke
```

Expected: `svelte-check` reports 0 errors, the build ends with `✔ done`, and the smoke check prints `SMOKE OK`. The room URL in the smoke check now returns the join form instead of a 404.

- [ ] **Step 5: Try it by hand**

```bash
docker compose up -d --wait
pnpm --filter @pokerji/web dev
```

Open `http://localhost:5173/poker`, create a room, open it, and vote. In a private window, open the room link, join as another person, and confirm each window shows the other as "voted" without the value. Reveal from the first window and confirm both show the result after the count. Stop the dev server with Ctrl-C.

This step is a sanity check for the person or agent executing the plan. The automated proof is Task 7.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the create page and the live room page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end tests

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/round.spec.ts`
- Modify: `apps/web/package.json`, `CLAUDE.md`

**Interfaces:**
- Consumes: the labels and test ids from Task 6; `server.js` and its environment variables from Task 5.
- Produces: `pnpm --filter @pokerji/web e2e`, which builds the app, starts it on port 4173 and drives it with Chromium.

- [ ] **Step 1: Add Playwright**

In `apps/web/package.json`, add `"@playwright/test": "^1.63.0"` to `devDependencies` (keep the list alphabetical) and add this script:

```json
    "e2e": "playwright test"
```

Then:

```bash
pnpm install
pnpm --filter @pokerji/web exec playwright install chromium
```

Expected: Chromium is downloaded into Playwright's cache (about 150 MB, once).

`apps/web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

const PORT = 4173;

// The tests run against a real build behind the real entry file, so the
// Content Security Policy, the cookie and the origin checks are all in force.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: 'pnpm build && node server.js',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      INSECURE_HTTP: '1',
      PROTOCOL_HEADER: 'x-forwarded-proto',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://pokerji:pokerji_dev@127.0.0.1:5432/pokerji',
      VALKEY_URL: process.env.VALKEY_URL ?? 'redis://:pokerji_dev@127.0.0.1:6379',
      ADDRESS_HMAC_SECRET: 'end-to-end-tests-only-address-hmac-secret',
      // A fresh namespace each run, so rate limits from earlier runs do not carry over.
      KEY_PREFIX: `e2e-${Date.now()}:`,
    },
  },
});
```

- [ ] **Step 2: Write the tests**

`apps/web/e2e/round.spec.ts`:

```ts
import { expect, test, type Browser, type Page } from '@playwright/test';

async function createRoom(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/poker');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create room' }).click();
  const link = page.getByRole('link', { name: 'Open the room' });
  const path = await link.getAttribute('href');
  if (!path) throw new Error('no room link');
  await link.click();
  await expect(page.getByTestId('participants')).toContainText(name);
  return { page, path, context };
}

async function joinRoom(browser: Browser, path: string, name: string, role = 'Voter') {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel(role).check();
  await page.getByRole('button', { name: 'Join' }).click();
  return { page, context };
}

const vote = (page: Page, card: string) =>
  page.getByRole('button', { name: `Vote ${card}`, exact: true }).click();

test('two people estimate a story and see the result together', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  const { page: ann } = await joinRoom(browser, path, 'Ann');
  await expect(mo.getByTestId('participants')).toContainText('Ann');

  await mo.getByLabel('Story title').fill('PROJ-1 Login page');
  await mo.getByRole('button', { name: 'Set title' }).click();
  await expect(ann.getByRole('heading', { level: 1 })).toHaveText('PROJ-1 Login page');

  await vote(mo, '3');
  await vote(ann, '8');

  // Each sees that the other has voted, and nothing about what they chose.
  await expect(ann.getByTestId('participants')).toContainText('Mo voted');
  await expect(mo.getByTestId('participants')).toContainText('Ann voted');
  await expect(ann.getByTestId('participants')).not.toContainText('3');
  await expect(mo.getByTestId('participants')).not.toContainText('8');
  await expect(ann.getByTestId('result')).toHaveCount(0);

  await mo.getByRole('button', { name: 'Reveal' }).click();
  await expect(ann.getByTestId('countdown')).toBeVisible();
  await expect(ann.getByRole('button', { name: 'Vote 5', exact: true })).toBeDisabled();

  for (const page of [mo, ann]) {
    await expect(page.getByTestId('result')).toContainText('Low 3, High 8', { timeout: 8_000 });
    await expect(page.getByTestId('result')).toContainText('Average 5.5');
    await expect(page.getByTestId('participants')).toContainText('Mo: 3');
    await expect(page.getByTestId('participants')).toContainText('Ann: 8');
  }

  await mo.getByRole('button', { name: 'New round' }).click();
  await expect(ann.getByRole('heading', { level: 1 })).toHaveText('No story yet');
  await expect(ann.getByTestId('participants')).toContainText('Ann not voted');
});

test('a spectator watches without a hand', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  const { page: sam } = await joinRoom(browser, path, 'Sam', 'Spectator');
  await expect(sam.getByText('You are watching.')).toBeVisible();
  await expect(sam.getByRole('button', { name: /^Vote / })).toHaveCount(0);
  await expect(mo.getByText('Watching')).toBeVisible();
  await expect(sam.getByRole('button', { name: 'Reveal' })).toHaveCount(0);
});

test('reloading the page keeps you in the room with the current state', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  await mo.getByLabel('Story title').fill('PROJ-2');
  await mo.getByRole('button', { name: 'Set title' }).click();
  await vote(mo, '5');
  await mo.reload();
  await expect(mo.getByRole('heading', { level: 1 })).toHaveText('PROJ-2');
  await expect(mo.getByTestId('participants')).toContainText('Mo voted');
  await expect(mo.getByRole('button', { name: 'Vote 5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(mo.url()).toContain(path);
});

test('an unknown room looks like any other room and cannot be joined', async ({ browser }) => {
  const { page } = await joinRoom(browser, '/poker/r/AAAAAAAAAAAA', 'Ann');
  await expect(page.getByRole('alert')).toHaveText(
    'Could not join. Check the link and the passcode, then try again.',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join the room');
});

test('the session cookie is scoped to its room and hidden from scripts', async ({ browser }) => {
  const { page, path, context } = await createRoom(browser, 'Mo');
  const cookies = await context.cookies();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    name: 'pj_session',
    path,
    httpOnly: true,
    sameSite: 'Lax',
  });
  expect(await page.evaluate(() => document.cookie)).toBe('');
});

test('pages carry the security headers, and the policy does not break the app', async ({
  browser,
  request,
}) => {
  const response = await request.get('/poker/r/AAAAAAAAAAAA');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('same-origin');
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['x-robots-tag']).toContain('noindex');

  const violations: string[] = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto('/poker');
  await page.getByLabel('Your name').fill('Mo');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('link', { name: 'Open the room' }).click();
  await expect(page.getByTestId('participants')).toContainText('Mo');
  expect(violations).toEqual([]);
});
```

- [ ] **Step 3: Run the tests**

```bash
docker compose up -d --wait
pnpm --filter @pokerji/web e2e
```

Expected: 6 passed. A failure here is a real defect in Tasks 5 or 6, or a wrong assumption in this plan about SvelteKit; use superpowers:systematic-debugging, fix the cause, and record a ruling if the plan's code had to change.

- [ ] **Step 4: Run everything**

```bash
pnpm test && pnpm typecheck && pnpm format:check
```

Expected: all package tests pass, both typechecks report no errors, and the format check reports no files.

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`, replace the first paragraph under `## Status` with:

```markdown
A full round is playable in a browser. `packages/protocol`, `packages/poker-engine`, `packages/poker-server` and `apps/web` exist. The pages use plain markup; the designed interface, and the settings, history, recovery and privacy pages, are Plan 4. The behaviour spec and design direction are in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, product facts in `PRODUCT.md`.
```

Add these lines to the `## Commands` list:

```markdown
- Run the app: copy `.env.example` to `.env`, then `pnpm --filter @pokerji/web dev` and open http://localhost:5173/poker
- Web typecheck: `pnpm --filter @pokerji/web typecheck`
- End-to-end tests: `pnpm --filter @pokerji/web e2e` (builds the app and drives Chromium; first run needs `pnpm --filter @pokerji/web exec playwright install chromium`)
- Smoke check of a build: `pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke`
```

Add these bullets to the end of `## Architecture`:

```markdown
- `apps/web` is a thin SvelteKit 3 shell. Rules live in the packages; a route only parses a form, calls a flow, sets a cookie and renders.
- SvelteKit 3 differences that matter here: configuration is in `vite.config.ts` (no `svelte.config.js`); hook types come from `@sveltejs/kit/hooks`; the library alias is `#lib` and imports through it carry the file extension.
- One runtime object per process lives on `globalThis` under `Symbol.for('pokerji.runtime')` (`apps/web/src/lib/server/pokerji.ts`). `apps/web/server.js`, the production entry, uses it to hand WebSocket upgrades to `createUpgradeHandler`; a Vite plugin does the same in dev.
- Behind Traefik the app needs `PROTOCOL_HEADER=x-forwarded-proto`, `HOST_HEADER=x-forwarded-host`, `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`. Without the first two, every form post is refused. `INSECURE_HTTP=1` is for local testing only.
- The Content Security Policy applies to builds, not to `vite dev`. It forbids inline styles: no `style` attributes and no Svelte `transition:` or `animate:` directives in `apps/web`.
- Join failures must stay indistinguishable (unknown room, wrong passcode, locked out, full). Do not add a branch that answers differently.
```

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "test: add end-to-end tests for a full round" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

1. Run `pnpm test && pnpm typecheck && pnpm --filter @pokerji/web e2e` once more and confirm all pass.
2. Request an Octopus code review and an Octopus security audit of the `feat/poker-web-slice` branch. This is the first branch that faces a browser: ask the audit to cover the cookie, the origin checks on forms and sockets, the Content Security Policy, the uniform join failure, and what the pages render from user input. Address findings using superpowers:receiving-code-review.
3. Use superpowers:finishing-a-development-branch to decide how the branch is integrated.
4. Write Plan 4 (interface and release). It starts with Impeccable's build of the room in the "Judges' Row" direction.
