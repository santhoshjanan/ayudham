# Planning Poker: Running a Room (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the behaviour of the app: everything a moderator and a participant can do that the first browser slice left out — settings, passcodes, moderator recovery, deleting a room, history, removing your name, the timer, removing and promoting people, switching role, and the privacy page.

**Architecture:** As before, the rules go into `packages/poker-server` as flows that take an authenticated `Actor` and are tested against real services; the SvelteKit routes in `apps/web` parse a form, call a flow and render. The pages stay plain semantic markup. After this plan every surface in the spec exists and works, so the Impeccable interface can then be designed across all of them at once.

**Tech Stack:** Unchanged from Plan 3.

**Spec:** `docs/superpowers/specs/2026-10-12-planning-poker-design.md`.

## Where this plan sits

| Plan | Delivers | Status |
|---|---|---|
| 1. Core | Protocol and room engine | Done |
| 2. Server core | `packages/poker-server` | Done |
| 3. In a browser | Create, join, vote, reveal | Done |
| **4. Running a room (this plan)** | Every remaining behaviour, in plain markup | This plan |
| Interface | Impeccable builds "Judges' Row" across every page in both themes, with the count-in, the pointer effect and audio. This is design work led by the Impeccable skill, not a code-first plan like this one. | After this plan |
| 5. Release | Dockerfile, Traefik notes, the deployment requirements carried from the audits, final Octopus security audit | Last |

Why behaviour before design: the interface is designed once, against pages that all exist and work, instead of designing the room now and retrofitting four more pages later. Nothing in this plan's markup is meant to survive the design pass except its labels, test ids and behaviour.

## Global Constraints

- All constraints from Plans 1–3 still apply. In particular: no room codes, names, titles, votes, tokens or addresses in logs; SQL always parameterised; no inline styles and no Svelte `transition:`/`animate:` directives; `Referrer-Policy` stays `same-origin`; the session cookie stays always-`Secure` outside local development; join failures stay indistinguishable.
- Work happens on branch `feat/poker-moderation`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests need `docker compose up -d --wait`.
- Every flow that changes a room checks `actor.session.moderator` itself. A route must never be the only place a permission is checked.
- An `Actor` always comes from `resumeSession` on the current request. Never build one from form data or keep one between requests.
- A secret is shown once and never stored readable: the recovery token is returned to the page that asked for it and nowhere else.
- Spec change in this plan, from the security audit: the minimum passcode length rises from 4 to 8 characters. At 50 failed attempts an hour a four-digit passcode falls in about eight days.
- Music: no tracks are bundled yet (the interface work chooses and licenses them). `MUSIC_TRACK_IDS` is an empty list, so the only valid music setting is "none". The settings page does not show a music control until the list is non-empty.
- Pages render dates on the server in UTC, so server and browser output match.

## Review Focus

1. A non-moderator posts directly to a moderator-only form action: refused by the flow, not just hidden by the page. (Task 1, Task 2)
2. Setting a passcode while people are in the room: everyone but moderators is signed out of the live room and must rejoin with it. (Task 1, Task 2)
3. Changing the deck while votes are in: refused with a clear message, and nothing is saved. (Task 1)
4. A recovery link opened by someone who has not joined, or with a wrong secret: the same refusal, and attempts are rate limited. (Task 1, Task 5)
5. Deleting a room while people are in it: their connections close and the link stops working. (Task 1, Task 2)

## File Structure

```
packages/protocol/src/limits.ts            (modified) PASSCODE_MIN 8, MUSIC_TRACK_IDS
packages/poker-server/
  src/moderation.ts                        Actor, settings schema, deck text parser, every moderator and member flow
  src/app.ts  src/config.ts                (modified) App exposes config; config gains backupRotationDays
  test/moderation.test.ts
apps/web/
  src/lib/server/actor.ts                  who is making this request
  src/lib/summary.ts                       one-line result text for a saved round
  src/routes/poker/r/[code]/Room.svelte    (replaced) timer, people controls, role switch, links
  src/routes/poker/r/[code]/settings/      +page.server.ts  +page.svelte
  src/routes/poker/r/[code]/history/       +page.server.ts  +page.svelte
  src/routes/poker/r/[code]/recover/       +page.server.ts  +page.svelte
  src/routes/privacy/                      +page.server.ts  +page.svelte
  src/routes/+page.svelte                  (modified) link to the privacy page
  e2e/moderation.spec.ts
```

---

### Task 1: Moderator and member flows

**Files:**
- Create: `packages/poker-server/src/moderation.ts`
- Modify: `packages/protocol/src/limits.ts`, `packages/poker-server/src/app.ts`, `packages/poker-server/src/index.ts`, `packages/poker-server/test/validate.test.ts`
- Test: `packages/poker-server/test/moderation.test.ts`

**Interfaces:**
- Consumes: `App`, `resumeSession`, `createRoomFlow`, `joinRoomFlow` and the data functions from Plans 2 and 3; `deckSchema`, `TIMER_MIN_SECONDS`, `TIMER_MAX_SECONDS` from `@pokerji/protocol`.
- Produces:
  - In `@pokerji/protocol`: `PASSCODE_MIN = 8`; `MUSIC_TRACK_IDS: readonly string[]` (empty).
  - `App` gains `config: Config`.
  - `interface Actor { room: RoomRow; session: SessionRow }` — what `resumeSession` returns.
  - `type FlowOutcome = { ok: true } | { ok: false; reason: 'invalid' | 'refused' | 'busy' }`
  - `settingsSchema` (`{ deck, timerSeconds, music }`), `parseDeckText(values: string, specials: string): Deck | null`
  - `saveSettings(app, actor, input: unknown): Promise<FlowOutcome>`
  - `setPasscode(app, actor, passcode: unknown): Promise<FlowOutcome>`, `removePasscode(app, actor): Promise<FlowOutcome>`
  - `regenerateRecovery(app, actor): Promise<{ ok: true; recoveryToken: string } | { ok: false; reason: 'refused' }>`
  - `recoverModerator(app, input: { address: string; actor: Actor; recoveryToken: unknown }): Promise<boolean>`
  - `deleteRoomNow(app, actor): Promise<FlowOutcome>`
  - `roomHistory(app, actor): Promise<SavedRound[]>`
  - `deleteHistoryRound(app, actor, roundId: unknown): Promise<FlowOutcome>`, `clearRoomHistory(app, actor): Promise<FlowOutcome>`
  - `anonymiseMe(app, actor): Promise<number>`

- [ ] **Step 1: Branch, and make the protocol changes**

```bash
git switch -c feat/poker-moderation
```

In `packages/protocol/src/limits.ts`, change `export const PASSCODE_MIN = 4;` to:

```ts
/** Raised from 4 after the security audit: short passcodes fall to patient guessing. */
export const PASSCODE_MIN = 8;
```

and append:

```ts
/**
 * Ids of the bundled music tracks. Empty until tracks are chosen and their
 * licences recorded; until then a room's music setting can only be "none".
 */
export const MUSIC_TRACK_IDS: readonly string[] = [];
```

In `packages/poker-server/test/validate.test.ts`, replace the body of the test `'bound the passcode length'` with:

```ts
    expect(ok(passcodeSchema, 'abcdefgh')).toBe(true);
    expect(ok(passcodeSchema, 'x'.repeat(64))).toBe(true);
    expect(ok(passcodeSchema, 'abcdefg')).toBe(false);
    expect(ok(passcodeSchema, 'x'.repeat(65))).toBe(false);
```

In `packages/poker-server/src/app.ts`, add `config: Config;` as the first field of the `App` interface, and `config,` as the first property of the object `createApp` returns.

- [ ] **Step 2: Write the failing tests**

`packages/poker-server/test/moderation.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymiseMe,
  clearRoomHistory,
  createApp,
  createRoomFlow,
  deleteHistoryRound,
  deleteRoomNow,
  findRoomByCode,
  joinRoomFlow,
  parseDeckText,
  recoverModerator,
  regenerateRecovery,
  removePasscode,
  resumeSession,
  roomHistory,
  saveRound,
  saveSettings,
  setPasscode,
  type Actor,
  type App,
} from '../src/index.ts';
import { fakeConnection } from './fakes.ts';
import { DATABASE_URL, testPrefix, testSchema, VALKEY_URL } from './services.ts';

let app: App;
let drop: () => Promise<void>;

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
});
afterAll(async () => {
  await app.stop();
  await drop();
});

const FIB = BUILT_IN_DECKS.fibonacci.deck;
const TEE = BUILT_IN_DECKS.tshirt.deck;
let n = 0;

/** A room with Mo (moderator) and Ann (voter), each from an address of their own. */
async function setup() {
  n += 1;
  const created = await createRoomFlow(app.flows, {
    address: `203.0.113.${n}`,
    name: 'Mo',
    deckId: 'fibonacci',
  });
  if (!created.ok) throw new Error('room was not created');
  const joined = await joinRoomFlow(app.flows, {
    address: `198.51.100.${n}`,
    code: created.code,
    name: 'Ann',
    role: 'voter',
    passcode: '',
  });
  if (!joined.ok) throw new Error('join failed');
  const who = async (token: string): Promise<Actor> => {
    const actor = await resumeSession(app.flows, { code: created.code, token });
    if (!actor) throw new Error('session did not resume');
    return actor;
  };
  return {
    code: created.code,
    recoveryToken: created.recoveryToken,
    moToken: created.sessionToken,
    annToken: joined.sessionToken,
    mo: await who(created.sessionToken),
    ann: await who(joined.sessionToken),
    who,
    annAddress: `198.51.100.${n}`,
  };
}

const joiner = (actor: Actor) => ({
  id: actor.session.id,
  name: actor.session.name,
  role: actor.session.role,
  moderator: actor.session.moderator,
});

const settings = (extra: Record<string, unknown> = {}) => ({
  deck: FIB,
  timerSeconds: null,
  music: null,
  ...extra,
});

const refused = { ok: false, reason: 'refused' };
const invalid = { ok: false, reason: 'invalid' };

describe('saveSettings', () => {
  it('saves a deck and a timer, and a live room shows them at once', async () => {
    const { code, mo } = await setup();
    const host = await app.registry.open(mo.room);
    const tab = fakeConnection();
    host?.connect(joiner(mo), tab.connection);

    expect(await saveSettings(app, mo, settings({ deck: TEE, timerSeconds: 90 }))).toEqual({
      ok: true,
    });
    expect(await findRoomByCode(app.db, code)).toMatchObject({ deck: TEE, timerSeconds: 90 });
    expect(tab.room()).toMatchObject({ deck: TEE, timer: { seconds: 90 } });
  });

  it('is refused for someone who is not a moderator', async () => {
    const { code, ann } = await setup();
    expect(await saveSettings(app, ann, settings({ deck: TEE }))).toEqual(refused);
    expect((await findRoomByCode(app.db, code))?.deck).toEqual(FIB);
  });

  it('rejects a timer out of range, a bad deck and an unknown track', async () => {
    const { mo } = await setup();
    for (const bad of [
      settings({ timerSeconds: 5 }),
      settings({ timerSeconds: 601 }),
      settings({ timerSeconds: 30.5 }),
      settings({ deck: { values: ['1'], specials: [] } }),
      settings({ deck: null }),
      settings({ music: 'not-a-track' }),
      null,
    ]) {
      expect(await saveSettings(app, mo, bad)).toEqual(invalid);
    }
  });

  it('refuses a deck change while votes are in, and saves nothing', async () => {
    const { code, mo } = await setup();
    const host = await app.registry.open(mo.room);
    host?.connect(joiner(mo), fakeConnection().connection);
    host?.receive(mo.session.id, { type: 'vote', card: '5' });

    expect(await saveSettings(app, mo, settings({ deck: TEE, timerSeconds: 60 }))).toEqual({
      ok: false,
      reason: 'busy',
    });
    expect(await findRoomByCode(app.db, code)).toMatchObject({ deck: FIB, timerSeconds: null });
  });

  it('allows a timer change while votes are in', async () => {
    const { mo } = await setup();
    const host = await app.registry.open(mo.room);
    const tab = fakeConnection();
    host?.connect(joiner(mo), tab.connection);
    host?.receive(mo.session.id, { type: 'vote', card: '5' });
    expect(await saveSettings(app, mo, settings({ timerSeconds: 45 }))).toEqual({ ok: true });
    expect(tab.room()).toMatchObject({ timer: { seconds: 45 }, you: { vote: '5' } });
  });
});

describe('parseDeckText', () => {
  it('reads cards separated by commas or spaces', () => {
    expect(parseDeckText('1, 2,3  5', '? ☕')).toEqual({
      values: ['1', '2', '3', '5'],
      specials: ['?', '☕'],
    });
    expect(parseDeckText('S M L', '')).toEqual({ values: ['S', 'M', 'L'], specials: [] });
  });

  it('returns nothing for a deck that is not valid', () => {
    expect(parseDeckText('', '')).toBeNull();
    expect(parseDeckText('1', '')).toBeNull();
    expect(parseDeckText('1 1 2', '')).toBeNull();
    expect(parseDeckText('1 2 TOOLONG', '')).toBeNull();
    expect(parseDeckText(Array.from({ length: 21 }, (_, i) => i).join(' '), '')).toBeNull();
  });
});

describe('setPasscode and removePasscode', () => {
  const join = (code: string, passcode: string, address: string) =>
    joinRoomFlow(app.flows, { address, code, name: 'Bo', role: 'voter', passcode });

  it('requires the passcode from then on, and removing it opens the room again', async () => {
    const { code, mo } = await setup();
    expect(await setPasscode(app, mo, 'open sesame')).toEqual({ ok: true });
    expect((await join(code, '', '192.0.2.1')).ok).toBe(false);
    expect((await join(code, 'open sesame', '192.0.2.2')).ok).toBe(true);

    expect(await removePasscode(app, await resumeAgain(code, mo))).toEqual({ ok: true });
    expect((await join(code, '', '192.0.2.3')).ok).toBe(true);
  });

  it('signs everyone but moderators out, in the database and in the live room', async () => {
    const { code, mo, ann, moToken, annToken } = await setup();
    const host = await app.registry.open(mo.room);
    const annTab = fakeConnection();
    const moTab = fakeConnection();
    host?.connect(joiner(ann), annTab.connection);
    host?.connect(joiner(mo), moTab.connection);

    await setPasscode(app, mo, 'open sesame');
    expect(await resumeSession(app.flows, { code, token: annToken })).toBeNull();
    expect(await resumeSession(app.flows, { code, token: moToken })).not.toBeNull();
    expect(annTab.sent.at(-1)).toEqual({ type: 'removed' });
    expect(annTab.isClosed()).toBe(true);
    expect(moTab.isClosed()).toBe(false);
  });

  it('rejects a passcode that is too short, too long or not text', async () => {
    const { code, mo } = await setup();
    for (const bad of ['short77', 'x'.repeat(65), '', null, 12345678]) {
      expect(await setPasscode(app, mo, bad)).toEqual(invalid);
    }
    expect((await findRoomByCode(app.db, code))?.passcodeHash).toBeNull();
  });

  it('is refused for someone who is not a moderator', async () => {
    const { code, ann } = await setup();
    expect(await setPasscode(app, ann, 'open sesame')).toEqual(refused);
    expect(await removePasscode(app, ann)).toEqual(refused);
    expect((await findRoomByCode(app.db, code))?.passcodeHash).toBeNull();
  });

  async function resumeAgain(code: string, actor: Actor): Promise<Actor> {
    const room = await findRoomByCode(app.db, code);
    if (!room) throw new Error('room is gone');
    return { room, session: actor.session };
  }
});

describe('recovery', () => {
  it('makes a joined person a moderator when they present the recovery secret', async () => {
    const { ann, who, annToken, annAddress, recoveryToken } = await setup();
    const host = await app.registry.open(ann.room);
    const tab = fakeConnection();
    host?.connect(joiner(ann), tab.connection);

    expect(
      await recoverModerator(app, { address: annAddress, actor: ann, recoveryToken }),
    ).toBe(true);
    expect((await who(annToken)).session.moderator).toBe(true);
    expect(tab.room().you.moderator).toBe(true);
  });

  it('refuses a wrong, missing or malformed secret', async () => {
    const { ann, who, annToken, annAddress } = await setup();
    for (const bad of ['wrong', '', null, 42, 'x'.repeat(500)]) {
      expect(
        await recoverModerator(app, { address: annAddress, actor: ann, recoveryToken: bad }),
      ).toBe(false);
    }
    expect((await who(annToken)).session.moderator).toBe(false);
  });

  it('does not accept one room’s secret in another room', async () => {
    const first = await setup();
    const second = await setup();
    expect(
      await recoverModerator(app, {
        address: second.annAddress,
        actor: second.ann,
        recoveryToken: first.recoveryToken,
      }),
    ).toBe(false);
  });

  it('stops answering after thirty attempts from one client, even for the right secret', async () => {
    const { ann, recoveryToken } = await setup();
    const address = '192.0.2.77';
    for (let i = 0; i < 30; i += 1) {
      await recoverModerator(app, { address, actor: ann, recoveryToken: 'wrong' });
    }
    expect(await recoverModerator(app, { address, actor: ann, recoveryToken })).toBe(false);
  });

  it('replaces the secret: the old link stops working and the new one works', async () => {
    const { mo, ann, annAddress, recoveryToken } = await setup();
    const made = await regenerateRecovery(app, mo);
    if (!made.ok) throw new Error('not regenerated');
    expect(made.recoveryToken).not.toBe(recoveryToken);

    const fresh = { room: (await findRoomByCode(app.db, ann.room.code))!, session: ann.session };
    expect(await recoverModerator(app, { address: annAddress, actor: fresh, recoveryToken })).toBe(
      false,
    );
    expect(
      await recoverModerator(app, {
        address: annAddress,
        actor: fresh,
        recoveryToken: made.recoveryToken,
      }),
    ).toBe(true);
  });

  it('only a moderator can replace the secret', async () => {
    const { ann } = await setup();
    expect(await regenerateRecovery(app, ann)).toEqual(refused);
  });
});

describe('deleteRoomNow', () => {
  it('closes the live room and removes the room', async () => {
    const { code, mo, ann } = await setup();
    const host = await app.registry.open(mo.room);
    const tab = fakeConnection();
    host?.connect(joiner(ann), tab.connection);

    expect(await deleteRoomNow(app, mo)).toEqual({ ok: true });
    expect(tab.isClosed()).toBe(true);
    expect(app.registry.get(mo.room.id)).toBeUndefined();
    expect(await findRoomByCode(app.db, code)).toBeNull();
  });

  it('is refused for someone who is not a moderator', async () => {
    const { code, ann } = await setup();
    expect(await deleteRoomNow(app, ann)).toEqual(refused);
    expect(await findRoomByCode(app.db, code)).not.toBeNull();
  });
});

describe('history', () => {
  async function withRounds() {
    const made = await setup();
    const ids = [randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      await saveRound(app.db, made.mo.room.id, {
        id,
        title: `PROJ-${index + 1}`,
        votes: [
          { sessionId: made.mo.session.id, name: 'Mo', card: '3' },
          { sessionId: made.ann.session.id, name: 'Ann', card: '8' },
        ],
      });
    }
    return { ...made, ids };
  }

  it('lists the room’s rounds, newest first, to any member', async () => {
    const { ann } = await withRounds();
    const rounds = await roomHistory(app, ann);
    expect(rounds.map((round) => round.title)).toEqual(['PROJ-2', 'PROJ-1']);
  });

  it('lets a moderator delete one round or all of them, and nobody else', async () => {
    const { mo, ann, ids } = await withRounds();
    expect(await deleteHistoryRound(app, ann, ids[0])).toEqual(refused);
    expect(await clearRoomHistory(app, ann)).toEqual(refused);
    expect(await roomHistory(app, mo)).toHaveLength(2);

    expect(await deleteHistoryRound(app, mo, ids[0])).toEqual({ ok: true });
    expect((await roomHistory(app, mo)).map((round) => round.title)).toEqual(['PROJ-2']);
    expect(await clearRoomHistory(app, mo)).toEqual({ ok: true });
    expect(await roomHistory(app, mo)).toEqual([]);
  });

  it('rejects a round id that is not an id, or belongs to another room', async () => {
    const { mo } = await withRounds();
    const other = await withRounds();
    for (const bad of ['nope', '', null, 7]) {
      expect(await deleteHistoryRound(app, mo, bad)).toEqual(invalid);
    }
    expect(await deleteHistoryRound(app, mo, other.ids[0])).toEqual(invalid);
    expect(await roomHistory(app, other.mo)).toHaveLength(2);
  });

  it('removes only the caller’s name from history', async () => {
    const { mo, ann } = await withRounds();
    expect(await anonymiseMe(app, ann)).toBe(2);
    const [round] = await roomHistory(app, mo);
    expect(round?.votes.map((vote) => vote.name)).toEqual(['Mo', null]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test`
Expected: FAIL in `moderation.test.ts`, because none of the flows are exported. `validate.test.ts` passes: it follows `PASSCODE_MIN`.

- [ ] **Step 4: Implement the flows**

`packages/poker-server/src/moderation.ts`:

```ts
import {
  deckSchema,
  MUSIC_TRACK_IDS,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
  type Deck,
} from '@pokerji/protocol';
import { z } from 'zod';
import type { App } from './app.ts';
import {
  anonymiseSession,
  clearHistory,
  deleteRound,
  listRounds,
  type SavedRound,
} from './history.ts';
import { LIMITS, withinLimit } from './limiter.ts';
import {
  deleteRoom,
  setPasscodeHash,
  setRecoveryHash,
  updateRoomSettings,
  type RoomRow,
} from './rooms.ts';
import { addressKey, hashPasscode, hashToken, newToken, tokenMatches } from './secrets.ts';
import { deleteNonModeratorSessions, setSessionModerator, type SessionRow } from './sessions.ts';
import { normaliseAddress, passcodeSchema } from './validate.ts';

/**
 * Who is making a request: the room and session `resumeSession` found for it.
 * Always built from the current request, never from form data.
 */
export interface Actor {
  room: RoomRow;
  session: SessionRow;
}

export type FlowOutcome = { ok: true } | { ok: false; reason: 'invalid' | 'refused' | 'busy' };

const OK = { ok: true } as const;
const INVALID = { ok: false, reason: 'invalid' } as const;
/** The caller is not allowed to do this. */
const REFUSED = { ok: false, reason: 'refused' } as const;
/** The room is in a state that does not allow this right now. */
const BUSY = { ok: false, reason: 'busy' } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const settingsSchema = z.object({
  deck: deckSchema,
  timerSeconds: z.number().int().min(TIMER_MIN_SECONDS).max(TIMER_MAX_SECONDS).nullable(),
  music: z
    .string()
    .refine((id) => MUSIC_TRACK_IDS.includes(id))
    .nullable(),
});

/** Reads a custom deck typed as text: cards separated by commas or spaces. */
export function parseDeckText(values: string, specials: string): Deck | null {
  const cards = (text: string) => text.split(/[\s,]+/u).filter((card) => card !== '');
  const parsed = deckSchema.safeParse({ values: cards(values), specials: cards(specials) });
  return parsed.success ? parsed.data : null;
}

export async function saveSettings(app: App, actor: Actor, input: unknown): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const host = app.registry.get(actor.room.id);
  const deckChanged = JSON.stringify(parsed.data.deck) !== JSON.stringify(actor.room.deck);
  // Checked before saving, so the stored settings and the live room never disagree.
  if (deckChanged && host && !host.canChangeDeck()) return BUSY;

  await updateRoomSettings(app.db, actor.room.id, parsed.data);
  host?.applySettings(parsed.data);
  return OK;
}

/** Sets or changes the passcode. Everyone except moderators is signed out and must rejoin with it. */
export async function setPasscode(app: App, actor: Actor, passcode: unknown): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  const parsed = passcodeSchema.safeParse(passcode);
  if (!parsed.success) return INVALID;

  await setPasscodeHash(app.db, actor.room.id, await hashPasscode(parsed.data));
  const signedOut = await deleteNonModeratorSessions(app.db, actor.room.id);
  app.registry.get(actor.room.id)?.evict(signedOut);
  return OK;
}

export async function removePasscode(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  await setPasscodeHash(app.db, actor.room.id, null);
  return OK;
}

/** Issues a new recovery secret. The old link stops working. The secret is returned once. */
export async function regenerateRecovery(
  app: App,
  actor: Actor,
): Promise<{ ok: true; recoveryToken: string } | { ok: false; reason: 'refused' }> {
  if (!actor.session.moderator) return REFUSED;
  const recoveryToken = newToken();
  await setRecoveryHash(app.db, actor.room.id, hashToken(recoveryToken));
  return { ok: true, recoveryToken };
}

/** Makes a joined person a moderator if they hold the room's recovery secret. */
export async function recoverModerator(
  app: App,
  input: { address: string; actor: Actor; recoveryToken: unknown },
): Promise<boolean> {
  const client = addressKey(app.flows.addressSecret, normaliseAddress(input.address));
  if (!(await withinLimit(app.kv, `recover:${client}`, LIMITS.join, app.flows.keyPrefix))) {
    return false;
  }
  const { room, session } = input.actor;
  const token = input.recoveryToken;
  if (typeof token !== 'string' || token.length > 128) return false;
  if (!tokenMatches(token, room.recoveryHash)) return false;
  if (!session.moderator) {
    await setSessionModerator(app.db, room.id, session.id);
    app.registry.get(room.id)?.grantModerator(session.id);
  }
  return true;
}

/** Deletes the room and everything in it, now. Live connections are closed first. */
export async function deleteRoomNow(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  await app.registry.close(actor.room.id);
  await deleteRoom(app.db, actor.room.id);
  return OK;
}

/** Any member of the room may read its history. */
export function roomHistory(app: App, actor: Actor): Promise<SavedRound[]> {
  return listRounds(app.db, actor.room.id);
}

export async function deleteHistoryRound(
  app: App,
  actor: Actor,
  roundId: unknown,
): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  if (typeof roundId !== 'string' || !UUID.test(roundId)) return INVALID;
  return (await deleteRound(app.db, actor.room.id, roundId)) ? OK : INVALID;
}

export async function clearRoomHistory(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  await clearHistory(app.db, actor.room.id);
  return OK;
}

/** "Remove my name from history": clears the caller's name from their own votes in this room. */
export function anonymiseMe(app: App, actor: Actor): Promise<number> {
  return anonymiseSession(app.db, actor.room.id, actor.session.id);
}
```

Add this line to `packages/poker-server/src/index.ts`, keeping the list alphabetical:

```ts
export * from './moderation.ts';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every package's tests PASS and both typechecks report no errors. The recovery rate-limit test makes thirty real requests and takes a moment.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add moderator and member flows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The settings page

**Files:**
- Create: `apps/web/src/lib/server/actor.ts`
- Create: `apps/web/src/routes/poker/r/[code]/settings/+page.server.ts`, `apps/web/src/routes/poker/r/[code]/settings/+page.svelte`
- Test: `apps/web/e2e/moderation.spec.ts`

**Interfaces:**
- Consumes: Task 1's flows; `runtime()`, `SESSION_COOKIE`, `resumeSession` from earlier plans.
- Produces:
  - `actorOf(event): Promise<Actor | null>`, `memberOf(event): Promise<Actor>` (redirects to the join form when there is no session), `moderatorOf(event): Promise<Actor>` (403 for a member who is not a moderator), from `#lib/server/actor.ts`.
  - The page `/poker/r/<code>/settings` with forms labelled: "Deck", "Value cards", "Special cards", "Timer in seconds", "Save settings"; "New passcode", "Set passcode", "Remove passcode"; "Make a new moderator link"; "Delete this room".
  - Test helpers in `e2e/moderation.spec.ts`: `createRoom`, `joinRoom`, `vote`, re-used by Tasks 3–5.

- [ ] **Step 1: Write the failing browser tests**

`apps/web/e2e/moderation.spec.ts`:

```ts
import { expect, test, type Browser, type Page } from '@playwright/test';

async function createRoom(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/poker');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create room' }).click();
  const recovery = (await page.getByTestId('recovery-link').textContent())?.trim() ?? '';
  const link = page.getByRole('link', { name: 'Open the room' });
  const path = (await link.getAttribute('href')) ?? '';
  await link.click();
  await expect(page.getByTestId('participants')).toContainText(name);
  return { page, path, context, recovery };
}

async function joinRoom(
  browser: Browser,
  path: string,
  name: string,
  options: { passcode?: string; role?: string } = {},
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel(options.role ?? 'Voter').check();
  if (options.passcode !== undefined) {
    await page.getByLabel('Passcode, if the room has one').fill(options.passcode);
  }
  await page.getByRole('button', { name: 'Join' }).click();
  return { page, context };
}

const vote = (page: Page, card: string) =>
  page.getByRole('button', { name: `Vote ${card}`, exact: true }).click();

const refusal = 'Could not join. Check the link and the passcode, then try again.';

test.describe('settings', () => {
  test('a moderator changes the deck and the room uses it', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Deck').selectOption('custom');
    await mo.getByLabel('Value cards').fill('S, M, L');
    await mo.getByLabel('Special cards').fill('?');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await expect(mo.getByRole('status')).toHaveText('Settings saved.');

    await mo.goto(path);
    await expect(mo.getByRole('button', { name: 'Vote M', exact: true })).toBeVisible();
    await expect(mo.getByRole('button', { name: 'Vote 5', exact: true })).toHaveCount(0);
  });

  test('a deck that is not valid is refused with a reason', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Deck').selectOption('custom');
    await mo.getByLabel('Value cards').fill('only');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await expect(mo.getByRole('alert')).toContainText('could not be saved');
  });

  test('someone who is not a moderator cannot open settings or post to them', async ({
    browser,
  }) => {
    const { path } = await createRoom(browser, 'Mo');
    const { page: ann, context } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');
    const opened = await ann.goto(`${path}/settings`);
    expect(opened?.status()).toBe(403);

    const posted = await context.request.post(`${path}/settings?/delete`, {
      headers: { origin: new URL(ann.url()).origin },
      form: {},
    });
    expect(posted.status()).toBe(403);
    await ann.goto(path);
    await expect(ann.getByTestId('participants')).toContainText('Ann');
  });

  test('someone who has not joined is sent to the join form', async ({ browser }) => {
    const { path } = await createRoom(browser, 'Mo');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${path}/settings`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join the room');
  });

  test('setting a passcode signs others out, and they need it to return', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');

    await mo.goto(`${path}/settings`);
    await mo.getByLabel('New passcode').fill('open sesame');
    await mo.getByRole('button', { name: 'Set passcode' }).click();
    await expect(mo.getByRole('status')).toContainText('Passcode set');

    await expect(ann.getByRole('heading', { level: 1 })).toHaveText(
      'You are no longer in this room',
    );

    const wrong = await joinRoom(browser, path, 'Bo', { passcode: 'wrong guess' });
    await expect(wrong.page.getByRole('alert')).toHaveText(refusal);
    const right = await joinRoom(browser, path, 'Cy', { passcode: 'open sesame' });
    await expect(right.page.getByTestId('participants')).toContainText('Cy');
  });

  test('a passcode shorter than eight characters is refused', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('New passcode').fill('short77');
    await mo.getByRole('button', { name: 'Set passcode' }).click();
    await expect(mo.getByRole('alert')).toContainText('8 to 64 characters');
  });

  test('deleting the room closes it for everyone', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');

    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Type DELETE to confirm').fill('DELETE');
    await mo.getByRole('button', { name: 'Delete this room' }).click();
    await expect(mo).toHaveURL(/\/poker$/);

    await expect(ann.getByRole('heading', { level: 1 })).toHaveText('Join the room', {
      timeout: 20_000,
    });
    const again = await joinRoom(browser, path, 'Bo');
    await expect(again.page.getByRole('alert')).toHaveText(refusal);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/web e2e`
Expected: the `settings` tests FAIL (the page does not exist; `/settings` returns 404). The eight tests from Plan 3 still pass.

- [ ] **Step 3: Implement the request helper**

`apps/web/src/lib/server/actor.ts`:

```ts
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { resumeSession, SESSION_COOKIE, type Actor } from '@pokerji/poker-server';
import { runtime } from '#lib/server/pokerji.ts';

/** The room and session this request belongs to, or null. Looked up fresh on every request. */
export function actorOf(event: RequestEvent): Promise<Actor | null> {
  return resumeSession(runtime().app.flows, {
    code: event.params.code,
    token: event.cookies.get(SESSION_COOKIE),
  });
}

/** A member of the room. Anyone else is sent to the join form, exactly as for an unknown room. */
export async function memberOf(event: RequestEvent): Promise<Actor> {
  const actor = await actorOf(event);
  if (!actor) redirect(303, `/poker/r/${event.params.code}`);
  return actor;
}

/**
 * A moderator of the room. This guards the page; every flow checks again, so a
 * route is never the only thing standing between a member and a moderator action.
 */
export async function moderatorOf(event: RequestEvent): Promise<Actor> {
  const actor = await memberOf(event);
  if (!actor.session.moderator) error(403, 'Only a moderator can open this page.');
  return actor;
}
```

- [ ] **Step 4: Implement the settings page**

`apps/web/src/routes/poker/r/[code]/settings/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import {
  deleteRoomNow,
  parseDeckText,
  regenerateRecovery,
  removePasscode,
  saveSettings,
  SESSION_COOKIE,
  setPasscode,
} from '@pokerji/poker-server';
import { BUILT_IN_DECKS, type BuiltInDeckId, type Deck } from '@pokerji/protocol';
import { moderatorOf } from '#lib/server/actor.ts';
import { runtime } from '#lib/server/pokerji.ts';
import type { Actions, PageServerLoad } from './$types';

const builtInId = (deck: Deck): string =>
  Object.entries(BUILT_IN_DECKS).find(
    ([, known]) => JSON.stringify(known.deck) === JSON.stringify(deck),
  )?.[0] ?? 'custom';

const REFUSED = 'Only a moderator can do that.';

export const load: PageServerLoad = async (event) => {
  const { room } = await moderatorOf(event);
  return {
    code: room.code,
    deckId: builtInId(room.deck),
    values: room.deck.values.join(', '),
    specials: room.deck.specials.join(', '),
    timerSeconds: room.timerSeconds,
    hasPasscode: room.passcodeHash !== null,
  };
};

export const actions: Actions = {
  settings: async (event) => {
    const actor = await moderatorOf(event);
    const form = await event.request.formData();
    const deckId = String(form.get('deck') ?? '');
    const deck =
      deckId === 'custom'
        ? parseDeckText(String(form.get('values') ?? ''), String(form.get('specials') ?? ''))
        : (BUILT_IN_DECKS[deckId as BuiltInDeckId]?.deck ?? null);
    const timer = String(form.get('timer') ?? '').trim();
    const result = await saveSettings(runtime().app, actor, {
      deck,
      timerSeconds: timer === '' ? null : Number(timer),
      music: actor.room.music,
    });
    if (result.ok) return { notice: 'Settings saved.' };
    if (result.reason === 'busy') {
      return fail(409, {
        message:
          'The deck can only change between rounds. Start a new round in the room, then save again.',
      });
    }
    return fail(result.reason === 'refused' ? 403 : 400, {
      message:
        result.reason === 'refused'
          ? REFUSED
          : 'The settings could not be saved. A deck needs 2 to 20 different cards of up to 4 characters, and a timer runs from 10 to 600 seconds.',
    });
  },

  passcode: async (event) => {
    const actor = await moderatorOf(event);
    const form = await event.request.formData();
    const result = await setPasscode(runtime().app, actor, form.get('passcode'));
    if (result.ok) {
      return {
        notice:
          'Passcode set. Everyone except moderators was signed out and needs it to come back.',
      };
    }
    return fail(result.reason === 'refused' ? 403 : 400, {
      message: result.reason === 'refused' ? REFUSED : 'A passcode has 8 to 64 characters.',
    });
  },

  removePasscode: async (event) => {
    const actor = await moderatorOf(event);
    const result = await removePasscode(runtime().app, actor);
    if (!result.ok) return fail(403, { message: REFUSED });
    return { notice: 'Passcode removed. Anyone with the link can join.' };
  },

  recovery: async (event) => {
    const actor = await moderatorOf(event);
    const result = await regenerateRecovery(runtime().app, actor);
    if (!result.ok) return fail(403, { message: REFUSED });
    // Shown once. The old link no longer works.
    return { notice: 'New moderator link made.', recoveryToken: result.recoveryToken };
  },

  delete: async (event) => {
    const actor = await moderatorOf(event);
    const form = await event.request.formData();
    if (form.get('confirm') !== 'DELETE') {
      return fail(400, { message: 'Type DELETE in capitals to confirm.' });
    }
    const result = await deleteRoomNow(runtime().app, actor);
    if (!result.ok) return fail(403, { message: REFUSED });
    event.cookies.delete(SESSION_COOKIE, { path: `/poker/r/${actor.room.code}` });
    redirect(303, '/poker');
  },
};
```

`apps/web/src/routes/poker/r/[code]/settings/+page.svelte`:

```svelte
<script lang="ts">
  import { BUILT_IN_DECKS } from '@pokerji/protocol';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const decks = Object.entries(BUILT_IN_DECKS);
  let deckId = $state(data.deckId);
</script>

<svelte:head>
  <title>Room settings · pokerji</title>
</svelte:head>

<main>
  <p><a href="/poker/r/{data.code}">Back to the room</a></p>
  <h1>Room settings</h1>

  {#if form && 'notice' in form}
    <p role="status">{form.notice}</p>
  {/if}
  {#if form && 'message' in form}
    <p role="alert">{form.message}</p>
  {/if}

  {#if form && 'recoveryToken' in form && form.recoveryToken}
    <p>Save this link now. It is shown only once, and the previous link no longer works.</p>
    <p>
      <code data-testid="recovery-link">/poker/r/{data.code}/recover#m={form.recoveryToken}</code>
    </p>
  {/if}

  <section>
    <h2>Deck and timer</h2>
    <form method="POST" action="?/settings">
      <p>
        <label for="deck">Deck</label>
        <select id="deck" name="deck" bind:value={deckId}>
          {#each decks as [id, deck] (id)}
            <option value={id}>{deck.name}: {deck.deck.values.join(', ')}</option>
          {/each}
          <option value="custom">Custom</option>
        </select>
      </p>
      {#if deckId === 'custom'}
        <p>
          <label for="values">Value cards</label>
          <input id="values" name="values" value={data.values} />
        </p>
        <p>Lowest first, separated by commas or spaces. Up to 4 characters each.</p>
        <p>
          <label for="specials">Special cards</label>
          <input id="specials" name="specials" value={data.specials} />
        </p>
        <p>Cards that are not estimates, such as ? for "not sure". They are left out of results.</p>
      {/if}
      <p>
        <label for="timer">Timer in seconds</label>
        <input
          id="timer"
          name="timer"
          type="number"
          min="10"
          max="600"
          value={data.timerSeconds ?? ''}
        />
      </p>
      <p>Leave the timer empty for no timer. The deck can only change between rounds.</p>
      <button>Save settings</button>
    </form>
  </section>

  <section>
    <h2>Passcode</h2>
    <p>
      {data.hasPasscode
        ? 'This room has a passcode. People need it, as well as the link, to join.'
        : 'This room has no passcode. Anyone with the link can join.'}
    </p>
    <form method="POST" action="?/passcode">
      <p>
        <label for="passcode">New passcode</label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          minlength="8"
          maxlength="64"
          autocomplete="new-password"
        />
      </p>
      <p>
        8 to 64 characters. Setting or changing it signs out everyone except moderators; they
        rejoin with the new passcode.
      </p>
      <button>Set passcode</button>
    </form>
    {#if data.hasPasscode}
      <form method="POST" action="?/removePasscode">
        <button>Remove passcode</button>
      </form>
    {/if}
  </section>

  <section>
    <h2>Moderator link</h2>
    <p>
      The moderator link lets you run this room from another browser. Make a new one if the old
      one is lost or was seen by someone else.
    </p>
    <form method="POST" action="?/recovery">
      <button>Make a new moderator link</button>
    </form>
  </section>

  <section>
    <h2>Delete this room</h2>
    <p>
      This removes the room, everyone in it and all of its history, now. It cannot be undone.
    </p>
    <form method="POST" action="?/delete">
      <p>
        <label for="confirm">Type DELETE to confirm</label>
        <input id="confirm" name="confirm" autocomplete="off" />
      </p>
      <button>Delete this room</button>
    </form>
  </section>
</main>
```

- [ ] **Step 5: Update the room page's message for people who were signed out**

In `apps/web/src/routes/poker/r/[code]/Room.svelte`, replace:

```svelte
  <h1>You were removed from this room</h1>
  <p>Ask the moderator if you think this was a mistake.</p>
```

with:

```svelte
  <h1>You are no longer in this room</h1>
  <p>
    A moderator removed you, or set a passcode. <a href="/poker/r/{code}" data-sveltekit-reload
      >Join again</a
    > with the room link, and the passcode if there is one.
  </p>
```

- [ ] **Step 6: Run the tests**

```bash
pnpm --filter @pokerji/web typecheck
pnpm --filter @pokerji/web e2e
```

Expected: `svelte-check` reports 0 errors and all browser tests pass, including the seven new `settings` tests. The delete test waits for the other person's page to notice: its socket closes, it retries, and on the third failure it asks the server and shows the join form.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the room settings page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Running the round — timer, people and roles

**Files:**
- Modify: `apps/web/src/routes/poker/r/[code]/Room.svelte` (replaced in full)
- Test: `apps/web/e2e/moderation.spec.ts`

**Interfaces:**
- Consumes: the protocol messages `startTimer`, `stopTimer`, `removeParticipant`, `promote`, `setRole`, `newRound`; the settings page from Task 2 (to give a room a timer).
- Produces: in the live room — a timer readout (`data-testid="timer"`) with "Start timer" and "Stop timer"; per-person buttons "Remove <name>" and "Make <name> a moderator"; "Watch instead" and "Vote instead"; "Vote again" beside "New round"; links "History" and "Settings".

- [ ] **Step 1: Write the failing browser tests**

Append to `apps/web/e2e/moderation.spec.ts`:

```ts
test.describe('running a round', () => {
  test('the timer counts down for everyone and says when time is up', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await expect(mo.getByTestId('timer')).toHaveCount(0);
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Timer in seconds').fill('10');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await mo.goto(path);
    const { page: ann } = await joinRoom(browser, path, 'Ann');

    await expect(ann.getByTestId('timer')).toHaveText('Timer: 10 seconds, not running');
    await expect(ann.getByRole('button', { name: 'Start timer' })).toHaveCount(0);
    await mo.getByRole('button', { name: 'Start timer' }).click();
    await expect(ann.getByTestId('timer')).toContainText('remaining');
    await expect(ann.getByText('Time is up.')).toBeVisible({ timeout: 15_000 });
    // The timer never reveals on its own.
    await expect(ann.getByTestId('result')).toHaveCount(0);
  });

  test('a moderator stops the timer', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Timer in seconds').fill('60');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await mo.goto(path);
    await mo.getByRole('button', { name: 'Start timer' }).click();
    await expect(mo.getByTestId('timer')).toContainText('remaining');
    await mo.getByRole('button', { name: 'Stop timer' }).click();
    await expect(mo.getByTestId('timer')).toHaveText('Timer: 60 seconds, not running');
  });

  test('a moderator removes someone, who is told and cannot simply reconnect', async ({
    browser,
  }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(mo.getByTestId('participants')).toContainText('Ann');
    await expect(ann.getByRole('button', { name: 'Remove Mo' })).toHaveCount(0);

    await mo.getByRole('button', { name: 'Remove Ann' }).click();
    await expect(ann.getByRole('heading', { level: 1 })).toHaveText(
      'You are no longer in this room',
    );
    await expect(mo.getByTestId('participants')).not.toContainText('Ann');
    await ann.reload();
    await expect(ann.getByRole('heading', { level: 1 })).toHaveText('Join the room');
  });

  test('a moderator makes someone a co-moderator', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByRole('button', { name: 'Reveal' })).toHaveCount(0);
    await mo.getByRole('button', { name: 'Make Ann a moderator' }).click();
    await expect(ann.getByRole('button', { name: 'Reveal' })).toBeVisible();
    await expect(ann.getByRole('link', { name: 'Settings' })).toBeVisible();
    // Moderators cannot remove each other.
    await expect(mo.getByRole('button', { name: 'Remove Ann' })).toHaveCount(0);
  });

  test('someone switches between voting and watching', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await vote(ann, '5');
    await ann.getByRole('button', { name: 'Watch instead' }).click();
    await expect(ann.getByText('You are watching.')).toBeVisible();
    await expect(mo.getByText('Watching')).toBeVisible();
    await expect(mo.getByTestId('participants')).not.toContainText('Ann');

    await ann.getByRole('button', { name: 'Vote instead' }).click();
    await expect(mo.getByTestId('participants')).toContainText('Ann not voted');
  });

  test('"Vote again" keeps the story and clears the votes', async ({ browser }) => {
    const { page: mo } = await createRoom(browser, 'Mo');
    await mo.getByLabel('Story title').fill('PROJ-9');
    await mo.getByRole('button', { name: 'Set title' }).click();
    await vote(mo, '5');
    await mo.getByRole('button', { name: 'Reveal' }).click();
    await expect(mo.getByTestId('result')).toContainText('Unanimous: 5', { timeout: 8_000 });
    await mo.getByRole('button', { name: 'Vote again' }).click();
    await expect(mo.getByRole('heading', { level: 1 })).toHaveText('PROJ-9');
    await expect(mo.getByTestId('participants')).toContainText('Mo not voted');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/web e2e`
Expected: the six `running a round` tests FAIL, because the controls do not exist. Everything else passes.

- [ ] **Step 3: Replace the room component**

Replace `apps/web/src/routes/poker/r/[code]/Room.svelte` with:

```svelte
<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import {
    CLOSE_TOO_MANY_CONNECTIONS,
    type ClientMessage,
    type RoomSnapshot,
    type ServerMessage,
  } from '@pokerji/protocol';

  let { code }: { code: string } = $props();

  type Status = 'connecting' | 'open' | 'reconnecting' | 'removed' | 'full' | 'replaced';
  type Person = RoomSnapshot['participants'][number];

  let room = $state<RoomSnapshot | null>(null);
  let status = $state<Status>('connecting');
  let notice = $state('');
  let now = $state(Date.now());
  let titleDraft = $state('');

  let socket: WebSocket | null = null;
  // The server's clock minus this browser's, so countdowns agree on every screen.
  let clockOffset = 0;

  const live = $derived(status === 'open');

  const send = (message: ClientMessage): boolean => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };

  $effect(() => {
    const path = `/poker/r/${code}/ws`;
    // Set when the server has told us not to come back: retrying would be pointless or harmful.
    let finished = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const finish = (reason: Status) => {
      finished = true;
      status = reason;
    };

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${location.host}${path}`);
      socket = ws;
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'snapshot') {
          // Only a snapshot proves the connection works; an accepted socket can still be closed at once.
          failures = 0;
          status = 'open';
          // A running timer in the new snapshot means any "time is up" notice is stale.
          if (message.room.timer.endsAt !== null || message.room.phase !== 'voting') notice = '';
          room = message.room;
          clockOffset = message.room.serverNow - Date.now();
        } else if (message.type === 'removed') {
          finish('removed');
        } else if (message.type === 'error' && message.code === 'room_full') {
          finish('full');
        } else if (message.type === 'timerExpired') {
          notice = 'Time is up.';
        }
      };
      ws.onclose = (event) => {
        if (finished) return;
        if (event.code === CLOSE_TOO_MANY_CONNECTIONS) {
          finish('replaced');
          return;
        }
        failures += 1;
        status = 'reconnecting';
        // Keep trying for as long as it takes, more slowly each time. Every third
        // failure, ask the server whether this session still exists: if it does
        // not, the page data changes and the join form replaces this component.
        // If the server cannot be reached the check simply fails and we carry on.
        if (failures % 3 === 0) refreshAll().catch(() => undefined);
        retry = setTimeout(connect, Math.min(500 * 2 ** Math.min(failures, 5), 15_000));
      };
    };

    connect();
    const clock = setInterval(() => {
      now = Date.now() + clockOffset;
    }, 200);

    return () => {
      finished = true;
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
  const timerText = $derived.by(() => {
    if (!room || room.timer.seconds === null) return null;
    if (room.timer.endsAt === null) return `Timer: ${room.timer.seconds} seconds, not running`;
    const left = Math.max(0, Math.ceil((room.timer.endsAt - now) / 1000));
    const minutes = Math.floor(left / 60);
    const seconds = String(left % 60).padStart(2, '0');
    return `Timer: ${minutes}:${seconds} remaining`;
  });
  const cards = $derived(room ? [...room.deck.values, ...room.deck.specials] : []);
  const voters = $derived(room ? room.participants.filter((p) => p.role === 'voter') : []);
  const spectators = $derived(room ? room.participants.filter((p) => p.role === 'spectator') : []);

  /** Everything shown after a voter's name, as one string so its spacing is exact. */
  const labelFor = (person: Person): string => {
    if (!room) return '';
    const parts: string[] = [];
    if (room.phase === 'revealed') {
      parts.push(`: ${person.vote ?? 'no vote'}`);
      if (room.result?.highIds.includes(person.id)) parts.push(' (High)');
      if (room.result?.lowIds.includes(person.id)) parts.push(' (Low)');
    } else {
      parts.push(person.hasVoted ? ' voted' : ' not voted');
    }
    if (person.moderator) parts.push(' · moderator');
    if (!person.present) parts.push(' · away');
    return parts.join('');
  };

  /** A moderator may act on anyone who is not themselves and not a moderator. */
  const canManage = (person: Person): boolean =>
    room !== null && room.you.moderator && person.id !== room.you.id && !person.moderator;

  const setTitle = (event: SubmitEvent) => {
    event.preventDefault();
    if (send({ type: 'setTitle', title: titleDraft })) titleDraft = '';
  };
</script>

{#snippet manage(person: Person)}
  {#if room && canManage(person)}
    <button
      type="button"
      disabled={!live}
      onclick={() => send({ type: 'promote', participantId: person.id })}
      >Make {person.name} a moderator</button
    >
    <button
      type="button"
      disabled={!live || room.phase === 'counting'}
      onclick={() => send({ type: 'removeParticipant', participantId: person.id })}
      >Remove {person.name}</button
    >
  {/if}
{/snippet}

{#if status === 'removed'}
  <h1>You are no longer in this room</h1>
  <p>
    A moderator removed you, or set a passcode. <a href="/poker/r/{code}" data-sveltekit-reload
      >Join again</a
    > with the room link, and the passcode if there is one.
  </p>
{:else if status === 'full'}
  <h1>This room is full</h1>
  <p>A room holds 50 people. Try again when someone has left.</p>
{:else if status === 'replaced'}
  <h1>This room is open in too many tabs</h1>
  <p>You have it open in more than four places. Close one, then reload this page.</p>
{:else if !room}
  <p data-testid="status" role="status">Connecting…</p>
{:else}
  <nav aria-label="Room">
    <a href="/poker/r/{code}/history">History</a>
    {#if room.you.moderator}
      <a href="/poker/r/{code}/settings">Settings</a>
    {/if}
  </nav>

  {#if status === 'reconnecting'}
    <p data-testid="status" role="status">Connection lost. Reconnecting…</p>
  {/if}
  {#if notice}
    <p role="status">{notice}</p>
  {/if}

  <h1>{room.title || 'No story yet'}</h1>

  {#if timerText !== null}
    <p data-testid="timer">{timerText}</p>
  {/if}

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
          <!-- The name has its own element, so a name can never be mistaken for a label. -->
          <b>{person.name}</b><span>{labelFor(person)}</span>
          {@render manage(person)}
        </li>
      {/each}
    </ul>
    {#if spectators.length > 0}
      <h2>Watching</h2>
      <ul>
        {#each spectators as person (person.id)}
          <li>
            <b>{person.name}</b><span>{person.moderator ? ' · moderator' : ''}</span>
            {@render manage(person)}
          </li>
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
          disabled={!live || room.phase !== 'voting'}
          onclick={() => send({ type: 'vote', card })}>{card}</button
        >
      {/each}
      <p>
        <button
          type="button"
          disabled={!live || room.phase === 'counting'}
          onclick={() => send({ type: 'setRole', role: 'spectator' })}>Watch instead</button
        >
      </p>
    </section>
  {:else}
    <p>You are watching.</p>
    <p>
      <button
        type="button"
        disabled={!live || room.phase === 'counting'}
        onclick={() => send({ type: 'setRole', role: 'voter' })}>Vote instead</button
      >
    </p>
  {/if}

  {#if room.you.moderator}
    <section>
      <h2>Moderator</h2>
      <form onsubmit={setTitle}>
        <label for="title">Story title</label>
        <input id="title" bind:value={titleDraft} maxlength="200" />
        <button disabled={!live || room.phase !== 'voting'}>Set title</button>
      </form>
      <button
        type="button"
        disabled={!live || room.phase !== 'voting'}
        onclick={() => send({ type: 'reveal' })}>Reveal</button
      >
      <button
        type="button"
        disabled={!live || room.phase === 'counting'}
        onclick={() => send({ type: 'newRound', keepTitle: true })}>Vote again</button
      >
      <button
        type="button"
        disabled={!live || room.phase === 'counting'}
        onclick={() => send({ type: 'newRound', keepTitle: false })}>New round</button
      >
      {#if room.timer.seconds !== null}
        {#if room.timer.endsAt === null}
          <button
            type="button"
            disabled={!live || room.phase !== 'voting'}
            onclick={() => send({ type: 'startTimer' })}>Start timer</button
          >
        {:else}
          <button type="button" disabled={!live} onclick={() => send({ type: 'stopTimer' })}
            >Stop timer</button
          >
        {/if}
      {/if}
    </section>
  {/if}

  <p>Votes are recorded under your name and kept for 30 days after the room was last used.</p>
{/if}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @pokerji/web typecheck
pnpm --filter @pokerji/web e2e
```

Expected: `svelte-check` reports 0 errors and every browser test passes. The timer test waits ten real seconds.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add timer, people and role controls to the room" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The history page

**Files:**
- Create: `apps/web/src/lib/summary.ts`
- Create: `apps/web/src/routes/poker/r/[code]/history/+page.server.ts`, `apps/web/src/routes/poker/r/[code]/history/+page.svelte`
- Test: `apps/web/e2e/moderation.spec.ts`

**Interfaces:**
- Consumes: `roomHistory`, `deleteHistoryRound`, `clearRoomHistory`, `anonymiseMe` from Task 1; `memberOf` from Task 2; `computeResult` from `@pokerji/poker-engine`.
- Produces:
  - `summarise(deck: Deck, cards: readonly string[]): string` from `#lib/summary.ts` — "Unanimous: 5", or "Low 3, High 8, average 5.5", or "" when the cards are not in the deck.
  - The page `/poker/r/<code>/history`: one `article` per round (`data-testid="round"`), a "Remove my name from history" button for everyone, and "Delete this round" and "Delete all history" for moderators.

- [ ] **Step 1: Write the failing browser tests**

Append to `apps/web/e2e/moderation.spec.ts`:

```ts
test.describe('history', () => {
  async function playRound(browser: Browser) {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await mo.getByLabel('Story title').fill('PROJ-1 Login');
    await mo.getByRole('button', { name: 'Set title' }).click();
    await vote(mo, '3');
    await vote(ann, '8');
    await mo.getByRole('button', { name: 'Reveal' }).click();
    await expect(mo.getByTestId('result')).toContainText('Low 3, High 8', { timeout: 8_000 });
    return { mo, ann, path };
  }

  test('a finished round appears in history for everyone in the room', async ({ browser }) => {
    const { ann, path } = await playRound(browser);
    await ann.getByRole('link', { name: 'History' }).click();
    await expect(ann).toHaveURL(new RegExp(`${path}/history$`));
    const round = ann.getByTestId('round');
    await expect(round).toHaveCount(1);
    await expect(round).toContainText('PROJ-1 Login');
    await expect(round).toContainText('Low 3, High 8, average 5.5');
    await expect(round).toContainText('Mo: 3');
    await expect(round).toContainText('Ann: 8');
    await expect(ann.getByRole('button', { name: 'Delete this round' })).toHaveCount(0);
  });

  test('someone removes their own name, and only theirs', async ({ browser }) => {
    const { mo, ann, path } = await playRound(browser);
    await ann.goto(`${path}/history`);
    await ann.getByRole('button', { name: 'Remove my name from history' }).click();
    await expect(ann.getByRole('status')).toContainText('Your name was removed from 1 vote');
    await mo.goto(`${path}/history`);
    const round = mo.getByTestId('round');
    await expect(round).toContainText('Anonymous: 8');
    await expect(round).toContainText('Mo: 3');
    await expect(round).not.toContainText('Ann');
  });

  test('a moderator deletes a round', async ({ browser }) => {
    const { mo, path } = await playRound(browser);
    await mo.goto(`${path}/history`);
    await mo.getByRole('button', { name: 'Delete this round' }).click();
    await expect(mo.getByTestId('round')).toHaveCount(0);
    await expect(mo.getByText('No rounds have been saved yet.')).toBeVisible();
  });

  test('history is only for people in the room', async ({ browser }) => {
    const { path } = await playRound(browser);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${path}/history`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join the room');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/web e2e`
Expected: the four `history` tests FAIL, because the page does not exist.

- [ ] **Step 3: Implement the summary and the page**

`apps/web/src/lib/summary.ts`:

```ts
import { computeResult } from '@pokerji/poker-engine';
import type { Deck } from '@pokerji/protocol';

/**
 * One line describing a saved round, using the room's current deck. Empty when
 * the cards no longer belong to the deck, as after the deck was changed.
 */
export function summarise(deck: Deck, cards: readonly string[]): string {
  const result = computeResult(
    deck,
    cards.map((card, index) => ({ participantId: String(index), card })),
  );
  if (result.low === null) return '';
  if (result.unanimous) return `Unanimous: ${result.low}`;
  const average =
    result.average === null ? '' : `, average ${Math.round(result.average * 10) / 10}`;
  return `Low ${result.low}, High ${result.high}${average}`;
}
```

`apps/web/src/routes/poker/r/[code]/history/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import {
  anonymiseMe,
  clearRoomHistory,
  deleteHistoryRound,
  roomHistory,
} from '@pokerji/poker-server';
import { memberOf } from '#lib/server/actor.ts';
import { runtime } from '#lib/server/pokerji.ts';
import { summarise } from '#lib/summary.ts';
import type { Actions, PageServerLoad } from './$types';

const REFUSED = 'Only a moderator can do that.';

export const load: PageServerLoad = async (event) => {
  const actor = await memberOf(event);
  const rounds = await roomHistory(runtime().app, actor);
  return {
    code: actor.room.code,
    moderator: actor.session.moderator,
    rounds: rounds.map((round) => ({
      id: round.id,
      title: round.title,
      // Rendered on the server in UTC, so server and browser output match.
      revealed: `${round.revealedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      summary: summarise(
        actor.room.deck,
        round.votes.map((vote) => vote.card),
      ),
      votes: round.votes.map((vote) => ({ name: vote.name, card: vote.card })),
    })),
  };
};

export const actions: Actions = {
  anonymise: async (event) => {
    const actor = await memberOf(event);
    const changed = await anonymiseMe(runtime().app, actor);
    return {
      notice:
        changed === 0
          ? 'Your name is not on any saved vote.'
          : `Your name was removed from ${changed} ${changed === 1 ? 'vote' : 'votes'}.`,
    };
  },

  deleteRound: async (event) => {
    const actor = await memberOf(event);
    const form = await event.request.formData();
    const result = await deleteHistoryRound(runtime().app, actor, form.get('round'));
    if (result.ok) return { notice: 'Round deleted.' };
    return fail(result.reason === 'refused' ? 403 : 400, {
      message: result.reason === 'refused' ? REFUSED : 'That round could not be found.',
    });
  },

  clear: async (event) => {
    const actor = await memberOf(event);
    const result = await clearRoomHistory(runtime().app, actor);
    if (!result.ok) return fail(403, { message: REFUSED });
    return { notice: 'All history deleted.' };
  },
};
```

`apps/web/src/routes/poker/r/[code]/history/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>History · pokerji</title>
</svelte:head>

<main>
  <p><a href="/poker/r/{data.code}">Back to the room</a></p>
  <h1>History</h1>

  {#if form && 'notice' in form}
    <p role="status">{form.notice}</p>
  {/if}
  {#if form && 'message' in form}
    <p role="alert">{form.message}</p>
  {/if}

  {#if data.rounds.length === 0}
    <p>No rounds have been saved yet.</p>
  {:else}
    {#each data.rounds as round (round.id)}
      <article data-testid="round">
        <h2>{round.title || 'Untitled'}</h2>
        <p>{round.revealed}{round.summary ? ` · ${round.summary}` : ''}</p>
        <ul>
          {#each round.votes as entry, index (index)}
            <li><b>{entry.name ?? 'Anonymous'}</b><span>: {entry.card}</span></li>
          {/each}
        </ul>
        {#if data.moderator}
          <form method="POST" action="?/deleteRound">
            <input type="hidden" name="round" value={round.id} />
            <button>Delete this round</button>
          </form>
        {/if}
      </article>
    {/each}
  {/if}

  <section>
    <h2>Your name</h2>
    <p>
      You can remove your name from the votes you cast in this room. The votes stay and show as
      "Anonymous". This works for votes cast since you last joined; if you were removed or signed
      out and came back, ask a moderator to delete the earlier rounds.
    </p>
    <form method="POST" action="?/anonymise">
      <button>Remove my name from history</button>
    </form>
  </section>

  {#if data.moderator && data.rounds.length > 0}
    <section>
      <h2>Delete all history</h2>
      <p>This removes every saved round in this room. It cannot be undone.</p>
      <form method="POST" action="?/clear">
        <button>Delete all history</button>
      </form>
    </section>
  {/if}
</main>
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @pokerji/web typecheck
pnpm --filter @pokerji/web e2e
```

Expected: `svelte-check` reports 0 errors and every browser test passes.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the history page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Moderator recovery

**Files:**
- Create: `apps/web/src/routes/poker/r/[code]/recover/+page.server.ts`, `apps/web/src/routes/poker/r/[code]/recover/+page.svelte`
- Test: `apps/web/e2e/moderation.spec.ts`

**Interfaces:**
- Consumes: `recoverModerator` from Task 1; `actorOf` from Task 2; `clientAddress` from Plan 3; the recovery link the create and settings pages show (`data-testid="recovery-link"`).
- Produces: the page `/poker/r/<code>/recover`. The secret arrives in the URL fragment (`#m=<secret>`), which browsers do not send to servers; the page's script copies it into a form that posts it in the request body.

- [ ] **Step 1: Write the failing browser tests**

Append to `apps/web/e2e/moderation.spec.ts`:

```ts
test.describe('moderator recovery', () => {
  test('the moderator link makes a joined person a moderator', async ({ browser }) => {
    const { path, recovery } = await createRoom(browser, 'Mo');
    expect(recovery).toMatch(new RegExp(`^${path}/recover#m=[A-Za-z0-9_-]{43}$`));
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByRole('button', { name: 'Reveal' })).toHaveCount(0);

    await ann.goto(recovery);
    await ann.getByRole('button', { name: 'Become a moderator' }).click();
    await expect(ann).toHaveURL(new RegExp(`${path}$`));
    await expect(ann.getByRole('button', { name: 'Reveal' })).toBeVisible();
  });

  test('a wrong secret is refused', async ({ browser }) => {
    const { path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');
    await ann.goto(`${path}/recover#m=${'x'.repeat(43)}`);
    await ann.getByRole('button', { name: 'Become a moderator' }).click();
    await expect(ann.getByRole('alert')).toContainText('That link did not work');
  });

  test('someone who has not joined is asked to join first', async ({ browser }) => {
    const { path, recovery } = await createRoom(browser, 'Mo');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(recovery);
    await expect(page.getByText('Join the room first')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Become a moderator' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Join the room' })).toHaveAttribute('href', path);
  });

  test('a new moderator link replaces the old one', async ({ browser }) => {
    const { page: mo, path, recovery } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByRole('button', { name: 'Make a new moderator link' }).click();
    const fresh = (await mo.getByTestId('recovery-link').textContent())?.trim() ?? '';
    expect(fresh).not.toBe(recovery);

    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');
    await ann.goto(recovery);
    await ann.getByRole('button', { name: 'Become a moderator' }).click();
    await expect(ann.getByRole('alert')).toContainText('That link did not work');
    await ann.goto(fresh);
    await ann.getByRole('button', { name: 'Become a moderator' }).click();
    await expect(ann.getByRole('button', { name: 'Reveal' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/web e2e`
Expected: the four `moderator recovery` tests FAIL, because the page does not exist.

- [ ] **Step 3: Implement the page**

`apps/web/src/routes/poker/r/[code]/recover/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { recoverModerator } from '@pokerji/poker-server';
import { actorOf } from '#lib/server/actor.ts';
import { clientAddress } from '#lib/server/address.ts';
import { runtime } from '#lib/server/pokerji.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  code: event.params.code,
  joined: (await actorOf(event)) !== null,
});

export const actions: Actions = {
  default: async (event) => {
    const actor = await actorOf(event);
    const form = await event.request.formData();
    const recovered =
      actor !== null &&
      (await recoverModerator(runtime().app, {
        address: clientAddress(event),
        actor,
        recoveryToken: form.get('token'),
      }));
    if (!recovered) {
      // One message for every reason, so the page gives nothing away.
      return fail(403, {
        message:
          'That link did not work. Check that you copied all of it and that you have joined the room.',
      });
    }
    redirect(303, `/poker/r/${event.params.code}`);
  },
};
```

`apps/web/src/routes/poker/r/[code]/recover/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  // The secret is in the part of the address after "#", which the browser never
  // sends to a server. It is read here and sent in the body of the form instead.
  let token = $state('');
  $effect(() => {
    token = new URLSearchParams(location.hash.slice(1)).get('m') ?? '';
  });
</script>

<svelte:head>
  <title>Moderator link · pokerji</title>
</svelte:head>

<main>
  <h1>Moderator link</h1>

  {#if form?.message}
    <p role="alert">{form.message}</p>
  {/if}

  {#if !data.joined}
    <p>Join the room first, then open your moderator link again.</p>
    <p><a href="/poker/r/{data.code}">Join the room</a></p>
  {:else}
    <p>This link lets you run the room from this browser.</p>
    <form method="POST">
      <input type="hidden" name="token" value={token} />
      <button disabled={token === ''}>Become a moderator</button>
    </form>
    <noscript><p>This page needs JavaScript to read the link.</p></noscript>
  {/if}
</main>
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @pokerji/web typecheck
pnpm --filter @pokerji/web e2e
```

Expected: `svelte-check` reports 0 errors and every browser test passes.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the moderator recovery page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The privacy page

**Files:**
- Modify: `packages/poker-server/src/config.ts`, `packages/poker-server/test/config.test.ts`
- Create: `apps/web/src/routes/privacy/+page.server.ts`, `apps/web/src/routes/privacy/+page.svelte`
- Modify: `apps/web/src/routes/+page.svelte`, `.env.example`, `CLAUDE.md`
- Test: `apps/web/e2e/moderation.spec.ts`

**Interfaces:**
- Consumes: `runtime().app.config` from Task 1.
- Produces:
  - `Config` gains `backupRotationDays: number | null`, read from `BACKUP_ROTATION_DAYS` (whole days, 1–3650; absent means unknown).
  - The page `/privacy`, stating what is stored, for how long, who can see it, and what is never collected. Each promise sits beside the mechanism that keeps it.

- [ ] **Step 1: Write the failing tests**

In `packages/poker-server/test/config.test.ts`, add `backupRotationDays: null,` to the object the first test expects, and add this test to the `describe` block:

```ts
  it('reads the backup rotation period, or leaves it unknown', () => {
    expect(loadConfig({ ...valid, BACKUP_ROTATION_DAYS: '14' }).backupRotationDays).toBe(14);
    expect(loadConfig(valid).backupRotationDays).toBeNull();
    expect(() => loadConfig({ ...valid, BACKUP_ROTATION_DAYS: '0' })).toThrow(
      /BACKUP_ROTATION_DAYS/,
    );
  });
```

Append to `apps/web/e2e/moderation.spec.ts`:

```ts
test.describe('privacy page', () => {
  test('says what is stored and for how long, and is linked from the home page', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    const main = page.getByRole('main');
    await expect(main).toContainText('30 days');
    await expect(main).toContainText('No accounts');
    await expect(main).toContainText('one cookie');
    await expect(main).toContainText('We do not store your IP address');
    await expect(main).toContainText('a moderator can delete those rounds');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-server test` and `pnpm --filter @pokerji/web e2e`
Expected: the config test FAILS (`backupRotationDays` is missing) and the privacy test FAILS (no such page or link).

- [ ] **Step 3: Add the setting**

In `packages/poker-server/src/config.ts`, add to the schema after `KEY_PREFIX`:

```ts
  BACKUP_ROTATION_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
```

add to the `Config` interface:

```ts
  /** How long database backups are kept, for the privacy page. Null when not stated. */
  backupRotationDays: number | null;
```

and add to the object `loadConfig` returns:

```ts
    backupRotationDays: parsed.data.BACKUP_ROTATION_DAYS ?? null,
```

Every test that builds a `Config` by hand must add `backupRotationDays: null`: `test/app.test.ts`, `test/upgrade.test.ts` and `test/moderation.test.ts`.

Append to `.env.example`:

```
# Optional. How many days your Postgres backups are kept. Shown on the privacy page.
# BACKUP_ROTATION_DAYS=14
```

- [ ] **Step 4: Implement the page**

`apps/web/src/routes/privacy/+page.server.ts`:

```ts
import { runtime } from '#lib/server/pokerji.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const { retentionDays, backupRotationDays } = runtime().app.config;
  return { retentionDays, backupRotationDays };
};
```

`apps/web/src/routes/privacy/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Privacy · pokerji</title>
</svelte:head>

<main>
  <p><a href="/">pokerji</a></p>
  <h1>Privacy</h1>
  <p>
    This page says what pokerji stores, for how long, and who can see it. Each promise is
    followed by how it is kept.
  </p>

  <h2>No accounts</h2>
  <p>
    You never sign up. You type a display name when you join a room, and that is all we know
    about you.
  </p>
  <p><b>How:</b> there is no sign-up, email field or login anywhere in the service.</p>

  <h2>What a room stores</h2>
  <ul>
    <li>The room's settings: its deck, its timer length and whether it has a passcode.</li>
    <li>The display name and role of each person who joined.</li>
    <li>
      For each revealed round: the story title, the time, and which card each named person
      played.
    </li>
  </ul>
  <p>
    Votes in a round that has not been revealed are never written down. They exist only in the
    server's memory until the reveal.
  </p>
  <p>
    <b>How:</b> a round is saved at the moment it is revealed, and not before. Passcodes and the
    secrets in links are stored only in scrambled form that cannot be read back.
  </p>

  <h2>How long it is kept</h2>
  <p>
    A room, with everything in it, is deleted {data.retentionDays} days after it was last used.
  </p>
  <p>
    A moderator can delete a single round, all history, or the whole room at any time. Deletion
    is immediate.
  </p>
  <p>
    {#if data.backupRotationDays !== null}
      Deleted data can remain in database backups for up to {data.backupRotationDays} days, until
      those backups are replaced.
    {:else}
      Deleted data can remain in database backups for a short time, until those backups are
      replaced.
    {/if}
  </p>
  <p><b>How:</b> a job runs every hour and removes rooms past that age.</p>

  <h2>Who can see a room</h2>
  <p>
    Anyone who has the room's link, and its passcode if a moderator set one, can join and can
    read the room's history. Treat the link as you would the contents of the room.
  </p>
  <p>
    Nobody, the moderator included, can see how someone voted before the reveal. Before then
    everyone sees only who has voted.
  </p>
  <p>
    <b>How:</b> room links are long random codes that cannot be guessed, and the server does not
    send any vote to any browser until the reveal.
  </p>

  <h2>Removing your name</h2>
  <p>
    On a room's history page you can remove your name from the votes you cast there. The votes
    stay and show as "Anonymous".
  </p>
  <p>
    This reaches the votes you cast since you last joined. If you were removed from a room, or
    signed out because a passcode was set, you come back as a new participant and cannot reach
    your earlier votes; a moderator can delete those rounds for you.
  </p>

  <h2>Cookies and your browser</h2>
  <p>
    We set one cookie for each room you join. It keeps you in that room and does nothing else.
    It cannot be read by scripts and is sent only to this site.
  </p>
  <p>Your browser also remembers your sound and theme choices. Those never leave your device.</p>
  <p><b>How:</b> there are no advertising, analytics or third-party cookies on this site.</p>

  <h2>What we do not collect</h2>
  <ul>
    <li>
      We do not store your IP address. It is used for a few minutes, in scrambled form, to stop
      abuse such as creating thousands of rooms, and is then forgotten.
    </li>
    <li>We do not use analytics, trackers, advertising or fingerprinting.</li>
    <li>
      We do not load anything from other companies' servers: no fonts, scripts, images or
      embeds.
    </li>
    <li>We do not write room links, names, story titles or votes to our logs.</li>
  </ul>
  <p>
    <b>How:</b> the site instructs your browser to refuse anything not served by this site, so
    even a mistake on our side could not load a tracker.
  </p>
</main>
```

In `apps/web/src/routes/+page.svelte`, add after the closing `</ul>`:

```svelte
  <p><a href="/privacy">Privacy</a></p>
```

- [ ] **Step 5: Run everything**

```bash
pnpm test && pnpm typecheck && pnpm format:check
pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke
pnpm --filter @pokerji/web e2e
```

Expected: all package tests pass, both typechecks report no errors, the format check reports no files, the smoke check prints `SMOKE OK`, and every browser test passes.

- [ ] **Step 6: Update CLAUDE.md**

In `CLAUDE.md`, replace the first paragraph under `## Status` with:

```markdown
Every behaviour in the spec works in a browser, in plain markup: create, join, vote, reveal, timer, removing and promoting people, settings, passcodes, moderator recovery, history, removing your name, deleting a room, and the privacy page. What remains is the designed interface (Impeccable, "Judges' Row", both themes, audio) and release (Dockerfile, Traefik notes, final security audit). The behaviour spec and design direction are in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, product facts in `PRODUCT.md`.
```

Add these bullets to the end of `## Architecture`:

```markdown
- `packages/poker-server/src/moderation.ts` holds every moderator and member flow. Each takes an `Actor` (the room and session `resumeSession` found for this request) and checks `actor.session.moderator` itself. A route's guard (`moderatorOf` in `apps/web/src/lib/server/actor.ts`) is a convenience, never the only check.
- Form actions return `{ notice }` on success and `fail(status, { message })` on failure; pages show `notice` as a status and `message` as an alert.
- The moderator recovery secret travels in the URL fragment and is posted in a form body, so it never appears in a server log. It is returned to a page once and stored only as a hash.
- `MUSIC_TRACK_IDS` in `packages/protocol` is empty until tracks are chosen and licensed; until then the only valid music setting is none.
```

- [ ] **Step 7: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add the privacy page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

1. Run `pnpm test && pnpm typecheck && pnpm --filter @pokerji/web e2e` once more and confirm all pass.
2. Request an Octopus code review and an Octopus security audit of the `feat/poker-moderation` branch. Ask the audit to cover: every moderator-only action reached directly by a non-moderator and by someone from another room; the passcode and recovery flows (guessing, lockout, timing); what the settings, history and recovery pages render from stored data; whether any response can leak the recovery secret; and whether the privacy page's statements are true of the code. Address findings using superpowers:receiving-code-review.
3. Use superpowers:finishing-a-development-branch to decide how the branch is integrated.
4. Start the interface work with the Impeccable skill: every page now exists and works, so "Judges' Row" can be built across all of them in both themes. Tell it about the constraint that the Content Security Policy forbids inline styles.
