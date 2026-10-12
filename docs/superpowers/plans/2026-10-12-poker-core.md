# Planning Poker Core (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the workspace and the two framework-free packages that define planning poker: the message protocol and the room rules engine, fully tested.

**Architecture:** A pnpm monorepo. `packages/protocol` holds limits, decks and WebSocket message schemas shared by server and browser. `packages/poker-engine` is a pure reducer: `apply(state, command, now)` returns a new state plus a list of effects for a host to carry out. Neither package performs I/O, reads a clock, or imports a framework.

**Tech Stack:** Node 24+ (26.10 installed locally), pnpm 11.25, TypeScript 7.0, Zod 4.6, Vitest 5.0, Prettier 3.9.

**Spec:** `docs/superpowers/specs/2026-10-12-planning-poker-design.md`. Design brief (not needed for this plan, no UI here): `docs/superpowers/specs/2026-10-12-planning-poker-design-direction.md`.

## Where this plan sits

The spec is too large for one plan, so it is split into three. Each produces working, tested software.

| Plan | Delivers | Written when |
|---|---|---|
| **1. Core (this plan)** | Workspace, protocol, room engine | Now |
| **2. Server** | SvelteKit app skeleton with a custom Node entry and `ws`, Postgres schema, sessions and cookies, create/join/recover/settings/history actions, the room host that drives the engine, Valkey rate limits and room lock, retention job, logging rules, Docker Compose, integration tests | After Plan 1 lands, against its real interfaces and the current SvelteKit 3 docs |
| **3. Interface and release** | Impeccable build of every surface in both themes, audio, pointer effect, accessibility, Playwright tests, Dockerfile, deployment notes, Octopus security audit | After Plan 2 lands |

Checked on 2026-10-12: the SvelteKit 3 docs for the Node adapter and routing do not mention built-in WebSocket support, so the spec's custom Node entry with `ws` stands.

## Global Constraints

- Node `>=24`. Package manager is pnpm; do not use npm or yarn.
- TypeScript `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. No enums, no parameter properties, no namespaces.
- Relative imports include the `.ts` extension (`./deck.ts`).
- `packages/protocol` and `packages/poker-engine` must not import Node built-ins, DOM APIs, or any framework. The engine never calls `Date.now()`; time arrives as the `now` argument in epoch milliseconds.
- Engine state is treated as immutable: return new objects, never mutate.
- Limits, copied from the spec: 50 participants per room; 2 KB WebSocket message; 200-character title; 1–30 character display name; custom deck up to 20 cards of up to 4 characters each; timer 10 seconds to 10 minutes; reveal count 3 seconds; away participants dropped after 10 minutes; room unloads 5 minutes after the last connection; passcode 4–64 characters.
- Vote secrecy: no snapshot built before the `revealed` phase may contain another participant's vote value.
- Work happens on branch `feat/poker-core`, not `main`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TypeScript 7, Vitest 5 and Zod 4.6 are recent major versions. If a command or API in this plan does not exist as written (for example the `tsc` binary name), check that package's current documentation and use the equivalent; do not downgrade the package.
- `pnpm install` may warn about ignored dependency build scripts. That is expected; do not approve them.

## Review Focus

Conditions the spec implies that are easy to miss. Each has a test in the task named.

1. A voter's connection drops after voting and they reconnect mid-round: their vote is kept and they are not listed twice. (Task 4)
2. The moderator disconnects during the three-second count: the reveal still happens. (Task 5)
3. A browser with a stale deck sends a vote for a card that is no longer in the deck: refused, state untouched. (Task 5)
4. A client sends malformed JSON, an unknown message type, or a valid message with extra fields: rejected before reaching the engine. (Task 2)
5. A save confirmation for an earlier round arrives after a new round has started: ignored. (Task 5)

## File Structure

```
package.json                      workspace scripts and dev dependencies
pnpm-workspace.yaml               workspace package globs
tsconfig.base.json                shared compiler options
.gitignore  .prettierrc  .prettierignore
packages/protocol/
  package.json  tsconfig.json
  src/limits.ts                   numeric limits from the spec
  src/deck.ts                     deck schema, built-in decks, cardValue
  src/messages.ts                 client message schemas, server message and snapshot types
  src/index.ts                    re-exports
  test/deck.test.ts  test/messages.test.ts
packages/poker-engine/
  package.json  tsconfig.json  vitest.config.ts
  src/state.ts                    RoomState, Command, Effect, Outcome, createRoom
  src/outcome.ts                  small helpers shared by handlers
  src/result.ts                   computeResult
  src/presence.ts                 join, disconnect, dropStale, evict
  src/snapshot.ts                 snapshotFor
  src/round.ts                    revealIfDue, roundSaved
  src/client.ts                   handleClient: every client message
  src/timer.ts                    expireTimer
  src/settings.ts                 canChangeDeck, applySettings
  src/apply.ts                    apply: the single entry point
  src/index.ts                    re-exports
  test/helpers.ts                 fixtures shared by tests
  test/result.test.ts  test/presence.test.ts  test/rounds.test.ts
  test/moderation.test.ts  test/timer.test.ts  test/settings.test.ts
  test/authorization.test.ts
```

---

### Task 1: Workspace and decks

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.prettierrc`, `.prettierignore`
- Create: `packages/protocol/package.json`, `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/limits.ts`, `packages/protocol/src/deck.ts`, `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/deck.test.ts`
- Modify: `CLAUDE.md` (replace the `## Status` section)

**Interfaces:**
- Consumes: nothing.
- Produces, from `@pokerji/protocol`:
  - Constants: `MAX_PARTICIPANTS`, `MAX_MESSAGE_BYTES`, `TITLE_MAX`, `NAME_MIN`, `NAME_MAX`, `DECK_MAX_CARDS`, `CARD_MAX_CHARS`, `TIMER_MIN_SECONDS`, `TIMER_MAX_SECONDS`, `REVEAL_COUNT_MS`, `AWAY_DROP_MS`, `ROOM_UNLOAD_MS`, `PASSCODE_MIN`, `PASSCODE_MAX`.
  - `cardSchema`, `deckSchema`, `type Deck = { values: string[]; specials: string[] }`.
  - `type BuiltInDeckId`, `BUILT_IN_DECKS: Record<BuiltInDeckId, { name: string; deck: Deck }>`.
  - `cardValue(card: string): number | null`.

- [ ] **Step 1: Branch**

The documents, `compose.yaml`, `.env.example` and `.gitignore` are already committed on `main`.

```bash
git switch -c feat/poker-core
```

- [ ] **Step 2: Create the workspace files**

`package.json`:

```json
{
  "name": "pokerji",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.25.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "prettier": "^3.9.10",
    "typescript": "^7.0.2",
    "vitest": "^5.0.4"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

`.gitignore` already exists; leave it as it is.

`.prettierrc`:

```json
{ "singleQuote": true, "printWidth": 100 }
```

`.prettierignore`:

```
pnpm-lock.yaml
docs/
*.md
```

- [ ] **Step 3: Create the protocol package shell**

`packages/protocol/package.json`:

```json
{
  "name": "@pokerji/protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "zod": "^4.6.7"
  }
}
```

`packages/protocol/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/protocol/src/limits.ts`:

```ts
export const MAX_PARTICIPANTS = 50;
export const MAX_MESSAGE_BYTES = 2048;
export const TITLE_MAX = 200;
export const NAME_MIN = 1;
export const NAME_MAX = 30;
export const DECK_MAX_CARDS = 20;
export const CARD_MAX_CHARS = 4;
export const TIMER_MIN_SECONDS = 10;
export const TIMER_MAX_SECONDS = 600;
export const REVEAL_COUNT_MS = 3_000;
export const AWAY_DROP_MS = 600_000;
export const ROOM_UNLOAD_MS = 300_000;
export const PASSCODE_MIN = 4;
export const PASSCODE_MAX = 64;
```

`packages/protocol/src/index.ts`:

```ts
export * from './limits.ts';
export * from './deck.ts';
```

Then install:

```bash
pnpm install
```

Expected: a `pnpm-lock.yaml` is written and `node_modules/` appears.

- [ ] **Step 4: Write the failing deck tests**

`packages/protocol/test/deck.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUILT_IN_DECKS, cardValue, deckSchema } from '../src/index.ts';

describe('built-in decks', () => {
  it('offers the four decks in the spec', () => {
    expect(Object.keys(BUILT_IN_DECKS)).toEqual([
      'fibonacci',
      'modifiedFibonacci',
      'tshirt',
      'powersOfTwo',
    ]);
  });

  it('are all valid and carry ? and a break card', () => {
    for (const { deck } of Object.values(BUILT_IN_DECKS)) {
      expect(deckSchema.safeParse(deck).success).toBe(true);
      expect(deck.specials).toEqual(['?', '☕']);
    }
  });
});

describe('deckSchema', () => {
  const parse = (values: string[], specials: string[] = []) =>
    deckSchema.safeParse({ values, specials }).success;

  it('accepts a custom deck of exactly 20 cards', () => {
    const eighteen = Array.from({ length: 18 }, (_, i) => String(i));
    expect(parse(eighteen, ['?', '☕'])).toBe(true);
  });

  it('rejects 21 cards', () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => String(i));
    expect(parse(nineteen, ['?', '☕'])).toBe(false);
  });

  it('rejects a card longer than 4 characters', () => {
    expect(parse(['1', '2', 'XXXXL'])).toBe(false);
  });

  it('rejects empty cards and cards containing whitespace', () => {
    expect(parse(['1', '', '3'])).toBe(false);
    expect(parse(['1', ' ', '3'])).toBe(false);
    expect(parse(['1', 'a b', '3'])).toBe(false);
  });

  it('rejects a card repeated across values and specials', () => {
    expect(parse(['1', '2', '?'], ['?'])).toBe(false);
    expect(parse(['1', '1', '2'])).toBe(false);
  });

  it('rejects fewer than two value cards', () => {
    expect(parse(['1'], ['?'])).toBe(false);
  });
});

describe('cardValue', () => {
  it('reads numbers, including the half card', () => {
    expect(cardValue('8')).toBe(8);
    expect(cardValue('0')).toBe(0);
    expect(cardValue('1.5')).toBe(1.5);
    expect(cardValue('½')).toBe(0.5);
  });

  it('returns null for anything else', () => {
    expect(cardValue('XL')).toBeNull();
    expect(cardValue('?')).toBeNull();
    expect(cardValue('-1')).toBeNull();
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/protocol test`
Expected: FAIL, because `./deck.ts` does not exist.

- [ ] **Step 6: Implement decks**

`packages/protocol/src/deck.ts`:

```ts
import { z } from 'zod';
import { CARD_MAX_CHARS, DECK_MAX_CARDS } from './limits.ts';

export const cardSchema = z
  .string()
  .refine(
    (card) => /^\S+$/u.test(card) && [...card].length <= CARD_MAX_CHARS,
    'A card is 1 to 4 characters with no spaces',
  );

export const deckSchema = z
  .object({
    /** Estimate cards, lowest first. */
    values: z.array(cardSchema).min(2),
    /** Cards that are not estimates, such as "?" and a break card. */
    specials: z.array(cardSchema),
  })
  .refine((deck) => deck.values.length + deck.specials.length <= DECK_MAX_CARDS, 'Too many cards')
  .refine((deck) => {
    const all = [...deck.values, ...deck.specials];
    return new Set(all).size === all.length;
  }, 'Cards must be unique');

export type Deck = z.infer<typeof deckSchema>;

export type BuiltInDeckId = 'fibonacci' | 'modifiedFibonacci' | 'tshirt' | 'powersOfTwo';

const SPECIALS = ['?', '☕'];

export const BUILT_IN_DECKS: Record<BuiltInDeckId, { name: string; deck: Deck }> = {
  fibonacci: {
    name: 'Fibonacci',
    deck: {
      values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'],
      specials: [...SPECIALS],
    },
  },
  modifiedFibonacci: {
    name: 'Modified Fibonacci',
    deck: {
      values: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100'],
      specials: [...SPECIALS],
    },
  },
  tshirt: {
    name: 'T-shirt sizes',
    deck: { values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], specials: [...SPECIALS] },
  },
  powersOfTwo: {
    name: 'Powers of two',
    deck: { values: ['1', '2', '4', '8', '16', '32', '64'], specials: [...SPECIALS] },
  },
};

/** The numeric worth of a card, or null when the card is not a number. */
export function cardValue(card: string): number | null {
  if (card === '½') return 0.5;
  return /^\d+(\.\d+)?$/.test(card) ? Number(card) : null;
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @pokerji/protocol test && pnpm --filter @pokerji/protocol typecheck`
Expected: all tests PASS, typecheck prints nothing.

- [ ] **Step 8: Record the commands in CLAUDE.md**

In `CLAUDE.md`, replace the whole `## Status` section (heading and its paragraph) with:

```markdown
## Status

Early build. `packages/protocol` and `packages/poker-engine` exist; the server and UI do not yet. Plans live in `docs/superpowers/plans/`.

## Commands

Package manager is pnpm (Node 24+).

- Install: `pnpm install`
- All tests: `pnpm test`
- One package: `pnpm --filter @pokerji/poker-engine test`
- One file: `pnpm --filter @pokerji/poker-engine exec vitest run test/rounds.test.ts`
- One test by name: add `-t "part of the test name"` to the line above
- Typecheck: `pnpm typecheck`
- Format: `pnpm format` (check only: `pnpm format:check`)

## Architecture

- `packages/protocol`: limits, decks, and WebSocket message schemas shared by server and browser.
- `packages/poker-engine`: the room rules as a pure reducer, `apply(state, command, now)` returning `{ state, effects }`. No I/O, no clock, no framework. A host (the server) feeds it commands and carries out its effects.
- Vote secrecy is enforced in one place, `snapshotFor` in the engine. Anything that sends room state to a browser must go through it.
```

- [ ] **Step 9: Format and commit**

```bash
pnpm format
git add -A
git commit -m "feat: add workspace and protocol decks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Protocol messages

**Files:**
- Create: `packages/protocol/src/messages.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: `cardSchema`, `type Deck`, `TITLE_MAX` from Task 1.
- Produces, from `@pokerji/protocol`:
  - `roleSchema`, `type Role = 'voter' | 'spectator'`
  - `type Phase = 'voting' | 'counting' | 'revealed'`
  - `type SaveStatus = 'none' | 'pending' | 'saved' | 'failed'`
  - `clientMessageSchema`, `type ClientMessage` (union on `type`: `vote {card}`, `clearVote`, `setRole {role}`, `setTitle {title}`, `reveal`, `newRound {keepTitle}`, `startTimer`, `stopTimer`, `removeParticipant {participantId}`, `promote {participantId}`)
  - `parseClientMessage(raw: string): ClientMessage | null`
  - `interface RoundResult`, `interface ParticipantView`, `interface RoomSnapshot`, `type ErrorCode`, `type ServerMessage`

- [ ] **Step 1: Write the failing tests**

`packages/protocol/test/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/index.ts';

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  it.each([
    [{ type: 'vote', card: '5' }],
    [{ type: 'clearVote' }],
    [{ type: 'setRole', role: 'spectator' }],
    [{ type: 'setTitle', title: 'PROJ-12 Login page' }],
    [{ type: 'setTitle', title: '' }],
    [{ type: 'reveal' }],
    [{ type: 'newRound', keepTitle: true }],
    [{ type: 'startTimer' }],
    [{ type: 'stopTimer' }],
    [{ type: 'removeParticipant', participantId: 'p1' }],
    [{ type: 'promote', participantId: 'p1' }],
  ])('accepts %j', (message) => {
    expect(parse(message)).toEqual(message);
  });

  it('trims the title', () => {
    expect(parse({ type: 'setTitle', title: '  PROJ-1  ' })).toEqual({
      type: 'setTitle',
      title: 'PROJ-1',
    });
  });

  it('rejects text that is not JSON', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('')).toBeNull();
  });

  it.each([
    [null],
    [[]],
    ['vote'],
    [{ type: 'nope' }],
    [{ type: 'vote' }],
    [{ type: 'vote', card: '5', extra: 1 }],
    [{ type: 'vote', card: 'TOOLONG' }],
    [{ type: 'setRole', role: 'moderator' }],
    [{ type: 'setTitle', title: 'x'.repeat(201) }],
    [{ type: 'newRound' }],
    [{ type: 'newRound', keepTitle: 'yes' }],
    [{ type: 'promote', participantId: '' }],
    [{ type: 'promote', participantId: 'x'.repeat(65) }],
    [{ type: 'reveal', force: true }],
  ])('rejects %j', (message) => {
    expect(parse(message)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/protocol test`
Expected: FAIL, because `parseClientMessage` is not exported.

- [ ] **Step 3: Implement messages**

`packages/protocol/src/messages.ts`:

```ts
import { z } from 'zod';
import { cardSchema, type Deck } from './deck.ts';
import { TITLE_MAX } from './limits.ts';

export const roleSchema = z.enum(['voter', 'spectator']);
export type Role = z.infer<typeof roleSchema>;

export type Phase = 'voting' | 'counting' | 'revealed';
export type SaveStatus = 'none' | 'pending' | 'saved' | 'failed';

const participantId = z.string().min(1).max(64);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('vote'), card: cardSchema }),
  z.strictObject({ type: z.literal('clearVote') }),
  z.strictObject({ type: z.literal('setRole'), role: roleSchema }),
  z.strictObject({ type: z.literal('setTitle'), title: z.string().trim().max(TITLE_MAX) }),
  z.strictObject({ type: z.literal('reveal') }),
  z.strictObject({ type: z.literal('newRound'), keepTitle: z.boolean() }),
  z.strictObject({ type: z.literal('startTimer') }),
  z.strictObject({ type: z.literal('stopTimer') }),
  z.strictObject({ type: z.literal('removeParticipant'), participantId }),
  z.strictObject({ type: z.literal('promote'), participantId }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Returns the message, or null for anything that is not exactly a known message. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export interface RoundResult {
  /** Mean of the value cards voted, or null when any of them is not a number. */
  average: number | null;
  /** Lowest and highest value card voted, by deck order. Null when no value card was voted. */
  low: string | null;
  high: string | null;
  /** True when at least one value card was voted and all value cards voted are the same. */
  unanimous: boolean;
  /** Cards that received votes, in deck order, values before specials. */
  distribution: { card: string; count: number }[];
  /** Participants holding the low and high cards. Both empty when unanimous. */
  lowIds: string[];
  highIds: string[];
}

export interface ParticipantView {
  id: string;
  name: string;
  role: Role;
  moderator: boolean;
  present: boolean;
  hasVoted: boolean;
  /** Always null before the revealed phase. */
  vote: string | null;
}

export interface RoomSnapshot {
  /** Server time in epoch milliseconds when this snapshot was built. */
  serverNow: number;
  you: { id: string; name: string; role: Role; moderator: boolean; vote: string | null };
  title: string;
  deck: Deck;
  phase: Phase;
  /** Epoch milliseconds when the count ends; set only while counting. */
  revealAt: number | null;
  timer: { seconds: number | null; endsAt: number | null };
  music: string | null;
  participants: ParticipantView[];
  /** Null before the revealed phase. */
  result: RoundResult | null;
  saveStatus: SaveStatus;
}

export type ErrorCode = 'invalid' | 'forbidden' | 'rate_limited' | 'room_full';

export type ServerMessage =
  | { type: 'snapshot'; room: RoomSnapshot }
  | { type: 'timerExpired' }
  | { type: 'removed' }
  | { type: 'error'; code: ErrorCode };
```

Replace `packages/protocol/src/index.ts` with:

```ts
export * from './limits.ts';
export * from './deck.ts';
export * from './messages.ts';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @pokerji/protocol test && pnpm --filter @pokerji/protocol typecheck`
Expected: all tests PASS, typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add protocol messages and snapshot types" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Round results

**Files:**
- Create: `packages/poker-engine/package.json`, `packages/poker-engine/tsconfig.json`, `packages/poker-engine/vitest.config.ts`
- Create: `packages/poker-engine/src/result.ts`, `packages/poker-engine/src/index.ts`
- Test: `packages/poker-engine/test/result.test.ts`

**Interfaces:**
- Consumes: `type Deck`, `type RoundResult`, `cardValue`, `BUILT_IN_DECKS` from `@pokerji/protocol`.
- Produces, from `@pokerji/poker-engine`:
  - `computeResult(deck: Deck, votes: readonly { participantId: string; card: string }[]): RoundResult`

- [ ] **Step 1: Create the engine package shell**

`packages/poker-engine/package.json`:

```json
{
  "name": "@pokerji/poker-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@pokerji/protocol": "workspace:*"
  }
}
```

`packages/poker-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/poker-engine/vitest.config.ts` (points the workspace import at source, so tests never depend on how linked packages are resolved):

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@pokerji/protocol': fileURLToPath(new URL('../protocol/src/index.ts', import.meta.url)),
    },
  },
});
```

`packages/poker-engine/src/index.ts`:

```ts
export * from './result.ts';
```

Then link the workspace package:

```bash
pnpm install
```

- [ ] **Step 2: Write the failing tests**

`packages/poker-engine/test/result.test.ts`:

```ts
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { computeResult } from '../src/index.ts';

const FIB = BUILT_IN_DECKS.fibonacci.deck;
const MOD = BUILT_IN_DECKS.modifiedFibonacci.deck;
const TEE = BUILT_IN_DECKS.tshirt.deck;
const v = (participantId: string, card: string) => ({ participantId, card });

describe('computeResult', () => {
  it('averages numeric votes and identifies who holds the extremes', () => {
    const result = computeResult(FIB, [v('a', '3'), v('b', '5'), v('c', '8'), v('d', '5')]);
    expect(result.average).toBeCloseTo(5.25);
    expect(result).toMatchObject({
      low: '3',
      high: '8',
      unanimous: false,
      lowIds: ['a'],
      highIds: ['c'],
      distribution: [
        { card: '3', count: 1 },
        { card: '5', count: 2 },
        { card: '8', count: 1 },
      ],
    });
  });

  it('flags everyone who shares an extreme', () => {
    const result = computeResult(FIB, [v('a', '3'), v('b', '3'), v('c', '8')]);
    expect(result.lowIds).toEqual(['a', 'b']);
    expect(result.highIds).toEqual(['c']);
  });

  it('reports a unanimous vote with nobody flagged', () => {
    expect(computeResult(FIB, [v('a', '5'), v('b', '5')])).toEqual({
      average: 5,
      low: '5',
      high: '5',
      unanimous: true,
      lowIds: [],
      highIds: [],
      distribution: [{ card: '5', count: 2 }],
    });
  });

  it('treats a single vote as unanimous', () => {
    expect(computeResult(FIB, [v('a', '13')])).toMatchObject({ average: 13, unanimous: true });
  });

  it('keeps special cards in the distribution and out of everything else', () => {
    expect(computeResult(FIB, [v('a', '5'), v('b', '?'), v('c', '☕')])).toEqual({
      average: 5,
      low: '5',
      high: '5',
      unanimous: true,
      lowIds: [],
      highIds: [],
      distribution: [
        { card: '5', count: 1 },
        { card: '?', count: 1 },
        { card: '☕', count: 1 },
      ],
    });
  });

  it('has no statistics when only special cards were voted', () => {
    expect(computeResult(FIB, [v('a', '?'), v('b', '?')])).toEqual({
      average: null,
      low: null,
      high: null,
      unanimous: false,
      lowIds: [],
      highIds: [],
      distribution: [{ card: '?', count: 2 }],
    });
  });

  it('handles a round with no votes', () => {
    expect(computeResult(FIB, [])).toMatchObject({ average: null, low: null, distribution: [] });
  });

  it('orders a non-numeric deck by position and gives no average', () => {
    expect(computeResult(TEE, [v('a', 'XL'), v('b', 'S'), v('c', 'M')])).toMatchObject({
      average: null,
      low: 'S',
      high: 'XL',
      unanimous: false,
      lowIds: ['b'],
      highIds: ['a'],
    });
  });

  it('counts the half card as 0.5', () => {
    expect(computeResult(MOD, [v('a', '½'), v('b', '1')]).average).toBeCloseTo(0.75);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-engine test`
Expected: FAIL, because `./result.ts` does not exist.

- [ ] **Step 4: Implement computeResult**

`packages/poker-engine/src/result.ts`:

```ts
import { cardValue, type Deck, type RoundResult } from '@pokerji/protocol';

export interface CastVote {
  participantId: string;
  card: string;
}

export function computeResult(deck: Deck, votes: readonly CastVote[]): RoundResult {
  const distribution = [...deck.values, ...deck.specials]
    .map((card) => ({ card, count: votes.filter((vote) => vote.card === card).length }))
    .filter((entry) => entry.count > 0);

  const valued = votes.filter((vote) => deck.values.includes(vote.card));
  if (valued.length === 0) {
    return {
      average: null,
      low: null,
      high: null,
      unanimous: false,
      lowIds: [],
      highIds: [],
      distribution,
    };
  }

  const positions = valued.map((vote) => deck.values.indexOf(vote.card));
  const low = deck.values[Math.min(...positions)] as string;
  const high = deck.values[Math.max(...positions)] as string;
  const unanimous = low === high;

  const numbers = valued.map((vote) => cardValue(vote.card));
  const average = numbers.every((n): n is number => n !== null)
    ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length
    : null;

  const holders = (card: string) =>
    valued.filter((vote) => vote.card === card).map((vote) => vote.participantId);

  return {
    average,
    low,
    high,
    unanimous,
    lowIds: unanimous ? [] : holders(low),
    highIds: unanimous ? [] : holders(high),
    distribution,
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-engine test && pnpm --filter @pokerji/poker-engine typecheck`
Expected: all tests PASS, typecheck prints nothing.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: compute round results" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Room state, presence and snapshots

**Files:**
- Create: `packages/poker-engine/src/state.ts`, `src/outcome.ts`, `src/presence.ts`, `src/snapshot.ts`, `src/apply.ts`
- Modify: `packages/poker-engine/src/index.ts`
- Create: `packages/poker-engine/test/helpers.ts`
- Test: `packages/poker-engine/test/presence.test.ts`

**Interfaces:**
- Consumes: `computeResult` is not used yet. From `@pokerji/protocol`: `type Deck`, `type Role`, `type Phase`, `type SaveStatus`, `type RoundResult`, `type ClientMessage`, `type ServerMessage`, `type RoomSnapshot`, `MAX_PARTICIPANTS`, `AWAY_DROP_MS`, `BUILT_IN_DECKS`.
- Produces, from `@pokerji/poker-engine`:
  - Types `Participant`, `RoomState`, `RoomSettings`, `Joiner`, `Command`, `Effect`, `Outcome` (exact shapes in Step 3).
  - `createRoom(settings: RoomSettings): RoomState`
  - `apply(state: RoomState, command: Command, now: number): Outcome`. In this task it handles `join`, `disconnect`, `evict`, `grantModerator` and `tick`; every other command returns the state unchanged.
  - `snapshotFor(state: RoomState, id: string, now: number): RoomSnapshot | null`
  - Internal helpers in `src/outcome.ts`, used by later tasks: `ok(state, effects?)`, `deny(state, to)`, `find(state, id)`, `patch(state, id, change)`, `without(state, ids)`, `freshRound(state, title)`.
  - Test fixtures in `test/helpers.ts`: `FIB`, `mo`, `ann`, `sam`, `msg(from, message)`, `forbidden(to)`, `run(state, commands, now?)`, `seeded()`.
- Note for the host (Plan 2): one participant may hold several connections. Send `disconnect` only when that participant's last connection closes.

- [ ] **Step 1: Write the test fixtures**

`packages/poker-engine/test/helpers.ts`:

```ts
import { BUILT_IN_DECKS, type ClientMessage } from '@pokerji/protocol';
import { apply, createRoom, type Command, type RoomState } from '../src/index.ts';

export const FIB = BUILT_IN_DECKS.fibonacci.deck;

export const mo = { id: 'm', name: 'Mo', role: 'voter', moderator: true } as const;
export const ann = { id: 'a', name: 'Ann', role: 'voter', moderator: false } as const;
export const sam = { id: 's', name: 'Sam', role: 'spectator', moderator: false } as const;

export const msg = (from: string, message: ClientMessage): Command => ({
  type: 'client',
  from,
  message,
});

export const forbidden = (to: string) => ({
  type: 'send',
  to,
  message: { type: 'error', code: 'forbidden' },
});

/** Applies commands in order at one instant and returns the final state. */
export function run(state: RoomState, commands: readonly Command[], now = 0): RoomState {
  return commands.reduce((current, command) => apply(current, command, now).state, state);
}

/** A room with a 60-second timer holding Mo (moderator, voter), Ann (voter) and Sam (spectator). */
export function seeded(): RoomState {
  return run(createRoom({ deck: FIB, timerSeconds: 60, music: null }), [
    { type: 'join', participant: mo },
    { type: 'join', participant: ann },
    { type: 'join', participant: sam },
  ]);
}
```

- [ ] **Step 2: Write the failing tests**

`packages/poker-engine/test/presence.test.ts`:

```ts
import { AWAY_DROP_MS, MAX_PARTICIPANTS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { apply, createRoom, snapshotFor, type RoomState } from '../src/index.ts';
import { ann, FIB, mo, run, seeded } from './helpers.ts';

const withVote = (state: RoomState, id: string, card: string): RoomState => ({
  ...state,
  participants: state.participants.map((p) => (p.id === id ? { ...p, vote: card } : p)),
});

describe('createRoom', () => {
  it('starts empty, in voting, on round 1', () => {
    expect(createRoom({ deck: FIB, timerSeconds: null, music: null })).toEqual({
      deck: FIB,
      timerSeconds: null,
      music: null,
      title: '',
      phase: 'voting',
      revealAt: null,
      timerEndsAt: null,
      roundSeq: 1,
      result: null,
      saveStatus: 'none',
      participants: [],
    });
  });
});

describe('join', () => {
  it('adds a present participant with no vote', () => {
    const state = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), [
      { type: 'join', participant: ann },
    ]);
    expect(state.participants).toEqual([{ ...ann, present: true, awaySince: null, vote: null }]);
  });

  it('keeps the vote and does not duplicate when someone reconnects mid-round', () => {
    const voted = withVote(seeded(), 'a', '5');
    const away = apply(voted, { type: 'disconnect', id: 'a' }, 1_000).state;
    const back = apply(away, { type: 'join', participant: ann }, 2_000).state;
    expect(back.participants.filter((p) => p.id === 'a')).toEqual([
      { ...ann, present: true, awaySince: null, vote: '5' },
    ]);
    expect(back.participants).toHaveLength(3);
  });

  it('refuses the 51st participant and closes their connection', () => {
    const joins = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => ({
      type: 'join' as const,
      participant: { id: `p${i}`, name: `P${i}`, role: 'voter' as const, moderator: false },
    }));
    const full = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), joins);
    const outcome = apply(full, { type: 'join', participant: ann }, 0);
    expect(outcome.state).toBe(full);
    expect(outcome.effects).toEqual([
      { type: 'send', to: 'a', message: { type: 'error', code: 'room_full' } },
      { type: 'close', id: 'a' },
    ]);
  });

  it('lets an existing participant back into a full room', () => {
    const joins = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => ({
      type: 'join' as const,
      participant: { id: `p${i}`, name: `P${i}`, role: 'voter' as const, moderator: false },
    }));
    const full = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), joins);
    const outcome = apply(full, joins[0]!, 0);
    expect(outcome.effects).toEqual([]);
    expect(outcome.state.participants).toHaveLength(MAX_PARTICIPANTS);
  });
});

describe('disconnect and tick', () => {
  it('marks a participant away without removing them', () => {
    const state = apply(seeded(), { type: 'disconnect', id: 'a' }, 5_000).state;
    expect(state.participants.find((p) => p.id === 'a')).toMatchObject({
      present: false,
      awaySince: 5_000,
    });
  });

  it('ignores a disconnect for someone who is not in the room', () => {
    const state = seeded();
    expect(apply(state, { type: 'disconnect', id: 'nobody' }, 0).state).toBe(state);
  });

  it('drops a participant after ten minutes away, and not before', () => {
    const away = apply(seeded(), { type: 'disconnect', id: 'a' }, 0).state;
    const early = apply(away, { type: 'tick' }, AWAY_DROP_MS - 1).state;
    expect(early.participants.map((p) => p.id)).toEqual(['m', 'a', 's']);
    const late = apply(away, { type: 'tick' }, AWAY_DROP_MS).state;
    expect(late.participants.map((p) => p.id)).toEqual(['m', 's']);
  });

  it('returns the same state from a tick when nothing is due', () => {
    const state = seeded();
    expect(apply(state, { type: 'tick' }, 1_000_000).state).toBe(state);
  });
});

describe('evict and grantModerator', () => {
  it('removes the named participants and tells them', () => {
    const outcome = apply(seeded(), { type: 'evict', ids: ['a', 'nobody'] }, 0);
    expect(outcome.state.participants.map((p) => p.id)).toEqual(['m', 's']);
    expect(outcome.effects).toEqual([
      { type: 'send', to: 'a', message: { type: 'removed' } },
      { type: 'close', id: 'a' },
    ]);
  });

  it('grants moderator rights', () => {
    const state = apply(seeded(), { type: 'grantModerator', id: 'a' }, 0).state;
    expect(state.participants.find((p) => p.id === 'a')?.moderator).toBe(true);
  });
});

describe('snapshotFor', () => {
  it('returns null for someone who is not in the room', () => {
    expect(snapshotFor(seeded(), 'nobody', 0)).toBeNull();
  });

  it('describes the room for one participant', () => {
    expect(snapshotFor(seeded(), 'a', 1234)).toEqual({
      serverNow: 1234,
      you: { id: 'a', name: 'Ann', role: 'voter', moderator: false, vote: null },
      title: '',
      deck: FIB,
      phase: 'voting',
      revealAt: null,
      timer: { seconds: 60, endsAt: null },
      music: null,
      participants: [
        { ...mo, present: true, hasVoted: false, vote: null },
        { ...ann, present: true, hasVoted: false, vote: null },
        {
          id: 's',
          name: 'Sam',
          role: 'spectator',
          moderator: false,
          present: true,
          hasVoted: false,
          vote: null,
        },
      ],
      result: null,
      saveStatus: 'none',
    });
  });

  it('shows your own vote to you and hides it from others while voting', () => {
    const voted = withVote(seeded(), 'a', '8');
    expect(snapshotFor(voted, 'a', 0)?.you.vote).toBe('8');
    const seenByMo = snapshotFor(voted, 'm', 0);
    expect(seenByMo?.participants.find((p) => p.id === 'a')).toMatchObject({
      hasVoted: true,
      vote: null,
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-engine test`
Expected: FAIL, because `apply`, `createRoom` and `snapshotFor` are not exported.

- [ ] **Step 4: Implement state and helpers**

`packages/poker-engine/src/state.ts`:

```ts
import type {
  ClientMessage,
  Deck,
  Phase,
  Role,
  RoundResult,
  SaveStatus,
  ServerMessage,
} from '@pokerji/protocol';

export interface Participant {
  id: string;
  name: string;
  role: Role;
  moderator: boolean;
  present: boolean;
  /** Epoch milliseconds when the last connection closed; null while present. */
  awaySince: number | null;
  vote: string | null;
}

export interface RoomSettings {
  deck: Deck;
  timerSeconds: number | null;
  music: string | null;
}

export interface RoomState extends RoomSettings {
  title: string;
  phase: Phase;
  revealAt: number | null;
  timerEndsAt: number | null;
  /** Increases by one with every new round. Identifies a round to the host. */
  roundSeq: number;
  result: RoundResult | null;
  saveStatus: SaveStatus;
  participants: readonly Participant[];
}

export interface Joiner {
  id: string;
  name: string;
  role: Role;
  moderator: boolean;
}

export type Command =
  | { type: 'join'; participant: Joiner }
  | { type: 'disconnect'; id: string }
  | { type: 'tick' }
  | { type: 'client'; from: string; message: ClientMessage }
  | { type: 'settings'; settings: RoomSettings }
  | { type: 'evict'; ids: readonly string[] }
  | { type: 'grantModerator'; id: string }
  | { type: 'roundSaved'; seq: number; ok: boolean };

export type Effect =
  | { type: 'send'; to: string; message: ServerMessage }
  | { type: 'announce'; message: ServerMessage }
  | { type: 'close'; id: string }
  | {
      type: 'persistRound';
      seq: number;
      title: string;
      votes: { participantId: string; name: string; card: string }[];
    }
  | { type: 'persistRole'; id: string; role: Role }
  | { type: 'persistModerator'; id: string }
  | { type: 'deleteSession'; id: string };

export interface Outcome {
  state: RoomState;
  effects: Effect[];
}

export function createRoom(settings: RoomSettings): RoomState {
  return {
    deck: settings.deck,
    timerSeconds: settings.timerSeconds,
    music: settings.music,
    title: '',
    phase: 'voting',
    revealAt: null,
    timerEndsAt: null,
    roundSeq: 1,
    result: null,
    saveStatus: 'none',
    participants: [],
  };
}
```

`packages/poker-engine/src/outcome.ts`:

```ts
import type { Effect, Outcome, Participant, RoomState } from './state.ts';

export const ok = (state: RoomState, effects: Effect[] = []): Outcome => ({ state, effects });

/** Refuses a client message: state untouched, sender told. */
export const deny = (state: RoomState, to: string): Outcome =>
  ok(state, [{ type: 'send', to, message: { type: 'error', code: 'forbidden' } }]);

export const find = (state: RoomState, id: string): Participant | undefined =>
  state.participants.find((p) => p.id === id);

export function patch(state: RoomState, id: string, change: Partial<Participant>): RoomState {
  return {
    ...state,
    participants: state.participants.map((p) => (p.id === id ? { ...p, ...change } : p)),
  };
}

export function without(state: RoomState, ids: readonly string[]): RoomState {
  return { ...state, participants: state.participants.filter((p) => !ids.includes(p.id)) };
}

export function freshRound(state: RoomState, title: string): RoomState {
  return {
    ...state,
    title,
    phase: 'voting',
    revealAt: null,
    timerEndsAt: null,
    roundSeq: state.roundSeq + 1,
    result: null,
    saveStatus: 'none',
    participants: state.participants.map((p) => ({ ...p, vote: null })),
  };
}
```

- [ ] **Step 5: Implement presence, snapshots and apply**

`packages/poker-engine/src/presence.ts`:

```ts
import { AWAY_DROP_MS, MAX_PARTICIPANTS } from '@pokerji/protocol';
import { find, ok, patch, without } from './outcome.ts';
import type { Effect, Joiner, Outcome, RoomState } from './state.ts';

export function join(state: RoomState, joiner: Joiner): Outcome {
  if (find(state, joiner.id)) {
    return ok(patch(state, joiner.id, { present: true, awaySince: null }));
  }
  if (state.participants.length >= MAX_PARTICIPANTS) {
    return ok(state, [
      { type: 'send', to: joiner.id, message: { type: 'error', code: 'room_full' } },
      { type: 'close', id: joiner.id },
    ]);
  }
  return ok({
    ...state,
    participants: [
      ...state.participants,
      { ...joiner, present: true, awaySince: null, vote: null },
    ],
  });
}

export function disconnect(state: RoomState, id: string, now: number): Outcome {
  if (!find(state, id)) return ok(state);
  return ok(patch(state, id, { present: false, awaySince: now }));
}

/** Removes participants away for ten minutes. Never during the count, so locked votes survive. */
export function dropStale(state: RoomState, now: number): RoomState {
  if (state.phase === 'counting') return state;
  const stale = state.participants
    .filter((p) => !p.present && p.awaySince !== null && now - p.awaySince >= AWAY_DROP_MS)
    .map((p) => p.id);
  return stale.length === 0 ? state : without(state, stale);
}

export function evict(state: RoomState, ids: readonly string[]): Outcome {
  const present = ids.filter((id) => find(state, id));
  if (present.length === 0) return ok(state);
  return ok(
    without(state, present),
    present.flatMap((id): Effect[] => [
      { type: 'send', to: id, message: { type: 'removed' } },
      { type: 'close', id },
    ]),
  );
}
```

`packages/poker-engine/src/snapshot.ts`:

```ts
import type { RoomSnapshot } from '@pokerji/protocol';
import { find } from './outcome.ts';
import type { RoomState } from './state.ts';

/**
 * The room as one participant may see it. This is the only place vote secrecy
 * is enforced: other people's votes and the result appear only once revealed.
 */
export function snapshotFor(state: RoomState, id: string, now: number): RoomSnapshot | null {
  const you = find(state, id);
  if (!you) return null;
  const open = state.phase === 'revealed';
  return {
    serverNow: now,
    you: { id: you.id, name: you.name, role: you.role, moderator: you.moderator, vote: you.vote },
    title: state.title,
    deck: state.deck,
    phase: state.phase,
    revealAt: state.revealAt,
    timer: { seconds: state.timerSeconds, endsAt: state.timerEndsAt },
    music: state.music,
    participants: state.participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      moderator: p.moderator,
      present: p.present,
      hasVoted: p.vote !== null,
      vote: open ? p.vote : null,
    })),
    result: open ? state.result : null,
    saveStatus: state.saveStatus,
  };
}
```

`packages/poker-engine/src/apply.ts`:

```ts
import { find, ok, patch } from './outcome.ts';
import { disconnect, dropStale, evict, join } from './presence.ts';
import type { Command, Outcome, RoomState } from './state.ts';

/** The engine's single entry point. Pure: same inputs, same outputs. */
export function apply(state: RoomState, command: Command, now: number): Outcome {
  switch (command.type) {
    case 'join':
      return join(state, command.participant);
    case 'disconnect':
      return disconnect(state, command.id, now);
    case 'evict':
      return evict(state, command.ids);
    case 'grantModerator':
      return find(state, command.id) ? ok(patch(state, command.id, { moderator: true })) : ok(state);
    case 'tick':
      return tick(state, now);
    default:
      return ok(state);
  }
}

function tick(state: RoomState, now: number): Outcome {
  return ok(dropStale(state, now));
}
```

Replace `packages/poker-engine/src/index.ts` with:

```ts
export * from './apply.ts';
export * from './result.ts';
export * from './snapshot.ts';
export * from './state.ts';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-engine test && pnpm --filter @pokerji/poker-engine typecheck`
Expected: all tests PASS, typecheck prints nothing.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add room state, presence and per-recipient snapshots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rounds — voting, the count, reveal and secrecy

**Files:**
- Create: `packages/poker-engine/src/round.ts`, `packages/poker-engine/src/client.ts`
- Modify: `packages/poker-engine/src/apply.ts`
- Test: `packages/poker-engine/test/rounds.test.ts`

**Interfaces:**
- Consumes: `ok`, `deny`, `find`, `patch`, `freshRound` from `src/outcome.ts`; `dropStale` from `src/presence.ts`; `computeResult` from `src/result.ts`; `REVEAL_COUNT_MS` and `type ClientMessage` from `@pokerji/protocol`; fixtures from `test/helpers.ts`.
- Produces:
  - `handleClient(state: RoomState, from: string, message: ClientMessage, now: number): Outcome` in `src/client.ts`. In this task it handles `vote`, `clearVote`, `setRole`, `setTitle`, `reveal`, `newRound`; other message types are denied.
  - `revealIfDue(state: RoomState, now: number): Outcome` and `roundSaved(state: RoomState, seq: number, saved: boolean): Outcome` in `src/round.ts`.
  - `apply` now handles `client` and `roundSaved`, and `tick` reveals when the count is over.

- [ ] **Step 1: Write the failing tests**

`packages/poker-engine/test/rounds.test.ts`:

```ts
import { AWAY_DROP_MS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { apply, snapshotFor } from '../src/index.ts';
import { forbidden, msg, run, seeded } from './helpers.ts';

const vote = (from: string, card: string) => msg(from, { type: 'vote', card });
const reveal = msg('m', { type: 'reveal' });
const voteOf = (state: ReturnType<typeof seeded>, id: string) =>
  state.participants.find((p) => p.id === id)?.vote;

describe('voting', () => {
  it('records a vote and lets the voter change it', () => {
    const state = run(seeded(), [vote('a', '5'), vote('a', '8')]);
    expect(voteOf(state, 'a')).toBe('8');
  });

  it('clears a vote', () => {
    const state = run(seeded(), [vote('a', '5'), msg('a', { type: 'clearVote' })]);
    expect(voteOf(state, 'a')).toBeNull();
  });

  it('accepts a special card', () => {
    expect(voteOf(run(seeded(), [vote('a', '?')]), 'a')).toBe('?');
  });

  it('refuses a card that is not in the deck and changes nothing', () => {
    const state = seeded();
    const outcome = apply(state, vote('a', 'XL'), 0);
    expect(outcome.state).toBe(state);
    expect(outcome.effects).toEqual([forbidden('a')]);
  });

  it('refuses a vote from a spectator', () => {
    expect(apply(seeded(), vote('s', '5'), 0).effects).toEqual([forbidden('s')]);
  });

  it('ignores a message from someone who is not in the room', () => {
    const state = seeded();
    expect(apply(state, vote('nobody', '5'), 0)).toEqual({ state, effects: [] });
  });
});

describe('reveal', () => {
  it('locks votes for three seconds, then reveals and asks for the round to be saved', () => {
    const voted = run(seeded(), [
      msg('m', { type: 'setTitle', title: 'PROJ-1' }),
      vote('m', '3'),
      vote('a', '8'),
    ]);
    const counting = apply(voted, reveal, 1_000);
    expect(counting.state).toMatchObject({ phase: 'counting', revealAt: 4_000 });
    expect(counting.effects).toEqual([]);

    expect(apply(counting.state, vote('a', '5'), 2_000).effects).toEqual([forbidden('a')]);
    expect(apply(counting.state, msg('a', { type: 'clearVote' }), 2_000).effects).toEqual([
      forbidden('a'),
    ]);
    expect(apply(counting.state, { type: 'tick' }, 3_999).state.phase).toBe('counting');

    const done = apply(counting.state, { type: 'tick' }, 4_000);
    expect(done.state).toMatchObject({ phase: 'revealed', revealAt: null, saveStatus: 'pending' });
    expect(done.state.result).toMatchObject({
      average: 5.5,
      low: '3',
      high: '8',
      unanimous: false,
      lowIds: ['m'],
      highIds: ['a'],
    });
    expect(done.effects).toEqual([
      {
        type: 'persistRound',
        seq: 1,
        title: 'PROJ-1',
        votes: [
          { participantId: 'm', name: 'Mo', card: '3' },
          { participantId: 'a', name: 'Ann', card: '8' },
        ],
      },
    ]);
  });

  it('reveals a round with no votes without saving it', () => {
    const counting = apply(seeded(), reveal, 0).state;
    const done = apply(counting, { type: 'tick' }, 3_000);
    expect(done.state).toMatchObject({ phase: 'revealed', saveStatus: 'none' });
    expect(done.effects).toEqual([]);
  });

  it('still reveals when the moderator disconnects during the count', () => {
    const counting = apply(run(seeded(), [vote('m', '3'), vote('a', '8')]), reveal, 0).state;
    const gone = apply(counting, { type: 'disconnect', id: 'm' }, 500).state;
    const done = apply(gone, { type: 'tick' }, 3_000).state;
    expect(done.phase).toBe('revealed');
    expect(done.result?.lowIds).toEqual(['m']);
  });

  it('does not drop an away voter while the count is running', () => {
    const away = apply(run(seeded(), [vote('a', '8')]), { type: 'disconnect', id: 'a' }, 0).state;
    const counting = apply(away, reveal, AWAY_DROP_MS - 1_000).state;
    const during = apply(counting, { type: 'tick' }, AWAY_DROP_MS).state;
    expect(during.participants.map((p) => p.id)).toContain('a');
  });

  it('cannot be started twice or by a non-moderator', () => {
    const counting = apply(seeded(), reveal, 0).state;
    expect(apply(counting, reveal, 100).effects).toEqual([forbidden('m')]);
    expect(apply(seeded(), msg('a', { type: 'reveal' }), 0).effects).toEqual([forbidden('a')]);
  });

  it('refuses votes once revealed', () => {
    const revealed = apply(apply(seeded(), reveal, 0).state, { type: 'tick' }, 3_000).state;
    expect(apply(revealed, vote('a', '5'), 4_000).effects).toEqual([forbidden('a')]);
  });
});

describe('new round', () => {
  const revealed = () =>
    apply(
      apply(
        run(seeded(), [msg('m', { type: 'setTitle', title: 'PROJ-1' }), vote('a', '8')]),
        reveal,
        0,
      ).state,
      { type: 'tick' },
      3_000,
    ).state;

  it('clears votes and the result, keeps the title when asked, and advances the round', () => {
    const next = apply(revealed(), msg('m', { type: 'newRound', keepTitle: true }), 5_000).state;
    expect(next).toMatchObject({
      phase: 'voting',
      title: 'PROJ-1',
      roundSeq: 2,
      result: null,
      saveStatus: 'none',
    });
    expect(next.participants.every((p) => p.vote === null)).toBe(true);
  });

  it('clears the title when asked', () => {
    const next = apply(revealed(), msg('m', { type: 'newRound', keepTitle: false }), 5_000).state;
    expect(next.title).toBe('');
  });

  it('can reset a round that is still in voting', () => {
    const next = run(seeded(), [vote('a', '8'), msg('m', { type: 'newRound', keepTitle: true })]);
    expect(next.roundSeq).toBe(2);
    expect(voteOf(next, 'a')).toBeNull();
  });

  it('is refused during the count and for non-moderators', () => {
    const counting = apply(seeded(), reveal, 0).state;
    const newRound = { type: 'newRound', keepTitle: true } as const;
    expect(apply(counting, msg('m', newRound), 100).effects).toEqual([forbidden('m')]);
    expect(apply(revealed(), msg('a', newRound), 5_000).effects).toEqual([forbidden('a')]);
  });
});

describe('roundSaved', () => {
  const pending = () =>
    apply(apply(run(seeded(), [vote('a', '8')]), reveal, 0).state, { type: 'tick' }, 3_000).state;

  it('marks the round saved or failed, and saved again after a retry', () => {
    const failed = apply(pending(), { type: 'roundSaved', seq: 1, ok: false }, 0).state;
    expect(failed.saveStatus).toBe('failed');
    expect(apply(failed, { type: 'roundSaved', seq: 1, ok: true }, 0).state.saveStatus).toBe(
      'saved',
    );
  });

  it('ignores a confirmation for an earlier round', () => {
    const next = apply(pending(), msg('m', { type: 'newRound', keepTitle: true }), 0).state;
    expect(apply(next, { type: 'roundSaved', seq: 1, ok: true }, 0).state).toBe(next);
  });

  it('ignores a confirmation when nothing was being saved', () => {
    const state = seeded();
    expect(apply(state, { type: 'roundSaved', seq: 1, ok: true }, 0).state).toBe(state);
  });
});

describe('setRole', () => {
  it('moves a voter to spectator, discards their vote and asks for the role to be saved', () => {
    const outcome = apply(
      run(seeded(), [vote('a', '5')]),
      msg('a', { type: 'setRole', role: 'spectator' }),
      0,
    );
    expect(outcome.state.participants.find((p) => p.id === 'a')).toMatchObject({
      role: 'spectator',
      vote: null,
    });
    expect(outcome.effects).toEqual([{ type: 'persistRole', id: 'a', role: 'spectator' }]);
  });

  it('does nothing when the role is unchanged', () => {
    const state = seeded();
    expect(apply(state, msg('s', { type: 'setRole', role: 'spectator' }), 0)).toEqual({
      state,
      effects: [],
    });
  });

  it('is refused during the count', () => {
    const counting = apply(seeded(), reveal, 0).state;
    expect(apply(counting, msg('a', { type: 'setRole', role: 'spectator' }), 100).effects).toEqual([
      forbidden('a'),
    ]);
  });

  it('keeps a revealed vote on show when its owner becomes a spectator', () => {
    const revealed = apply(
      apply(run(seeded(), [vote('a', '8')]), reveal, 0).state,
      { type: 'tick' },
      3_000,
    ).state;
    const next = apply(revealed, msg('a', { type: 'setRole', role: 'spectator' }), 4_000).state;
    expect(voteOf(next, 'a')).toBe('8');
  });
});

describe('setTitle', () => {
  it('is for moderators, during voting only', () => {
    const title = { type: 'setTitle', title: 'PROJ-2' } as const;
    expect(apply(seeded(), msg('m', title), 0).state.title).toBe('PROJ-2');
    expect(apply(seeded(), msg('a', title), 0).effects).toEqual([forbidden('a')]);
    const revealed = apply(apply(seeded(), reveal, 0).state, { type: 'tick' }, 3_000).state;
    expect(apply(revealed, msg('m', title), 4_000).effects).toEqual([forbidden('m')]);
  });
});

describe('vote secrecy', () => {
  const voting = () => run(seeded(), [vote('m', '3'), vote('a', '8')]);

  it('never shows another person a vote before the reveal, during voting or the count', () => {
    const counting = apply(voting(), reveal, 0).state;
    for (const state of [voting(), counting]) {
      for (const viewer of ['m', 'a', 's']) {
        const snapshot = snapshotFor(state, viewer, 0);
        expect(snapshot?.result).toBeNull();
        expect(snapshot?.participants.map((p) => p.vote)).toEqual([null, null, null]);
        expect(snapshot?.participants.map((p) => p.hasVoted)).toEqual([true, true, false]);
      }
    }
  });

  it('shows each person only their own vote before the reveal', () => {
    expect(snapshotFor(voting(), 'a', 0)?.you.vote).toBe('8');
    expect(snapshotFor(voting(), 'm', 0)?.you.vote).toBe('3');
    expect(snapshotFor(voting(), 's', 0)?.you.vote).toBeNull();
  });

  it('shows every vote and the result to everyone after the reveal', () => {
    const revealed = apply(apply(voting(), reveal, 0).state, { type: 'tick' }, 3_000).state;
    for (const viewer of ['m', 'a', 's']) {
      const snapshot = snapshotFor(revealed, viewer, 3_000);
      expect(snapshot?.participants.map((p) => p.vote)).toEqual(['3', '8', null]);
      expect(snapshot?.result?.high).toBe('8');
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-engine test`
Expected: FAIL. `rounds.test.ts` fails because client messages leave the state unchanged; earlier test files still pass.

- [ ] **Step 3: Implement the round functions**

`packages/poker-engine/src/round.ts`:

```ts
import { ok } from './outcome.ts';
import { computeResult } from './result.ts';
import type { Outcome, RoomState } from './state.ts';

/** Moves from counting to revealed once the count is over. */
export function revealIfDue(state: RoomState, now: number): Outcome {
  if (state.phase !== 'counting' || state.revealAt === null || now < state.revealAt) {
    return ok(state);
  }
  const votes = state.participants.flatMap((p) =>
    p.vote === null ? [] : [{ participantId: p.id, name: p.name, card: p.vote }],
  );
  const save = votes.length > 0;
  const next: RoomState = {
    ...state,
    phase: 'revealed',
    revealAt: null,
    result: computeResult(state.deck, votes),
    saveStatus: save ? 'pending' : 'none',
  };
  return ok(
    next,
    save ? [{ type: 'persistRound', seq: state.roundSeq, title: state.title, votes }] : [],
  );
}

/** Records the host's answer to a persistRound effect. Answers for other rounds are ignored. */
export function roundSaved(state: RoomState, seq: number, saved: boolean): Outcome {
  if (seq !== state.roundSeq || state.saveStatus === 'none') return ok(state);
  return ok({ ...state, saveStatus: saved ? 'saved' : 'failed' });
}
```

- [ ] **Step 4: Implement the client message handler**

`packages/poker-engine/src/client.ts`:

```ts
import { REVEAL_COUNT_MS, type ClientMessage } from '@pokerji/protocol';
import { deny, find, freshRound, ok, patch } from './outcome.ts';
import type { Outcome, RoomState } from './state.ts';

/** Checks a client message against the sender's role and the round's phase, then applies it. */
export function handleClient(
  state: RoomState,
  from: string,
  message: ClientMessage,
  now: number,
): Outcome {
  const actor = find(state, from);
  if (!actor) return ok(state);

  switch (message.type) {
    case 'vote': {
      const inDeck =
        state.deck.values.includes(message.card) || state.deck.specials.includes(message.card);
      if (actor.role !== 'voter' || state.phase !== 'voting' || !inDeck) return deny(state, from);
      return ok(patch(state, from, { vote: message.card }));
    }
    case 'clearVote':
      if (actor.role !== 'voter' || state.phase !== 'voting') return deny(state, from);
      return ok(patch(state, from, { vote: null }));
    case 'setRole': {
      if (state.phase === 'counting') return deny(state, from);
      if (actor.role === message.role) return ok(state);
      const vote = state.phase === 'voting' ? null : actor.vote;
      return ok(patch(state, from, { role: message.role, vote }), [
        { type: 'persistRole', id: from, role: message.role },
      ]);
    }
    case 'setTitle':
      if (!actor.moderator || state.phase !== 'voting') return deny(state, from);
      return ok({ ...state, title: message.title });
    case 'reveal':
      if (!actor.moderator || state.phase !== 'voting') return deny(state, from);
      return ok({
        ...state,
        phase: 'counting',
        revealAt: now + REVEAL_COUNT_MS,
        timerEndsAt: null,
      });
    case 'newRound':
      if (!actor.moderator || state.phase === 'counting') return deny(state, from);
      return ok(freshRound(state, message.keepTitle ? state.title : ''));
    default:
      return deny(state, from);
  }
}
```

- [ ] **Step 5: Wire both into apply**

Replace `packages/poker-engine/src/apply.ts` with:

```ts
import { handleClient } from './client.ts';
import { find, ok, patch } from './outcome.ts';
import { disconnect, dropStale, evict, join } from './presence.ts';
import { revealIfDue, roundSaved } from './round.ts';
import type { Command, Outcome, RoomState } from './state.ts';

/** The engine's single entry point. Pure: same inputs, same outputs. */
export function apply(state: RoomState, command: Command, now: number): Outcome {
  switch (command.type) {
    case 'join':
      return join(state, command.participant);
    case 'disconnect':
      return disconnect(state, command.id, now);
    case 'evict':
      return evict(state, command.ids);
    case 'grantModerator':
      return find(state, command.id) ? ok(patch(state, command.id, { moderator: true })) : ok(state);
    case 'client':
      return handleClient(state, command.from, command.message, now);
    case 'roundSaved':
      return roundSaved(state, command.seq, command.ok);
    case 'tick':
      return tick(state, now);
    default:
      return ok(state);
  }
}

function tick(state: RoomState, now: number): Outcome {
  const revealed = revealIfDue(state, now);
  return ok(dropStale(revealed.state, now), revealed.effects);
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @pokerji/poker-engine test && pnpm --filter @pokerji/poker-engine typecheck`
Expected: all tests PASS, typecheck prints nothing.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add voting, the reveal count and vote secrecy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Moderation, timer, settings and the authorization matrix

**Files:**
- Create: `packages/poker-engine/src/timer.ts`, `packages/poker-engine/src/settings.ts`
- Modify: `packages/poker-engine/src/client.ts`, `packages/poker-engine/src/apply.ts`, `packages/poker-engine/src/index.ts`
- Test: `packages/poker-engine/test/moderation.test.ts`, `test/timer.test.ts`, `test/settings.test.ts`, `test/authorization.test.ts`

**Interfaces:**
- Consumes: `ok`, `deny`, `find`, `patch`, `without`, `freshRound` from `src/outcome.ts`; `handleClient` from Task 5; fixtures from `test/helpers.ts`.
- Produces:
  - `handleClient` handles every `ClientMessage` type: adds `startTimer`, `stopTimer`, `removeParticipant`, `promote`.
  - `expireTimer(state: RoomState, now: number): Outcome` in `src/timer.ts`.
  - `canChangeDeck(state: RoomState): boolean` and `applySettings(state: RoomState, settings: RoomSettings): Outcome` in `src/settings.ts`. `canChangeDeck` is exported from the package: the host must call it before saving a deck change.
  - `apply` handles every `Command` type, with no fallback case.

- [ ] **Step 1: Write the failing moderation tests**

`packages/poker-engine/test/moderation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.ts';
import { forbidden, msg, run, seeded } from './helpers.ts';

const remove = (from: string, participantId: string) =>
  msg(from, { type: 'removeParticipant', participantId });
const promote = (from: string, participantId: string) =>
  msg(from, { type: 'promote', participantId });

describe('removeParticipant', () => {
  it('removes the participant, tells them, closes their connection and deletes their session', () => {
    const outcome = apply(seeded(), remove('m', 'a'), 0);
    expect(outcome.state.participants.map((p) => p.id)).toEqual(['m', 's']);
    expect(outcome.effects).toEqual([
      { type: 'send', to: 'a', message: { type: 'removed' } },
      { type: 'close', id: 'a' },
      { type: 'deleteSession', id: 'a' },
    ]);
  });

  it('cannot be used on yourself, on another moderator, or on someone who is not there', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    expect(apply(twoMods, remove('m', 'm'), 0).effects).toEqual([forbidden('m')]);
    expect(apply(twoMods, remove('m', 'a'), 0).effects).toEqual([forbidden('m')]);
    expect(apply(twoMods, remove('m', 'nobody'), 0).effects).toEqual([forbidden('m')]);
  });
});

describe('promote', () => {
  it('makes a co-moderator who can then run the round', () => {
    const outcome = apply(seeded(), promote('m', 'a'), 0);
    expect(outcome.effects).toEqual([{ type: 'persistModerator', id: 'a' }]);
    const revealing = apply(outcome.state, msg('a', { type: 'reveal' }), 0);
    expect(revealing.state.phase).toBe('counting');
  });

  it('does nothing when the target is already a moderator', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    expect(apply(twoMods, promote('m', 'a'), 0)).toEqual({ state: twoMods, effects: [] });
  });

  it('is refused for a target who is not there', () => {
    expect(apply(seeded(), promote('m', 'nobody'), 0).effects).toEqual([forbidden('m')]);
  });
});
```

- [ ] **Step 2: Write the failing timer tests**

`packages/poker-engine/test/timer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { apply, createRoom, snapshotFor } from '../src/index.ts';
import { FIB, forbidden, mo, msg, run, seeded } from './helpers.ts';

const start = msg('m', { type: 'startTimer' });
const stop = msg('m', { type: 'stopTimer' });
const expired = { type: 'announce', message: { type: 'timerExpired' } };

describe('timer', () => {
  it('starts from the room setting and appears in snapshots', () => {
    const state = apply(seeded(), start, 10_000).state;
    expect(state.timerEndsAt).toBe(70_000);
    expect(snapshotFor(state, 'a', 10_000)?.timer).toEqual({ seconds: 60, endsAt: 70_000 });
  });

  it('cannot start in a room with no timer set', () => {
    const noTimer = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), [
      { type: 'join', participant: mo },
    ]);
    expect(apply(noTimer, start, 0).effects).toEqual([forbidden('m')]);
  });

  it('announces expiry once and never reveals on its own', () => {
    const running = apply(seeded(), start, 0).state;
    expect(apply(running, { type: 'tick' }, 59_999).effects).toEqual([]);
    const ended = apply(running, { type: 'tick' }, 60_000);
    expect(ended.effects).toEqual([expired]);
    expect(ended.state).toMatchObject({ timerEndsAt: null, phase: 'voting' });
    expect(apply(ended.state, { type: 'tick' }, 61_000).effects).toEqual([]);
  });

  it('stops without announcing', () => {
    const stopped = apply(apply(seeded(), start, 0).state, stop, 5_000);
    expect(stopped.state.timerEndsAt).toBeNull();
    expect(stopped.effects).toEqual([]);
    expect(apply(stopped.state, { type: 'tick' }, 60_000).effects).toEqual([]);
  });

  it('cannot be stopped when it is not running', () => {
    expect(apply(seeded(), stop, 0).effects).toEqual([forbidden('m')]);
  });

  it('is stopped by a reveal and does not announce afterwards', () => {
    const running = apply(seeded(), start, 0).state;
    const counting = apply(running, msg('m', { type: 'reveal' }), 58_000).state;
    expect(counting.timerEndsAt).toBeNull();
    const done = apply(counting, { type: 'tick' }, 61_000);
    expect(done.state.phase).toBe('revealed');
    expect(done.effects).toEqual([]);
  });

  it('cannot start once the round is revealed', () => {
    const revealed = apply(
      apply(seeded(), msg('m', { type: 'reveal' }), 0).state,
      { type: 'tick' },
      3_000,
    ).state;
    expect(apply(revealed, start, 4_000).effects).toEqual([forbidden('m')]);
  });
});
```

- [ ] **Step 3: Write the failing settings tests**

`packages/poker-engine/test/settings.test.ts`:

```ts
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { apply, canChangeDeck } from '../src/index.ts';
import { FIB, msg, run, seeded } from './helpers.ts';

const TEE = BUILT_IN_DECKS.tshirt.deck;
const vote = msg('a', { type: 'vote', card: '8' });
const reveal = msg('m', { type: 'reveal' });

describe('canChangeDeck', () => {
  it('is true before anyone has voted and after a reveal, false otherwise', () => {
    expect(canChangeDeck(seeded())).toBe(true);
    const voted = run(seeded(), [vote]);
    expect(canChangeDeck(voted)).toBe(false);
    const counting = apply(voted, reveal, 0).state;
    expect(canChangeDeck(counting)).toBe(false);
    const revealed = apply(counting, { type: 'tick' }, 3_000).state;
    expect(canChangeDeck(revealed)).toBe(true);
  });
});

describe('settings', () => {
  it('changes the deck by starting a new round that keeps the title', () => {
    const titled = run(seeded(), [msg('m', { type: 'setTitle', title: 'PROJ-1' })]);
    const next = apply(
      titled,
      { type: 'settings', settings: { deck: TEE, timerSeconds: 60, music: null } },
      0,
    ).state;
    expect(next).toMatchObject({ deck: TEE, title: 'PROJ-1', roundSeq: 2, phase: 'voting' });
  });

  it('refuses the whole change when the deck cannot change right now', () => {
    const voted = run(seeded(), [vote]);
    const outcome = apply(
      voted,
      { type: 'settings', settings: { deck: TEE, timerSeconds: 30, music: 'nocturne' } },
      0,
    );
    expect(outcome.state).toBe(voted);
  });

  it('changes timer and music mid-round without disturbing votes', () => {
    const voted = run(seeded(), [vote]);
    const next = apply(
      voted,
      { type: 'settings', settings: { deck: FIB, timerSeconds: 30, music: 'nocturne' } },
      0,
    ).state;
    expect(next).toMatchObject({ timerSeconds: 30, music: 'nocturne', roundSeq: 1 });
    expect(next.participants.find((p) => p.id === 'a')?.vote).toBe('8');
  });

  it('stops a running timer when the timer is switched off', () => {
    const running = apply(seeded(), msg('m', { type: 'startTimer' }), 0).state;
    const next = apply(
      running,
      { type: 'settings', settings: { deck: FIB, timerSeconds: null, music: null } },
      1_000,
    ).state;
    expect(next).toMatchObject({ timerSeconds: null, timerEndsAt: null });
  });
});
```

- [ ] **Step 4: Write the failing authorization matrix**

`packages/poker-engine/test/authorization.test.ts`:

```ts
import type { ClientMessage } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.ts';
import { forbidden, msg, seeded } from './helpers.ts';

/** Voting phase with the timer running, so every message has a state in which it can succeed. */
const base = () => apply(seeded(), msg('m', { type: 'startTimer' }), 0).state;

/** Someone other than the actor who is not a moderator. */
const target = (actor: string) => (actor === 'a' ? 's' : 'a');

type Row = [
  name: string,
  build: (actor: string) => ClientMessage,
  allowed: { m: boolean; a: boolean; s: boolean },
];

const everyone = { m: true, a: true, s: true };
const votersOnly = { m: true, a: true, s: false };
const moderatorOnly = { m: true, a: false, s: false };

const matrix: Row[] = [
  ['vote', () => ({ type: 'vote', card: '5' }), votersOnly],
  ['clearVote', () => ({ type: 'clearVote' }), votersOnly],
  ['setRole', () => ({ type: 'setRole', role: 'spectator' }), everyone],
  ['setTitle', () => ({ type: 'setTitle', title: 'PROJ-9' }), moderatorOnly],
  ['reveal', () => ({ type: 'reveal' }), moderatorOnly],
  ['newRound', () => ({ type: 'newRound', keepTitle: true }), moderatorOnly],
  ['startTimer', () => ({ type: 'startTimer' }), moderatorOnly],
  ['stopTimer', () => ({ type: 'stopTimer' }), moderatorOnly],
  [
    'removeParticipant',
    (actor) => ({ type: 'removeParticipant', participantId: target(actor) }),
    moderatorOnly,
  ],
  ['promote', (actor) => ({ type: 'promote', participantId: target(actor) }), moderatorOnly],
];

describe('authorization matrix', () => {
  for (const [name, build, allowed] of matrix) {
    for (const actor of ['m', 'a', 's'] as const) {
      const verdict = allowed[actor] ? 'allows' : 'refuses';
      it(`${verdict} ${name} from ${actor}`, () => {
        const state = base();
        const outcome = apply(state, msg(actor, build(actor)), 1_000);
        if (allowed[actor]) {
          expect(outcome.effects).not.toContainEqual(forbidden(actor));
        } else {
          expect(outcome.state).toBe(state);
          expect(outcome.effects).toEqual([forbidden(actor)]);
        }
      });
    }
  }

  it('covers every client message type', () => {
    const covered = matrix.map(([name]) => name).sort();
    expect(covered).toEqual(
      [
        'clearVote',
        'newRound',
        'promote',
        'removeParticipant',
        'reveal',
        'setRole',
        'setTitle',
        'startTimer',
        'stopTimer',
        'vote',
      ].sort(),
    );
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm --filter @pokerji/poker-engine test`
Expected: FAIL in the four new files. `canChangeDeck` is not exported, and timer and moderation messages are denied for the moderator.

- [ ] **Step 6: Implement timer and settings**

`packages/poker-engine/src/timer.ts`:

```ts
import { ok } from './outcome.ts';
import type { Outcome, RoomState } from './state.ts';

/** Ends a running timer once its deadline passes. It never reveals. */
export function expireTimer(state: RoomState, now: number): Outcome {
  if (state.timerEndsAt === null || now < state.timerEndsAt) return ok(state);
  return ok({ ...state, timerEndsAt: null }, [
    { type: 'announce', message: { type: 'timerExpired' } },
  ]);
}
```

`packages/poker-engine/src/settings.ts`:

```ts
import type { Deck } from '@pokerji/protocol';
import { freshRound, ok } from './outcome.ts';
import type { Outcome, RoomSettings, RoomState } from './state.ts';

/** A deck may change after a reveal, or during voting before anyone has voted. */
export function canChangeDeck(state: RoomState): boolean {
  return (
    state.phase === 'revealed' ||
    (state.phase === 'voting' && state.participants.every((p) => p.vote === null))
  );
}

const sameDeck = (a: Deck, b: Deck) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applies settings saved by a moderator. A deck change starts a new round and
 * keeps the title. If the deck may not change now, nothing is applied: the
 * host is expected to have checked canChangeDeck before saving.
 */
export function applySettings(state: RoomState, settings: RoomSettings): Outcome {
  const deckChanged = !sameDeck(state.deck, settings.deck);
  if (deckChanged && !canChangeDeck(state)) return ok(state);
  const next: RoomState = {
    ...state,
    timerSeconds: settings.timerSeconds,
    music: settings.music,
    timerEndsAt: settings.timerSeconds === null ? null : state.timerEndsAt,
  };
  return ok(deckChanged ? freshRound({ ...next, deck: settings.deck }, state.title) : next);
}
```

- [ ] **Step 7: Complete the client message handler**

In `packages/poker-engine/src/client.ts`, change the first import line to:

```ts
import { deny, find, freshRound, ok, patch, without } from './outcome.ts';
```

Then replace these two lines at the end of the `switch`:

```ts
    default:
      return deny(state, from);
```

with:

```ts
    case 'startTimer':
      if (!actor.moderator || state.phase !== 'voting' || state.timerSeconds === null) {
        return deny(state, from);
      }
      return ok({ ...state, timerEndsAt: now + state.timerSeconds * 1000 });
    case 'stopTimer':
      if (!actor.moderator || state.timerEndsAt === null) return deny(state, from);
      return ok({ ...state, timerEndsAt: null });
    case 'removeParticipant': {
      const target = find(state, message.participantId);
      if (!actor.moderator || !target || target.id === from || target.moderator) {
        return deny(state, from);
      }
      return ok(without(state, [target.id]), [
        { type: 'send', to: target.id, message: { type: 'removed' } },
        { type: 'close', id: target.id },
        { type: 'deleteSession', id: target.id },
      ]);
    }
    case 'promote': {
      const target = find(state, message.participantId);
      if (!actor.moderator || !target) return deny(state, from);
      if (target.moderator) return ok(state);
      return ok(patch(state, target.id, { moderator: true }), [
        { type: 'persistModerator', id: target.id },
      ]);
    }
```

The `switch` now has a case for every message type and no `default`.

- [ ] **Step 8: Complete apply**

Replace `packages/poker-engine/src/apply.ts` with:

```ts
import { handleClient } from './client.ts';
import { find, ok, patch } from './outcome.ts';
import { disconnect, dropStale, evict, join } from './presence.ts';
import { revealIfDue, roundSaved } from './round.ts';
import { applySettings } from './settings.ts';
import type { Command, Outcome, RoomState } from './state.ts';
import { expireTimer } from './timer.ts';

/** The engine's single entry point. Pure: same inputs, same outputs. */
export function apply(state: RoomState, command: Command, now: number): Outcome {
  switch (command.type) {
    case 'join':
      return join(state, command.participant);
    case 'disconnect':
      return disconnect(state, command.id, now);
    case 'evict':
      return evict(state, command.ids);
    case 'grantModerator':
      return find(state, command.id) ? ok(patch(state, command.id, { moderator: true })) : ok(state);
    case 'client':
      return handleClient(state, command.from, command.message, now);
    case 'roundSaved':
      return roundSaved(state, command.seq, command.ok);
    case 'settings':
      return applySettings(state, command.settings);
    case 'tick':
      return tick(state, now);
  }
}

/** Time-driven changes, in order: finish the count, expire the timer, drop the long-absent. */
function tick(state: RoomState, now: number): Outcome {
  const revealed = revealIfDue(state, now);
  const timed = expireTimer(revealed.state, now);
  return ok(dropStale(timed.state, now), [...revealed.effects, ...timed.effects]);
}
```

Replace `packages/poker-engine/src/index.ts` with:

```ts
export * from './apply.ts';
export * from './result.ts';
export { canChangeDeck } from './settings.ts';
export * from './snapshot.ts';
export * from './state.ts';
```

- [ ] **Step 9: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck && pnpm format:check`
Expected: every test in both packages PASSES, typecheck prints nothing, and the format check reports no files. If the format check lists files, run `pnpm format` and re-run it.

- [ ] **Step 10: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: add moderation, timer, settings and the authorization matrix" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

1. Run `pnpm test && pnpm typecheck` once more from the repository root and confirm both pass.
2. Request an Octopus code review of the `feat/poker-core` branch (`octo:skills:octopus-code-review`), with attention to vote secrecy in `snapshot.ts` and the authorization checks in `client.ts`. Address findings using superpowers:receiving-code-review.
3. Use superpowers:finishing-a-development-branch to decide how the branch is integrated.
4. Write Plan 2 (Server) against the interfaces that now exist.
