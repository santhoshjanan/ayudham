# Text Tools Core (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/text-tools`, the framework-free package that holds every rule of the text tools: unbiased sampling, the six generators, the six converters and the word list reader, plus the vendored EFF word list.

**Architecture:** A pure package in the style of `packages/schema-builder`: plain TypeScript, no I/O, no DOM, no framework, no dependency, tested with Vitest. Randomness and the clock are arguments, so every test is deterministic. Every public function returns a `Result` and none throws on any input.

**Tech Stack:** Node 24+ (26.10 installed locally), pnpm 11.25, TypeScript 7.0, Vitest 5.0, Prettier 3.9.

**Spec:** `docs/superpowers/specs/2026-10-14-text-tools-design.md`

## Where this plan sits

| Plan | Delivers | Written when |
|---|---|---|
| **1. Core (this plan)** | `packages/text-tools` and the vendored word list | Now |
| **2. Page and release** | Impeccable design direction; the `/text` page; bar, home page, sitemap and privacy page changes; browser tests; screenshots; document updates; Octopus code review and security audit | After Plan 1 lands, against its real interfaces |

The code and tests in this plan were extracted and run on 2026-10-14 (Node 26.10, Vitest 5.0.3): every test passes, apart from the word list file test in Task 4, which needs the download.

## Global Constraints

- Node `>=24`. Package manager is pnpm; do not use npm or yarn.
- TypeScript `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. No enums, no parameter properties, no namespaces.
- Relative imports include the `.ts` extension (`./limits.ts`).
- The package has no dependencies. Do not add one.
- Nothing under `packages/text-tools/src` may import a Node built-in or contain the words `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `fetch`, `crypto`, `atob`, `btoa`, `Date` or `Math.random`, in code or in a comment. Task 1 adds a test that enforces this. The only platform objects allowed are `TextEncoder` and `TextDecoder`.
- Randomness is always the `random` argument. The clock is always the `now` argument.
- Never take a remainder of a random value to choose something. Every choice goes through `below` (Task 2).
- Every exported function that takes typed text or an option returns a `Result`. None throws, whatever it is given.
- Limits, copied from the spec: password length 8 to 256; random string 1 to 256 characters or 1 to 128 bytes; 1 to 100 results at once; 3 to 12 passphrase words; 4 to 12 PIN digits; number bounds ±1,000,000,000,000,000; 2 to 1,000 sides on a die; 2 to 256 distinct characters in an own alphabet; 100,000 characters of typed text; 1,000 redraws before a sampler gives up.
- Regular expressions run on up to 100,000 typed characters. Do not add one that can backtrack over a long run; trimming punctuation off a word is done with loops for that reason (Task 8).
- Format with `pnpm format` before each commit. The code blocks in this plan are not formatted (`.prettierignore` covers `docs/`), so expect it to rewrap some lines. End commit messages with the session's attribution line.

## Review Focus

Inputs the spec implies but does not spell out, most likely first. Each has a test in the task named.

1. **An option that is not a whole number** (a form field gives `NaN`, `12.5`, `Infinity`, or a string): every generator refuses it with `out-of-range`. Tests in Task 11.
2. **A random source that throws, returns too few bytes, or returns a plain array**: every generator answers `no-random`, never a short or predictable result. Tests in Tasks 2 and 11.
3. **Text ending in a line break, or with Windows line endings**: no phantom blank item in a pick, a sort or a line count, and no stray `\r` in a result. Tests in Tasks 1, 7 and 9.
4. **Emoji and lone surrogates**: an own alphabet of emoji picks whole characters; case conversion, encoding and counting never throw on half a surrogate pair. Tests in Tasks 5 and 11.
5. **A word list changed in transit** (Windows line endings, a byte-order mark, a blank line added): the reader refuses it instead of producing words with invisible characters. Tests in Task 4.

## File Structure

```
packages/text-tools/
  package.json  tsconfig.json  vitest.config.ts
  src/
    index.ts        what the page may import
    limits.ts       LIMITS
    result.ts       Result, Problem, ok, refuse, whole, explain
    text.ts         checkText, splitLines, listLines
    random.ts       RandomSource, bytes, below, pickFrom, shuffled, guard, many
    alphabets.ts    the fixed character sets
    password.ts     password, passwordBits, countAllowed
    wordlist.ts     WORD_COUNT, WORD_LIST_SHA256, readWordList
    passphrase.ts   passphrase, passphraseBits
    bytes.ts        utf8, fromUtf8, toHex, toBase64
    strings.ts      randomString, stringBits, checkAlphabet
    numbers.ts      pin, numberBetween
    ids.ts          identifier
    chance.ts       dice, coins, pick
    cases.ts        convertCase, allCases, words
    slug.ts         slug
    lines.ts        lines
    count.ts        count
    entities.ts     the HTML entity table, encodeEntities, decodeEntities
    encode.ts       encode, decode
  test/
    helpers.ts      feed, seeded, ALL_BYTES
    one test file per source file, plus purity, wordlist-file and robustness
apps/web/static/text/
  eff_large_wordlist.txt   exactly as published
  LICENSES.md
```

---

### Task 1: The package, its limits and its results

**Files:**
- Create: `packages/text-tools/package.json`, `packages/text-tools/tsconfig.json`, `packages/text-tools/vitest.config.ts`
- Create: `packages/text-tools/src/limits.ts`, `src/result.ts`, `src/text.ts`, `src/index.ts`
- Test: `packages/text-tools/test/purity.test.ts`, `test/result.test.ts`, `test/text.test.ts`

**Interfaces:**
- Produces: `LIMITS`; `type Problem`; `PROBLEMS`; `type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem }`; `ok(value)`; `refuse(problem)`; `whole(value: unknown, min: number, max: number): value is number`; `explain(problem: Problem): string`; `checkText(text: unknown): Result<string>`; `splitLines(text: string): string[]`; `listLines(text: string): string[]`.

- [ ] **Step 1: Create the package files**

Create `packages/text-tools/package.json`:

```json
{
  "name": "@pokerji/text-tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "devDependencies": {
    "@types/node": "^24.0.0"
  }
}
```

Create `packages/text-tools/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

Create `packages/text-tools/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({});
```

Run: `pnpm install`
Expected: the workspace gains `@pokerji/text-tools`; no new package is downloaded.

- [ ] **Step 2: Write the failing tests**

Create `packages/text-tools/test/purity.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

describe('the package source', () => {
  it('imports no Node built-in, touches no browser global, and has no clock or random source of its own', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((name) =>
      name.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(`${SRC}/${name}`, 'utf8');
      expect(source, name).not.toMatch(/from 'node:/);
      expect(source, name).not.toMatch(
        /\b(window|document|localStorage|sessionStorage|navigator|fetch|crypto|atob|btoa|Date)\b/,
      );
      expect(source, name).not.toMatch(/Math\.random/);
    }
  });
});
```

Create `packages/text-tools/test/result.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { explain, ok, PROBLEMS, refuse, whole } from '../src/index.ts';

describe('results', () => {
  it('wraps a value and a refusal', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(refuse('too-long')).toEqual({ ok: false, problem: 'too-long' });
  });

  it('has a sentence for every problem', () => {
    for (const problem of PROBLEMS) {
      expect(explain(problem), problem).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe('whole', () => {
  it('accepts only whole numbers inside the bounds', () => {
    expect(whole(8, 8, 256)).toBe(true);
    expect(whole(256, 8, 256)).toBe(true);
    for (const bad of [7, 257, 8.5, NaN, Infinity, -Infinity, '12', null, undefined, {}, 12n]) {
      expect(whole(bad, 8, 256), String(bad)).toBe(false);
    }
  });
});
```

Create `packages/text-tools/test/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkText, LIMITS, listLines, splitLines } from '../src/index.ts';

describe('checkText', () => {
  it('accepts text up to the limit and refuses more', () => {
    expect(checkText('x'.repeat(LIMITS.text))).toEqual({ ok: true, value: 'x'.repeat(LIMITS.text) });
    expect(checkText('x'.repeat(LIMITS.text + 1))).toEqual({ ok: false, problem: 'too-long' });
  });

  it('refuses anything that is not text', () => {
    for (const bad of [undefined, null, 3, {}, ['a']]) {
      expect(checkText(bad)).toEqual({ ok: false, problem: 'too-long' });
    }
  });
});

describe('lines', () => {
  it('splits at every kind of line ending', () => {
    expect(splitLines('a\r\nb\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitLines('')).toEqual(['']);
  });

  it('does not count an empty line after a final line break', () => {
    expect(listLines('')).toEqual([]);
    expect(listLines('a')).toEqual(['a']);
    expect(listLines('a\n')).toEqual(['a']);
    expect(listLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(listLines('a\n\n')).toEqual(['a', '']);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: FAIL, `Cannot find module '../src/index.ts'` (the purity test fails on an empty `src`).

- [ ] **Step 4: Write the implementation**

Create `packages/text-tools/src/limits.ts`:

```ts
/** Every bound in the package. The page's fields carry the same numbers. */
export const LIMITS = {
  passwordMin: 8,
  /** Characters in one generated password or string. */
  length: 256,
  /** Bytes in one generated hex or Base64 string. */
  bytes: 128,
  /** Results made at once. */
  results: 100,
  wordsMin: 3,
  wordsMax: 12,
  pinMin: 4,
  pinMax: 12,
  /** A number's bounds lie between minus this and this. */
  bound: 1_000_000_000_000_000,
  sidesMin: 2,
  sidesMax: 1_000,
  alphabetMin: 2,
  alphabetMax: 256,
  /** Characters of typed text in any one box. */
  text: 100_000,
  /** Draws a sampler makes before it gives up on its source. */
  redraws: 1_000,
} as const;
```

Create `packages/text-tools/src/result.ts`:

```ts
import { LIMITS } from './limits.ts';

export const PROBLEMS = [
  'too-long',
  'out-of-range',
  'no-classes',
  'alphabet-size',
  'alphabet-space',
  'alphabet-repeat',
  'no-random',
  'bad-word-list',
  'empty-list',
  'bad-base64',
  'bad-hex',
  'odd-hex',
  'bad-percent',
] as const;

export type Problem = (typeof PROBLEMS)[number];

export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const refuse = (problem: Problem): Result<never> => ({ ok: false, problem });

/** True for a whole number from `min` to `max`. Options arrive from form fields, so anything can. */
export function whole(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

const SENTENCES: Record<Problem, string> = {
  'too-long': `That is more than ${LIMITS.text.toLocaleString('en')} characters, the most this tool takes.`,
  'out-of-range': 'That value is outside what this tool allows.',
  'no-classes': 'Choose at least one kind of character.',
  'alphabet-size': `An alphabet needs between ${LIMITS.alphabetMin} and ${LIMITS.alphabetMax} characters.`,
  'alphabet-space': 'An alphabet cannot contain white space or control characters.',
  'alphabet-repeat': 'An alphabet cannot contain the same character twice.',
  'no-random': 'This browser did not supply random numbers, so nothing was generated.',
  'bad-word-list': 'The word list could not be read.',
  'empty-list': 'Type at least one line to pick from.',
  'bad-base64': 'That is not Base64: it has a character or a length that Base64 never has.',
  'bad-hex': 'That is not hex: only 0 to 9 and a to f are allowed.',
  'odd-hex': 'That is not hex: it has an odd number of digits.',
  'bad-percent': 'That has a % that is not followed by two hex digits.',
};

export const explain = (problem: Problem): string => SENTENCES[problem];
```

Create `packages/text-tools/src/text.ts`:

```ts
import { LIMITS } from './limits.ts';
import { ok, refuse, type Result } from './result.ts';

/** The first check of every function that takes typed text. */
export function checkText(text: unknown): Result<string> {
  return typeof text === 'string' && text.length <= LIMITS.text ? ok(text) : refuse('too-long');
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

/** The lines of a list. An empty line after a final line break is not a line. */
export function listLines(text: string): string[] {
  const list = splitLines(text);
  if (list.at(-1) === '') list.pop();
  return list;
}
```

Create `packages/text-tools/src/index.ts`:

```ts
export * from './limits.ts';
export * from './result.ts';
export * from './text.ts';
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm --filter @pokerji/text-tools test && pnpm --filter @pokerji/text-tools typecheck`
Expected: PASS, 3 files; no type errors.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/text-tools pnpm-lock.yaml
git commit -m "feat: the text-tools package, with its limits and results"
```

---

### Task 2: Sampling without bias

**Files:**
- Create: `packages/text-tools/src/random.ts`, `packages/text-tools/test/helpers.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/random.test.ts`

**Interfaces:**
- Consumes: `LIMITS`, `ok`, `refuse`, `whole`, `Result`.
- Produces, from `src/random.ts`: `type RandomSource = (count: number) => Uint8Array`; `class RandomFailure`; `bytes(count: number, random: RandomSource): Uint8Array`; `below(n: number, random: RandomSource): number`; `pickFrom(alphabet: readonly string[], length: number, random: RandomSource): string`; `shuffled<T>(items: readonly T[], random: RandomSource): T[]`; `guard<T>(make: () => T): Result<T>`; `many<T>(count: unknown, one: () => Result<T>): Result<T[]>`. The first five throw `RandomFailure`; later tasks call them only inside `guard`. Only `many` and the type are exported from the index.
- Produces, from `test/helpers.ts`: `feed(values: number[]): RandomSource`, `seeded(seed?: number): RandomSource`, `ALL_BYTES: number[]`.

- [ ] **Step 1: Write the test helpers and the failing test**

Create `packages/text-tools/test/helpers.ts`:

```ts
import type { RandomSource } from '../src/index.ts';

/** Hands out the given bytes in order, starting again when they run out. */
export function feed(values: number[]): RandomSource {
  let at = 0;
  return (count) => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = values[at++ % values.length]!;
    return out;
  };
}

/** A repeatable stream of well-mixed bytes (xorshift32). For tests only. */
export function seeded(seed = 0x9e3779b9): RandomSource {
  let state = seed >>> 0 || 1;
  return (count) => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      state = (state ^ (state << 13)) >>> 0;
      state = (state ^ (state >>> 17)) >>> 0;
      state = (state ^ (state << 5)) >>> 0;
      out[i] = state & 0xff;
    }
    return out;
  };
}

export const ALL_BYTES = Array.from({ length: 256 }, (_, i) => i);
```

Create `packages/text-tools/test/random.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { many, ok, refuse } from '../src/index.ts';
import { below, bytes, guard, pickFrom, RandomFailure, shuffled } from '../src/random.ts';
import { ALL_BYTES, feed, seeded } from './helpers.ts';

describe('bytes', () => {
  it('returns what the source gave', () => {
    expect([...bytes(3, feed([1, 2, 3]))]).toEqual([1, 2, 3]);
  });

  it('refuses a source that throws, miscounts or returns the wrong thing', () => {
    expect(() =>
      bytes(4, () => {
        throw new Error('no');
      }),
    ).toThrow(RandomFailure);
    expect(() => bytes(4, () => new Uint8Array(3))).toThrow(RandomFailure);
    expect(() => bytes(4, () => new Uint8Array(5))).toThrow(RandomFailure);
    expect(() => bytes(4, () => [1, 2, 3, 4] as unknown as Uint8Array)).toThrow(RandomFailure);
  });
});

describe('below', () => {
  it('draws again instead of taking a remainder', () => {
    // 6 needs three bits: 7 and 6 are thrown away, 5 is kept.
    expect(below(6, feed([7, 6, 5]))).toBe(5);
  });

  it('uses the low bits of the first byte only', () => {
    expect(below(6, feed([0b1111_1010]))).toBe(2);
  });

  it('draws as many bytes as the number needs', () => {
    // 300 needs nine bits: 0x1ff is thrown away, 0x12b is 299.
    expect(below(300, feed([0xff, 0xff, 0x01, 0x2b]))).toBe(299);
  });

  it('needs no draw when there is one outcome', () => {
    expect(
      below(1, () => {
        throw new Error('not called');
      }),
    ).toBe(0);
  });

  it('gives every outcome equally often over every byte value', () => {
    const random = feed(ALL_BYTES);
    const seen = [0, 0, 0, 0, 0, 0];
    // Of 256 bytes, 192 are kept: 32 for each of the six outcomes.
    for (let i = 0; i < 192; i++) seen[below(6, random)]!++;
    expect(seen).toEqual([32, 32, 32, 32, 32, 32]);
  });

  it('reaches the largest bound the package uses', () => {
    const top = 2 * 1_000_000_000_000_000 + 1;
    const random = seeded();
    for (let i = 0; i < 500; i++) {
      const value = below(top, random);
      expect(Number.isSafeInteger(value) && value >= 0 && value < top).toBe(true);
    }
  });

  it('gives up on a source that never yields a usable value', () => {
    expect(() => below(6, feed([7]))).toThrow(RandomFailure);
  });

  it('refuses a bound that is not a whole number of at least one', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => below(bad, seeded())).toThrow(RandomFailure);
    }
  });
});

describe('pickFrom', () => {
  it('picks one character for each place', () => {
    expect(pickFrom(['x', 'y'], 4, feed([0, 1, 1, 0]))).toBe('xyyx');
  });
});

describe('shuffled', () => {
  it('swaps from the end, leaving the original alone', () => {
    const original = [1, 2, 3];
    expect(shuffled(original, feed([0, 1]))).toEqual([3, 2, 1]);
    expect(original).toEqual([1, 2, 3]);
  });

  it('gives each order about equally often', () => {
    const random = seeded();
    const seen = new Map<string, number>();
    for (let i = 0; i < 6_000; i++) {
      const order = shuffled(['a', 'b', 'c'], random).join('');
      seen.set(order, (seen.get(order) ?? 0) + 1);
    }
    expect(seen.size).toBe(6);
    for (const count of seen.values()) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1_150);
    }
  });
});

describe('guard', () => {
  it('turns a failed source into a refusal and lets other errors through', () => {
    expect(guard(() => 'fine')).toEqual(ok('fine'));
    expect(guard(() => below(6, feed([7])))).toEqual(refuse('no-random'));
    expect(() =>
      guard(() => {
        throw new TypeError('a bug');
      }),
    ).toThrow(TypeError);
  });
});

describe('many', () => {
  it('makes the number asked for', () => {
    let made = 0;
    expect(many(3, () => ok(++made))).toEqual(ok([1, 2, 3]));
  });

  it('refuses a number outside 1 to 100', () => {
    for (const bad of [0, 101, 2.5, NaN, '3']) {
      expect(many(bad, () => ok('x'))).toEqual(refuse('out-of-range'));
    }
  });

  it('stops at the first refusal', () => {
    let made = 0;
    expect(many(5, () => (++made === 2 ? refuse('no-random') : ok(made)))).toEqual(
      refuse('no-random'),
    );
    expect(made).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/random.test.ts`
Expected: FAIL, `Cannot find module '../src/random.ts'`.

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/random.ts`:

```ts
import { LIMITS } from './limits.ts';
import { ok, refuse, whole, type Result } from './result.ts';

/** Must return `count` fresh random bytes. The page passes the browser's own source. */
export type RandomSource = (count: number) => Uint8Array;

/** The source threw, miscounted, or never produced a usable value. */
export class RandomFailure extends Error {}

export function bytes(count: number, random: RandomSource): Uint8Array {
  let drawn: unknown;
  try {
    drawn = random(count);
  } catch {
    throw new RandomFailure();
  }
  if (!(drawn instanceof Uint8Array) || drawn.length !== count) throw new RandomFailure();
  return drawn;
}

/**
 * A whole number from 0 to n - 1, each equally likely. Draws just enough bits, and draws again
 * when the value is n or more, so no outcome is favoured. At least half of all draws are kept.
 */
export function below(n: number, random: RandomSource): number {
  if (!Number.isSafeInteger(n) || n < 1) throw new RandomFailure();
  if (n === 1) return 0;
  let bits = 0;
  for (let rest = n - 1; rest > 0; rest = Math.floor(rest / 2)) bits++;
  const size = Math.ceil(bits / 8);
  const mask = 0xff >> (size * 8 - bits);
  for (let attempt = 0; attempt < LIMITS.redraws; attempt++) {
    const drawn = bytes(size, random);
    let value = drawn[0]! & mask;
    // Multiplying, not shifting: a bound can need up to 53 bits.
    for (let i = 1; i < size; i++) value = value * 256 + drawn[i]!;
    if (value < n) return value;
  }
  throw new RandomFailure();
}

export function pickFrom(alphabet: readonly string[], length: number, random: RandomSource): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[below(alphabet.length, random)]!;
  return out;
}

/** A new array in a random order (Fisher-Yates). */
export function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(i + 1, random);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Runs a generator, answering a failed source with a refusal. */
export function guard<T>(make: () => T): Result<T> {
  try {
    return ok(make());
  } catch (error) {
    if (error instanceof RandomFailure) return refuse('no-random');
    throw error;
  }
}

/** Several results, each made independently. */
export function many<T>(count: unknown, one: () => Result<T>): Result<T[]> {
  if (!whole(count, 1, LIMITS.results)) return refuse('out-of-range');
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const made = one();
    if (!made.ok) return made;
    out.push(made.value);
  }
  return ok(out);
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export { many, type RandomSource } from './random.ts';
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: unbiased sampling for the text tools"
```

---

### Task 3: Passwords

**Files:**
- Create: `packages/text-tools/src/alphabets.ts`, `packages/text-tools/src/password.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/password.test.ts`

**Interfaces:**
- Consumes: `below`, `guard`, `RandomFailure`, `RandomSource` from `./random.ts`; `LIMITS`, `ok`, `refuse`, `whole`, `Result`.
- Produces: `LOWER`, `UPPER`, `DIGITS`, `SYMBOLS`, `LOOKALIKES`, `BASE64`, `URL_SAFE`, `CROCKFORD` (strings); `type PasswordOptions = { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean; plain: boolean }` (`plain` is "no look-alikes"); `PASSWORD_DEFAULTS`; `password(options, random): Result<string>`; `passwordBits(options): Result<number>`; `countAllowed(sizes: number[], length: number): bigint`.

- [ ] **Step 1: Write the failing test**

Create `packages/text-tools/test/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  countAllowed,
  DIGITS,
  LOOKALIKES,
  LOWER,
  password,
  PASSWORD_DEFAULTS,
  passwordBits,
  refuse,
  SYMBOLS,
  UPPER,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const only = (on: Partial<typeof PASSWORD_DEFAULTS>) => ({
  ...PASSWORD_DEFAULTS,
  lower: false,
  upper: false,
  digits: false,
  symbols: false,
  ...on,
});

describe('password', () => {
  it('has the length asked for and a character of every class that is on', () => {
    const random = seeded();
    for (let i = 0; i < 200; i++) {
      const made = password(PASSWORD_DEFAULTS, random);
      if (!made.ok) throw new Error(made.problem);
      const chars = [...made.value];
      expect(chars).toHaveLength(20);
      for (const set of [LOWER, UPPER, DIGITS, SYMBOLS]) {
        expect(chars.some((char) => set.includes(char))).toBe(true);
      }
    }
  });

  it('uses only the classes that are on', () => {
    const made = password(only({ digits: true, length: 8 }), seeded());
    expect(made.ok && /^[0-9]{8}$/.test(made.value)).toBe(true);
  });

  it('leaves out look-alikes when asked', () => {
    const random = seeded();
    for (let i = 0; i < 200; i++) {
      const made = password({ ...PASSWORD_DEFAULTS, plain: true }, random);
      if (!made.ok) throw new Error(made.problem);
      for (const char of made.value) expect(LOOKALIKES.includes(char)).toBe(false);
    }
  });

  it('draws the whole password again when a class is missing', () => {
    // Lowercase and digits: 36 characters, 'a' at 0 and '0' at 26.
    // The first eight draws spell aaaaaaaa, which has no digit and is thrown away.
    const random = feed([...Array<number>(15).fill(0), 26]);
    expect(password(only({ lower: true, digits: true, length: 8 }), random)).toEqual({
      ok: true,
      value: 'aaaaaaa0',
    });
  });

  it('refuses a length outside 8 to 256, and no classes at all', () => {
    for (const length of [7, 257, 20.5, NaN]) {
      expect(password({ ...PASSWORD_DEFAULTS, length }, seeded())).toEqual(refuse('out-of-range'));
    }
    expect(password(only({}), seeded())).toEqual(refuse('no-classes'));
  });

  it('answers a failed source with a refusal', () => {
    expect(password(PASSWORD_DEFAULTS, feed([0xff]))).toEqual(refuse('no-random'));
  });
});

describe('countAllowed', () => {
  it('matches a count made by trying every password', () => {
    const cases: Array<[number[], number]> = [
      [[2, 1, 3], 4],
      [[1, 1], 3],
      [[3], 5],
      [[2, 2, 2, 2], 4],
      [[2, 3], 1],
    ];
    for (const [sizes, length] of cases) {
      const owner = sizes.flatMap((size, set) => Array<number>(size).fill(set));
      let allowed = 0;
      const total = owner.length ** length;
      for (let code = 0; code < total; code++) {
        const seen = new Set<number>();
        for (let rest = code, i = 0; i < length; i++, rest = Math.floor(rest / owner.length)) {
          seen.add(owner[rest % owner.length]!);
        }
        if (seen.size === sizes.length) allowed++;
      }
      expect(countAllowed(sizes, length), `${sizes} x ${length}`).toBe(BigInt(allowed));
    }
  });
});

describe('passwordBits', () => {
  it('is the whole number of bits in the count of allowed passwords', () => {
    expect(passwordBits(PASSWORD_DEFAULTS)).toEqual({ ok: true, value: 128 });
    expect(passwordBits({ ...PASSWORD_DEFAULTS, plain: true })).toEqual({ ok: true, value: 126 });
    expect(passwordBits(only({ digits: true, length: 8 }))).toEqual({ ok: true, value: 26 });
    expect(passwordBits({ ...PASSWORD_DEFAULTS, length: 256 })).toEqual({ ok: true, value: 1645 });
  });

  it('never claims more than length times the bits of one character', () => {
    for (const length of [8, 9, 12, 40]) {
      const bits = passwordBits({ ...PASSWORD_DEFAULTS, length });
      expect(bits.ok && bits.value <= length * Math.log2(86)).toBe(true);
    }
  });

  it('refuses what password refuses', () => {
    expect(passwordBits({ ...PASSWORD_DEFAULTS, length: 7 })).toEqual(refuse('out-of-range'));
    expect(passwordBits(only({}))).toEqual(refuse('no-classes'));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/password.test.ts`
Expected: FAIL, `password is not a function` (or a missing export).

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/alphabets.ts`:

```ts
export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/';

/** Characters easily mistaken for one another, left out on request. */
export const LOOKALIKES = '0Oo1lI|';

export const BASE64 = UPPER + LOWER + DIGITS + '+/';
export const URL_SAFE = UPPER + LOWER + DIGITS + '-_';

/** Crockford's Base32, as ULID uses it: no I, L, O or U. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
```

Create `packages/text-tools/src/password.ts`:

```ts
import { DIGITS, LOOKALIKES, LOWER, SYMBOLS, UPPER } from './alphabets.ts';
import { LIMITS } from './limits.ts';
import { below, guard, RandomFailure, type RandomSource } from './random.ts';
import { ok, refuse, whole, type Result } from './result.ts';

export type PasswordOptions = {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** No look-alikes. */
  plain: boolean;
};

export const PASSWORD_DEFAULTS: PasswordOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  plain: false,
};

/** The classes that are on, each as its characters. */
function classes(options: PasswordOptions): Result<string[][]> {
  if (!whole(options.length, LIMITS.passwordMin, LIMITS.length)) return refuse('out-of-range');
  const on = [
    options.lower === true ? LOWER : '',
    options.upper === true ? UPPER : '',
    options.digits === true ? DIGITS : '',
    options.symbols === true ? SYMBOLS : '',
  ].filter((set) => set !== '');
  if (on.length === 0) return refuse('no-classes');
  return ok(
    on.map((set) => [...set].filter((char) => !(options.plain === true && LOOKALIKES.includes(char)))),
  );
}

/**
 * How many strings of `length` characters use every one of the classes, whose sizes are given.
 * Counted by inclusion and exclusion: all strings, less those missing one class, and so on.
 */
export function countAllowed(sizes: number[], length: number): bigint {
  const all = sizes.reduce((sum, size) => sum + size, 0);
  let count = 0n;
  for (let missing = 0; missing < 1 << sizes.length; missing++) {
    let left = all;
    let dropped = 0;
    sizes.forEach((size, i) => {
      if (missing & (1 << i)) {
        left -= size;
        dropped++;
      }
    });
    const term = BigInt(left) ** BigInt(length);
    count += dropped % 2 === 1 ? -term : term;
  }
  return count;
}

/** The strength of the rule, in whole bits, rounded down. */
export function passwordBits(options: PasswordOptions): Result<number> {
  const sets = classes(options);
  if (!sets.ok) return sets;
  const count = countAllowed(
    sets.value.map((set) => set.length),
    options.length,
  );
  return ok(count.toString(2).length - 1);
}

/**
 * A password with at least one character of every class that is on. It is drawn whole and drawn
 * again until it has them, so every allowed password is equally likely.
 */
export function password(options: PasswordOptions, random: RandomSource): Result<string> {
  const sets = classes(options);
  if (!sets.ok) return sets;
  const all = sets.value.flat();
  return guard(() => {
    for (let attempt = 0; attempt < LIMITS.redraws; attempt++) {
      const drawn = Array.from({ length: options.length }, () => all[below(all.length, random)]!);
      if (sets.value.every((set) => drawn.some((char) => set.includes(char)))) {
        return drawn.join('');
      }
    }
    throw new RandomFailure();
  });
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './alphabets.ts';
export * from './password.ts';
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: passwords with an exact strength figure"
```

---

### Task 4: The word list and passphrases

**Files:**
- Create: `apps/web/static/text/eff_large_wordlist.txt`, `apps/web/static/text/LICENSES.md`
- Create: `packages/text-tools/src/wordlist.ts`, `packages/text-tools/src/passphrase.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/wordlist.test.ts`, `test/wordlist-file.test.ts`, `test/passphrase.test.ts`

**Interfaces:**
- Consumes: `below`, `guard`, `RandomSource`; `LIMITS`, `ok`, `refuse`, `whole`, `Result`.
- Produces: `WORD_COUNT = 7776`; `WORD_LIST_SHA256: string`; `readWordList(text: unknown): Result<string[]>`; `SEPARATORS = ['-', ' ', '.', '_']`; `type Separator`; `type PassphraseOptions = { words: number; separator: Separator; capitals: boolean; digit: boolean }`; `PASSPHRASE_DEFAULTS`; `passphrase(options, list: readonly string[], random): Result<string>`; `passphraseBits(options): Result<number>`.

- [ ] **Step 1: Ask the owner, then download the word list**

**Stop and ask the owner before this step.** It downloads one file from eff.org: `eff_large_wordlist.txt`, about 108 kB, the EFF long word list (CC BY 3.0 US).

```bash
mkdir -p apps/web/static/text
curl --fail --silent --show-error --location \
  --output apps/web/static/text/eff_large_wordlist.txt \
  https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt
wc -l apps/web/static/text/eff_large_wordlist.txt
head -n 1 apps/web/static/text/eff_large_wordlist.txt
tail -n 1 apps/web/static/text/eff_large_wordlist.txt
shasum -a 256 apps/web/static/text/eff_large_wordlist.txt
```

Expected: 7776 lines; the first line is `11111`, a tab, `abacus`; the last is `66666`, a tab, `zoom`. If any of the three differs, stop: the file is not the published list. Keep the 64-character checksum for Steps 2 and 5. Do not edit or reformat the file. Prettier has no parser for `.txt`, so `pnpm format` leaves it alone.

- [ ] **Step 2: Record the licence**

Create `apps/web/static/text/LICENSES.md`, putting today's date and the checksum from Step 1 in the table's row:

```markdown
# Bundled word list

`eff_large_wordlist.txt` is the
[EFF long word list for passphrases](https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases),
made by the Electronic Frontier Foundation and published under the
[Creative Commons Attribution 3.0 United States licence](https://creativecommons.org/licenses/by/3.0/us/).

The file is exactly as published: 7,776 lines, each a dice number, a tab and a word. Nothing is
fetched from eff.org when the app is built or run. The passphrase tool fetches the file from this
site, checks its SHA-256 against the value in `packages/text-tools/src/wordlist.ts`, and then
checks its shape, before using a word.

To replace the file: download it again, put its checksum in the row below and in
`WORD_LIST_SHA256`. A test compares the three.

| File | Source | Fetched | SHA-256 |
|---|---|---|---|
| `eff_large_wordlist.txt` | https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt | FETCH-DATE | `CHECKSUM` |
```

- [ ] **Step 3: Write the failing tests**

Create `packages/text-tools/test/wordlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readWordList, refuse, WORD_COUNT } from '../src/index.ts';

/** A list in the published shape: a dice number, a tab, a word. */
function listText(change: (lines: string[]) => void = () => {}): string {
  const lines = Array.from({ length: WORD_COUNT }, (_, i) => {
    const dice = [...i.toString(6).padStart(5, '0')].map((digit) => Number(digit) + 1).join('');
    const word = [...i.toString(26).padStart(3, '0')]
      .map((digit) => String.fromCharCode(97 + parseInt(digit, 26)))
      .join('');
    return `${dice}\t${word}`;
  });
  change(lines);
  return lines.join('\n') + '\n';
}

describe('readWordList', () => {
  it('reads a list in the published shape', () => {
    const read = readWordList(listText());
    if (!read.ok) throw new Error(read.problem);
    expect(read.value).toHaveLength(WORD_COUNT);
    expect(read.value[0]).toBe('aaa');
    expect(read.value[1]).toBe('aab');
  });

  it('accepts hyphenated words and a missing final line break', () => {
    const text = listText((lines) => (lines[5] = '11116\tdrop-down'));
    expect(readWordList(text).ok).toBe(true);
    expect(readWordList(text.trimEnd()).ok).toBe(true);
  });

  it('refuses a list that is short, long or repeats a word', () => {
    expect(readWordList(listText((lines) => lines.pop()))).toEqual(refuse('bad-word-list'));
    expect(readWordList(listText((lines) => lines.push('11111\textra')))).toEqual(
      refuse('bad-word-list'),
    );
    expect(readWordList(listText((lines) => (lines[1] = lines[0]!)))).toEqual(
      refuse('bad-word-list'),
    );
  });

  it('refuses a list changed in transit', () => {
    expect(readWordList(listText().replaceAll('\n', '\r\n'))).toEqual(refuse('bad-word-list'));
    expect(readWordList('﻿' + listText())).toEqual(refuse('bad-word-list'));
    expect(readWordList(listText() + '\n')).toEqual(refuse('bad-word-list'));
  });

  it('refuses a misshapen line', () => {
    for (const line of ['11111 abacus', 'abacus', '11111\tAbacus', '11117\tabacus', '11111\ta b', '']) {
      expect(readWordList(listText((lines) => (lines[9] = line))), line).toEqual(
        refuse('bad-word-list'),
      );
    }
  });

  it('refuses anything that is not text', () => {
    for (const bad of [undefined, null, 5, ['a']]) {
      expect(readWordList(bad)).toEqual(refuse('bad-word-list'));
    }
  });
});
```

Create `packages/text-tools/test/wordlist-file.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readWordList, WORD_LIST_SHA256 } from '../src/index.ts';

const STATIC = fileURLToPath(new URL('../../../apps/web/static/text/', import.meta.url));

describe('the vendored word list', () => {
  const file = readFileSync(`${STATIC}eff_large_wordlist.txt`);

  it('has the checksum the package and the licence record give', () => {
    const sum = createHash('sha256').update(file).digest('hex');
    expect(WORD_LIST_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(sum).toBe(WORD_LIST_SHA256);
    expect(readFileSync(`${STATIC}LICENSES.md`, 'utf8')).toContain(`\`${sum}\``);
  });

  it('is read whole', () => {
    const read = readWordList(file.toString('utf8'));
    if (!read.ok) throw new Error(read.problem);
    expect(read.value).toHaveLength(7_776);
    expect(read.value[0]).toBe('abacus');
    expect(read.value.at(-1)).toBe('zoom');
  });
});
```

Create `packages/text-tools/test/passphrase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  passphrase,
  PASSPHRASE_DEFAULTS,
  passphraseBits,
  refuse,
  WORD_COUNT,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const LIST = Array.from({ length: WORD_COUNT }, (_, i) => `w${i}`);
const three = { ...PASSPHRASE_DEFAULTS, words: 3 };
// A word is two bytes: 7,776 needs thirteen bits.
const WORDS_012 = [0, 0, 0, 1, 0, 2];

describe('passphrase', () => {
  it('joins the words drawn with the separator', () => {
    expect(passphrase(three, LIST, feed(WORDS_012))).toEqual({ ok: true, value: 'w0-w1-w2' });
    expect(passphrase({ ...three, separator: ' ' }, LIST, feed(WORDS_012))).toEqual({
      ok: true,
      value: 'w0 w1 w2',
    });
  });

  it('can draw the last word of the list', () => {
    // 0x1e5f is 7,775.
    expect(passphrase(three, LIST, feed([0x1e, 0x5f]))).toEqual({
      ok: true,
      value: 'w7775-w7775-w7775',
    });
  });

  it('gives each word a capital when asked', () => {
    expect(passphrase({ ...three, capitals: true }, LIST, feed(WORDS_012))).toEqual({
      ok: true,
      value: 'W0-W1-W2',
    });
  });

  it('puts one digit after one word chosen at random', () => {
    // After the words: 1 picks the second word, 7 is the digit.
    expect(passphrase({ ...three, digit: true }, LIST, feed([...WORDS_012, 1, 7]))).toEqual({
      ok: true,
      value: 'w0-w17-w2',
    });
  });

  it('makes six words by default', () => {
    const made = passphrase(PASSPHRASE_DEFAULTS, LIST, seeded());
    expect(made.ok && made.value.split('-')).toHaveLength(6);
  });

  it('refuses a word count outside 3 to 12 and an unknown separator', () => {
    for (const words of [2, 13, 4.5, NaN]) {
      expect(passphrase({ ...three, words }, LIST, seeded())).toEqual(refuse('out-of-range'));
    }
    expect(passphrase({ ...three, separator: '' as '-' }, LIST, seeded())).toEqual(
      refuse('out-of-range'),
    );
  });

  it('refuses a list of the wrong length', () => {
    expect(passphrase(three, LIST.slice(1), seeded())).toEqual(refuse('bad-word-list'));
    expect(passphrase(three, 'abacus' as unknown as string[], seeded())).toEqual(
      refuse('bad-word-list'),
    );
  });

  it('answers a failed source with a refusal', () => {
    expect(passphrase(three, LIST, feed([0xff]))).toEqual(refuse('no-random'));
  });
});

describe('passphraseBits', () => {
  it('is words times the bits of one word, rounded down', () => {
    expect(passphraseBits(three)).toEqual({ ok: true, value: 38 });
    expect(passphraseBits(PASSPHRASE_DEFAULTS)).toEqual({ ok: true, value: 77 });
    expect(passphraseBits({ ...PASSPHRASE_DEFAULTS, words: 12 })).toEqual({ ok: true, value: 155 });
  });

  it('adds the digit and its place, and nothing for capitals', () => {
    expect(passphraseBits({ ...PASSPHRASE_DEFAULTS, digit: true })).toEqual({ ok: true, value: 83 });
    expect(passphraseBits({ ...PASSPHRASE_DEFAULTS, capitals: true })).toEqual({
      ok: true,
      value: 77,
    });
  });

  it('refuses what passphrase refuses', () => {
    expect(passphraseBits({ ...three, words: 2 })).toEqual(refuse('out-of-range'));
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/wordlist.test.ts test/wordlist-file.test.ts test/passphrase.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 5: Write the implementation**

Create `packages/text-tools/src/wordlist.ts`, replacing `CHECKSUM` with the 64 characters from Step 1:

```ts
import { ok, refuse, type Result } from './result.ts';

/** Words in the EFF long list: every outcome of five dice. */
export const WORD_COUNT = 7_776;

/** SHA-256 of `apps/web/static/text/eff_large_wordlist.txt`, which the page checks on arrival. */
export const WORD_LIST_SHA256 = 'CHECKSUM';

const LINE = /^[1-6]{5}\t([a-z]+(?:-[a-z]+)*)$/;

/**
 * The words of the list as published: a dice number, a tab and a word on each line. Anything
 * else is refused whole, so a changed list can never supply a word.
 */
export function readWordList(text: unknown): Result<string[]> {
  if (typeof text !== 'string') return refuse('bad-word-list');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== WORD_COUNT) return refuse('bad-word-list');
  const words = new Set<string>();
  for (const line of lines) {
    const match = LINE.exec(line);
    if (!match) return refuse('bad-word-list');
    words.add(match[1]!);
  }
  return words.size === WORD_COUNT ? ok([...words]) : refuse('bad-word-list');
}
```

Create `packages/text-tools/src/passphrase.ts`:

```ts
import { LIMITS } from './limits.ts';
import { below, guard, type RandomSource } from './random.ts';
import { ok, refuse, whole, type Result } from './result.ts';
import { WORD_COUNT } from './wordlist.ts';

export const SEPARATORS = ['-', ' ', '.', '_'] as const;
export type Separator = (typeof SEPARATORS)[number];

export type PassphraseOptions = {
  words: number;
  separator: Separator;
  /** A capital at the start of every word. Adds no strength. */
  capitals: boolean;
  /** One digit after one word chosen at random. */
  digit: boolean;
};

export const PASSPHRASE_DEFAULTS: PassphraseOptions = {
  words: 6,
  separator: '-',
  capitals: false,
  digit: false,
};

const allowed = (options: PassphraseOptions): boolean =>
  whole(options.words, LIMITS.wordsMin, LIMITS.wordsMax) &&
  SEPARATORS.includes(options.separator);

/** The strength of the rule, in whole bits, rounded down. */
export function passphraseBits(options: PassphraseOptions): Result<number> {
  if (!allowed(options)) return refuse('out-of-range');
  const digit = options.digit === true ? Math.log2(10 * options.words) : 0;
  return ok(Math.floor(options.words * Math.log2(WORD_COUNT) + digit));
}

/** Words from `list`, which must be the whole list as `readWordList` returned it. */
export function passphrase(
  options: PassphraseOptions,
  list: readonly string[],
  random: RandomSource,
): Result<string> {
  if (!allowed(options)) return refuse('out-of-range');
  if (!Array.isArray(list) || list.length !== WORD_COUNT) return refuse('bad-word-list');
  return guard(() => {
    const chosen = Array.from({ length: options.words }, () => {
      const word = String(list[below(WORD_COUNT, random)]);
      return options.capitals === true ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    });
    if (options.digit === true) {
      const at = below(chosen.length, random);
      chosen[at] += String(below(10, random));
    }
    return chosen.join(options.separator);
  });
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './wordlist.ts';
export * from './passphrase.ts';
```

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS, including both tests in `wordlist-file.test.ts`.

- [ ] **Step 7: Commit**

```bash
pnpm format
git status --short apps/web/static/text
git add packages/text-tools apps/web/static/text
git commit -m "feat: passphrases from the vendored EFF long word list"
```

Before committing, run `shasum -a 256 apps/web/static/text/eff_large_wordlist.txt` once more: it must still give the checksum from Step 1, proving the formatter left the file alone.

---

### Task 5: Random strings, PINs and numbers

**Files:**
- Create: `packages/text-tools/src/bytes.ts`, `src/strings.ts`, `src/numbers.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/bytes.test.ts`, `test/strings.test.ts`, `test/numbers.test.ts`

**Interfaces:**
- Consumes: `below`, `bytes`, `guard`, `pickFrom`, `RandomSource`; the alphabets; `LIMITS`, `ok`, `refuse`, `whole`, `Result`.
- Produces: `utf8(text: string): Uint8Array`; `fromUtf8(data: Uint8Array): string | null`; `toHex(data: Uint8Array): string`; `toBase64(data: Uint8Array, url?: boolean): string`; `STRING_KINDS`; `type StringKind = 'hex' | 'base64' | 'base64url' | 'digits' | 'letters' | 'alphanumeric' | 'own'`; `type LetterCase = 'lower' | 'upper' | 'both'`; `type StringOptions = { kind: StringKind; size: number; letters: LetterCase; alphabet: string }`; `STRING_SIZES: Record<StringKind, number>`; `checkAlphabet(text: unknown): Result<string[]>`; `randomString(options, random): Result<string>`; `stringBits(options): Result<number>`; `pin(digits: number, random): Result<string>`; `numberBetween(first: number, second: number, random): Result<number>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/text-tools/test/bytes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fromUtf8, toBase64, toHex, utf8 } from '../src/index.ts';

describe('byte helpers', () => {
  it('turns text into UTF-8 and back', () => {
    expect([...utf8('é€')]).toEqual([0xc3, 0xa9, 0xe2, 0x82, 0xac]);
    expect(fromUtf8(utf8('é€ 😀'))).toBe('é€ 😀');
  });

  it('keeps a byte-order mark instead of swallowing it', () => {
    expect(fromUtf8(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61))).toBe('﻿a');
  });

  it('answers null for bytes that are not text', () => {
    expect(fromUtf8(Uint8Array.of(0xff))).toBeNull();
    expect(fromUtf8(Uint8Array.of(0xc3))).toBeNull();
  });

  it('writes lowercase hex, two digits a byte', () => {
    expect(toHex(Uint8Array.of(0, 1, 0xab, 0xff))).toBe('0001abff');
    expect(toHex(new Uint8Array(0))).toBe('');
  });

  it('writes Base64 with padding and Base64URL without', () => {
    const cases: Array<[string, string, string]> = [
      ['', '', ''],
      ['f', 'Zg==', 'Zg'],
      ['fo', 'Zm8=', 'Zm8'],
      ['foo', 'Zm9v', 'Zm9v'],
      ['foob', 'Zm9vYg==', 'Zm9vYg'],
      ['>>>???', 'Pj4+Pz8/', 'Pj4-Pz8_'],
    ];
    for (const [text, padded, url] of cases) {
      expect(toBase64(utf8(text))).toBe(padded);
      expect(toBase64(utf8(text), true)).toBe(url);
    }
  });
});
```

Create `packages/text-tools/test/strings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  checkAlphabet,
  randomString,
  refuse,
  stringBits,
  STRING_KINDS,
  STRING_SIZES,
  type StringOptions,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const of = (kind: StringOptions['kind'], size: number, more: Partial<StringOptions> = {}) => ({
  kind,
  size,
  letters: 'both' as const,
  alphabet: '',
  ...more,
});

describe('randomString', () => {
  it('writes random bytes as hex, Base64 and Base64URL', () => {
    const DEADBEEF = [0xde, 0xad, 0xbe, 0xef];
    expect(randomString(of('hex', 4), feed(DEADBEEF))).toEqual({ ok: true, value: 'deadbeef' });
    expect(randomString(of('base64', 4), feed(DEADBEEF))).toEqual({ ok: true, value: '3q2+7w==' });
    expect(randomString(of('base64url', 4), feed(DEADBEEF))).toEqual({ ok: true, value: '3q2-7w' });
  });

  it('draws characters for the other kinds', () => {
    expect(randomString(of('digits', 5), feed([3, 1, 4, 1, 5]))).toEqual({ ok: true, value: '31415' });
    expect(randomString(of('letters', 3, { letters: 'lower' }), feed([0, 1, 25]))).toEqual({
      ok: true,
      value: 'abz',
    });
    expect(randomString(of('letters', 3, { letters: 'upper' }), feed([0, 1, 25]))).toEqual({
      ok: true,
      value: 'ABZ',
    });
    expect(randomString(of('letters', 2), feed([0, 26]))).toEqual({ ok: true, value: 'Aa' });
    expect(randomString(of('alphanumeric', 3), feed([0, 26, 52]))).toEqual({ ok: true, value: 'Aa0' });
    expect(randomString(of('own', 4, { alphabet: 'xy' }), feed([0, 1, 1, 0]))).toEqual({
      ok: true,
      value: 'xyyx',
    });
  });

  it('picks whole characters from an alphabet of emoji', () => {
    expect(randomString(of('own', 3, { alphabet: '😀😎' }), feed([1, 0, 1]))).toEqual({
      ok: true,
      value: '😎😀😎',
    });
  });

  it('holds to both ends of each size limit', () => {
    const hex = randomString(of('hex', 128), seeded());
    expect(hex.ok && hex.value).toHaveLength(256);
    expect(randomString(of('hex', 1), seeded()).ok).toBe(true);
    expect(randomString(of('hex', 129), seeded())).toEqual(refuse('out-of-range'));
    expect(randomString(of('hex', 0), seeded())).toEqual(refuse('out-of-range'));
    const digits = randomString(of('digits', 256), seeded());
    expect(digits.ok && digits.value).toHaveLength(256);
    expect(randomString(of('digits', 257), seeded())).toEqual(refuse('out-of-range'));
    expect(randomString(of('digits', 12.5), seeded())).toEqual(refuse('out-of-range'));
  });

  it('refuses an unknown kind and a bad alphabet', () => {
    expect(randomString(of('rot13' as 'hex', 4), seeded())).toEqual(refuse('out-of-range'));
    expect(randomString(of('own', 4, { alphabet: 'aa' }), seeded())).toEqual(refuse('alphabet-repeat'));
  });

  it('has a default size for every kind', () => {
    for (const kind of STRING_KINDS) {
      expect(randomString(of(kind, STRING_SIZES[kind], { alphabet: 'abc' }), seeded()).ok).toBe(true);
    }
  });
});

describe('checkAlphabet', () => {
  it('accepts distinct characters, counted as code points', () => {
    expect(checkAlphabet('ab')).toEqual({ ok: true, value: ['a', 'b'] });
    expect(checkAlphabet('😀😎')).toEqual({ ok: true, value: ['😀', '😎'] });
  });

  it('refuses too few, too many, repeats, white space and control characters', () => {
    expect(checkAlphabet('a')).toEqual(refuse('alphabet-size'));
    expect(checkAlphabet('')).toEqual(refuse('alphabet-size'));
    const wide = Array.from({ length: 257 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
    expect(checkAlphabet(wide)).toEqual(refuse('alphabet-size'));
    expect(checkAlphabet(wide.slice(0, 256)).ok).toBe(true);
    expect(checkAlphabet('aba')).toEqual(refuse('alphabet-repeat'));
    for (const bad of ['a b', 'a\tb', 'a\nb', 'a\0b', 'a​b', 'a\uD800b']) {
      expect(checkAlphabet(bad), JSON.stringify(bad)).toEqual(refuse('alphabet-space'));
    }
    expect(checkAlphabet(7)).toEqual(refuse('alphabet-size'));
  });
});

describe('stringBits', () => {
  it('is eight bits a byte, or the bits of each character, rounded down', () => {
    expect(stringBits(of('hex', 16))).toEqual({ ok: true, value: 128 });
    expect(stringBits(of('base64url', 32))).toEqual({ ok: true, value: 256 });
    expect(stringBits(of('digits', 16))).toEqual({ ok: true, value: 53 });
    expect(stringBits(of('alphanumeric', 24))).toEqual({ ok: true, value: 142 });
    expect(stringBits(of('own', 16, { alphabet: 'xy' }))).toEqual({ ok: true, value: 16 });
  });

  it('refuses what randomString refuses', () => {
    expect(stringBits(of('hex', 129))).toEqual(refuse('out-of-range'));
    expect(stringBits(of('own', 4, { alphabet: 'a' }))).toEqual(refuse('alphabet-size'));
  });
});
```

Create `packages/text-tools/test/numbers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LIMITS, numberBetween, pin, refuse } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

describe('pin', () => {
  it('is digits only and keeps leading zeros', () => {
    expect(pin(6, feed([1, 2, 3, 4, 5, 0]))).toEqual({ ok: true, value: '123450' });
    expect(pin(4, feed([0, 0, 0, 7]))).toEqual({ ok: true, value: '0007' });
  });

  it('refuses a length outside 4 to 12', () => {
    for (const digits of [3, 13, 4.5, NaN]) expect(pin(digits, seeded())).toEqual(refuse('out-of-range'));
  });
});

describe('numberBetween', () => {
  it('includes both bounds', () => {
    expect(numberBetween(1, 6, feed([0]))).toEqual({ ok: true, value: 1 });
    expect(numberBetween(1, 6, feed([5]))).toEqual({ ok: true, value: 6 });
  });

  it('swaps bounds given the wrong way round', () => {
    expect(numberBetween(6, 1, feed([5]))).toEqual({ ok: true, value: 6 });
  });

  it('handles equal and negative bounds', () => {
    expect(numberBetween(5, 5, seeded())).toEqual({ ok: true, value: 5 });
    expect(numberBetween(-3, 3, feed([0]))).toEqual({ ok: true, value: -3 });
    expect(numberBetween(-3, 3, feed([6]))).toEqual({ ok: true, value: 3 });
  });

  it('stays whole and inside the widest range', () => {
    const random = seeded();
    for (let i = 0; i < 300; i++) {
      const made = numberBetween(-LIMITS.bound, LIMITS.bound, random);
      if (!made.ok) throw new Error(made.problem);
      expect(Number.isSafeInteger(made.value)).toBe(true);
      expect(Math.abs(made.value)).toBeLessThanOrEqual(LIMITS.bound);
    }
  });

  it('refuses a bound that is too large or not whole', () => {
    expect(numberBetween(0, LIMITS.bound + 1, seeded())).toEqual(refuse('out-of-range'));
    expect(numberBetween(-LIMITS.bound - 1, 0, seeded())).toEqual(refuse('out-of-range'));
    expect(numberBetween(1.5, 3, seeded())).toEqual(refuse('out-of-range'));
    expect(numberBetween(1, NaN, seeded())).toEqual(refuse('out-of-range'));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/bytes.test.ts test/strings.test.ts test/numbers.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/bytes.ts`:

```ts
import { BASE64, URL_SAFE } from './alphabets.ts';

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The text these bytes spell as UTF-8, or null when they spell none. */
export function fromUtf8(data: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
  } catch {
    return null;
  }
}

export function toHex(data: Uint8Array): string {
  let out = '';
  for (const byte of data) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Standard Base64 with padding, or the URL-safe alphabet without. */
export function toBase64(data: Uint8Array, url = false): string {
  const alphabet = url ? URL_SAFE : BASE64;
  const pad = url ? '' : '=';
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i]!;
    const b = data[i + 1];
    const c = data[i + 2];
    out += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? pad : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? pad : alphabet[c & 63]!;
  }
  return out;
}
```

Create `packages/text-tools/src/strings.ts`:

```ts
import { DIGITS, LOWER, UPPER } from './alphabets.ts';
import { toBase64, toHex } from './bytes.ts';
import { LIMITS } from './limits.ts';
import { bytes, guard, pickFrom, type RandomSource } from './random.ts';
import { ok, refuse, whole, type Result } from './result.ts';

export const STRING_KINDS = [
  'hex',
  'base64',
  'base64url',
  'digits',
  'letters',
  'alphanumeric',
  'own',
] as const;
export type StringKind = (typeof STRING_KINDS)[number];
export type LetterCase = 'lower' | 'upper' | 'both';

export type StringOptions = {
  kind: StringKind;
  /** Bytes for hex and both Base64 kinds, characters for the rest. */
  size: number;
  /** Used by the letters kind. */
  letters: LetterCase;
  /** Used by the own kind. */
  alphabet: string;
};

/** The size each kind starts with. */
export const STRING_SIZES: Record<StringKind, number> = {
  hex: 16,
  base64: 32,
  base64url: 32,
  digits: 16,
  letters: 16,
  alphanumeric: 24,
  own: 16,
};

/** The characters of a typed alphabet, or why it cannot be used. Counted as code points. */
export function checkAlphabet(text: unknown): Result<string[]> {
  // A code point is at most two units, so anything longer than this is too many characters.
  if (typeof text !== 'string' || text.length > LIMITS.alphabetMax * 2) {
    return refuse('alphabet-size');
  }
  const chars = [...text];
  if (chars.length < LIMITS.alphabetMin || chars.length > LIMITS.alphabetMax) {
    return refuse('alphabet-size');
  }
  if (/[\s\p{C}]/u.test(text)) return refuse('alphabet-space');
  if (new Set(chars).size !== chars.length) return refuse('alphabet-repeat');
  return ok(chars);
}

type Plan = { bytes: true } | { bytes: false; alphabet: string[] };

function plan(options: StringOptions): Result<Plan> {
  const kind = options.kind;
  if (kind === 'hex' || kind === 'base64' || kind === 'base64url') {
    return whole(options.size, 1, LIMITS.bytes) ? ok({ bytes: true }) : refuse('out-of-range');
  }
  if (!whole(options.size, 1, LIMITS.length)) return refuse('out-of-range');
  if (kind === 'digits') return ok({ bytes: false, alphabet: [...DIGITS] });
  if (kind === 'alphanumeric') return ok({ bytes: false, alphabet: [...(UPPER + LOWER + DIGITS)] });
  if (kind === 'letters') {
    const set = { lower: LOWER, upper: UPPER, both: UPPER + LOWER }[options.letters];
    return set === undefined ? refuse('out-of-range') : ok({ bytes: false, alphabet: [...set] });
  }
  if (kind === 'own') {
    const chars = checkAlphabet(options.alphabet);
    return chars.ok ? ok({ bytes: false, alphabet: chars.value }) : chars;
  }
  return refuse('out-of-range');
}

/** The strength of the rule, in whole bits, rounded down. */
export function stringBits(options: StringOptions): Result<number> {
  const made = plan(options);
  if (!made.ok) return made;
  return ok(
    made.value.bytes
      ? options.size * 8
      : Math.floor(options.size * Math.log2(made.value.alphabet.length)),
  );
}

export function randomString(options: StringOptions, random: RandomSource): Result<string> {
  const made = plan(options);
  if (!made.ok) return made;
  const how = made.value;
  return guard(() => {
    if (!how.bytes) return pickFrom(how.alphabet, options.size, random);
    const drawn = bytes(options.size, random);
    return options.kind === 'hex' ? toHex(drawn) : toBase64(drawn, options.kind === 'base64url');
  });
}
```

Create `packages/text-tools/src/numbers.ts`:

```ts
import { DIGITS } from './alphabets.ts';
import { LIMITS } from './limits.ts';
import { below, guard, pickFrom, type RandomSource } from './random.ts';
import { refuse, whole, type Result } from './result.ts';

/** Digits only. Leading zeros are kept, so the answer is text. */
export function pin(digits: number, random: RandomSource): Result<string> {
  if (!whole(digits, LIMITS.pinMin, LIMITS.pinMax)) return refuse('out-of-range');
  return guard(() => pickFrom([...DIGITS], digits, random));
}

/** A whole number between two bounds, both included, given in either order. */
export function numberBetween(first: number, second: number, random: RandomSource): Result<number> {
  if (!whole(first, -LIMITS.bound, LIMITS.bound) || !whole(second, -LIMITS.bound, LIMITS.bound)) {
    return refuse('out-of-range');
  }
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  return guard(() => low + below(high - low + 1, random));
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './bytes.ts';
export * from './strings.ts';
export * from './numbers.ts';
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: random strings, PINs and numbers in a range"
```

---

### Task 6: Identifiers

**Files:**
- Create: `packages/text-tools/src/ids.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/ids.test.ts`

**Interfaces:**
- Consumes: `bytes`, `guard`, `pickFrom`, `RandomSource`; `CROCKFORD`, `URL_SAFE`; `toHex`; `ok`, `refuse`, `whole`, `Result`.
- Produces: `ID_KINDS = ['uuid4', 'uuid7', 'ulid', 'short']`; `type IdKind`; `TIMED_IDS: readonly IdKind[]` (the kinds that contain the time); `identifier(kind: IdKind, now: number, random: RandomSource): Result<string>`, where `now` is milliseconds since 1970.

- [ ] **Step 1: Write the failing test**

Create `packages/text-tools/test/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { identifier, ID_KINDS, refuse, TIMED_IDS } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const NOW = 1_645_557_742_000;

describe('uuid4', () => {
  it('sets the version and variant bits and leaves the rest random', () => {
    expect(identifier('uuid4', NOW, feed([0xff]))).toEqual({
      ok: true,
      value: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    });
    expect(identifier('uuid4', NOW, feed([0]))).toEqual({
      ok: true,
      value: '00000000-0000-4000-8000-000000000000',
    });
  });
});

describe('uuid7', () => {
  it('matches the example in RFC 9562', () => {
    const random = feed([0x0c, 0xc3, 0x18, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f]);
    expect(identifier('uuid7', NOW, random)).toEqual({
      ok: true,
      value: '017f22e2-79b0-7cc3-98c4-dc0c0c07398f',
    });
  });

  it('carries the time in its first twelve hex digits', () => {
    const made = identifier('uuid7', 0xffff_ffff_ffff, feed([0]));
    expect(made).toEqual({ ok: true, value: 'ffffffff-ffff-7000-8000-000000000000' });
  });
});

describe('ulid', () => {
  it('writes the time in ten characters and the random part in sixteen', () => {
    expect(identifier('ulid', 1_469_918_176_385, feed([0]))).toEqual({
      ok: true,
      value: '01ARYZ6S410000000000000000',
    });
    expect(identifier('ulid', 0, feed([0xff]))).toEqual({
      ok: true,
      value: '0000000000ZZZZZZZZZZZZZZZZ',
    });
    expect(identifier('ulid', 0xffff_ffff_ffff, feed([0]))).toEqual({
      ok: true,
      value: '7ZZZZZZZZZ0000000000000000',
    });
  });

  it('spreads the random bytes five bits at a time', () => {
    // 0x08 0x42 0x10 0x84 0x21 is the bit pattern 00001 repeated: the character 1, eight times.
    const random = feed([0x08, 0x42, 0x10, 0x84, 0x21]);
    expect(identifier('ulid', 0, random)).toEqual({
      ok: true,
      value: '00000000001111111111111111',
    });
  });
});

describe('short id', () => {
  it('is 21 URL-safe characters', () => {
    expect(identifier('short', NOW, feed([0]))).toEqual({ ok: true, value: 'A'.repeat(21) });
    const made = identifier('short', NOW, seeded());
    expect(made.ok && /^[A-Za-z0-9_-]{21}$/.test(made.value)).toBe(true);
  });
});

describe('identifier', () => {
  it('says which kinds contain the time', () => {
    expect(TIMED_IDS).toEqual(['uuid7', 'ulid']);
  });

  it('refuses a time that does not fit 48 bits, for the kinds that use it', () => {
    for (const now of [-1, 2 ** 48, 1.5, NaN]) {
      expect(identifier('uuid7', now, seeded())).toEqual(refuse('out-of-range'));
      expect(identifier('ulid', now, seeded())).toEqual(refuse('out-of-range'));
      expect(identifier('uuid4', now, seeded()).ok).toBe(true);
    }
  });

  it('refuses an unknown kind and a failed source', () => {
    expect(identifier('guid' as 'uuid4', NOW, seeded())).toEqual(refuse('out-of-range'));
    for (const kind of ID_KINDS) {
      expect(identifier(kind, NOW, () => new Uint8Array(0))).toEqual(refuse('no-random'));
    }
  });

  it('makes a different value each time', () => {
    const random = seeded();
    for (const kind of ID_KINDS) {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const made = identifier(kind, NOW, random);
        if (made.ok) seen.add(made.value);
      }
      expect(seen.size).toBe(200);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/ids.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/ids.ts`:

```ts
import { CROCKFORD, URL_SAFE } from './alphabets.ts';
import { toHex } from './bytes.ts';
import { bytes, guard, pickFrom, type RandomSource } from './random.ts';
import { refuse, whole, type Result } from './result.ts';

export const ID_KINDS = ['uuid4', 'uuid7', 'ulid', 'short'] as const;
export type IdKind = (typeof ID_KINDS)[number];

/** The kinds whose value contains the time it was made. The page says so beside them. */
export const TIMED_IDS: readonly IdKind[] = ['uuid7', 'ulid'];

const TIME_MAX = 2 ** 48 - 1;

function dashed(data: Uint8Array): string {
  const hex = toHex(data);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    '-',
  );
}

/** RFC 9562 version 4: 122 random bits. */
function uuid4(random: RandomSource): string {
  const data = Uint8Array.from(bytes(16, random));
  data[6] = 0x40 | (data[6]! & 0x0f);
  data[8] = 0x80 | (data[8]! & 0x3f);
  return dashed(data);
}

/** RFC 9562 version 7: 48 bits of time in milliseconds, then 74 random bits. */
function uuid7(now: number, random: RandomSource): string {
  const drawn = bytes(10, random);
  const data = new Uint8Array(16);
  for (let i = 0; i < 6; i++) data[i] = Math.floor(now / 2 ** (8 * (5 - i))) % 256;
  data.set(drawn, 6);
  data[6] = 0x70 | (drawn[0]! & 0x0f);
  data[8] = 0x80 | (drawn[2]! & 0x3f);
  return dashed(data);
}

/** 48 bits of time and 80 random bits, in Crockford's Base32. */
function ulid(now: number, random: RandomSource): string {
  let out = '';
  for (let i = 9; i >= 0; i--) out += CROCKFORD[Math.floor(now / 32 ** i) % 32]!;
  let buffer = 0;
  let held = 0;
  for (const byte of bytes(10, random)) {
    buffer = (buffer << 8) | byte;
    held += 8;
    while (held >= 5) {
      held -= 5;
      out += CROCKFORD[(buffer >> held) & 31]!;
    }
    buffer &= (1 << held) - 1;
  }
  return out;
}

/** `now` is milliseconds since 1970; only the timed kinds read it. */
export function identifier(kind: IdKind, now: number, random: RandomSource): Result<string> {
  if (!ID_KINDS.includes(kind)) return refuse('out-of-range');
  if (TIMED_IDS.includes(kind) && !whole(now, 0, TIME_MAX)) return refuse('out-of-range');
  return guard(() => {
    if (kind === 'uuid4') return uuid4(random);
    if (kind === 'uuid7') return uuid7(now, random);
    if (kind === 'ulid') return ulid(now, random);
    return pickFrom([...URL_SAFE], 21, random);
  });
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './ids.ts';
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: UUID v4 and v7, ULID and short identifiers"
```

---

### Task 7: Chance

**Files:**
- Create: `packages/text-tools/src/chance.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/chance.test.ts`

**Interfaces:**
- Consumes: `below`, `guard`, `shuffled`, `RandomSource`; `checkText`, `listLines`; `LIMITS`, `refuse`, `whole`, `Result`.
- Produces: `type Roll = { rolls: number[]; total: number }`; `dice(count: number, sides: number, random): Result<Roll>`; `type Face = 'heads' | 'tails'`; `coins(count: number, random): Result<Face[]>`; `pick(text: unknown, count: number, random): Result<string[]>`.

- [ ] **Step 1: Write the failing test**

Create `packages/text-tools/test/chance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coins, dice, pick, refuse } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

describe('dice', () => {
  it('rolls each die from 1 to its sides and adds them up', () => {
    expect(dice(3, 6, feed([0, 5, 2]))).toEqual({ ok: true, value: { rolls: [1, 6, 3], total: 10 } });
  });

  it('stays inside the sides', () => {
    const made = dice(100, 1_000, seeded());
    if (!made.ok) throw new Error(made.problem);
    expect(made.value.rolls).toHaveLength(100);
    expect(made.value.rolls.every((roll) => roll >= 1 && roll <= 1_000)).toBe(true);
  });

  it('refuses a count or sides outside the limits', () => {
    expect(dice(0, 6, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(101, 6, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(1, 1, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(1, 1_001, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(1, 6.5, seeded())).toEqual(refuse('out-of-range'));
  });
});

describe('coins', () => {
  it('flips each coin', () => {
    expect(coins(3, feed([0, 1, 1]))).toEqual({ ok: true, value: ['heads', 'tails', 'tails'] });
    expect(coins(0, seeded())).toEqual(refuse('out-of-range'));
  });
});

describe('pick', () => {
  it('picks lines without picking one twice', () => {
    const random = seeded();
    for (let i = 0; i < 50; i++) {
      const made = pick('ann\nbo\ncy\ndi', 3, random);
      if (!made.ok) throw new Error(made.problem);
      expect(made.value).toHaveLength(3);
      expect(new Set(made.value).size).toBe(3);
      expect(made.value.every((name) => ['ann', 'bo', 'cy', 'di'].includes(name))).toBe(true);
    }
  });

  it('gives the whole list, shuffled, when asked for more than it holds', () => {
    const made = pick('ann\nbo\ncy', 10, seeded());
    expect(made.ok && [...made.value].sort()).toEqual(['ann', 'bo', 'cy']);
  });

  it('ignores blank lines, line endings and space around a line', () => {
    const made = pick('  ann  \r\n\r\nbo\r\n\n', 5, seeded());
    expect(made.ok && [...made.value].sort()).toEqual(['ann', 'bo']);
  });

  it('keeps a line that appears twice as two chances', () => {
    const made = pick('ann\nann', 2, seeded());
    expect(made).toEqual({ ok: true, value: ['ann', 'ann'] });
  });

  it('refuses an empty list, a bad count and text over the limit', () => {
    expect(pick('', 1, seeded())).toEqual(refuse('empty-list'));
    expect(pick(' \n\t\n', 1, seeded())).toEqual(refuse('empty-list'));
    expect(pick('a\nb', 0, seeded())).toEqual(refuse('out-of-range'));
    expect(pick('a\n'.repeat(60_000), 1, seeded())).toEqual(refuse('too-long'));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/chance.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/chance.ts`:

```ts
import { LIMITS } from './limits.ts';
import { below, guard, shuffled, type RandomSource } from './random.ts';
import { refuse, whole, type Result } from './result.ts';
import { checkText, listLines } from './text.ts';

export type Roll = { rolls: number[]; total: number };

export function dice(count: number, sides: number, random: RandomSource): Result<Roll> {
  if (!whole(count, 1, LIMITS.results) || !whole(sides, LIMITS.sidesMin, LIMITS.sidesMax)) {
    return refuse('out-of-range');
  }
  return guard(() => {
    const rolls = Array.from({ length: count }, () => 1 + below(sides, random));
    return { rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) };
  });
}

export type Face = 'heads' | 'tails';

export function coins(count: number, random: RandomSource): Result<Face[]> {
  if (!whole(count, 1, LIMITS.results)) return refuse('out-of-range');
  return guard(() =>
    Array.from({ length: count }, (): Face => (below(2, random) === 0 ? 'heads' : 'tails')),
  );
}

/**
 * `count` lines of the typed list, no line picked twice. Asking for more than the list holds
 * gives the whole list in a random order. Blank lines are not entries.
 */
export function pick(text: unknown, count: number, random: RandomSource): Result<string[]> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  if (!whole(count, 1, LIMITS.results)) return refuse('out-of-range');
  const entries = listLines(checked.value)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (entries.length === 0) return refuse('empty-list');
  return guard(() => shuffled(entries, random).slice(0, count));
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './chance.ts';
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: dice, coins and picking from a list"
```

---

### Task 8: Case conversion

**Files:**
- Create: `packages/text-tools/src/cases.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/cases.test.ts`

**Interfaces:**
- Consumes: `checkText`, `splitLines`; `ok`, `refuse`, `Result`.
- Produces: `CASE_FORMS = ['camel', 'pascal', 'snake', 'constant', 'kebab', 'train', 'dot', 'path', 'title', 'sentence', 'upper', 'lower']`; `type CaseForm`; `words(line: string): string[]`; `convertCase(text: unknown, form: CaseForm): Result<string>`; `allCases(text: unknown): Result<Record<CaseForm, string>>`.

- [ ] **Step 1: Write the failing test**

Create `packages/text-tools/test/cases.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allCases, CASE_FORMS, convertCase, refuse, words, type CaseForm } from '../src/index.ts';

const to = (text: string, form: CaseForm): string => {
  const made = convertCase(text, form);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('words', () => {
  it('splits at spaces and punctuation', () => {
    expect(words('hello, world! foo_bar-baz.qux/x')).toEqual([
      'hello',
      'world',
      'foo',
      'bar',
      'baz',
      'qux',
      'x',
    ]);
  });

  it('splits where the case changes and keeps a run of capitals together', () => {
    expect(words('parseHTTPResponse')).toEqual(['parse', 'HTTP', 'Response']);
    expect(words('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(words('HTTP')).toEqual(['HTTP']);
    expect(words('iPhone')).toEqual(['i', 'Phone']);
  });

  it('splits letters from digits', () => {
    expect(words('response2now')).toEqual(['response', '2', 'now']);
    expect(words('v10beta')).toEqual(['v', '10', 'beta']);
  });

  it('drops apostrophes so a word stays whole', () => {
    expect(words("don't stop")).toEqual(['dont', 'stop']);
    expect(words('it’s')).toEqual(['its']);
  });

  it('knows letters beyond ASCII', () => {
    expect(words('crèmeBrûlée')).toEqual(['crème', 'Brûlée']);
    expect(words('привет мир')).toEqual(['привет', 'мир']);
    expect(words('école')).toEqual(['école']);
    expect(words('日本語 テスト')).toEqual(['日本語', 'テスト']);
  });

  it('finds none in punctuation', () => {
    expect(words('  --  ')).toEqual([]);
  });
});

describe('the programming forms', () => {
  const INPUT = 'parseHTTPResponse2 now';
  const expected: Array<[CaseForm, string]> = [
    ['camel', 'parseHttpResponse2Now'],
    ['pascal', 'ParseHttpResponse2Now'],
    ['snake', 'parse_http_response_2_now'],
    ['constant', 'PARSE_HTTP_RESPONSE_2_NOW'],
    ['kebab', 'parse-http-response-2-now'],
    ['train', 'Parse-Http-Response-2-Now'],
    ['dot', 'parse.http.response.2.now'],
    ['path', 'parse/http/response/2/now'],
  ];
  for (const [form, value] of expected) {
    it(form, () => expect(to(INPUT, form)).toBe(value));
  }

  it('converts each line on its own', () => {
    expect(to('first name\r\nLastName\n\nUSER_ID', 'camel')).toBe('firstName\nlastName\n\nuserId');
  });

  it('handles accented letters', () => {
    expect(to('crème brûlée', 'pascal')).toBe('CrèmeBrûlée');
    expect(to('Élan vital', 'snake')).toBe('élan_vital');
  });
});

describe('title case', () => {
  it('capitalises words and keeps small words small', () => {
    expect(to("the return of the iPhone: a buyer's guide", 'title')).toBe(
      "The Return of the iPhone: A Buyer's Guide",
    );
  });

  it('capitalises a small word that is first, last or after a colon', () => {
    expect(to('of mice and men', 'title')).toBe('Of Mice and Men');
    expect(to('what it is for', 'title')).toBe('What It Is For');
    expect(to('war: the sequel', 'title')).toBe('War: The Sequel');
  });

  it('lowers a small word typed with a capital', () => {
    expect(to('Lord Of The Rings', 'title')).toBe('Lord of the Rings');
  });

  it('leaves words with a capital inside as typed, unless everything is capitals', () => {
    expect(to('a NASA and eBay story', 'title')).toBe('A NASA and eBay Story');
    expect(to('THE LORD OF THE RINGS', 'title')).toBe('The Lord of the Rings');
  });

  it('keeps spacing and punctuation, and treats each line as a title', () => {
    expect(to('  "hello"   (world)  ', 'title')).toBe('  "Hello"   (World)  ');
    expect(to('the end\nthe start', 'title')).toBe('The End\nThe Start');
  });
});

describe('sentence case', () => {
  it('capitalises only the start of each sentence', () => {
    expect(to("the return of the iPhone: a buyer's guide", 'sentence')).toBe(
      "The return of the iPhone: a buyer's guide",
    );
    expect(to('Hello World. How Are You? fine! OK then', 'sentence')).toBe(
      'Hello world. How are you? Fine! OK then',
    );
  });

  it('keeps the word I', () => {
    expect(to("so i said i'm sure i’ll go", 'sentence')).toBe("So I said I'm sure I’ll go");
  });

  it('starts a sentence after a closing quote or bracket', () => {
    expect(to('she said "no." then left (really.) yes', 'sentence')).toBe(
      'She said "no." Then left (really.) Yes',
    );
  });

  it('lowers everything first when the text is all capitals', () => {
    expect(to('HELLO WORLD. NASA ROCKS', 'sentence')).toBe('Hello world. Nasa rocks');
  });
});

describe('upper and lower', () => {
  it('changes every letter', () => {
    expect(to("The iPhone: a Buyer's Guide", 'upper')).toBe("THE IPHONE: A BUYER'S GUIDE");
    expect(to("The iPhone: a Buyer's Guide", 'lower')).toBe("the iphone: a buyer's guide");
  });
});

describe('convertCase', () => {
  it('gives an empty answer for empty text', () => {
    for (const form of CASE_FORMS) expect(to('', form)).toBe('');
  });

  it('refuses an unknown form and text over the limit', () => {
    expect(convertCase('a', 'sponge' as CaseForm)).toEqual(refuse('out-of-range'));
    expect(convertCase('x'.repeat(100_001), 'camel')).toEqual(refuse('too-long'));
  });

  it('is quick on a long run of punctuation inside a word', () => {
    const awkward = 'a' + '!'.repeat(99_990) + 'a';
    const started = performance.now();
    for (const form of CASE_FORMS) expect(convertCase(awkward, form).ok).toBe(true);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe('allCases', () => {
  it('gives every form at once', () => {
    const made = allCases('hello world');
    if (!made.ok) throw new Error(made.problem);
    expect(Object.keys(made.value)).toEqual([...CASE_FORMS]);
    expect(made.value.kebab).toBe('hello-world');
    expect(made.value.title).toBe('Hello World');
  });

  it('refuses text over the limit', () => {
    expect(allCases('x'.repeat(100_001))).toEqual(refuse('too-long'));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/cases.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/cases.ts`:

```ts
import { ok, refuse, type Result } from './result.ts';
import { checkText, splitLines } from './text.ts';

export const CASE_FORMS = [
  'camel',
  'pascal',
  'snake',
  'constant',
  'kebab',
  'train',
  'dot',
  'path',
  'title',
  'sentence',
  'upper',
  'lower',
] as const;
export type CaseForm = (typeof CASE_FORMS)[number];

/**
 * One word: capitals that end before a capitalised word (HTTP in HTTPResponse), a word with or
 * without its capital, a run of capitals, a run of digits, or a run of letters that have no case.
 */
const WORD = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+|[\p{Lo}\p{Lt}\p{Lm}]+/gu;

/** The words of a line, for the programming forms. Apostrophes are dropped, not split on. */
export function words(line: string): string[] {
  return line.normalize('NFC').replace(/['’]/g, '').match(WORD) ?? [];
}

function upperFirst(word: string): string {
  const [first = '', ...rest] = [...word];
  return first.toUpperCase() + rest.join('');
}

const capital = (word: string): string => upperFirst(word.toLowerCase());
const lower = (word: string): string => word.toLowerCase();

type Programming = Exclude<CaseForm, 'title' | 'sentence' | 'upper' | 'lower'>;

const JOIN: Record<Programming, (parts: string[]) => string> = {
  camel: (parts) => parts.map((word, i) => (i === 0 ? lower(word) : capital(word))).join(''),
  pascal: (parts) => parts.map(capital).join(''),
  snake: (parts) => parts.map(lower).join('_'),
  constant: (parts) => parts.map((word) => word.toUpperCase()).join('_'),
  kebab: (parts) => parts.map(lower).join('-'),
  train: (parts) => parts.map(capital).join('-'),
  dot: (parts) => parts.map(lower).join('.'),
  path: (parts) => parts.map(lower).join('/'),
};

const SMALL = new Set('a an and as at but by for if in nor of on or per the to via vs'.split(' '));

const solid = (char: string): boolean => /[\p{L}\p{N}]/u.test(char);

/**
 * A written word as the punctuation before it, the word, and the punctuation after. Done with
 * loops: a pattern for this backtracks badly on a long run of punctuation.
 */
function edges(word: string): [string, string, string] {
  const chars = [...word];
  let from = 0;
  while (from < chars.length && !solid(chars[from]!)) from++;
  let to = chars.length;
  while (to > from && !solid(chars[to - 1]!)) to--;
  return [chars.slice(0, from).join(''), chars.slice(from, to).join(''), chars.slice(to).join('')];
}

/** True for a word with a capital after its first letter, such as iPhone or NASA. */
const inner = (core: string): boolean => /\p{Lu}/u.test([...core].slice(1).join(''));

/** True when the text has capitals and no lowercase letter at all. */
const shouting = (text: string): boolean => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

function title(line: string, loud: boolean): string {
  const parts = line.split(/(\s+)/);
  const places = parts.map((_, i) => i).filter((i) => i % 2 === 0 && parts[i] !== '');
  let afterColon = false;
  places.forEach((place, n) => {
    const [lead, typed, trail] = edges(parts[place]!);
    const core = loud ? typed.toLowerCase() : typed;
    let out = core;
    if (core !== '' && !inner(core)) {
      const plain = core.toLowerCase();
      const small = SMALL.has(plain) && n > 0 && n < places.length - 1 && !afterColon;
      out = small ? plain : upperFirst(core);
    }
    parts[place] = lead + out + trail;
    afterColon = trail.includes(':');
  });
  return parts.join('');
}

function sentence(text: string, loud: boolean): string {
  let start = true;
  return text.replace(/\S+/g, (word) => {
    const [lead, typed, trail] = edges(word);
    const core = loud ? typed.toLowerCase() : typed;
    let out = core;
    if (core !== '' && !inner(core)) {
      out = core.toLowerCase();
      if (start || /^i(['’](m|ll|ve|d))?$/.test(out)) out = upperFirst(out);
    }
    if (/[.!?]/.test(core === '' ? lead : trail)) start = true;
    else if (core !== '') start = false;
    return lead + out + trail;
  });
}

export function convertCase(text: unknown, form: CaseForm): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (!CASE_FORMS.includes(form)) return refuse('out-of-range');
  if (form === 'upper') return ok(value.toUpperCase());
  if (form === 'lower') return ok(value.toLowerCase());
  if (form === 'sentence') return ok(sentence(value, shouting(value)));
  if (form === 'title') {
    const loud = shouting(value);
    return ok(
      splitLines(value)
        .map((line) => title(line, loud))
        .join('\n'),
    );
  }
  const join = JOIN[form];
  return ok(
    splitLines(value)
      .map((line) => join(words(line)))
      .join('\n'),
  );
}

/** Every form at once, for a page that shows them side by side. */
export function allCases(text: unknown): Result<Record<CaseForm, string>> {
  const out = {} as Record<CaseForm, string>;
  for (const form of CASE_FORMS) {
    const made = convertCase(text, form);
    if (!made.ok) return made;
    out[form] = made.value;
  }
  return ok(out);
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './cases.ts';
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: case conversion, twelve forms"
```

---

### Task 9: Slug, lines and counts

**Files:**
- Create: `packages/text-tools/src/slug.ts`, `src/lines.ts`, `src/count.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/slug.test.ts`, `test/lines.test.ts`, `test/count.test.ts`

**Interfaces:**
- Consumes: `checkText`, `splitLines`, `listLines`; `utf8`; `guard`, `shuffled`, `RandomSource`; `ok`, `refuse`, `Result`.
- Produces: `slug(text: unknown): Result<string>`; `LINE_ORDERS = ['keep', 'az', 'za', 'reverse', 'shuffle']`; `type LineOrder`; `type LineOptions = { trim: boolean; blanks: boolean; unique: boolean; ignoreCase: boolean; order: LineOrder; number: boolean }` (`blanks` removes blank lines, `unique` removes repeats); `LINE_DEFAULTS`; `lines(text: unknown, options: LineOptions, random: RandomSource): Result<string>`; `type Counts = { characters: number; solid: number; words: number; lines: number; bytes: number }` (`solid` is characters that are not white space); `count(text: unknown): Result<Counts>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/text-tools/test/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { refuse, slug } from '../src/index.ts';

const of = (text: string): string => {
  const made = slug(text);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('slug', () => {
  it('lowers, hyphenates and trims', () => {
    expect(of('  Hello, World!  ')).toBe('hello-world');
    expect(of('A  --  B__C')).toBe('a-b-c');
    expect(of('Version 2.0 (final)')).toBe('version-2-0-final');
  });

  it('strips accents', () => {
    expect(of('Crème Brûlée')).toBe('creme-brulee');
    expect(of('Łódź, İstanbul')).toBe('lodz-istanbul');
    expect(of('école')).toBe('ecole');
  });

  it('spells out letters that have no accent to strip', () => {
    expect(of('Straße Æther Œuvre Søren Đorđe Þór')).toBe('strasse-aether-oeuvre-soren-dorde-thor');
  });

  it('drops what has no Latin form, leaving an empty line', () => {
    expect(of('日本語')).toBe('');
    expect(of('!!!')).toBe('');
    expect(of('😀 party')).toBe('party');
  });

  it('converts each line on its own', () => {
    expect(of('First Post\r\nSecond Post\n')).toBe('first-post\nsecond-post\n');
  });

  it('refuses text over the limit', () => {
    expect(slug('x'.repeat(100_001))).toEqual(refuse('too-long'));
  });
});
```

Create `packages/text-tools/test/lines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LINE_DEFAULTS, lines, refuse, type LineOptions } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const NONE: LineOptions = { ...LINE_DEFAULTS, trim: false };

const run = (text: string, options: Partial<LineOptions>, random = seeded()): string => {
  const made = lines(text, { ...NONE, ...options }, random);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('lines', () => {
  it('changes nothing with every step off, apart from line endings', () => {
    expect(run(' b \r\na\r\n', {})).toBe(' b \na');
  });

  it('trims by default', () => {
    expect(LINE_DEFAULTS.trim).toBe(true);
    expect(run('  a  \n\tb\t', { trim: true })).toBe('a\nb');
  });

  it('removes blank lines, counting a line of spaces as blank', () => {
    expect(run('a\n\n   \nb', { blanks: true })).toBe('a\nb');
  });

  it('removes repeats, keeping the first of each', () => {
    expect(run('b\na\nb\nA\na', { unique: true })).toBe('b\na\nA');
    expect(run('b\na\nb\nA\na', { unique: true, ignoreCase: true })).toBe('b\na');
  });

  it('sorts by code point, either way', () => {
    expect(run('b\nB\na\n10\n9', { order: 'az' })).toBe('10\n9\nB\na\nb');
    expect(run('b\nB\na\n10\n9', { order: 'za' })).toBe('b\na\nB\n9\n10');
  });

  it('sorts without regard to case when asked, capitals first among equals', () => {
    expect(run('b\nB\na\nA', { order: 'az', ignoreCase: true })).toBe('A\na\nB\nb');
  });

  it('puts characters beyond the basic plane after those within it', () => {
    expect(run('😀\nＡ\nz', { order: 'az' })).toBe('z\nＡ\n😀');
  });

  it('reverses', () => {
    expect(run('a\nb\nc', { order: 'reverse' })).toBe('c\nb\na');
  });

  it('shuffles with the source it is given', () => {
    expect(run('a\nb\nc', { order: 'shuffle' }, feed([0, 1]))).toBe('c\nb\na');
  });

  it('numbers last, after every other step', () => {
    expect(run('b\n\na\nb', { blanks: true, unique: true, order: 'az', number: true })).toBe(
      '1. a\n2. b',
    );
  });

  it('does not sort a phantom blank line to the top', () => {
    expect(run('b\na\n', { order: 'az' })).toBe('a\nb');
    expect(run('b\r\na\r\n', { order: 'az', number: true })).toBe('1. a\n2. b');
  });

  it('gives nothing for nothing', () => {
    expect(run('', { number: true })).toBe('');
  });

  it('refuses an unknown order, text over the limit, and a failed source', () => {
    expect(lines('a', { ...NONE, order: 'random' as 'az' }, seeded())).toEqual(refuse('out-of-range'));
    expect(lines('x'.repeat(100_001), NONE, seeded())).toEqual(refuse('too-long'));
    expect(lines('a\nb\nc', { ...NONE, order: 'shuffle' }, feed([0xff]))).toEqual(refuse('no-random'));
  });
});
```

Create `packages/text-tools/test/count.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { count, refuse } from '../src/index.ts';

const of = (text: string) => {
  const made = count(text);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('count', () => {
  it('counts nothing in nothing', () => {
    expect(of('')).toEqual({ characters: 0, solid: 0, words: 0, lines: 0, bytes: 0 });
  });

  it('counts characters, words, lines and bytes', () => {
    expect(of('Hello, wide world')).toEqual({
      characters: 17,
      solid: 15,
      words: 3,
      lines: 1,
      bytes: 17,
    });
  });

  it('counts a character as a reader sees it', () => {
    expect(of('👨‍👩‍👧')).toMatchObject({ characters: 1, bytes: 18 });
    expect(of('é')).toMatchObject({ characters: 1, bytes: 3 });
    expect(of('🇮🇳')).toMatchObject({ characters: 1, bytes: 8 });
    expect(of('é€')).toMatchObject({ characters: 2, bytes: 5 });
  });

  it('counts lines without a phantom last one', () => {
    expect(of('a\nb').lines).toBe(2);
    expect(of('a\nb\n').lines).toBe(2);
    expect(of('a\r\nb\r\n').lines).toBe(2);
    expect(of('a\n\nb').lines).toBe(3);
    expect(of('\n').lines).toBe(1);
  });

  it('counts a Windows line ending as one character', () => {
    expect(of('a\r\nb')).toMatchObject({ characters: 3, solid: 2, words: 2 });
  });

  it('refuses text over the limit', () => {
    expect(count('x'.repeat(100_001))).toEqual(refuse('too-long'));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/slug.test.ts test/lines.test.ts test/count.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/slug.ts`:

```ts
import { ok, type Result } from './result.ts';
import { checkText, splitLines } from './text.ts';

/** Letters that have no accent to strip, spelled out. */
const SPELLED: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
  þ: 'th',
};

function slugLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[ßæœøđłþ]/g, (char) => SPELLED[char] ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Each line as a URL slug: lowercase letters and digits, joined by single hyphens. */
export function slug(text: unknown): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  return ok(splitLines(checked.value).map(slugLine).join('\n'));
}
```

Create `packages/text-tools/src/lines.ts`:

```ts
import { guard, shuffled, type RandomSource } from './random.ts';
import { refuse, type Result } from './result.ts';
import { checkText, listLines } from './text.ts';

export const LINE_ORDERS = ['keep', 'az', 'za', 'reverse', 'shuffle'] as const;
export type LineOrder = (typeof LINE_ORDERS)[number];

export type LineOptions = {
  /** Trim the white space at both ends of each line. */
  trim: boolean;
  /** Remove blank lines. */
  blanks: boolean;
  /** Remove repeated lines, keeping the first of each. */
  unique: boolean;
  /** Ignore case when removing repeats and when sorting. */
  ignoreCase: boolean;
  order: LineOrder;
  /** Number the lines. */
  number: boolean;
};

export const LINE_DEFAULTS: LineOptions = {
  trim: true,
  blanks: false,
  unique: false,
  ignoreCase: false,
  order: 'keep',
  number: false,
};

/** Moves surrogates above the rest of the basic plane, so units compare as code points do. */
const rank = (unit: number): number =>
  unit >= 0xd800 && unit <= 0xdfff ? unit + 0x2000 : unit >= 0xe000 ? unit - 0x800 : unit;

/** Order by code point, the same in every browser and language. */
function compare(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const left = a.charCodeAt(i);
    const right = b.charCodeAt(i);
    if (left !== right) return rank(left) - rank(right);
  }
  return a.length - b.length;
}

function sorted(list: string[], ignoreCase: boolean): string[] {
  const keyed = list.map((line) => ({ line, key: ignoreCase ? line.toLowerCase() : line }));
  keyed.sort((a, b) => compare(a.key, b.key) || compare(a.line, b.line));
  return keyed.map((entry) => entry.line);
}

/** The steps, in the order the options are listed. */
export function lines(text: unknown, options: LineOptions, random: RandomSource): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  if (!LINE_ORDERS.includes(options.order)) return refuse('out-of-range');
  const ignoreCase = options.ignoreCase === true;
  return guard(() => {
    let list = listLines(checked.value);
    if (options.trim === true) list = list.map((line) => line.trim());
    if (options.blanks === true) list = list.filter((line) => line.trim() !== '');
    if (options.unique === true) {
      const seen = new Set<string>();
      list = list.filter((line) => {
        const key = ignoreCase ? line.toLowerCase() : line;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (options.order === 'az') list = sorted(list, ignoreCase);
    if (options.order === 'za') list = sorted(list, ignoreCase).reverse();
    if (options.order === 'reverse') list = list.toReversed();
    if (options.order === 'shuffle') list = shuffled(list, random);
    if (options.number === true) list = list.map((line, i) => `${i + 1}. ${line}`);
    return list.join('\n');
  });
}
```

Create `packages/text-tools/src/count.ts`:

```ts
import { utf8 } from './bytes.ts';
import { ok, type Result } from './result.ts';
import { checkText, listLines } from './text.ts';

export type Counts = {
  /** Characters as a reader counts them: an emoji or an accented letter is one. */
  characters: number;
  /** Characters that are not white space. */
  solid: number;
  words: number;
  lines: number;
  /** Bytes as UTF-8. */
  bytes: number;
};

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function count(text: unknown): Result<Counts> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  let characters = 0;
  let solid = 0;
  for (const { segment } of graphemes.segment(value)) {
    characters++;
    if (segment.trim() !== '') solid++;
  }
  return ok({
    characters,
    solid,
    words: value.match(/\S+/g)?.length ?? 0,
    lines: listLines(value).length,
    bytes: utf8(value).length,
  });
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './slug.ts';
export * from './lines.ts';
export * from './count.ts';
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @pokerji/text-tools test && pnpm --filter @pokerji/text-tools typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: slugs, line tools and counts"
```

---

### Task 10: Encoding and decoding

**Files:**
- Create: `packages/text-tools/src/entities.ts`, `packages/text-tools/src/encode.ts`
- Modify: `packages/text-tools/src/index.ts`
- Test: `packages/text-tools/test/entities.test.ts`, `test/encode.test.ts`

**Interfaces:**
- Consumes: `utf8`, `fromUtf8`, `toHex`, `toBase64`; `BASE64`, `URL_SAFE`; `checkText`; `ok`, `refuse`, `Result`.
- Produces: `ENTITIES: ReadonlyMap<string, number>` (name to code point); `encodeEntities(text: string): string`; `decodeEntities(text: string): string`; `ENCODINGS = ['base64', 'base64url', 'hex', 'url', 'entities']`; `type Encoding`; `encode(text: unknown, form: Encoding): Result<string>`; `type Decoded = { text: string; binary: boolean }` (`binary` true means the bytes were not text and `text` is their hex); `decode(text: unknown, form: Encoding): Result<Decoded>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/text-tools/test/entities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeEntities, encodeEntities, ENTITIES } from '../src/index.ts';

describe('the entity table', () => {
  it('holds the 252 names of HTML 4 and apos', () => {
    expect(ENTITIES.size).toBe(253);
  });

  it('maps names to the right characters', () => {
    const checks: Array<[string, string]> = [
      ['nbsp', ' '],
      ['copy', '©'],
      ['frac12', '½'],
      ['Agrave', 'À'],
      ['times', '×'],
      ['szlig', 'ß'],
      ['divide', '÷'],
      ['yuml', 'ÿ'],
      ['OElig', 'Œ'],
      ['Yuml', 'Ÿ'],
      ['fnof', 'ƒ'],
      ['Alpha', 'Α'],
      ['Rho', 'Ρ'],
      ['Sigma', 'Σ'],
      ['Omega', 'Ω'],
      ['alpha', 'α'],
      ['sigmaf', 'ς'],
      ['omega', 'ω'],
      ['piv', 'ϖ'],
      ['ndash', '–'],
      ['mdash', '—'],
      ['hellip', '…'],
      ['euro', '€'],
      ['trade', '™'],
      ['larr', '←'],
      ['hArr', '⇔'],
      ['ne', '≠'],
      ['le', '≤'],
      ['infin', '∞'],
      ['hearts', '♥'],
      ['diams', '♦'],
      ['apos', "'"],
    ];
    for (const [name, char] of checks) {
      expect(String.fromCodePoint(ENTITIES.get(name)!), name).toBe(char);
    }
  });

  it('gives each name its own character, apart from none', () => {
    expect(new Set(ENTITIES.values()).size).toBe(253);
  });
});

describe('encodeEntities', () => {
  it('escapes the five characters that matter in HTML', () => {
    expect(encodeEntities(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
    expect(encodeEntities('café ©')).toBe('café ©');
  });
});

describe('decodeEntities', () => {
  it('reads names, decimal numbers and hex numbers', () => {
    expect(decodeEntities('&lt;p&gt; &amp; &eacute; &#233; &#xE9; &#Xe9; &euro; &apos;')).toBe(
      "<p> & é é é é € '",
    );
    expect(decodeEntities('&#128512;')).toBe('😀');
  });

  it('is exact about case', () => {
    expect(decodeEntities('&Eacute; &eacute; &EACUTE;')).toBe('É é &EACUTE;');
  });

  it('leaves alone what it does not know or cannot be a character', () => {
    for (const typed of ['&nosuch;', '&#xD800;', '&#0;', '&#1114112;', '&#99999999999;', '&amp', '& ;', '&#;', '&#x;']) {
      expect(decodeEntities(typed), typed).toBe(typed);
    }
  });

  it('decodes once, not again', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });

  it('undoes encodeEntities', () => {
    const text = `<a href="x">Tom & 'Jerry'</a> &amp; ©`;
    expect(decodeEntities(encodeEntities(text))).toBe(text);
  });
});
```

Create `packages/text-tools/test/encode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decode, encode, ENCODINGS, refuse, type Encoding } from '../src/index.ts';

const enc = (text: string, form: Encoding): string => {
  const made = encode(text, form);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};
const text = (value: string) => ({ ok: true, value: { text: value, binary: false } });
const binary = (hex: string) => ({ ok: true, value: { text: hex, binary: true } });

describe('encode', () => {
  it('writes each form', () => {
    expect(enc('hello', 'base64')).toBe('aGVsbG8=');
    expect(enc('hello', 'base64url')).toBe('aGVsbG8');
    expect(enc('hello', 'hex')).toBe('68656c6c6f');
    expect(enc('a b&c/é', 'url')).toBe('a%20b%26c%2F%C3%A9');
    expect(enc('<b>', 'entities')).toBe('&lt;b&gt;');
  });

  it('leaves the unreserved URL characters alone', () => {
    const unreserved = "AZaz09-_.!~*'()";
    expect(enc(unreserved, 'url')).toBe(unreserved);
    expect(enc('+', 'url')).toBe('%2B');
    expect(enc('😀', 'url')).toBe('%F0%9F%98%80');
  });

  it('refuses an unknown form and text over the limit', () => {
    expect(encode('a', 'rot13' as Encoding)).toEqual(refuse('out-of-range'));
    expect(encode('x'.repeat(100_001), 'hex')).toEqual(refuse('too-long'));
  });
});

describe('decode', () => {
  it('reads Base64 with white space, with or without padding', () => {
    expect(decode('aGVsbG8=', 'base64')).toEqual(text('hello'));
    expect(decode('aGVsbG8', 'base64')).toEqual(text('hello'));
    expect(decode(' aGVs\nbG8= \r\n', 'base64')).toEqual(text('hello'));
    expect(decode('', 'base64')).toEqual(text(''));
  });

  it('keeps the two Base64 alphabets apart', () => {
    expect(decode('Pj4+Pz8/', 'base64')).toEqual(text('>>>???'));
    expect(decode('Pj4-Pz8_', 'base64url')).toEqual(text('>>>???'));
    expect(decode('Pj4-Pz8_', 'base64')).toEqual(refuse('bad-base64'));
    expect(decode('Pj4+Pz8/', 'base64url')).toEqual(refuse('bad-base64'));
  });

  it('refuses Base64 with a wrong character, length or padding', () => {
    for (const bad of ['aGVsbG8*', 'a', 'aGVsb', 'aG=VsbG8', 'aGVsbG8===', '😀']) {
      expect(decode(bad, 'base64'), bad).toEqual(refuse('bad-base64'));
    }
  });

  it('reads hex in either case, with spaces and colons', () => {
    expect(decode('68656c6c6f', 'hex')).toEqual(text('hello'));
    expect(decode('68:65:6C 6c\n6F', 'hex')).toEqual(text('hello'));
    expect(decode('6', 'hex')).toEqual(refuse('odd-hex'));
    expect(decode('zz', 'hex')).toEqual(refuse('bad-hex'));
    expect(decode('0x68', 'hex')).toEqual(refuse('bad-hex'));
  });

  it('reads percent sequences and leaves a plus as a plus', () => {
    expect(decode('a%20b%26c%2F%C3%A9', 'url')).toEqual(text('a b&c/é'));
    expect(decode('%e2%82%ac', 'url')).toEqual(text('€'));
    expect(decode('a+b', 'url')).toEqual(text('a+b'));
    expect(decode('caf%C3%A9 é', 'url')).toEqual(text('café é'));
    for (const bad of ['100%', '%zz', '%2', '%%20']) {
      expect(decode(bad, 'url'), bad).toEqual(refuse('bad-percent'));
    }
  });

  it('shows bytes that are not text as hex', () => {
    expect(decode('/w==', 'base64')).toEqual(binary('ff'));
    expect(decode('ff00', 'hex')).toEqual(binary('ff00'));
    expect(decode('%FF', 'url')).toEqual(binary('ff'));
  });

  it('reads entities', () => {
    expect(decode('&lt;b&gt; &amp; &copy;', 'entities')).toEqual(text('<b> & ©'));
  });

  it('refuses an unknown form and text over the limit', () => {
    expect(decode('a', 'rot13' as Encoding)).toEqual(refuse('out-of-range'));
    expect(decode('x'.repeat(100_001), 'hex')).toEqual(refuse('too-long'));
  });
});

describe('a round trip', () => {
  it('returns what was typed, in every form', () => {
    const samples = ['', 'hello', 'a b&c/é?=+%', 'line\r\nbreak\ttab', '日本語 😀 👨‍👩‍👧', '<p class="x">&amp;</p>', '\0 ﻿'];
    for (const form of ENCODINGS) {
      for (const sample of samples) {
        expect(decode(enc(sample, form), form), `${form}: ${JSON.stringify(sample)}`).toEqual(
          text(sample),
        );
      }
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/entities.test.ts test/encode.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Write the implementation**

Create `packages/text-tools/src/entities.ts`:

```ts
/** The names for U+00A0 to U+00FF, in order. */
const LATIN =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';

/** The names for U+0391 to U+03A9; there is no letter at U+03A2. */
const GREEK_UPPER =
  'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho - Sigma Tau Upsilon Phi Chi Psi Omega';

/** The names for U+03B1 to U+03C9. */
const GREEK_LOWER =
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega';

/** Every other name of HTML 4, with its code point, and apos. */
const OTHER =
  'quot:34 amp:38 apos:39 lt:60 gt:62 OElig:338 oelig:339 Scaron:352 scaron:353 Yuml:376 fnof:402 circ:710 tilde:732 thetasym:977 upsih:978 piv:982 ensp:8194 emsp:8195 thinsp:8201 zwnj:8204 zwj:8205 lrm:8206 rlm:8207 ndash:8211 mdash:8212 lsquo:8216 rsquo:8217 sbquo:8218 ldquo:8220 rdquo:8221 bdquo:8222 dagger:8224 Dagger:8225 bull:8226 hellip:8230 permil:8240 prime:8242 Prime:8243 lsaquo:8249 rsaquo:8250 oline:8254 frasl:8260 euro:8364 image:8465 weierp:8472 real:8476 trade:8482 alefsym:8501 larr:8592 uarr:8593 rarr:8594 darr:8595 harr:8596 crarr:8629 lArr:8656 uArr:8657 rArr:8658 dArr:8659 hArr:8660 forall:8704 part:8706 exist:8707 empty:8709 nabla:8711 isin:8712 notin:8713 ni:8715 prod:8719 sum:8721 minus:8722 lowast:8727 radic:8730 prop:8733 infin:8734 ang:8736 and:8743 or:8744 cap:8745 cup:8746 int:8747 there4:8756 sim:8764 cong:8773 asymp:8776 ne:8800 equiv:8801 le:8804 ge:8805 sub:8834 sup:8835 nsub:8836 sube:8838 supe:8839 oplus:8853 otimes:8855 perp:8869 sdot:8901 lceil:8968 rceil:8969 lfloor:8970 rfloor:8971 lang:10216 rang:10217 loz:9674 spades:9824 clubs:9827 hearts:9829 diams:9830';

function table(): Map<string, number> {
  const names = new Map<string, number>();
  const run = (list: string, first: number): void =>
    list.split(' ').forEach((name, i) => {
      if (name !== '-') names.set(name, first + i);
    });
  run(LATIN, 0xa0);
  run(GREEK_UPPER, 0x391);
  run(GREEK_LOWER, 0x3b1);
  for (const pair of OTHER.split(' ')) {
    const [name = '', code = ''] = pair.split(':');
    names.set(name, Number(code));
  }
  return names;
}

/** Named entities this package decodes: the 252 of HTML 4, and apos. */
export const ENTITIES: ReadonlyMap<string, number> = table();

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function encodeEntities(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** True for a code point that is a character: not zero, not a surrogate, not past the end. */
const real = (code: number): boolean =>
  code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);

/**
 * Names and numbers become their characters. Anything unknown, or naming no character, is left
 * as typed. Done from the table above and never by handing text to a page to parse.
 */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#([0-9]{1,8})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{0,9}));/g,
    (typed, decimal?: string, hex?: string, name?: string) => {
      const code =
        decimal !== undefined
          ? Number(decimal)
          : hex !== undefined
            ? parseInt(hex, 16)
            : (ENTITIES.get(name ?? '') ?? 0);
      return real(code) ? String.fromCodePoint(code) : typed;
    },
  );
}
```

Create `packages/text-tools/src/encode.ts`:

```ts
import { BASE64, URL_SAFE } from './alphabets.ts';
import { fromUtf8, toBase64, toHex, utf8 } from './bytes.ts';
import { decodeEntities, encodeEntities } from './entities.ts';
import { ok, refuse, type Result } from './result.ts';
import { checkText } from './text.ts';

export const ENCODINGS = ['base64', 'base64url', 'hex', 'url', 'entities'] as const;
export type Encoding = (typeof ENCODINGS)[number];

/** What decoding gave. When the bytes were not text, `text` is their hex and `binary` is true. */
export type Decoded = { text: string; binary: boolean };

const UNRESERVED = /[A-Za-z0-9\-_.!~*'()]/;

function toPercent(data: Uint8Array): string {
  let out = '';
  for (const byte of data) {
    const char = String.fromCharCode(byte);
    out += UNRESERVED.test(char) ? char : '%' + byte.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

function fromPercent(text: string): Result<Uint8Array> {
  const typed = utf8(text);
  const out: number[] = [];
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== 0x25) {
      out.push(typed[i]!);
      continue;
    }
    const pair = String.fromCharCode(typed[i + 1] ?? 0, typed[i + 2] ?? 0);
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) return refuse('bad-percent');
    out.push(parseInt(pair, 16));
    i += 2;
  }
  return ok(Uint8Array.from(out));
}

function fromBase64(text: string, url: boolean): Result<Uint8Array> {
  const alphabet = url ? URL_SAFE : BASE64;
  let clean = text.replace(/\s+/g, '');
  if (clean.endsWith('==')) clean = clean.slice(0, -2);
  else if (clean.endsWith('=')) clean = clean.slice(0, -1);
  if (clean.length % 4 === 1) return refuse('bad-base64');
  const out: number[] = [];
  let buffer = 0;
  let held = 0;
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value < 0) return refuse('bad-base64');
    buffer = (buffer << 6) | value;
    held += 6;
    if (held >= 8) {
      held -= 8;
      out.push((buffer >> held) & 0xff);
      buffer &= (1 << held) - 1;
    }
  }
  return ok(Uint8Array.from(out));
}

function fromHex(text: string): Result<Uint8Array> {
  const clean = text.replace(/[\s:]+/g, '');
  if (/[^0-9a-fA-F]/.test(clean)) return refuse('bad-hex');
  if (clean.length % 2 === 1) return refuse('odd-hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return ok(out);
}

export function encode(text: unknown, form: Encoding): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (form === 'entities') return ok(encodeEntities(value));
  if (form === 'base64') return ok(toBase64(utf8(value)));
  if (form === 'base64url') return ok(toBase64(utf8(value), true));
  if (form === 'hex') return ok(toHex(utf8(value)));
  if (form === 'url') return ok(toPercent(utf8(value)));
  return refuse('out-of-range');
}

export function decode(text: unknown, form: Encoding): Result<Decoded> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (form === 'entities') return ok({ text: decodeEntities(value), binary: false });
  let data: Result<Uint8Array>;
  if (form === 'base64') data = fromBase64(value, false);
  else if (form === 'base64url') data = fromBase64(value, true);
  else if (form === 'hex') data = fromHex(value);
  else if (form === 'url') data = fromPercent(value);
  else return refuse('out-of-range');
  if (!data.ok) return data;
  const read = fromUtf8(data.value);
  return ok(read === null ? { text: toHex(data.value), binary: true } : { text: read, binary: false });
}
```

Add to `packages/text-tools/src/index.ts`:

```ts
export * from './entities.ts';
export * from './encode.ts';
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @pokerji/text-tools test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/text-tools
git commit -m "feat: encoding and decoding in five forms"
```

---

### Task 11: Nothing throws

**Files:**
- Test: `packages/text-tools/test/robustness.test.ts`

**Interfaces:**
- Consumes: everything exported from `src/index.ts`.
- Produces: no new code if the earlier tasks hold. A failure here is fixed in the source file that owns the function, with the failing input added to that file's own test.

- [ ] **Step 1: Write the test**

Create `packages/text-tools/test/robustness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  allCases,
  CASE_FORMS,
  checkAlphabet,
  coins,
  convertCase,
  count,
  decode,
  dice,
  encode,
  ENCODINGS,
  identifier,
  ID_KINDS,
  LINE_DEFAULTS,
  LINE_ORDERS,
  lines,
  many,
  numberBetween,
  passphrase,
  PASSPHRASE_DEFAULTS,
  password,
  PASSWORD_DEFAULTS,
  pick,
  pin,
  randomString,
  readWordList,
  refuse,
  slug,
  WORD_COUNT,
  type RandomSource,
  type Result,
} from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const AWKWARD = [
  '',
  ' ',
  '\0',
  '\uD800',
  'a\uDC00b',
  '\uDBFF\uDBFF',
  '\r\n\r\n',
  '﻿',
  '%',
  '&',
  '&#xD800;',
  '=',
  '====',
  '😀👨‍👩‍👧🇮🇳',
  'é́́',
  'İSTANBUL ǅ ß',
  '‮evil',
  '!'.repeat(100_000),
  'aA'.repeat(50_000),
  '&#'.repeat(50_000),
  '%4'.repeat(50_000),
  'a\n'.repeat(50_000),
  'x'.repeat(100_001),
];

const NOT_WHOLE = [NaN, Infinity, -Infinity, 12.5, -1, 0, 1e21, '12', null, undefined, {}, []];
const asNumber = (value: unknown): number => value as number;

const LIST = Array.from({ length: WORD_COUNT }, (_, i) => `w${i}`);
const NOW = 1_700_000_000_000;

describe('typed text', () => {
  it('never makes a converter throw', () => {
    for (const text of AWKWARD) {
      const label = JSON.stringify(text.slice(0, 12));
      expect(() => {
        allCases(text);
        for (const form of CASE_FORMS) convertCase(text, form);
        slug(text);
        count(text);
        for (const order of LINE_ORDERS) {
          lines(text, { ...LINE_DEFAULTS, unique: true, ignoreCase: true, order }, seeded());
        }
        for (const form of ENCODINGS) {
          encode(text, form);
          decode(text, form);
        }
        pick(text, 3, seeded());
        checkAlphabet(text);
        readWordList(text);
        randomString({ kind: 'own', size: 8, letters: 'both', alphabet: text }, seeded());
      }, label).not.toThrow();
    }
  });

  it('is refused by every converter when it is over the limit', () => {
    const long = 'x'.repeat(100_001);
    const answers: Array<Result<unknown>> = [
      allCases(long),
      slug(long),
      count(long),
      lines(long, LINE_DEFAULTS, seeded()),
      pick(long, 1, seeded()),
      ...CASE_FORMS.map((form) => convertCase(long, form)),
      ...ENCODINGS.flatMap((form) => [encode(long, form), decode(long, form)]),
    ];
    for (const answer of answers) expect(answer).toEqual(refuse('too-long'));
  });

  it('stays quick at the limit', () => {
    const started = performance.now();
    for (const text of AWKWARD) {
      allCases(text);
      slug(text);
      count(text);
      lines(text, { ...LINE_DEFAULTS, unique: true, order: 'az' }, seeded());
      for (const form of ENCODINGS) decode(text, form);
    }
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});

describe('an option that is not a whole number', () => {
  it('is refused by every generator', () => {
    for (const bad of NOT_WHOLE) {
      const n = asNumber(bad);
      const label = String(bad);
      const out = refuse('out-of-range');
      expect(password({ ...PASSWORD_DEFAULTS, length: n }, seeded()), label).toEqual(out);
      expect(passphrase({ ...PASSPHRASE_DEFAULTS, words: n }, LIST, seeded()), label).toEqual(out);
      for (const kind of ['hex', 'digits'] as const) {
        expect(
          randomString({ kind, size: n, letters: 'both', alphabet: '' }, seeded()),
          label,
        ).toEqual(out);
      }
      expect(pin(n, seeded()), label).toEqual(out);
      expect(dice(n, 6, seeded()), label).toEqual(out);
      expect(dice(2, n, seeded()), label).toEqual(out);
      expect(coins(n, seeded()), label).toEqual(out);
      expect(pick('a\nb', n, seeded()), label).toEqual(out);
      expect(many(n, () => refuse('no-random')), label).toEqual(out);
      if (bad !== 0 && bad !== -1) {
        expect(numberBetween(n, 5, seeded()), label).toEqual(out);
        expect(numberBetween(5, n, seeded()), label).toEqual(out);
      }
      if (bad !== 0) expect(identifier('uuid7', n, seeded()), label).toEqual(out);
    }
  });
});

describe('a random source that misbehaves', () => {
  const broken: Array<[string, RandomSource]> = [
    [
      'throws',
      () => {
        throw new Error('no entropy');
      },
    ],
    ['returns too few', () => new Uint8Array(0)],
    ['returns too many', (wanted) => new Uint8Array(wanted + 1)],
    ['returns an array', (wanted) => Array<number>(wanted).fill(1) as unknown as Uint8Array],
    ['returns nothing', () => undefined as unknown as Uint8Array],
  ];

  for (const [name, random] of broken) {
    it(`${name}: every generator answers no-random`, () => {
      const out = refuse('no-random');
      expect(password(PASSWORD_DEFAULTS, random)).toEqual(out);
      expect(passphrase(PASSPHRASE_DEFAULTS, LIST, random)).toEqual(out);
      expect(randomString({ kind: 'hex', size: 8, letters: 'both', alphabet: '' }, random)).toEqual(out);
      expect(randomString({ kind: 'digits', size: 8, letters: 'both', alphabet: '' }, random)).toEqual(out);
      expect(pin(6, random)).toEqual(out);
      expect(numberBetween(1, 6, random)).toEqual(out);
      for (const kind of ID_KINDS) expect(identifier(kind, NOW, random)).toEqual(out);
      expect(dice(2, 6, random)).toEqual(out);
      expect(coins(2, random)).toEqual(out);
      expect(pick('a\nb\nc', 2, random)).toEqual(out);
      expect(lines('a\nb\nc', { ...LINE_DEFAULTS, order: 'shuffle' }, random)).toEqual(out);
    });
  }

  it('a source stuck on one value never yields a short or lopsided result', () => {
    const stuck = feed([0xff]);
    expect(password(PASSWORD_DEFAULTS, stuck)).toEqual(refuse('no-random'));
    expect(pin(6, stuck)).toEqual(refuse('no-random'));
    expect(numberBetween(1, 6, stuck)).toEqual(refuse('no-random'));
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @pokerji/text-tools exec vitest run test/robustness.test.ts`
Expected: PASS. If a case fails, fix the function in its own source file, add the failing input to that file's own test, and run again.

- [ ] **Step 3: Run everything**

Run: `pnpm --filter @pokerji/text-tools test && pnpm typecheck && pnpm format:check`
Expected: every test file passes; no type errors in any package; no formatting differences.

Run: `pnpm test`
Expected: PASS for every package (the `poker-server` tests need `pnpm services:up` first).

- [ ] **Step 4: Commit**

```bash
git add packages/text-tools
git commit -m "test: no text-tools function throws, whatever it is given"
```

---

## After this plan

1. Write the design direction for `/text` through the Impeccable skill, holding to the existing design.
2. Write Plan 2 (the page, the site changes, browser tests, screenshots, document updates, the Octopus code review and security audit) against the interfaces this plan produced.
