# Schema Markup Builder Core (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/schema-builder`, the framework-free package that holds everything the schema markup builder knows: the draft model, the JSON-LD serialiser, the ten guided types, the checks, the Schema.org vocabulary reader and stored-draft parsing, plus the vendored vocabulary file.

**Architecture:** A pure package in the style of `packages/poker-engine`: plain TypeScript, no I/O, no DOM, no framework, tested with Vitest. A draft is an ordered list of items; every change is a pure function returning a new draft. Guided types are data. One compacted Schema.org vocabulary file is committed under `apps/web/static/schema/` and read through a Zod schema.

**Tech Stack:** Node 24+ (26.10 installed locally), pnpm 11.25, TypeScript 7.0, Zod 4.6.5, Vitest 5.0, Prettier 3.9.

**Spec:** `docs/superpowers/specs/2026-10-13-schema-builder-design.md`

## Where this plan sits

The spec is split into two plans. Each produces working, tested software.

| Plan | Delivers | Written when |
|---|---|---|
| **1. Core (this plan)** | `packages/schema-builder` and the vendored vocabulary | Now |
| **2. Page and release** | Impeccable design direction for the builder; the `/schema` page; home page, top bar, sitemap and privacy page changes; browser tests; screenshots; document updates; Octopus code review and security audit | After Plan 1 lands, against its real interfaces and the approved design direction |

Facts established on 2026-10-13 while writing this plan:

- The current Schema.org release is 30.1 (2026-09-16). `https://schema.org/version/30.1/schemaorg-current-https.jsonld` is 1,521,575 bytes with SHA-256 `0a4b8c4c910fc831ec8695196510973390906a5ee34dc6b862dfec4d21a12f74`.
- A prototype of the compaction in Task 4 gave 885 types and 1,438 properties: about 28 kB gzipped without descriptions and about 62 kB with first-sentence descriptions. That is under the spec's 150 kB rule, so descriptions go in `vocabulary.json` and there is no second file.
- Google's documentation for the guided types was read on 2026-10-13. Three findings changed the guided set's details, and the spec has been amended to match:
  - Google removed its FAQ rich result documentation on 2026-06-15 and no longer shows that result. `FAQPage` stays a guided type with no required fields and a note saying so.
  - The `WebSite` documentation is now the site-names page; it asks for `name`, `url` and `alternateName` only. `SearchAction` is not a guided field.
  - Google's event result does not support virtual events. `VirtualLocation` is not a guided field.

## Global Constraints

- Node `>=24`. Package manager is pnpm; do not use npm or yarn.
- TypeScript `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. No enums, no parameter properties, no namespaces.
- Relative imports include the `.ts` extension (`./model.ts`).
- Nothing under `packages/schema-builder/src` may import a Node built-in, use a DOM API, or import a framework. `scripts/` and `test/` may use Node built-ins. Task 1 adds a test that enforces this.
- Drafts are immutable: every function returns new objects and never mutates its arguments.
- The only runtime dependency is `zod`, pinned to `4.6.5` as in the other packages. Do not add any other dependency.
- Limits, copied from the spec: 20 top-level items; nesting depth 5; 50 values per property; 100 properties per item; 5,000 characters per text value. This plan adds one bound the spec leaves open: type and property names are at most 100 characters.
- Output rules, copied from the spec: `"@context": "https://schema.org"`; `@type` first, then `@id`, then properties in the editor's order; one value as a scalar, several as an array; the script-tag form writes every `<` in the JSON as `\u003c`.
- Local storage key `pj-schema-draft`.
- Nothing is fetched from schema.org by the app, the build or the tests. Only Task 4, run by hand, downloads the release file.
- Required and recommended levels come from `packages/schema-builder/RULES.md` (Task 2). Do not change a level without changing that file.
- Work happens on branch `feat/schema-builder`, not `main`.
- The code blocks in this plan are not wrapped the way Prettier wants. Run `pnpm format` before every commit, then `pnpm format:check`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- If a Zod 4.6, Vitest 5 or TypeScript 7 API in this plan does not exist as written, check that package's current documentation and use the equivalent; do not downgrade the package.
- `pnpm install` may warn about ignored dependency build scripts. That is expected; do not approve them.

## Review Focus

Conditions the spec implies that are easy to miss. Each has a test in the task named.

1. A description contains `</script>` or `<!--`: the script-tag form must not let it end the block, and the raw form must leave it alone. (Task 3)
2. A top-level item is removed while another still refers to it: the output drops the reference without throwing, and the checks report it. (Tasks 3 and 5)
3. The person gives one item the `@id` that would have been generated for another (`#person`): no two items may end up with the same `@id`. (Task 3)
4. Local storage holds something hostile or stale: not JSON, a huge string, a draft nested fifty levels deep, an unknown version, duplicate item keys. Each must give "no draft", never an exception. (Task 6)
5. A half-typed value (`2026-13`, `12,50`, `htp:/x`) sits in a date, number or URL field: it is kept, written to the output as typed, and reported; nothing throws and nothing is silently dropped. (Tasks 3 and 5)

## File Structure

```
.prettierignore                         one line added: the vocabulary file is not reformatted
packages/schema-builder/
  package.json  tsconfig.json  vitest.config.ts
  RULES.md                              where each guided type's levels come from
  src/limits.ts                         LIMITS
  src/model.ts                          Draft, Item, Property, Value, paths, small readers
  src/changes.ts                        every draft-changing function, and limit checks
  src/guided/shape.ts                   Field, Definition, and the helpers that build them
  src/guided/shared.ts                  nested definitions used by several types
  src/guided/site.ts                    Organization, LocalBusiness, WebSite, BreadcrumbList, Person
  src/guided/content.ts                 Article, FAQPage, Recipe
  src/guided/commerce.ts                Product, Event
  src/definitions.ts                    the registry and its lookups
  src/serialize.ts                      serialize, toJson, toScriptTag, idsFor
  src/vocabulary.ts                     parseVocabulary and the functions that read one
  src/checks.ts                         check
  src/storage.ts                        pack, unpack
  src/fields.ts                         fieldsFor, definitionAt, accepts
  src/index.ts                          re-exports
  scripts/compact.ts                    compact, summary (pure)
  scripts/compact-vocabulary.ts         the command that runs compact on a release file
  test/helpers.ts                       builders shared by tests
  test/purity.test.ts  test/changes.test.ts  test/definitions.test.ts
  test/serialize.test.ts  test/compact.test.ts  test/vocabulary.test.ts
  test/checks.test.ts  test/storage.test.ts  test/fields.test.ts
  test/guided.test.ts                   each of the ten types against known-good markup
apps/web/static/schema/
  vocabulary.json                       the compacted Schema.org 30.1 vocabulary
  LICENSES.md                           source, licence, attribution, checksums
```

---

### Task 1: The package, the model and the changes

**Files:**
- Create: `packages/schema-builder/package.json`, `packages/schema-builder/tsconfig.json`, `packages/schema-builder/vitest.config.ts`
- Create: `packages/schema-builder/src/limits.ts`, `packages/schema-builder/src/model.ts`, `packages/schema-builder/src/changes.ts`, `packages/schema-builder/src/index.ts`
- Test: `packages/schema-builder/test/helpers.ts`, `packages/schema-builder/test/purity.test.ts`, `packages/schema-builder/test/changes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LIMITS: { items: 20; depth: 5; values: 50; properties: 100; text: 5000; name: 100 }`
  - `TEXT_KINDS`, `type TextKind`, `type ValueKind`, `type Value`, `interface Property { name: string; values: Value[] }`, `interface Item { key: string; type: string; id: string; properties: Property[] }`, `interface Draft { items: Item[] }`, `interface Step { property: string; index: number }`, `interface ItemPath { key: string; steps: Step[] }`
  - `emptyDraft(): Draft`, `newItem(key: string, type: string): Item`, `valuesOf(item: Item, name: string): Value[]`, `itemAt(draft: Draft, at: ItemPath): Item | undefined`, `blankValue(value: Value): boolean`, `blankItem(item: Item): boolean`
  - `type Refusal`, `interface Change { draft: Draft; refused?: Refusal }`, `valueProblem(value: Value, depth: number): Refusal | undefined`, `itemProblem(item: Item, depth: number): Refusal | undefined`, `draftProblem(draft: Draft): Refusal | undefined`
  - `addItem(draft, item: Item): Change`, `removeItem(draft, key: string): Change`, `moveItem(draft, key: string, by: -1 | 1): Change`, `setType(draft, at: ItemPath, type: string, keeps: (property: string) => boolean): Change`, `setId(draft, at: ItemPath, id: string): Change`, `addValue(draft, at: ItemPath, property: string, value: Value): Change`, `setValue(draft, at: ItemPath, step: Step, value: Value): Change`, `removeValue(draft, at: ItemPath, step: Step): Change`, `moveValue(draft, at: ItemPath, step: Step, by: -1 | 1): Change`, `refersTo(draft: Draft, key: string): boolean`
  - Test helpers in `test/helpers.ts`: `text(t, kind?)`, `nested(item)`, `ref(key)`, `make(type, properties?, key?)`, `draftOf(...items)`

- [ ] **Step 1: Create the package files**

`packages/schema-builder/package.json`:

```json
{
  "name": "@pokerji/schema-builder",
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
  "dependencies": {
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/node": "^24.0.0"
  }
}
```

`packages/schema-builder/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "scripts"]
}
```

`packages/schema-builder/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({});
```

Run: `pnpm install`
Expected: the new package is linked; no new versions are downloaded, because `zod@4.6.5` and `@types/node@24` are already in the lockfile.

- [ ] **Step 2: Write the test helpers and the failing tests**

`packages/schema-builder/test/helpers.ts`:

```ts
import type { Draft, Item, TextKind, Value } from '../src/index.ts';

export const text = (t: string, kind: TextKind = 'text'): Value => ({ kind, text: t });
export const nested = (item: Item): Value => ({ kind: 'item', item });
export const ref = (key: string): Value => ({ kind: 'reference', key });

let count = 0;

/** An item with the given properties, in the given order. */
export const make = (
  type: string,
  properties: Record<string, Value | Value[]> = {},
  key = `k${++count}`,
): Item => ({
  key,
  type,
  id: '',
  properties: Object.entries(properties).map(([name, value]) => ({
    name,
    values: [value].flat(),
  })),
});

export const draftOf = (...items: Item[]): Draft => ({ items });
```

`packages/schema-builder/test/purity.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

describe('the package source', () => {
  it('imports no Node built-in and touches no browser global', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((name) =>
      name.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(`${SRC}/${name}`, 'utf8');
      expect(source, name).not.toMatch(/from 'node:/);
      expect(source, name).not.toMatch(/\b(window|document|localStorage|navigator|fetch)\b/);
    }
  });
});
```

`packages/schema-builder/test/changes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addItem,
  addValue,
  blankItem,
  draftProblem,
  emptyDraft,
  itemAt,
  LIMITS,
  moveItem,
  moveValue,
  newItem,
  refersTo,
  removeItem,
  removeValue,
  setId,
  setType,
  setValue,
  valuesOf,
} from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const top = (key: string) => ({ key, steps: [] });

describe('items', () => {
  it('adds, moves and removes top-level items without mutating the draft', () => {
    const empty = emptyDraft();
    const one = addItem(empty, newItem('a', 'Person')).draft;
    const two = addItem(one, newItem('b', 'Organization')).draft;
    expect(empty.items).toEqual([]);
    expect(two.items.map((item) => item.key)).toEqual(['a', 'b']);
    expect(moveItem(two, 'b', -1).draft.items.map((item) => item.key)).toEqual(['b', 'a']);
    expect(moveItem(two, 'b', 1).draft).toBe(two);
    expect(removeItem(two, 'a').draft.items.map((item) => item.key)).toEqual(['b']);
  });

  it('refuses a twenty-first item, a repeated key and an unknown key', () => {
    let draft = emptyDraft();
    for (let n = 0; n < LIMITS.items; n += 1) draft = addItem(draft, newItem(`k${n}`, 'Thing')).draft;
    expect(addItem(draft, newItem('extra', 'Thing'))).toEqual({ draft, refused: 'too-many-items' });
    const small = draftOf(make('Thing', {}, 'a'));
    expect(addItem(small, newItem('a', 'Thing')).refused).toBe('duplicate-key');
    expect(removeItem(small, 'missing').refused).toBe('not-found');
  });
});

describe('values', () => {
  it('adds, changes, moves and removes values of a top-level item', () => {
    const start = draftOf(make('Person', {}, 'a'));
    const one = addValue(start, top('a'), 'name', text('Ada')).draft;
    const two = addValue(one, top('a'), 'name', text('Countess')).draft;
    expect(valuesOf(two.items[0]!, 'name')).toEqual([text('Ada'), text('Countess')]);
    const moved = moveValue(two, top('a'), { property: 'name', index: 1 }, -1).draft;
    expect(valuesOf(moved.items[0]!, 'name')).toEqual([text('Countess'), text('Ada')]);
    const changed = setValue(moved, top('a'), { property: 'name', index: 0 }, text('Lovelace')).draft;
    expect(valuesOf(changed.items[0]!, 'name')[0]).toEqual(text('Lovelace'));
    const removed = removeValue(changed, top('a'), { property: 'name', index: 0 }).draft;
    expect(valuesOf(removed.items[0]!, 'name')).toEqual([text('Ada')]);
    expect(valuesOf(start.items[0]!, 'name')).toEqual([]);
  });

  it('drops a property when its last value is removed', () => {
    const start = draftOf(make('Person', { name: text('Ada') }, 'a'));
    const removed = removeValue(start, top('a'), { property: 'name', index: 0 }).draft;
    expect(removed.items[0]!.properties).toEqual([]);
  });

  it('reaches a nested item through a path', () => {
    const start = draftOf(make('Product', { offers: nested(make('Offer', {}, 'o')) }, 'p'));
    const at = { key: 'p', steps: [{ property: 'offers', index: 0 }] };
    const next = addValue(start, at, 'price', text('9.50', 'number')).draft;
    expect(valuesOf(itemAt(next, at)!, 'price')).toEqual([text('9.50', 'number')]);
    expect(itemAt(start, at)!.properties).toEqual([]);
  });

  it('refuses a path that does not lead to an item', () => {
    const start = draftOf(make('Person', { name: text('Ada') }, 'a'));
    const bad = { key: 'a', steps: [{ property: 'name', index: 0 }] };
    expect(addValue(start, bad, 'x', text('y')).refused).toBe('not-found');
    expect(setValue(start, top('a'), { property: 'name', index: 5 }, text('y')).refused).toBe(
      'not-found',
    );
    expect(itemAt(start, bad)).toBeUndefined();
  });

  it('refuses the fifty-first value and the hundred-and-first property', () => {
    let draft = draftOf(make('Thing', {}, 'a'));
    for (let n = 0; n < LIMITS.values; n += 1) draft = addValue(draft, top('a'), 'name', text('x')).draft;
    expect(addValue(draft, top('a'), 'name', text('x')).refused).toBe('too-many-values');

    let wide = draftOf(make('Thing', {}, 'a'));
    for (let n = 0; n < LIMITS.properties; n += 1) wide = addValue(wide, top('a'), `p${n}`, text('x')).draft;
    expect(addValue(wide, top('a'), 'another', text('x')).refused).toBe('too-many-properties');
    expect(addValue(wide, top('a'), 'p0', text('y')).refused).toBeUndefined();
  });

  it('refuses text longer than the limit and names longer than the limit', () => {
    const start = draftOf(make('Thing', {}, 'a'));
    const long = 'x'.repeat(LIMITS.text + 1);
    expect(addValue(start, top('a'), 'name', text(long)).refused).toBe('too-long');
    expect(addValue(start, top('a'), 'n'.repeat(LIMITS.name + 1), text('x')).refused).toBe('too-long');
    expect(setId(start, top('a'), long).refused).toBe('too-long');
    expect(addValue(start, top('a'), 'name', text('x'.repeat(LIMITS.text))).refused).toBeUndefined();
  });

  it('refuses nesting deeper than five items', () => {
    let draft = draftOf(make('Thing', {}, 'd1'));
    const steps: { property: string; index: number }[] = [];
    for (let depth = 2; depth <= LIMITS.depth; depth += 1) {
      const change = addValue(draft, { key: 'd1', steps: [...steps] }, 'about', nested(make('Thing')));
      expect(change.refused).toBeUndefined();
      draft = change.draft;
      steps.push({ property: 'about', index: 0 });
    }
    expect(addValue(draft, { key: 'd1', steps }, 'about', nested(make('Thing'))).refused).toBe(
      'too-deep',
    );
    expect(draftProblem(draft)).toBeUndefined();
  });

  it('counts the depth of a nested item that arrives already filled', () => {
    const deep = make('Thing', { about: nested(make('Thing', { about: nested(make('Thing')) })) });
    const start = draftOf(
      make('Thing', { about: nested(make('Thing', { about: nested(make('Thing', {}, 'c')) }, 'b')) }, 'a'),
    );
    const at = {
      key: 'a',
      steps: [
        { property: 'about', index: 0 },
        { property: 'about', index: 0 },
      ],
    };
    expect(addValue(start, at, 'about', nested(deep)).refused).toBe('too-deep');
  });
});

describe('type and id', () => {
  it('keeps only the properties the new type has', () => {
    const start = draftOf(make('Article', { headline: text('Hi'), wordCount: text('9', 'number') }, 'a'));
    const next = setType(start, top('a'), 'Person', (property) => property === 'headline').draft;
    expect(next.items[0]).toMatchObject({ type: 'Person', properties: [{ name: 'headline' }] });
  });

  it('sets an id', () => {
    const start = draftOf(make('Person', {}, 'a'));
    expect(setId(start, top('a'), '#me').draft.items[0]!.id).toBe('#me');
  });
});

describe('references and blanks', () => {
  it('finds a reference at any depth', () => {
    const draft = draftOf(
      make('Organization', {}, 'org'),
      make('Article', { author: nested(make('Person', { worksFor: ref('org') })) }, 'art'),
    );
    expect(refersTo(draft, 'org')).toBe(true);
    expect(refersTo(draft, 'art')).toBe(false);
  });

  it('treats whitespace and empty nested items as blank, and false as a value', () => {
    expect(blankItem(make('Offer', { price: text('  ', 'number') }))).toBe(true);
    expect(blankItem(make('Product', { offers: nested(make('Offer')) }))).toBe(true);
    expect(blankItem(make('Offer', { price: text('0', 'number') }))).toBe(false);
    expect(blankItem(make('Thing', { isFamilyFriendly: { kind: 'boolean', on: false } }))).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm --filter @pokerji/schema-builder test`
Expected: FAIL, because `../src/index.ts` does not exist.

- [ ] **Step 4: Write the model**

`packages/schema-builder/src/limits.ts`:

```ts
/** Every bound on a draft. Enforced on each change and again on a draft read from storage. */
export const LIMITS = {
  items: 20,
  depth: 5,
  values: 50,
  properties: 100,
  text: 5_000,
  name: 100,
} as const;
```

`packages/schema-builder/src/model.ts`:

```ts
export const TEXT_KINDS = ['text', 'number', 'date', 'dateTime', 'time', 'url'] as const;
export type TextKind = (typeof TEXT_KINDS)[number];
export type ValueKind = TextKind | 'boolean' | 'item' | 'reference';

/**
 * One value of a property. Text-like kinds hold what the person typed, valid or not;
 * whether it fits its kind is for the checks to say.
 */
export type Value =
  | { kind: TextKind; text: string }
  | { kind: 'boolean'; on: boolean }
  | { kind: 'item'; item: Item }
  | { kind: 'reference'; key: string };

export interface Property {
  name: string;
  values: Value[];
}

export interface Item {
  /** Local identifier, never written to the output. */
  key: string;
  type: string;
  /** The person's own `@id`, or empty. */
  id: string;
  properties: Property[];
}

export interface Draft {
  items: Item[];
}

/** One hop from an item to a nested item: the value at `index` of `property`. */
export interface Step {
  property: string;
  index: number;
}

/** Where an item is: a top-level item's key, then hops down to a nested one. */
export interface ItemPath {
  key: string;
  steps: Step[];
}

export const emptyDraft = (): Draft => ({ items: [] });

export const newItem = (key: string, type: string): Item => ({ key, type, id: '', properties: [] });

export const valuesOf = (item: Item, name: string): Value[] =>
  item.properties.find((property) => property.name === name)?.values ?? [];

export const itemAt = (draft: Draft, at: ItemPath): Item | undefined => {
  let item = draft.items.find((candidate) => candidate.key === at.key);
  for (const step of at.steps) {
    if (!item) return undefined;
    const value = valuesOf(item, step.property)[step.index];
    item = value?.kind === 'item' ? value.item : undefined;
  }
  return item;
};

/** Whether a value says nothing. `false` and `0` say something. */
export const blankValue = (value: Value): boolean => {
  switch (value.kind) {
    case 'boolean':
      return false;
    case 'reference':
      return value.key === '';
    case 'item':
      return blankItem(value.item);
    default:
      return value.text.trim() === '';
  }
};

export const blankItem = (item: Item): boolean =>
  item.properties.every((property) => property.values.every(blankValue));
```

- [ ] **Step 5: Write the changes**

`packages/schema-builder/src/changes.ts`:

```ts
import { LIMITS } from './limits.ts';
import type { Draft, Item, ItemPath, Step, Value } from './model.ts';
import { valuesOf } from './model.ts';

export const REFUSALS = [
  'too-many-items',
  'too-deep',
  'too-many-values',
  'too-many-properties',
  'too-long',
  'not-found',
  'duplicate-key',
] as const;
export type Refusal = (typeof REFUSALS)[number];

/** The result of a change. When `refused` is set, `draft` is the one passed in, untouched. */
export interface Change {
  draft: Draft;
  refused?: Refusal;
}

/** What is wrong with a value held by an item at `depth`, if anything. */
export const valueProblem = (value: Value, depth: number): Refusal | undefined => {
  if (value.kind === 'item') return itemProblem(value.item, depth + 1);
  if (value.kind === 'boolean') return undefined;
  const held = value.kind === 'reference' ? value.key : value.text;
  return held.length > LIMITS.text ? 'too-long' : undefined;
};

/** What is wrong with an item at `depth` (a top-level item is at depth 1), if anything. */
export const itemProblem = (item: Item, depth: number): Refusal | undefined => {
  if (depth > LIMITS.depth) return 'too-deep';
  if (item.type.length > LIMITS.name || item.key.length > LIMITS.name) return 'too-long';
  if (item.id.length > LIMITS.text) return 'too-long';
  if (item.properties.length > LIMITS.properties) return 'too-many-properties';
  for (const property of item.properties) {
    if (property.name.length > LIMITS.name) return 'too-long';
    if (property.values.length > LIMITS.values) return 'too-many-values';
    for (const value of property.values) {
      const problem = valueProblem(value, depth);
      if (problem) return problem;
    }
  }
  return undefined;
};

export const draftProblem = (draft: Draft): Refusal | undefined => {
  if (draft.items.length > LIMITS.items) return 'too-many-items';
  const keys = new Set(draft.items.map((item) => item.key));
  if (keys.size !== draft.items.length) return 'duplicate-key';
  for (const item of draft.items) {
    const problem = itemProblem(item, 1);
    if (problem) return problem;
  }
  return undefined;
};

const refuse = (draft: Draft, refused: Refusal): Change => ({ draft, refused });

const swap = <T>(list: T[], index: number, by: -1 | 1): T[] => {
  const one = list[index];
  const other = list[index + by];
  if (one === undefined || other === undefined) return list;
  const next = [...list];
  next[index] = other;
  next[index + by] = one;
  return next;
};

/** Replaces one property's values. A property left with none is dropped. */
const withValues = (item: Item, name: string, change: (values: Value[]) => Value[]): Item => {
  const known = item.properties.some((property) => property.name === name);
  const properties = known
    ? item.properties.map((property) =>
        property.name === name ? { name, values: change(property.values) } : property,
      )
    : [...item.properties, { name, values: change([]) }];
  return { ...item, properties: properties.filter((property) => property.values.length > 0) };
};

/** Applies `change` to the item at `at`, rebuilding every item above it. */
const edit = (
  draft: Draft,
  at: ItemPath,
  change: (item: Item, depth: number) => Item | Refusal,
): Change => {
  const walk = (item: Item, steps: Step[], depth: number): Item | Refusal => {
    const [step, ...rest] = steps;
    if (!step) return change(item, depth);
    const value = valuesOf(item, step.property)[step.index];
    if (value?.kind !== 'item') return 'not-found';
    const next = walk(value.item, rest, depth + 1);
    if (typeof next === 'string') return next;
    return withValues(item, step.property, (values) =>
      values.map((held, index) => (index === step.index ? { kind: 'item', item: next } : held)),
    );
  };
  const position = draft.items.findIndex((item) => item.key === at.key);
  const top = draft.items[position];
  if (!top) return refuse(draft, 'not-found');
  const next = walk(top, at.steps, 1);
  if (typeof next === 'string') return refuse(draft, next);
  return { draft: { items: draft.items.map((item, index) => (index === position ? next : item)) } };
};

export const addItem = (draft: Draft, item: Item): Change => {
  if (draft.items.length >= LIMITS.items) return refuse(draft, 'too-many-items');
  if (draft.items.some((held) => held.key === item.key)) return refuse(draft, 'duplicate-key');
  const problem = itemProblem(item, 1);
  if (problem) return refuse(draft, problem);
  return { draft: { items: [...draft.items, item] } };
};

export const removeItem = (draft: Draft, key: string): Change =>
  draft.items.some((item) => item.key === key)
    ? { draft: { items: draft.items.filter((item) => item.key !== key) } }
    : refuse(draft, 'not-found');

/** Moves an item one place. At either end the draft comes back as it was. */
export const moveItem = (draft: Draft, key: string, by: -1 | 1): Change => {
  const index = draft.items.findIndex((item) => item.key === key);
  if (index < 0) return refuse(draft, 'not-found');
  const items = swap(draft.items, index, by);
  return items === draft.items ? { draft } : { draft: { items } };
};

/** Changes an item's type, keeping only the properties `keeps` accepts. */
export const setType = (
  draft: Draft,
  at: ItemPath,
  type: string,
  keeps: (property: string) => boolean,
): Change =>
  edit(draft, at, (item) =>
    type.length > LIMITS.name
      ? 'too-long'
      : { ...item, type, properties: item.properties.filter((property) => keeps(property.name)) },
  );

export const setId = (draft: Draft, at: ItemPath, id: string): Change =>
  edit(draft, at, (item) => (id.length > LIMITS.text ? 'too-long' : { ...item, id }));

export const addValue = (draft: Draft, at: ItemPath, property: string, value: Value): Change =>
  edit(draft, at, (item, depth) => {
    if (property.length > LIMITS.name) return 'too-long';
    const held = valuesOf(item, property);
    if (held.length === 0 && item.properties.length >= LIMITS.properties) {
      return 'too-many-properties';
    }
    if (held.length >= LIMITS.values) return 'too-many-values';
    return valueProblem(value, depth) ?? withValues(item, property, (values) => [...values, value]);
  });

export const setValue = (draft: Draft, at: ItemPath, step: Step, value: Value): Change =>
  edit(draft, at, (item, depth) => {
    if (valuesOf(item, step.property)[step.index] === undefined) return 'not-found';
    return (
      valueProblem(value, depth) ??
      withValues(item, step.property, (values) =>
        values.map((held, index) => (index === step.index ? value : held)),
      )
    );
  });

export const removeValue = (draft: Draft, at: ItemPath, step: Step): Change =>
  edit(draft, at, (item) =>
    valuesOf(item, step.property)[step.index] === undefined
      ? 'not-found'
      : withValues(item, step.property, (values) =>
          values.filter((_, index) => index !== step.index),
        ),
  );

/** Moves a value one place within its property. At either end nothing changes. */
export const moveValue = (draft: Draft, at: ItemPath, step: Step, by: -1 | 1): Change =>
  edit(draft, at, (item) =>
    valuesOf(item, step.property)[step.index] === undefined
      ? 'not-found'
      : withValues(item, step.property, (values) => swap(values, step.index, by)),
  );

const mentions = (item: Item, key: string): boolean =>
  item.properties.some((property) =>
    property.values.some(
      (value) =>
        (value.kind === 'reference' && value.key === key) ||
        (value.kind === 'item' && mentions(value.item, key)),
    ),
  );

/** Whether anything in the draft refers to the top-level item `key`. */
export const refersTo = (draft: Draft, key: string): boolean =>
  draft.items.some((item) => mentions(item, key));
```

`packages/schema-builder/src/index.ts`:

```ts
export * from './changes.ts';
export * from './limits.ts';
export * from './model.ts';
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm --filter @pokerji/schema-builder test && pnpm --filter @pokerji/schema-builder typecheck`
Expected: every test passes; the typecheck prints nothing.

- [ ] **Step 7: Commit**

```bash
git add packages/schema-builder pnpm-lock.yaml
git commit -m "feat: the schema builder's draft model and changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The guided types

**Files:**
- Create: `packages/schema-builder/src/guided/shape.ts`, `packages/schema-builder/src/guided/shared.ts`, `packages/schema-builder/src/guided/site.ts`, `packages/schema-builder/src/guided/content.ts`, `packages/schema-builder/src/guided/commerce.ts`
- Create: `packages/schema-builder/src/definitions.ts`, `packages/schema-builder/RULES.md`
- Modify: `packages/schema-builder/src/index.ts`
- Test: `packages/schema-builder/test/definitions.test.ts`

**Interfaces:**
- Consumes: `ValueKind` from `src/model.ts`.
- Produces:
  - `type Level = 'required' | 'recommended' | 'optional'`, `type Format = 'currency' | 'rating'`
  - `interface Field { property: string; label: string; hint: string; kinds: ValueKind[]; level: Level; repeats: boolean; nested?: Record<string, string>; choices?: string[]; format?: Format; numbered?: boolean }`. `kinds[0]` is the kind a new value starts as. `nested` maps a nested item's type to the id of the definition used for it. A field whose kinds include `'item'` also accepts a reference; that is a rule of the editor, not data.
  - `interface Definition { id: string; type: string; variants: string[]; label: string; note: string; fields: Field[]; oneOf: string[][] }`. Each `oneOf` group is a list of properties of which at least one must have a value.
  - `GUIDED: string[]` (the ten top-level definition ids, in display order), `DEFINITIONS: Record<string, Definition>`, `RULES_CHECKED: string`
  - `topDefinition(type: string): Definition | undefined` (matches a top-level definition's type or one of its variants)
  - `nestedDefinition(field: Field | undefined, type: string): Definition | undefined`

- [ ] **Step 1: Write the failing test**

`packages/schema-builder/test/definitions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFINITIONS,
  GUIDED,
  nestedDefinition,
  RULES_CHECKED,
  topDefinition,
} from '../src/index.ts';

const all = Object.values(DEFINITIONS);

describe('the guided definitions', () => {
  it('offers the ten types in order', () => {
    expect(GUIDED).toEqual([
      'Organization',
      'LocalBusiness',
      'WebSite',
      'BreadcrumbList',
      'Article',
      'FAQPage',
      'Product',
      'Event',
      'Person',
      'Recipe',
    ]);
    for (const id of GUIDED) expect(DEFINITIONS[id]?.type).toBe(id);
  });

  it('files every definition under its own id', () => {
    for (const [id, definition] of Object.entries(DEFINITIONS)) expect(definition.id).toBe(id);
  });

  it('gives every field a label, at least one kind and no repeated property', () => {
    for (const definition of all) {
      const names = definition.fields.map((field) => field.property);
      expect(new Set(names).size, definition.id).toBe(names.length);
      for (const field of definition.fields) {
        expect(field.label, `${definition.id}.${field.property}`).not.toBe('');
        expect(field.kinds.length, `${definition.id}.${field.property}`).toBeGreaterThan(0);
      }
    }
  });

  it('points every nested item at a definition that exists', () => {
    for (const definition of all) {
      for (const field of definition.fields) {
        const where = `${definition.id}.${field.property}`;
        if (field.kinds.includes('item')) {
          expect(Object.keys(field.nested ?? {}).length, where).toBeGreaterThan(0);
        }
        for (const id of Object.values(field.nested ?? {})) {
          expect(DEFINITIONS[id], `${where} -> ${id}`).toBeDefined();
        }
      }
    }
  });

  it('offers choices only on text fields, as full Schema.org addresses', () => {
    for (const definition of all) {
      for (const field of definition.fields) {
        if (!field.choices) continue;
        expect(field.kinds[0]).toBe('text');
        for (const choice of field.choices) expect(choice).toMatch(/^https:\/\/schema\.org\/\w+$/);
      }
    }
  });

  it('names only its own fields in a one-of group', () => {
    for (const definition of all) {
      for (const group of definition.oneOf) {
        expect(group.length).toBeGreaterThan(1);
        for (const name of group) {
          expect(definition.fields.map((field) => field.property)).toContain(name);
        }
      }
    }
  });

  it('finds a top-level definition by type or variant, and nothing for a nested type', () => {
    expect(topDefinition('Article')?.id).toBe('Article');
    expect(topDefinition('BlogPosting')?.id).toBe('Article');
    expect(topDefinition('NewsArticle')?.id).toBe('Article');
    expect(topDefinition('Offer')).toBeUndefined();
    expect(topDefinition('PostalAddress')).toBeUndefined();
  });

  it('finds a nested definition through its field', () => {
    const offers = DEFINITIONS.Product?.fields.find((field) => field.property === 'offers');
    expect(nestedDefinition(offers, 'Offer')?.id).toBe('Product.Offer');
    expect(nestedDefinition(offers, 'Demand')).toBeUndefined();
    expect(nestedDefinition(undefined, 'Offer')).toBeUndefined();
  });

  it('marks the levels Google documents', () => {
    const levels = (id: string, level: string) =>
      DEFINITIONS[id]?.fields.filter((field) => field.level === level).map((field) => field.property);
    expect(levels('Organization', 'required')).toEqual([]);
    expect(levels('LocalBusiness', 'required')).toEqual(['name', 'address']);
    expect(levels('WebSite', 'required')).toEqual(['name', 'url']);
    expect(levels('BreadcrumbList', 'required')).toEqual(['itemListElement']);
    expect(levels('Article', 'required')).toEqual([]);
    expect(levels('Article', 'recommended')).toEqual([
      'headline',
      'image',
      'datePublished',
      'dateModified',
      'author',
    ]);
    expect(levels('FAQPage', 'required')).toEqual([]);
    expect(levels('Product', 'required')).toEqual(['name']);
    expect(DEFINITIONS.Product?.oneOf).toEqual([['offers', 'aggregateRating', 'review']]);
    expect(levels('Product.Offer', 'required')).toEqual(['price']);
    expect(levels('Event', 'required')).toEqual(['name', 'startDate', 'location']);
    expect(levels('Event.Place', 'required')).toEqual(['address']);
    expect(levels('Person', 'required')).toEqual([]);
    expect(levels('Recipe', 'required')).toEqual(['name', 'image']);
    expect(levels('AggregateRating', 'required')).toEqual(['ratingValue']);
    expect(DEFINITIONS.AggregateRating?.oneOf).toEqual([['ratingCount', 'reviewCount']]);
  });

  it('says when the rules were last checked', () => {
    expect(RULES_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/definitions.test.ts`
Expected: FAIL, because `DEFINITIONS` is not exported.

- [ ] **Step 3: Write the shape and its helpers**

`packages/schema-builder/src/guided/shape.ts`:

```ts
import type { ValueKind } from '../model.ts';

export type Level = 'required' | 'recommended' | 'optional';
export type Format = 'currency' | 'rating';

export interface Field {
  property: string;
  label: string;
  /** One plain line under the label. May be empty. */
  hint: string;
  /** The kinds of value the field takes. The first is what a new value starts as. */
  kinds: ValueKind[];
  level: Level;
  repeats: boolean;
  /** For an item value: the definition used for each type the field offers. */
  nested?: Record<string, string>;
  /** Values offered for a text field, as full Schema.org addresses. */
  choices?: string[];
  format?: Format;
  /** Nested items are written with a `position`, counted from 1. */
  numbered?: boolean;
}

export interface Definition {
  id: string;
  type: string;
  /** Other types the same form serves. */
  variants: string[];
  label: string;
  /** Shown above the form. Empty when there is nothing to say. */
  note: string;
  fields: Field[];
  /** Groups of properties of which at least one must have a value. */
  oneOf: string[][];
}

export const REQ: Level = 'required';
export const REC: Level = 'recommended';
export const OPT: Level = 'optional';

export const field = (
  property: string,
  label: string,
  hint: string,
  kinds: ValueKind | ValueKind[],
  level: Level,
  extra: Partial<Field> = {},
): Field => ({ property, label, hint, kinds: [kinds].flat(), level, repeats: false, ...extra });

/** A definition whose type is the last part of its id: `Product.Offer` is for `Offer`. */
export const define = (
  id: string,
  label: string,
  fields: Field[],
  extra: Partial<Definition> = {},
): Definition => ({
  id,
  type: id.split('.').pop() ?? id,
  variants: [],
  label,
  note: '',
  fields,
  oneOf: [],
  ...extra,
});

export const schema = (...names: string[]): string[] =>
  names.map((name) => `https://schema.org/${name}`);
```

- [ ] **Step 4: Write the shared nested definitions**

`packages/schema-builder/src/guided/shared.ts`:

```ts
import type { Field, Level } from './shape.ts';
import { define, field, OPT, REC, REQ } from './shape.ts';

export const POSTAL_ADDRESS = define('PostalAddress', 'Postal address', [
  field('streetAddress', 'Street address', 'Building number and street.', 'text', REC),
  field('addressLocality', 'Town or city', '', 'text', REC),
  field('addressRegion', 'Region', 'State, province or county.', 'text', REC),
  field('postalCode', 'Postal code', '', 'text', REC),
  field('addressCountry', 'Country', 'Two-letter code, such as US or GB.', 'text', REC),
]);

export const IMAGE_OBJECT = define('ImageObject', 'Image', [
  field('url', 'Image address', 'The full address of the image file.', 'url', REQ),
  field('caption', 'Caption', '', 'text', OPT),
]);

export const PARTY_PERSON = define('Party.Person', 'Person', [
  field('name', 'Name', '', 'text', REC),
  field('url', 'Web address', 'A page about this person.', 'url', REC),
]);

export const PARTY_ORGANIZATION = define('Party.Organization', 'Organization', [
  field('name', 'Name', '', 'text', REC),
  field('url', 'Web address', 'The organization’s site.', 'url', REC),
]);

export const RATING = define('Rating', 'Rating', [
  field('ratingValue', 'Rating', 'A number on the scale below.', 'number', REQ, {
    format: 'rating',
  }),
  field('bestRating', 'Best possible', '5 if left empty.', 'number', REC),
  field('worstRating', 'Worst possible', '1 if left empty.', 'number', REC),
]);

export const AGGREGATE_RATING = define(
  'AggregateRating',
  'Average rating',
  [
    field('ratingValue', 'Average rating', 'A number on the scale below.', 'number', REQ, {
      format: 'rating',
    }),
    field('ratingCount', 'Number of ratings', '', 'number', OPT),
    field('reviewCount', 'Number of reviews', '', 'number', OPT),
    field('bestRating', 'Best possible', '5 if left empty.', 'number', REC),
    field('worstRating', 'Worst possible', '1 if left empty.', 'number', REC),
  ],
  { oneOf: [['ratingCount', 'reviewCount']] },
);

export const SHARED = [
  POSTAL_ADDRESS,
  IMAGE_OBJECT,
  PARTY_PERSON,
  PARTY_ORGANIZATION,
  RATING,
  AGGREGATE_RATING,
];

export const image = (level: Level): Field =>
  field('image', 'Image', 'An image address, or an image with a caption.', ['url', 'item'], level, {
    repeats: true,
    nested: { ImageObject: 'ImageObject' },
  });

export const address = (level: Level, extra: Partial<Field> = {}): Field =>
  field('address', 'Address', '', 'item', level, {
    nested: { PostalAddress: 'PostalAddress' },
    ...extra,
  });

/** A field that takes a person or an organization. */
export const party = (
  property: string,
  label: string,
  hint: string,
  level: Level,
  extra: Partial<Field> = {},
): Field =>
  field(property, label, hint, 'item', level, {
    nested: { Person: 'Party.Person', Organization: 'Party.Organization' },
    ...extra,
  });

export const aggregateRating = (level: Level): Field =>
  field('aggregateRating', 'Average rating', 'Only for ratings your own site collected.', 'item', level, {
    nested: { AggregateRating: 'AggregateRating' },
  });
```

- [ ] **Step 5: Write the site types**

`packages/schema-builder/src/guided/site.ts`:

```ts
import { address, image, party } from './shared.ts';
import { define, field, OPT, REC, REQ, schema } from './shape.ts';

const CONTACT_POINT = define('ContactPoint', 'Contact point', [
  field('contactType', 'What it is for', 'Such as customer service or sales.', 'text', OPT),
  field('telephone', 'Telephone', 'With the country code, such as +1 201 555 0100.', 'text', REC),
  field('email', 'Email', '', 'text', REC),
]);

const GEO_COORDINATES = define('GeoCoordinates', 'Coordinates', [
  field('latitude', 'Latitude', 'At least five decimal places.', 'number', REC),
  field('longitude', 'Longitude', 'At least five decimal places.', 'number', REC),
]);

const OPENING_HOURS = define('OpeningHoursSpecification', 'Opening hours', [
  field('dayOfWeek', 'Days', '', 'text', REC, {
    repeats: true,
    choices: schema(
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ),
  }),
  field('opens', 'Opens', 'Such as 09:00.', 'time', REC),
  field('closes', 'Closes', 'Such as 17:30.', 'time', REC),
  field('validFrom', 'From', 'Only for seasonal hours.', 'date', OPT),
  field('validThrough', 'Until', 'Only for seasonal hours.', 'date', OPT),
]);

const BREADCRUMB_ITEM = define('Breadcrumb.ListItem', 'Step', [
  field('name', 'Title', 'What the breadcrumb says.', 'text', REQ),
  field('item', 'Page address', 'May be left empty on the last step.', 'url', REC),
]);

const ORGANIZATION = define(
  'Organization',
  'Organization',
  [
    field('name', 'Name', '', 'text', REC),
    field('url', 'Website', '', 'url', REC),
    field('logo', 'Logo', 'The address of the logo image.', ['url', 'item'], REC, {
      nested: { ImageObject: 'ImageObject' },
    }),
    field('description', 'Description', '', 'text', REC),
    field('alternateName', 'Also known as', '', 'text', REC),
    field('legalName', 'Registered name', '', 'text', REC),
    field('email', 'Email', '', 'text', REC),
    field('telephone', 'Telephone', 'With the country code.', 'text', REC),
    address(REC, { repeats: true }),
    field('contactPoint', 'Contact point', '', 'item', REC, {
      repeats: true,
      nested: { ContactPoint: 'ContactPoint' },
    }),
    field('sameAs', 'Profiles elsewhere', 'Addresses of pages about it on other sites.', 'url', REC, {
      repeats: true,
    }),
    field('foundingDate', 'Founded', '', 'date', REC),
    field('taxID', 'Tax ID', '', 'text', OPT),
    field('vatID', 'VAT ID', '', 'text', OPT),
    field('iso6523Code', 'ISO 6523 code', '', 'text', OPT),
    field('naics', 'NAICS code', '', 'text', OPT),
    field('globalLocationNumber', 'Global Location Number', '', 'text', OPT),
    field('duns', 'DUNS number', '', 'text', OPT),
    field('leiCode', 'LEI code', '', 'text', OPT),
  ],
  { note: 'Put this on your home page or a page that describes the organization.' },
);

const LOCAL_BUSINESS = define(
  'LocalBusiness',
  'Local business',
  [
    field('name', 'Name', '', 'text', REQ),
    address(REQ),
    field('url', 'Website', 'The page for this location.', 'url', REC),
    field('telephone', 'Telephone', 'With the country code.', 'text', REC),
    field('priceRange', 'Price range', 'Such as $$ or $10-15.', 'text', REC),
    field('geo', 'Coordinates', '', 'item', REC, {
      nested: { GeoCoordinates: 'GeoCoordinates' },
    }),
    field('openingHoursSpecification', 'Opening hours', 'One entry for each set of days.', 'item', REC, {
      repeats: true,
      nested: { OpeningHoursSpecification: 'OpeningHoursSpecification' },
    }),
    image(OPT),
  ],
  {
    note: 'For a more exact type, such as Restaurant or Dentist, choose “Another type”.',
  },
);

const WEB_SITE = define(
  'WebSite',
  'Website',
  [
    field('name', 'Site name', '', 'text', REQ),
    field('url', 'Home page', 'The address of the home page.', 'url', REQ),
    field('alternateName', 'Other names', 'A shorter name or an acronym.', 'text', REC, {
      repeats: true,
    }),
  ],
  { note: 'This belongs on the home page only.' },
);

const BREADCRUMB_LIST = define('BreadcrumbList', 'Breadcrumbs', [
  field('itemListElement', 'Steps', 'From the top of the site down to this page.', 'item', REQ, {
    repeats: true,
    numbered: true,
    nested: { ListItem: 'Breadcrumb.ListItem' },
  }),
]);

const PERSON = define(
  'Person',
  'Person',
  [
    field('name', 'Name', '', 'text', REC),
    field('url', 'Web address', 'A page about this person.', 'url', REC),
    image(REC),
    field('jobTitle', 'Job title', '', 'text', REC),
    party('worksFor', 'Works for', '', REC, { nested: { Organization: 'Party.Organization' } }),
    field('sameAs', 'Profiles elsewhere', 'Addresses of pages about them on other sites.', 'url', REC, {
      repeats: true,
    }),
    field('description', 'Description', '', 'text', OPT),
    field('email', 'Email', '', 'text', OPT),
    field('telephone', 'Telephone', '', 'text', OPT),
    address(OPT),
  ],
  {
    note: 'Google documents no search result for a person on their own, so nothing here is required.',
  },
);

export const SITE = [
  CONTACT_POINT,
  GEO_COORDINATES,
  OPENING_HOURS,
  BREADCRUMB_ITEM,
  ORGANIZATION,
  LOCAL_BUSINESS,
  WEB_SITE,
  BREADCRUMB_LIST,
  PERSON,
];
```

- [ ] **Step 6: Write the content types**

`packages/schema-builder/src/guided/content.ts`:

```ts
import { aggregateRating, image, party } from './shared.ts';
import { define, field, OPT, REC, REQ } from './shape.ts';

const ANSWER = define('Answer', 'Answer', [field('text', 'Answer', '', 'text', REC)]);

const QUESTION = define('Question', 'Question', [
  field('name', 'Question', '', 'text', REC),
  field('acceptedAnswer', 'Answer', '', 'item', REC, { nested: { Answer: 'Answer' } }),
]);

const HOW_TO_STEP = define('HowToStep', 'Step', [
  field('text', 'What to do', '', 'text', REQ),
  field('name', 'Short title', '', 'text', REC),
  field('url', 'Link to this step', '', 'url', REC),
  image(REC),
]);

const NUTRITION = define('NutritionInformation', 'Nutrition', [
  field('calories', 'Calories', 'Such as 270 calories. Needs a yield as well.', 'text', REC),
]);

const ARTICLE = define(
  'Article',
  'Article',
  [
    field('headline', 'Headline', '', 'text', REC),
    image(REC),
    field('datePublished', 'Published', 'With the time zone, such as 2026-10-13T08:00:00+00:00.', [
      'dateTime',
      'date',
    ], REC),
    field('dateModified', 'Last changed', '', ['dateTime', 'date'], REC),
    party('author', 'Author', 'One entry for each author.', REC, { repeats: true }),
    field('description', 'Summary', '', 'text', OPT),
    party('publisher', 'Publisher', '', OPT, { nested: { Organization: 'Party.Organization' } }),
    field('mainEntityOfPage', 'Page address', 'The address of the page the article is on.', 'url', OPT),
  ],
  { variants: ['BlogPosting', 'NewsArticle'] },
);

const FAQ_PAGE = define(
  'FAQPage',
  'FAQ page',
  [
    field('mainEntity', 'Questions', '', 'item', REC, {
      repeats: true,
      nested: { Question: 'Question' },
    }),
  ],
  {
    note: 'Google stopped showing FAQ results in 2026. The markup is still valid Schema.org and other readers use it.',
  },
);

const RECIPE = define('Recipe', 'Recipe', [
  field('name', 'Name of the dish', '', 'text', REQ),
  image(REQ),
  field('description', 'Description', '', 'text', REC),
  party('author', 'Author', '', REC),
  field('datePublished', 'Published', '', 'date', REC),
  field('prepTime', 'Preparation time', 'As a duration: PT20M is twenty minutes.', 'text', REC),
  field('cookTime', 'Cooking time', 'As a duration: PT1H30M is an hour and a half.', 'text', REC),
  field('totalTime', 'Total time', 'As a duration.', 'text', REC),
  field('recipeYield', 'Makes', 'Such as 4 servings.', 'text', REC),
  field('recipeCategory', 'Kind of dish', 'Such as dinner or dessert.', 'text', REC),
  field('recipeCuisine', 'Cuisine', 'Such as French or Mexican.', 'text', REC),
  field('keywords', 'Keywords', 'Separated by commas.', 'text', REC),
  field('recipeIngredient', 'Ingredients', 'One entry for each ingredient.', 'text', REC, {
    repeats: true,
  }),
  field('recipeInstructions', 'Steps', 'One entry for each step.', ['item', 'text'], REC, {
    repeats: true,
    nested: { HowToStep: 'HowToStep' },
  }),
  field('nutrition', 'Nutrition', '', 'item', REC, {
    nested: { NutritionInformation: 'NutritionInformation' },
  }),
  aggregateRating(REC),
]);

export const CONTENT = [ANSWER, QUESTION, HOW_TO_STEP, NUTRITION, ARTICLE, FAQ_PAGE, RECIPE];
```

- [ ] **Step 7: Write the commerce types**

`packages/schema-builder/src/guided/commerce.ts`:

```ts
import { address, aggregateRating, image, party } from './shared.ts';
import { define, field, OPT, REC, REQ, schema } from './shape.ts';

const BRAND = define('Brand', 'Brand', [field('name', 'Name', '', 'text', REC)]);

const PRODUCT_OFFER = define('Product.Offer', 'Offer', [
  field('price', 'Price', 'A number only, such as 19.99.', 'number', REQ),
  field('priceCurrency', 'Currency', 'Three-letter code, such as USD.', 'text', REC, {
    format: 'currency',
  }),
  field('availability', 'Availability', '', 'text', REC, {
    choices: schema(
      'InStock',
      'OutOfStock',
      'PreOrder',
      'BackOrder',
      'SoldOut',
      'LimitedAvailability',
      'InStoreOnly',
      'OnlineOnly',
      'PreSale',
      'Discontinued',
    ),
  }),
  field('priceValidUntil', 'Price valid until', '', 'date', REC),
  field('url', 'Where to buy', '', 'url', OPT),
  field('itemCondition', 'Condition', '', 'text', OPT, {
    choices: schema('NewCondition', 'UsedCondition', 'RefurbishedCondition', 'DamagedCondition'),
  }),
]);

const REVIEW = define('Review', 'Review', [
  party('author', 'Reviewer', '', REQ),
  field('reviewRating', 'Rating', '', 'item', REQ, { nested: { Rating: 'Rating' } }),
  field('datePublished', 'Published', '', 'date', REC),
  field('reviewBody', 'Review text', '', 'text', OPT),
]);

const EVENT_PLACE = define('Event.Place', 'Venue', [
  field('name', 'Venue name', '', 'text', REC),
  address(REQ),
]);

const EVENT_OFFER = define('Event.Offer', 'Tickets', [
  field('price', 'Price', 'A number only. 0 for a free event.', 'number', REC),
  field('priceCurrency', 'Currency', 'Three-letter code, such as USD.', 'text', REC, {
    format: 'currency',
  }),
  field('availability', 'Availability', '', 'text', REC, {
    choices: schema('InStock', 'SoldOut', 'PreOrder'),
  }),
  field('validFrom', 'On sale from', '', ['dateTime', 'date'], REC),
  field('url', 'Where to buy', '', 'url', REC),
]);

const PRODUCT = define(
  'Product',
  'Product',
  [
    field('name', 'Name', '', 'text', REQ),
    image(OPT),
    field('description', 'Description', '', 'text', OPT),
    field('sku', 'SKU', '', 'text', OPT),
    field('brand', 'Brand', '', 'item', OPT, { nested: { Brand: 'Brand' } }),
    field('offers', 'Offer', 'The price and whether it is in stock.', 'item', REC, {
      repeats: true,
      nested: { Offer: 'Product.Offer' },
    }),
    aggregateRating(OPT),
    field('review', 'Review', 'Only reviews your own site collected.', 'item', OPT, {
      repeats: true,
      nested: { Review: 'Review' },
    }),
  ],
  {
    oneOf: [['offers', 'aggregateRating', 'review']],
    note: 'For a page about one product.',
  },
);

const EVENT = define(
  'Event',
  'Event',
  [
    field('name', 'Name', '', 'text', REQ),
    field('startDate', 'Starts', 'With the time zone, such as 2026-11-02T19:00:00-05:00.', [
      'dateTime',
      'date',
    ], REQ),
    field('location', 'Venue', '', 'item', REQ, { nested: { Place: 'Event.Place' } }),
    field('endDate', 'Ends', '', ['dateTime', 'date'], REC),
    field('eventStatus', 'Status', '', 'text', REC, {
      choices: schema(
        'EventScheduled',
        'EventCancelled',
        'EventPostponed',
        'EventRescheduled',
        'EventMovedOnline',
      ),
    }),
    field('description', 'Description', '', 'text', REC),
    image(REC),
    party('organizer', 'Organizer', '', REC),
    party('performer', 'Performer', '', REC, {
      repeats: true,
      nested: { Person: 'Party.Person', PerformingGroup: 'Party.Organization' },
    }),
    field('offers', 'Tickets', 'One entry for each kind of ticket.', 'item', REC, {
      repeats: true,
      nested: { Offer: 'Event.Offer' },
    }),
    field('previousStartDate', 'Previous start', 'Only for a rescheduled event.', [
      'dateTime',
      'date',
    ], OPT),
  ],
  {
    note: 'Google shows events that take place somewhere physical and that the public can book.',
  },
);

export const COMMERCE = [BRAND, PRODUCT_OFFER, REVIEW, EVENT_PLACE, EVENT_OFFER, PRODUCT, EVENT];
```

- [ ] **Step 8: Write the registry**

`packages/schema-builder/src/definitions.ts`:

```ts
import { COMMERCE } from './guided/commerce.ts';
import { CONTENT } from './guided/content.ts';
import type { Definition, Field } from './guided/shape.ts';
import { SHARED } from './guided/shared.ts';
import { SITE } from './guided/site.ts';

export type { Definition, Field, Format, Level } from './guided/shape.ts';

/** The date the levels were last compared with their sources. See RULES.md. */
export const RULES_CHECKED = '2026-10-13';

/** The guided types offered to start an item, in the order they are shown. */
export const GUIDED = [
  'Organization',
  'LocalBusiness',
  'WebSite',
  'BreadcrumbList',
  'Article',
  'FAQPage',
  'Product',
  'Event',
  'Person',
  'Recipe',
];

export const DEFINITIONS: Record<string, Definition> = Object.fromEntries(
  [...SHARED, ...SITE, ...CONTENT, ...COMMERCE].map((definition) => [definition.id, definition]),
);

/** The guided definition for a top-level item of this type, if there is one. */
export const topDefinition = (type: string): Definition | undefined =>
  GUIDED.map((id) => DEFINITIONS[id]).find(
    (definition) => definition?.type === type || definition?.variants.includes(type),
  );

/** The definition a field uses for a nested item of this type, if it names one. */
export const nestedDefinition = (field: Field | undefined, type: string): Definition | undefined => {
  const id = field?.nested?.[type];
  return id === undefined ? undefined : DEFINITIONS[id];
};
```

Add to `packages/schema-builder/src/index.ts`, keeping the lines in alphabetical order:

```ts
export * from './changes.ts';
export * from './definitions.ts';
export * from './limits.ts';
export * from './model.ts';
```

- [ ] **Step 9: Write RULES.md**

`packages/schema-builder/RULES.md`:

```markdown
# Where the guided types' levels come from

Each guided type marks its fields required, recommended or optional. The levels are taken from
Google Search Central's structured data documentation, read on **2026-10-13**. That date is
exported as `RULES_CHECKED` and shown on the builder's page. When you re-read the sources,
change the levels, this file and `RULES_CHECKED` together.

Meeting these levels does not guarantee a search result of any kind.

| Guided type | Source | Source last updated |
|---|---|---|
| Organization | https://developers.google.com/search/docs/appearance/structured-data/organization | 2026-09-08 |
| LocalBusiness | https://developers.google.com/search/docs/appearance/structured-data/local-business | 2026-09-08 |
| WebSite | https://developers.google.com/search/docs/appearance/site-names | 2025-12-10 |
| BreadcrumbList | https://developers.google.com/search/docs/appearance/structured-data/breadcrumb | 2026-09-08 |
| Article, BlogPosting, NewsArticle | https://developers.google.com/search/docs/appearance/structured-data/article | 2026-09-08 |
| FAQPage | None. Google removed its FAQ documentation on 2026-06-15 and no longer shows the result. | |
| Product | https://developers.google.com/search/docs/appearance/structured-data/product-snippet | 2026-09-08 |
| Event | https://developers.google.com/search/docs/appearance/structured-data/event | 2026-09-08 |
| Person | None. Google documents no result for a person on their own. | |
| Recipe | https://developers.google.com/search/docs/appearance/structured-data/recipe | 2026-09-08 |
| AggregateRating, Review, Rating | https://developers.google.com/search/docs/appearance/structured-data/review-snippet | 2026-09-08 |

## What the sources say

- **Organization.** Nothing required. Recommended: `name`, `url`, `logo`, `description`,
  `alternateName`, `legalName`, `email`, `telephone`, `address` (with `streetAddress`,
  `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`), `contactPoint` (with
  `telephone`, `email`), `sameAs`, `foundingDate`, and identifiers (`taxID`, `vatID`,
  `iso6523Code`, `naics`, `globalLocationNumber`, `duns`, `leiCode`), plus `numberOfEmployees`,
  `hasMerchantReturnPolicy`, `hasMemberProgram` and `hasShippingService`.
- **LocalBusiness.** Required: `name`, `address`. Recommended: `url`, `telephone`, `priceRange`,
  `geo` (`latitude`, `longitude`), `openingHoursSpecification` (`dayOfWeek`, `opens`, `closes`,
  `validFrom`, `validThrough`), `menu`, `servesCuisine`, `department`, and `aggregateRating` and
  `review` for sites that collect reviews of other businesses.
- **WebSite.** Required: `name`, `url`. Recommended: `alternateName`. Home page only.
- **BreadcrumbList.** Required: `itemListElement`, and on each `ListItem`: `name`, `position`,
  `item`. `item` may be left off the last step.
- **Article.** Nothing required. Recommended: `headline`, `image`, `datePublished`,
  `dateModified`, `author` (with `name`, `url`).
- **Product.** Required: `name`, and one of `offers`, `aggregateRating`, `review`. On an `Offer`:
  `price` required; `priceCurrency`, `availability`, `priceValidUntil` recommended.
- **Event.** Required: `name`, `startDate`, `location` and `location.address`. Recommended:
  `location.name`, `endDate`, `eventStatus`, `description`, `image`, `organizer` (`name`, `url`),
  `performer` (`name`), `offers` (`price`, `priceCurrency`, `availability`, `validFrom`, `url`),
  and `previousStartDate` for a rescheduled event. Physical events only.
- **Recipe.** Required: `name`, `image`. Recommended: `description`, `author`, `datePublished`,
  `prepTime`, `cookTime`, `totalTime`, `recipeYield`, `recipeCategory`, `recipeCuisine`,
  `keywords`, `recipeIngredient`, `recipeInstructions` (each `HowToStep`: `text` required; `name`,
  `url`, `image` recommended), `nutrition.calories`, `aggregateRating`, `video`.
- **AggregateRating.** Required: `ratingValue`, and one of `ratingCount`, `reviewCount`.
  Recommended: `bestRating`, `worstRating`. The scale is 1 to 5 unless stated.
- **Review.** Required: `author`, `reviewRating` with `ratingValue`. Recommended:
  `datePublished`, `bestRating`, `worstRating`.

## Where the definitions differ, on purpose

- **Identifiers on Organization** (`taxID`, `vatID`, `iso6523Code`, `naics`,
  `globalLocationNumber`, `duns`, `leiCode`) are optional, not recommended. Most organizations
  publish none of them, and seven standing reminders would bury the useful ones.
- **Not guided fields**, though the sources list them; they stay reachable through "Add another
  property": `numberOfEmployees`, `hasMerchantReturnPolicy`, `hasMemberProgram`,
  `hasShippingService` (Organization); `department`, `aggregateRating`, `review` (LocalBusiness);
  `video` (Recipe). `menu` and `servesCuisine` are not properties of `LocalBusiness` itself in
  Schema.org, only of `FoodEstablishment`, so they appear when that type is chosen.
- **Seasonal opening hours** (`validFrom`, `validThrough`) are optional. They apply only to
  hours that change through the year.
- **The last breadcrumb's address** is why `item` is recommended and not required.
  `position` is not a field at all: the output numbers the steps.
- **Ratings and reviews on Product** are optional, and `offers` is recommended. The one-of rule
  still requires one of the three. Recommending ratings to everyone would invite invented ones.
- **FAQPage and Person** have no source, so nothing is required. Their recommended fields are
  this project's judgement of what makes the markup useful: questions with answers for
  `FAQPage`; `name`, `url`, `image`, `jobTitle`, `worksFor` and `sameAs` for `Person`.
```

- [ ] **Step 10: Run the tests and the typecheck**

Run: `pnpm --filter @pokerji/schema-builder test && pnpm --filter @pokerji/schema-builder typecheck`
Expected: every test passes; the typecheck prints nothing.

- [ ] **Step 11: Commit**

```bash
git add packages/schema-builder
git commit -m "feat: the ten guided types and where their levels come from

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The output

**Files:**
- Create: `packages/schema-builder/src/serialize.ts`
- Modify: `packages/schema-builder/src/index.ts`
- Test: `packages/schema-builder/test/serialize.test.ts`

**Interfaces:**
- Consumes: `Draft`, `Item`, `Value`, `valuesOf` (Task 1); `Definition`, `topDefinition`, `nestedDefinition` (Task 2).
- Produces:
  - `type Json = string | number | boolean | Json[] | JsonObject`, `interface JsonObject { [key: string]: Json }`
  - `idsFor(draft: Draft): Map<string, string>`: the `@id` each top-level item gets in the output, by key. Holds an entry only for an item with its own `@id` or one that something refers to.
  - `serialize(draft: Draft): JsonObject | undefined` (`undefined` for a draft with no items)
  - `toJson(draft: Draft): string` (`''` for a draft with no items)
  - `toScriptTag(draft: Draft): string` (`''` for a draft with no items)

- [ ] **Step 1: Write the failing test**

`packages/schema-builder/test/serialize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyDraft, idsFor, serialize, toJson, toScriptTag } from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

describe('serialize', () => {
  it('gives nothing for an empty draft', () => {
    expect(serialize(emptyDraft())).toBeUndefined();
    expect(toJson(emptyDraft())).toBe('');
    expect(toScriptTag(emptyDraft())).toBe('');
  });

  it('writes one item as one object with the context first', () => {
    const draft = draftOf(make('Thing', { name: text('Ada') }));
    expect(toJson(draft)).toBe(
      '{\n  "@context": "https://schema.org",\n  "@type": "Thing",\n  "name": "Ada"\n}',
    );
  });

  it('writes several items as one graph, in the draft’s order', () => {
    const draft = draftOf(make('Thing', { name: text('One') }), make('Thing', { name: text('Two') }));
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Thing', name: 'One' },
        { '@type': 'Thing', name: 'Two' },
      ],
    });
  });

  it('writes one value as a scalar and several as an array', () => {
    const draft = draftOf(make('Thing', { name: text('Ada'), sameAs: [text('https://a.example', 'url'), text('https://b.example', 'url')] }));
    expect(serialize(draft)).toMatchObject({
      name: 'Ada',
      sameAs: ['https://a.example', 'https://b.example'],
    });
  });

  it('leaves out blank values, blank nested items and properties left with nothing', () => {
    const draft = draftOf(
      make('Product', {
        name: [text('  '), text('Kettle')],
        description: text(''),
        offers: nested(make('Offer', { price: text(' ', 'number') })),
      }),
    );
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Kettle',
    });
  });

  it('still writes a top-level item that has no values yet', () => {
    expect(serialize(draftOf(make('Person')))).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
    });
  });

  it('trims text, and writes a number only when it is exactly what was typed', () => {
    const draft = draftOf(
      make('Thing', {
        name: text('  Ada  '),
        a: text('42', 'number'),
        b: text('19.5', 'number'),
        c: text('19.50', 'number'),
        d: text('12,50', 'number'),
        e: text('-3', 'number'),
        f: text('007', 'number'),
      }),
    );
    expect(serialize(draft)).toMatchObject({
      name: 'Ada',
      a: 42,
      b: 19.5,
      c: '19.50',
      d: '12,50',
      e: -3,
      f: '007',
    });
  });

  it('writes booleans, including false', () => {
    const draft = draftOf(make('Thing', { isFamilyFriendly: { kind: 'boolean', on: false } }));
    expect(serialize(draft)).toMatchObject({ isFamilyFriendly: false });
  });

  it('writes a half-typed date or address as typed', () => {
    const draft = draftOf(
      make('Thing', { startDate: text('2026-13', 'date'), url: text('htp:/x', 'url') }),
    );
    expect(serialize(draft)).toMatchObject({ startDate: '2026-13', url: 'htp:/x' });
  });

  it('writes a nested item in place, with its own id when it has one', () => {
    const offer = { ...make('Offer', { price: text('9', 'number') }), id: '#offer' };
    const draft = draftOf(make('Product', { name: text('Kettle'), offers: nested(offer) }));
    expect(serialize(draft)).toMatchObject({
      offers: { '@type': 'Offer', '@id': '#offer', price: 9 },
    });
  });

  it('orders properties as the guided form does, then the rest as they were added', () => {
    const draft = draftOf(
      make('WebSite', {
        inLanguage: text('en'),
        alternateName: text('PJ'),
        url: text('https://pokerji.example', 'url'),
        name: text('pokerji'),
      }),
    );
    expect(Object.keys(serialize(draft) ?? {})).toEqual([
      '@context',
      '@type',
      'name',
      'url',
      'alternateName',
      'inLanguage',
    ]);
  });

  it('gives the same text for the same draft', () => {
    const draft = draftOf(make('Person', { name: text('Ada') }), make('Thing'));
    expect(toJson(draft)).toBe(toJson(structuredClone(draft)));
  });

  it('numbers breadcrumb steps from 1, counting only the steps that are written', () => {
    const draft = draftOf(
      make('BreadcrumbList', {
        itemListElement: [
          nested(make('ListItem', { name: text('Home'), item: text('https://x.example/', 'url') })),
          nested(make('ListItem')),
          nested(make('ListItem', { name: text('Shoes') })),
        ],
      }),
    );
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x.example/' },
        { '@type': 'ListItem', position: 2, name: 'Shoes' },
      ],
    });
  });
});

describe('ids and references', () => {
  it('gives an id only to an item that has its own or is referred to', () => {
    const draft = draftOf(
      make('Organization', { name: text('Acme') }, 'org'),
      { ...make('WebSite', {}, 'site'), id: 'https://acme.example/#site' },
      make('Article', { publisher: ref('org') }, 'art'),
    );
    expect([...idsFor(draft)]).toEqual([
      ['site', 'https://acme.example/#site'],
      ['org', '#organization'],
    ]);
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', '@id': '#organization', name: 'Acme' },
        { '@type': 'WebSite', '@id': 'https://acme.example/#site' },
        { '@type': 'Article', publisher: { '@id': '#organization' } },
      ],
    });
  });

  it('numbers the second and later referred-to items of one type', () => {
    const draft = draftOf(
      make('Person', {}, 'a'),
      make('Person', {}, 'b'),
      make('Person', {}, 'c'),
      make('Article', { author: [ref('a'), ref('b'), ref('c')] }, 'art'),
    );
    expect([...idsFor(draft).values()]).toEqual(['#person', '#person-2', '#person-3']);
  });

  it('never gives two items the same id', () => {
    const draft = draftOf(
      { ...make('Thing', {}, 'mine'), id: '#person' },
      make('Person', {}, 'a'),
      { ...make('Thing', {}, 'also'), id: '#person-2' },
      make('Person', {}, 'b'),
      make('Article', { author: [ref('a'), ref('b')] }, 'art'),
    );
    const ids = [...idsFor(draft).values()];
    expect(new Set(ids).size).toBe(ids.length);
    expect(idsFor(draft).get('a')).toBe('#person-3');
    expect(idsFor(draft).get('b')).toBe('#person-4');
  });

  it('refers by the person’s own id when the target has one', () => {
    const draft = draftOf(
      { ...make('Organization', {}, 'org'), id: 'https://acme.example/#org' },
      make('WebSite', { publisher: ref('org') }, 'site'),
    );
    expect(serialize(draft)).toMatchObject({
      '@graph': [{}, { publisher: { '@id': 'https://acme.example/#org' } }],
    });
  });

  it('drops a reference to an item that is gone, without throwing', () => {
    const draft = draftOf(make('Article', { headline: text('Hi'), author: ref('gone') }, 'art'));
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Hi',
    });
  });

  it('finds a reference inside a nested item', () => {
    const draft = draftOf(
      make('Organization', {}, 'org'),
      make('Article', { author: nested(make('Person', { worksFor: ref('org') })) }, 'art'),
    );
    expect(idsFor(draft).get('org')).toBe('#organization');
  });
});

describe('the script tag', () => {
  it('wraps the JSON in a JSON-LD script element', () => {
    const tag = toScriptTag(draftOf(make('Thing', { name: text('Ada') })));
    expect(tag.startsWith('<script type="application/ld+json">\n{')).toBe(true);
    expect(tag.endsWith('}\n</script>')).toBe(true);
  });

  it('cannot be ended early by anything typed into a value', () => {
    const hostile = '</script><script>alert(1)</script><!-- <b>';
    const draft = draftOf(make('Thing', { name: text(hostile) }));
    const tag = toScriptTag(draft);
    const inside = tag.slice('<script type="application/ld+json">'.length, -'</script>'.length);
    expect(inside).not.toContain('<');
    expect(JSON.parse(inside)).toMatchObject({ name: hostile });
  });

  it('leaves the raw form alone', () => {
    const draft = draftOf(make('Thing', { name: text('a < b') }));
    expect(toJson(draft)).toContain('a < b');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/serialize.test.ts`
Expected: FAIL, because `serialize` is not exported.

- [ ] **Step 3: Write the serialiser**

`packages/schema-builder/src/serialize.ts`:

```ts
import type { Definition } from './definitions.ts';
import { nestedDefinition, topDefinition } from './definitions.ts';
import type { Draft, Item, Value } from './model.ts';
import { valuesOf } from './model.ts';

export type Json = string | number | boolean | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

const CONTEXT = 'https://schema.org';

const collectReferences = (item: Item, into: Set<string>): void => {
  for (const property of item.properties) {
    for (const value of property.values) {
      if (value.kind === 'reference') into.add(value.key);
      if (value.kind === 'item') collectReferences(value.item, into);
    }
  }
};

/**
 * The `@id` each top-level item is written with, by key. An item has one when the person set
 * it, or when something refers to the item. A generated id is `#` and the type in lower case,
 * numbered from the second of a type, and never one already in use.
 */
export const idsFor = (draft: Draft): Map<string, string> => {
  const referred = new Set<string>();
  for (const item of draft.items) collectReferences(item, referred);

  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const item of draft.items) {
    const own = item.id.trim();
    if (own === '') continue;
    ids.set(item.key, own);
    used.add(own);
  }

  const counts = new Map<string, number>();
  for (const item of draft.items) {
    if (ids.has(item.key) || !referred.has(item.key)) continue;
    const base = `#${item.type.toLowerCase()}`;
    let count = (counts.get(base) ?? 0) + 1;
    let id = count === 1 ? base : `${base}-${count}`;
    while (used.has(id)) {
      count += 1;
      id = `${base}-${count}`;
    }
    counts.set(base, count);
    used.add(id);
    ids.set(item.key, id);
  }
  return ids;
};

/** A value that is not a nested item, as JSON. `undefined` means it is left out. */
const writeScalar = (value: Exclude<Value, { kind: 'item' }>, ids: Map<string, string>): Json | undefined => {
  if (value.kind === 'boolean') return value.on;
  if (value.kind === 'reference') {
    const id = ids.get(value.key);
    return id === undefined ? undefined : { '@id': id };
  }
  const typed = value.text.trim();
  if (typed === '') return undefined;
  if (value.kind !== 'number') return typed;
  // A JSON number only when it reads back exactly as typed: "19.50" and "007" stay text.
  const parsed = Number(typed);
  return String(parsed) === typed ? parsed : typed;
};

/**
 * An item as JSON. A nested item with nothing to say is left out; a top-level one is always
 * written. `position` is set for a step of a numbered list.
 */
const writeItem = (
  item: Item,
  definition: Definition | undefined,
  ids: Map<string, string>,
  top: boolean,
  position?: number,
): JsonObject | undefined => {
  const out: JsonObject = { '@type': item.type };
  const id = top ? ids.get(item.key) : item.id.trim();
  if (id) out['@id'] = id;
  if (position !== undefined) out.position = position;

  const fields = definition?.fields ?? [];
  const order = new Set([
    ...fields.map((field) => field.property),
    ...item.properties.map((property) => property.name),
  ]);
  let wrote = false;
  for (const name of order) {
    const field = fields.find((candidate) => candidate.property === name);
    const written: Json[] = [];
    for (const value of valuesOf(item, name)) {
      const json =
        value.kind === 'item'
          ? writeItem(
              value.item,
              nestedDefinition(field, value.item.type),
              ids,
              false,
              field?.numbered ? written.length + 1 : undefined,
            )
          : writeScalar(value, ids);
      if (json !== undefined) written.push(json);
    }
    const [only] = written;
    if (only === undefined) continue;
    out[name] = written.length === 1 ? only : written;
    wrote = true;
  }
  return wrote || top || id ? out : undefined;
};

/** The draft as a JSON-LD object: one item on its own, several as one `@graph`. */
export const serialize = (draft: Draft): JsonObject | undefined => {
  const ids = idsFor(draft);
  const items = draft.items
    .map((item) => writeItem(item, topDefinition(item.type), ids, true))
    .filter((item) => item !== undefined);
  const [only] = items;
  if (only === undefined) return undefined;
  return items.length === 1
    ? { '@context': CONTEXT, ...only }
    : { '@context': CONTEXT, '@graph': items };
};

export const toJson = (draft: Draft): string => {
  const out = serialize(draft);
  return out === undefined ? '' : JSON.stringify(out, null, 2);
};

/**
 * The draft as a script element to paste into a page. Every `<` in the JSON is written as
 * `\u003c`, so nothing typed into a value can end the element or open a comment.
 */
export const toScriptTag = (draft: Draft): string => {
  const json = toJson(draft);
  if (json === '') return '';
  return `<script type="application/ld+json">\n${json.replaceAll('<', '\\u003c')}\n</script>`;
};
```

Add `export * from './serialize.ts';` to `packages/schema-builder/src/index.ts`, in alphabetical order.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm --filter @pokerji/schema-builder test && pnpm --filter @pokerji/schema-builder typecheck`
Expected: every test passes; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/schema-builder
git commit -m "feat: write a draft as JSON-LD and as a script tag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The vocabulary

**Files:**
- Create: `packages/schema-builder/scripts/compact.ts`, `packages/schema-builder/scripts/compact-vocabulary.ts`
- Create: `packages/schema-builder/src/vocabulary.ts`
- Create: `apps/web/static/schema/vocabulary.json`, `apps/web/static/schema/LICENSES.md`
- Modify: `packages/schema-builder/src/index.ts`, `.prettierignore`
- Test: `packages/schema-builder/test/compact.test.ts`, `packages/schema-builder/test/vocabulary.test.ts`

**Interfaces:**
- Consumes: `ValueKind` (Task 1); `DEFINITIONS` (Task 2).
- Produces:
  - `compact(release: unknown, version: string): string` and `summary(comment: string): string`, from `scripts/compact.ts`
  - The file format, one line of JSON: `{ "version": string, "types": { [type]: string[] }, "properties": { [property]: { "d": string[], "r": string[], "c": string } }, "enums": { [type]: string[] }, "dataTypes": string[] }`. `types` maps a type to its parents; `d` is the types a property belongs to, `r` the types it expects, `c` its description cut to one sentence.
  - `interface Vocabulary { version: string; types: Map<string, string[]>; properties: Map<string, { domains: string[]; ranges: string[]; comment: string }>; enums: Map<string, string[]>; dataTypes: Set<string>; own: Map<string, string[]> }`
  - `parseVocabulary(input: unknown): Vocabulary | undefined`
  - `lineage(vocabulary, type: string): string[]` (the type, then its ancestors nearest first, no repeats)
  - `propertiesOf(vocabulary, type: string): string[]`, `hasProperty(vocabulary, type: string, property: string): boolean`
  - `searchTypes(vocabulary, query: string, limit?: number): string[]`, `searchProperties(vocabulary, type: string, query: string, limit?: number): string[]`
  - `interface Expected { kinds: ValueKind[]; itemTypes: string[]; choices: string[] }`, `expects(vocabulary, property: string): Expected`
  - `describeProperty(vocabulary, property: string): string`

- [ ] **Step 1: Write the failing compaction test**

`packages/schema-builder/test/compact.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compact, summary } from '../scripts/compact.ts';

const id = (name: string) => ({ '@id': `schema:${name}` });

/** A release file in miniature, in the shape Schema.org publishes. */
const RELEASE = {
  '@context': { schema: 'https://schema.org/' },
  '@graph': [
    { '@id': 'schema:name', '@type': 'rdf:Property', 'rdfs:comment': 'The name of the item.', 'schema:domainIncludes': id('Thing'), 'schema:rangeIncludes': id('Text') },
    { '@id': 'schema:Thing', '@type': 'rdfs:Class', 'rdfs:comment': 'The most generic type.' },
    { '@id': 'schema:Text', '@type': ['rdfs:Class', 'schema:DataType'] },
    { '@id': 'schema:URL', '@type': 'rdfs:Class', 'rdfs:subClassOf': id('Text') },
    { '@id': 'schema:Offer', '@type': 'rdfs:Class', 'rdfs:subClassOf': [id('Thing'), { '@id': 'bibo:Deal' }] },
    { '@id': 'schema:Enumeration', '@type': 'rdfs:Class', 'rdfs:subClassOf': id('Thing') },
    { '@id': 'schema:ItemAvailability', '@type': 'rdfs:Class', 'rdfs:subClassOf': id('Enumeration') },
    { '@id': 'schema:OutOfStock', '@type': 'schema:ItemAvailability' },
    { '@id': 'schema:InStock', '@type': 'schema:ItemAvailability' },
    {
      '@id': 'schema:availability',
      '@type': 'rdf:Property',
      'rdfs:comment': { '@language': 'en', '@value': 'Whether it is in stock&#x2014;or not. See [[Offer]].' },
      'schema:domainIncludes': [id('Offer'), id('Gone')],
      'schema:rangeIncludes': id('ItemAvailability'),
    },
    { '@id': 'schema:Gone', '@type': 'rdfs:Class', 'schema:isPartOf': { '@id': 'https://attic.schema.org' } },
    { '@id': 'schema:New', '@type': 'rdfs:Class', 'schema:isPartOf': { '@id': 'https://pending.schema.org' } },
    { '@id': 'schema:soon', '@type': 'rdf:Property', 'schema:domainIncludes': id('Thing'), 'schema:isPartOf': { '@id': 'https://pending.schema.org' } },
    { '@id': 'schema:orphan', '@type': 'rdf:Property', 'schema:domainIncludes': id('New'), 'schema:rangeIncludes': id('Text') },
    { '@id': 'bibo:Issue', '@type': 'rdfs:Class' },
  ],
};

describe('compact', () => {
  const out = JSON.parse(compact(RELEASE, '0.1'));

  it('keeps types with their parents, and marks data types', () => {
    expect(out.version).toBe('0.1');
    expect(out.types).toEqual({
      Enumeration: ['Thing'],
      ItemAvailability: ['Enumeration'],
      Offer: ['Thing'],
      Text: [],
      Thing: [],
      URL: ['Text'],
    });
    expect(out.dataTypes).toEqual(['Text']);
  });

  it('keeps properties with where they belong, what they expect and one sentence', () => {
    expect(out.properties).toEqual({
      availability: {
        d: ['Offer'],
        r: ['ItemAvailability'],
        c: 'Whether it is in stock\u2014or not.',
      },
      name: { d: ['Thing'], r: ['Text'], c: 'The name of the item.' },
    });
  });

  it('lists the members of an enumeration in order', () => {
    expect(out.enums).toEqual({ ItemAvailability: ['InStock', 'OutOfStock'] });
  });

  it('drops pending and attic terms, terms from other vocabularies, and properties left with no type', () => {
    expect(out.types.Gone).toBeUndefined();
    expect(out.types.New).toBeUndefined();
    expect(out.types.Issue).toBeUndefined();
    expect(out.properties.soon).toBeUndefined();
    expect(out.properties.orphan).toBeUndefined();
  });

  it('gives identical output however the release is ordered', () => {
    const shuffled = { ...RELEASE, '@graph': [...RELEASE['@graph']].reverse() };
    expect(compact(shuffled, '0.1')).toBe(compact(RELEASE, '0.1'));
    expect(compact(RELEASE, '0.1').endsWith('}\n')).toBe(true);
  });

  it('accepts full addresses as well as the schema: prefix', () => {
    const full = {
      '@graph': [
        { '@id': 'https://schema.org/Thing', '@type': 'rdfs:Class' },
        { '@id': 'https://schema.org/name', '@type': 'rdf:Property', 'schema:domainIncludes': { '@id': 'https://schema.org/Thing' } },
      ],
    };
    expect(JSON.parse(compact(full, '0.1')).properties.name.d).toEqual(['Thing']);
  });
});

describe('summary', () => {
  it('keeps the first sentence', () => {
    expect(summary('An offer to sell. For example a ticket.')).toBe('An offer to sell.');
  });

  it('does not stop at an abbreviation', () => {
    expect(summary('A form of offer (e.g. sell, lease). More here.')).toBe(
      'A form of offer (e.g. sell, lease).',
    );
  });

  it('strips markup, links and escaped line breaks, and decodes entities', () => {
    expect(summary('The <b>size</b> of [[Thing]]\\n\\nsee [docs](http://x.example) &amp; more')).toBe(
      'The size of Thing see docs & more',
    );
  });

  it('cuts a long sentence at 200 characters', () => {
    const cut = summary('x'.repeat(400));
    expect(cut.length).toBe(200);
    expect(cut.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/compact.test.ts`
Expected: FAIL, because `scripts/compact.ts` does not exist.

- [ ] **Step 3: Write the compaction**

`packages/schema-builder/scripts/compact.ts`:

```ts
type Node = Record<string, unknown>;

const PREFIXES = ['schema:', 'https://schema.org/'];

/** The bare name of a Schema.org term, or nothing for a term from another vocabulary. */
const local = (id: unknown): string | undefined => {
  if (typeof id !== 'string') return undefined;
  const prefix = PREFIXES.find((candidate) => id.startsWith(candidate));
  return prefix === undefined ? undefined : id.slice(prefix.length);
};

const list = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const names = (value: unknown): string[] =>
  list(value)
    .map((node) => local((node as Node | null)?.['@id']))
    .filter((name) => name !== undefined)
    .sort();

const text = (value: unknown): string => {
  if (typeof value === 'string') return value;
  const held = (value as Node | null | undefined)?.['@value'];
  return typeof held === 'string' ? held : '';
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (/^#x/i.test(code)) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });

/** A description as one plain sentence of at most 200 characters. */
export const summary = (comment: string): string => {
  const plain = decode(
    comment
      .replaceAll('\\n', ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'),
  )
    .replace(/\s+/g, ' ')
    .trim();
  const end = /[.!?](?=\s+[A-Z]|$)/.exec(plain);
  const first = end ? plain.slice(0, end.index + 1) : plain;
  return first.length > 200 ? `${first.slice(0, 199)}…` : first;
};

const dropped = (node: Node): boolean =>
  /pending|attic/.test(String((node['schema:isPartOf'] as Node | undefined)?.['@id'] ?? ''));

const kindsOf = (node: Node): string[] => list(node['@type']).map(String);

/**
 * A Schema.org release file as the one line of JSON the builder reads. The output depends
 * only on the input: terms are sorted, and nothing about when or where it ran is written.
 */
export const compact = (release: unknown, version: string): string => {
  const graph = list((release as Node | null)?.['@graph']) as Node[];
  const kept = graph
    .map((node) => ({ node, name: local(node['@id']) }))
    .filter((entry): entry is { node: Node; name: string } => entry.name !== undefined)
    .filter((entry) => !dropped(entry.node))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const typeNames = new Set(
    kept.filter((entry) => kindsOf(entry.node).includes('rdfs:Class')).map((entry) => entry.name),
  );
  const known = (found: string[]): string[] => found.filter((name) => typeNames.has(name));

  const types: Record<string, string[]> = {};
  const properties: Record<string, { d: string[]; r: string[]; c: string }> = {};
  const enums: Record<string, string[]> = {};
  const dataTypes: string[] = [];

  for (const { node, name } of kept) {
    const kinds = kindsOf(node);
    if (kinds.includes('rdfs:Class')) {
      types[name] = known(names(node['rdfs:subClassOf']));
      if (kinds.includes('schema:DataType')) dataTypes.push(name);
    } else if (kinds.includes('rdf:Property')) {
      const d = known(names(node['schema:domainIncludes']));
      if (d.length === 0) continue;
      properties[name] = {
        d,
        r: known(names(node['schema:rangeIncludes'])),
        c: summary(text(node['rdfs:comment'])),
      };
    } else {
      for (const kind of kinds) {
        const owner = local(kind);
        if (owner !== undefined && typeNames.has(owner)) (enums[owner] ??= []).push(name);
      }
    }
  }
  return `${JSON.stringify({ version, types, properties, enums, dataTypes })}\n`;
};
```

`packages/schema-builder/scripts/compact-vocabulary.ts`:

```ts
// Turns a downloaded Schema.org release file into the vocabulary file the builder reads.
//   node packages/schema-builder/scripts/compact-vocabulary.ts <release.jsonld> <version> <out.json>
// Run by hand when moving to a new release, then update apps/web/static/schema/LICENSES.md.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { compact } from './compact.ts';

const [source, version, target] = process.argv.slice(2);
if (!source || !version || !target) {
  console.error('usage: compact-vocabulary.ts <release.jsonld> <version> <out.json>');
  process.exit(1);
}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

const release = readFileSync(source);
const output = compact(JSON.parse(release.toString('utf8')), version);
writeFileSync(target, output);

console.log(`release   sha256 ${sha256(release)}`);
console.log(`output    sha256 ${sha256(output)}`);
console.log(`output    ${Buffer.byteLength(output)} bytes, ${gzipSync(output).length} gzipped`);
```

- [ ] **Step 4: Run the compaction test**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/compact.test.ts`
Expected: PASS.

- [ ] **Step 5: Download the release file and produce the vocabulary**

The release file is downloaded to a temporary directory and is not committed. This step needs network access to schema.org; the owner has approved vendoring this file.

```bash
RELEASE_DIR="$(mktemp -d)"
curl -sSL -o "$RELEASE_DIR/schemaorg-current-https.jsonld" \
  https://schema.org/version/30.1/schemaorg-current-https.jsonld
shasum -a 256 "$RELEASE_DIR/schemaorg-current-https.jsonld"
```

Expected: `0a4b8c4c910fc831ec8695196510973390906a5ee34dc6b862dfec4d21a12f74`. If the checksum differs, stop and tell the owner; do not continue with a file that is not the one this plan was written against.

```bash
mkdir -p apps/web/static/schema
node packages/schema-builder/scripts/compact-vocabulary.ts \
  "$RELEASE_DIR/schemaorg-current-https.jsonld" 30.1 apps/web/static/schema/vocabulary.json
```

Expected: three lines. The release checksum matches the one above. The output is roughly 250,000 bytes and roughly 62,000 gzipped. If the gzipped size is 150,000 or more, stop and tell the owner: the spec then calls for descriptions in a second file, which this plan does not build.

Keep the `output sha256` line; the next step needs it.

- [ ] **Step 6: Record the licence, and keep Prettier away from the file**

`apps/web/static/schema/LICENSES.md`, with the output checksum from Step 5 in place of the row's last cell:

```markdown
# Bundled vocabulary

`vocabulary.json` is an adaptation of the [Schema.org](https://schema.org/) vocabulary, which
its sponsors publish under the
[Creative Commons Attribution-ShareAlike 3.0 Unported licence](https://creativecommons.org/licenses/by-sa/3.0/).
This adaptation is offered under the same licence.

It is made by `packages/schema-builder/scripts/compact-vocabulary.ts` from the release file
below. It keeps each type's name and parents, each property's name, the types it belongs to,
the types it expects and the first sentence of its description, and each enumeration's
members. It leaves out the pending and attic sections and everything else. Nothing is fetched
from schema.org when the app is built or run.

To move to a new release: download its `schemaorg-current-https.jsonld`, run the script, and
replace this row. A test compares the last checksum with the file.

| File | Schema.org release | Source | Fetched | SHA-256 of the source | SHA-256 of this file |
|---|---|---|---|---|---|
| `vocabulary.json` | 30.1 (2026-09-16) | https://schema.org/version/30.1/schemaorg-current-https.jsonld | 2026-10-13 | `0a4b8c4c910fc831ec8695196510973390906a5ee34dc6b862dfec4d21a12f74` | `<the output sha256 printed in Step 5>` |
```

Replace the "Fetched" date with the day Step 5 was run if it is not 2026-10-13.

Add one line to the end of `.prettierignore`:

```
apps/web/static/schema/*.json
```

- [ ] **Step 7: Write the failing vocabulary test**

`packages/schema-builder/test/vocabulary.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFINITIONS,
  describeProperty,
  expects,
  hasProperty,
  lineage,
  parseVocabulary,
  propertiesOf,
  searchProperties,
  searchTypes,
} from '../src/index.ts';

const STATIC = fileURLToPath(new URL('../../../apps/web/static/schema/', import.meta.url));

const SMALL = {
  version: 'test',
  types: {
    Thing: [],
    CreativeWork: ['Thing'],
    Article: ['CreativeWork'],
    Place: ['Thing'],
    Organization: ['Thing'],
    LocalBusiness: ['Organization', 'Place'],
    Enumeration: ['Thing'],
    ItemAvailability: ['Enumeration'],
    Offer: ['Thing'],
    Text: [],
    URL: ['Text'],
    Number: [],
    Integer: ['Number'],
    Boolean: [],
    Date: [],
    DateTime: [],
    Time: [],
    Quantity: [],
    Duration: ['Quantity'],
  },
  properties: {
    name: { d: ['Thing'], r: ['Text'], c: 'The name of the item.' },
    url: { d: ['Thing'], r: ['URL'], c: 'The address of the item.' },
    headline: { d: ['CreativeWork'], r: ['Text'], c: 'Headline of the article.' },
    wordCount: { d: ['Article'], r: ['Integer'], c: '' },
    geo: { d: ['Place'], r: ['Thing'], c: '' },
    legalName: { d: ['Organization'], r: ['Text'], c: '' },
    priceRange: { d: ['LocalBusiness'], r: ['Text'], c: '' },
    availability: { d: ['Offer'], r: ['ItemAvailability'], c: '' },
    validFrom: { d: ['Offer'], r: ['DateTime', 'Date'], c: '' },
    logo: { d: ['Organization'], r: ['Thing', 'URL'], c: '' },
    isFree: { d: ['Offer'], r: ['Boolean'], c: '' },
    opens: { d: ['Place'], r: ['Time'], c: '' },
    prepTime: { d: ['CreativeWork'], r: ['Duration'], c: '' },
  },
  enums: { ItemAvailability: ['InStock', 'OutOfStock'] },
  dataTypes: ['Boolean', 'Date', 'DateTime', 'Number', 'Quantity', 'Text', 'Time'],
};

describe('a parsed vocabulary', () => {
  const vocabulary = parseVocabulary(SMALL)!;

  it('refuses anything that is not a vocabulary', () => {
    expect(parseVocabulary(null)).toBeUndefined();
    expect(parseVocabulary('{}')).toBeUndefined();
    expect(parseVocabulary({ ...SMALL, types: [] })).toBeUndefined();
    expect(parseVocabulary({ ...SMALL, properties: { name: { d: 'Thing' } } })).toBeUndefined();
  });

  it('lists a type, then its ancestors nearest first, once each', () => {
    expect(lineage(vocabulary, 'Article')).toEqual(['Article', 'CreativeWork', 'Thing']);
    expect(lineage(vocabulary, 'LocalBusiness')).toEqual([
      'LocalBusiness',
      'Organization',
      'Place',
      'Thing',
    ]);
    expect(lineage(vocabulary, 'Nonsense')).toEqual([]);
  });

  it('lists a type’s own properties first, then each ancestor’s', () => {
    expect(propertiesOf(vocabulary, 'LocalBusiness')).toEqual([
      'priceRange',
      'legalName',
      'logo',
      'geo',
      'opens',
      'name',
      'url',
    ]);
    expect(propertiesOf(vocabulary, 'Nonsense')).toEqual([]);
  });

  it('says whether a type has a property', () => {
    expect(hasProperty(vocabulary, 'Article', 'name')).toBe(true);
    expect(hasProperty(vocabulary, 'Article', 'legalName')).toBe(false);
  });

  it('searches types by name, leaving out data types', () => {
    expect(searchTypes(vocabulary, 'art')).toEqual(['Article']);
    expect(searchTypes(vocabulary, 'o')).toEqual([
      'Offer',
      'Organization',
      'CreativeWork',
      'Enumeration',
      'LocalBusiness',
    ]);
    expect(searchTypes(vocabulary, 'text')).toEqual([]);
    expect(searchTypes(vocabulary, 'url')).toEqual([]);
    expect(searchTypes(vocabulary, '', 3)).toHaveLength(3);
  });

  it('searches a type’s properties', () => {
    expect(searchProperties(vocabulary, 'Article', 'na')).toEqual(['name']);
    expect(searchProperties(vocabulary, 'Article', 'e')).toEqual(['headline', 'prepTime', 'name']);
  });

  it('turns what a property expects into kinds, simplest first', () => {
    expect(expects(vocabulary, 'name')).toEqual({ kinds: ['text'], itemTypes: [], choices: [] });
    expect(expects(vocabulary, 'url').kinds).toEqual(['url']);
    expect(expects(vocabulary, 'wordCount').kinds).toEqual(['number']);
    expect(expects(vocabulary, 'isFree').kinds).toEqual(['boolean']);
    expect(expects(vocabulary, 'opens').kinds).toEqual(['time']);
    expect(expects(vocabulary, 'prepTime').kinds).toEqual(['text']);
    expect(expects(vocabulary, 'validFrom').kinds).toEqual(['date', 'dateTime']);
    expect(expects(vocabulary, 'logo')).toEqual({
      kinds: ['url', 'item', 'reference'],
      itemTypes: ['Thing'],
      choices: [],
    });
    expect(expects(vocabulary, 'availability')).toEqual({
      kinds: ['text'],
      itemTypes: [],
      choices: ['https://schema.org/InStock', 'https://schema.org/OutOfStock'],
    });
    expect(expects(vocabulary, 'nonsense')).toEqual({ kinds: ['text'], itemTypes: [], choices: [] });
  });

  it('describes a property', () => {
    expect(describeProperty(vocabulary, 'name')).toBe('The name of the item.');
    expect(describeProperty(vocabulary, 'nonsense')).toBe('');
  });
});

describe('the bundled vocabulary', () => {
  const file = readFileSync(`${STATIC}vocabulary.json`);
  const vocabulary = parseVocabulary(JSON.parse(file.toString('utf8')))!;

  it('is the file LICENSES.md records', () => {
    const sha256 = createHash('sha256').update(file).digest('hex');
    expect(readFileSync(`${STATIC}LICENSES.md`, 'utf8')).toContain(`\`${sha256}\``);
  });

  it('parses, and is Schema.org 30.1', () => {
    expect(vocabulary.version).toBe('30.1');
    expect(vocabulary.types.size).toBeGreaterThan(800);
    expect(vocabulary.properties.size).toBeGreaterThan(1_300);
  });

  it('knows every type and property the guided forms use', () => {
    for (const definition of Object.values(DEFINITIONS)) {
      const types = [definition.type, ...definition.variants];
      for (const type of types) {
        expect(vocabulary.types.has(type), type).toBe(true);
        for (const field of definition.fields) {
          expect(hasProperty(vocabulary, type, field.property), `${type}.${field.property}`).toBe(
            true,
          );
        }
      }
      for (const field of definition.fields) {
        for (const type of Object.keys(field.nested ?? {})) {
          expect(vocabulary.types.has(type), `${definition.id}.${field.property}: ${type}`).toBe(
            true,
          );
        }
        for (const choice of field.choices ?? []) {
          const member = choice.slice('https://schema.org/'.length);
          expect(
            [...vocabulary.enums.values()].some((members) => members.includes(member)),
            choice,
          ).toBe(true);
        }
      }
    }
  });

  it('holds only plain text in descriptions', () => {
    for (const [name, property] of vocabulary.properties) {
      expect(property.comment, name).not.toMatch(/<[a-z/]/i);
      expect(property.comment.length, name).toBeLessThanOrEqual(200);
    }
  });
});
```

- [ ] **Step 8: Run it to see it fail**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/vocabulary.test.ts`
Expected: FAIL, because `parseVocabulary` is not exported.

- [ ] **Step 9: Write the vocabulary reader**

`packages/schema-builder/src/vocabulary.ts`:

```ts
import { z } from 'zod';
import type { ValueKind } from './model.ts';

const Names = z.array(z.string());

const Raw = z.object({
  version: z.string(),
  types: z.record(z.string(), Names),
  properties: z.record(z.string(), z.object({ d: Names, r: Names, c: z.string() })),
  enums: z.record(z.string(), Names),
  dataTypes: Names,
});

export interface VocabularyProperty {
  /** The types the property belongs to. */
  domains: string[];
  /** The types of value it expects. */
  ranges: string[];
  comment: string;
}

export interface Vocabulary {
  version: string;
  /** Each type's parents. */
  types: Map<string, string[]>;
  properties: Map<string, VocabularyProperty>;
  /** Each enumeration's members. */
  enums: Map<string, string[]>;
  dataTypes: Set<string>;
  /** The properties that name each type directly, in alphabetical order. */
  own: Map<string, string[]>;
}

/** The vocabulary file's contents as something to query, or nothing if it is not one. */
export const parseVocabulary = (input: unknown): Vocabulary | undefined => {
  const parsed = Raw.safeParse(input);
  if (!parsed.success) return undefined;
  const raw = parsed.data;
  const own = new Map<string, string[]>();
  const properties = new Map<string, VocabularyProperty>();
  for (const name of Object.keys(raw.properties).sort()) {
    const property = raw.properties[name];
    if (!property) continue;
    properties.set(name, { domains: property.d, ranges: property.r, comment: property.c });
    for (const type of property.d) own.set(type, [...(own.get(type) ?? []), name]);
  }
  return {
    version: raw.version,
    types: new Map(Object.entries(raw.types)),
    properties,
    enums: new Map(Object.entries(raw.enums)),
    dataTypes: new Set(raw.dataTypes),
    own,
  };
};

/** A type, then its ancestors nearest first, each once. Empty for an unknown type. */
export const lineage = (vocabulary: Vocabulary, type: string): string[] => {
  if (!vocabulary.types.has(type)) return [];
  const found = [type];
  for (let index = 0; index < found.length; index += 1) {
    for (const parent of vocabulary.types.get(found[index] ?? '') ?? []) {
      if (!found.includes(parent)) found.push(parent);
    }
  }
  return found;
};

/** Every property a type can have: its own first, then each ancestor's, nearest first. */
export const propertiesOf = (vocabulary: Vocabulary, type: string): string[] => {
  const found = new Set<string>();
  for (const ancestor of lineage(vocabulary, type)) {
    for (const name of vocabulary.own.get(ancestor) ?? []) found.add(name);
  }
  return [...found];
};

export const hasProperty = (vocabulary: Vocabulary, type: string, property: string): boolean => {
  const domains = vocabulary.properties.get(property)?.domains ?? [];
  return lineage(vocabulary, type).some((ancestor) => domains.includes(ancestor));
};

const isData = (vocabulary: Vocabulary, type: string): boolean =>
  lineage(vocabulary, type).some((ancestor) => vocabulary.dataTypes.has(ancestor));

/** Names containing the query, those that start with it first. */
const matching = (names: string[], query: string, limit: number): string[] => {
  const wanted = query.trim().toLowerCase();
  const hits = names.filter((name) => name.toLowerCase().includes(wanted));
  const starts = hits.filter((name) => name.toLowerCase().startsWith(wanted));
  return [...starts, ...hits.filter((name) => !starts.includes(name))].slice(0, limit);
};

/** Types an item can be, by name. Data types such as Text are left out. */
export const searchTypes = (vocabulary: Vocabulary, query: string, limit = 20): string[] =>
  matching(
    [...vocabulary.types.keys()].filter((type) => !isData(vocabulary, type)).sort(),
    query,
    limit,
  );

export const searchProperties = (
  vocabulary: Vocabulary,
  type: string,
  query: string,
  limit = 20,
): string[] => matching(propertiesOf(vocabulary, type), query, limit);

export interface Expected {
  /** The kinds of value the property takes, simplest first. Never empty. */
  kinds: ValueKind[];
  /** The types a nested item may be. */
  itemTypes: string[];
  /** The values offered, when the property expects a member of an enumeration. */
  choices: string[];
}

const ORDER: ValueKind[] = [
  'text',
  'url',
  'number',
  'boolean',
  'date',
  'dateTime',
  'time',
  'item',
  'reference',
];

const DATA_KINDS: Record<string, ValueKind> = {
  URL: 'url',
  Text: 'text',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  DateTime: 'dateTime',
  Time: 'time',
  Quantity: 'text',
};

/** What a property expects, as kinds of value. An unknown property takes text. */
export const expects = (vocabulary: Vocabulary, property: string): Expected => {
  const kinds = new Set<ValueKind>();
  const itemTypes: string[] = [];
  const choices: string[] = [];
  for (const range of vocabulary.properties.get(property)?.ranges ?? []) {
    const ancestors = lineage(vocabulary, range);
    // URL is a kind of Text, so the nearest data type decides.
    const data = ancestors.find((ancestor) => Object.hasOwn(DATA_KINDS, ancestor));
    if (data !== undefined && isData(vocabulary, range)) {
      kinds.add(DATA_KINDS[data] ?? 'text');
    } else if (ancestors.includes('Enumeration')) {
      kinds.add('text');
      for (const member of vocabulary.enums.get(range) ?? []) {
        choices.push(`https://schema.org/${member}`);
      }
    } else {
      kinds.add('item');
      kinds.add('reference');
      itemTypes.push(range);
    }
  }
  if (kinds.size === 0) kinds.add('text');
  return { kinds: ORDER.filter((kind) => kinds.has(kind)), itemTypes, choices };
};

export const describeProperty = (vocabulary: Vocabulary, property: string): string =>
  vocabulary.properties.get(property)?.comment ?? '';
```

Add `export * from './vocabulary.ts';` to `packages/schema-builder/src/index.ts`, in alphabetical order.

- [ ] **Step 10: Run the tests, the typecheck and the format check**

Run: `pnpm --filter @pokerji/schema-builder test && pnpm --filter @pokerji/schema-builder typecheck && pnpm format:check`
Expected: every test passes; the typecheck prints nothing; Prettier reports every file formatted and does not mention `vocabulary.json`.

If "knows every type and property the guided forms use" fails, the message names the type and property. Fix the guided definition in Task 2's files (a misspelt property, or one the type does not have), not the vocabulary.

- [ ] **Step 11: Commit**

```bash
git add packages/schema-builder apps/web/static/schema .prettierignore
git commit -m "feat: the Schema.org 30.1 vocabulary, compacted, and a reader for it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The checks

**Files:**
- Create: `packages/schema-builder/src/checks.ts`
- Modify: `packages/schema-builder/src/index.ts`
- Test: `packages/schema-builder/test/checks.test.ts`

**Interfaces:**
- Consumes: `Draft`, `Item`, `Step`, `Value`, `valuesOf`, `blankValue` (Task 1); `Definition`, `Field`, `topDefinition`, `nestedDefinition` (Task 2); `Vocabulary`, `hasProperty` (Task 4).
- Produces:
  - `FINDING_KINDS`, `type FindingKind` = `'missing-required' | 'missing-recommended' | 'bad-url' | 'bad-date' | 'bad-number' | 'bad-currency' | 'out-of-range' | 'dangling-reference' | 'unknown-property'`
  - `interface Finding { item: string; steps: Step[]; property: string; index?: number; kind: FindingKind; anyOf?: string[] }`. `item` is the top-level item's key and `steps` leads to the item holding `property`. `index` is set when the finding is about one value. `anyOf` is set on a `missing-required` finding for a one-of group and lists the group.
  - `check(draft: Draft, vocabulary?: Vocabulary): Finding[]`, in the draft's order.

- [ ] **Step 1: Write the failing test**

`packages/schema-builder/test/checks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Finding } from '../src/index.ts';
import { check, parseVocabulary } from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const kinds = (findings: Finding[], kind: string) =>
  findings.filter((finding) => finding.kind === kind).map((finding) => finding.property);

describe('required and recommended', () => {
  it('reports what an empty guided item is missing', () => {
    const findings = check(draftOf(make('LocalBusiness', {}, 'shop')));
    expect(kinds(findings, 'missing-required')).toEqual(['name', 'address']);
    expect(kinds(findings, 'missing-recommended')).toEqual([
      'url',
      'telephone',
      'priceRange',
      'geo',
      'openingHoursSpecification',
    ]);
    expect(findings[0]).toEqual({
      item: 'shop',
      steps: [],
      property: 'name',
      kind: 'missing-required',
    });
  });

  it('treats a blank value as missing', () => {
    const draft = draftOf(make('WebSite', { name: text('  '), url: text('https://x.example', 'url') }));
    expect(kinds(check(draft), 'missing-required')).toEqual(['name']);
  });

  it('applies a variant’s rules', () => {
    expect(kinds(check(draftOf(make('BlogPosting'))), 'missing-recommended')).toContain('headline');
  });

  it('has no required or recommended rules for a type outside the ten', () => {
    expect(check(draftOf(make('Movie')))).toEqual([]);
  });

  it('looks inside a nested item only once it has a value', () => {
    const empty = draftOf(make('Product', { name: text('Kettle'), offers: nested(make('Offer')) }));
    expect(kinds(check(empty), 'missing-required')).toEqual(['offers']);

    const started = draftOf(
      make(
        'Product',
        { name: text('Kettle'), offers: nested(make('Offer', { priceCurrency: text('USD') })) },
        'p',
      ),
    );
    const findings = check(started);
    expect(findings.filter((finding) => finding.kind === 'missing-required')).toEqual([
      {
        item: 'p',
        steps: [{ property: 'offers', index: 0 }],
        property: 'price',
        kind: 'missing-required',
      },
    ]);
    expect(kinds(findings, 'missing-recommended')).toEqual(['availability', 'priceValidUntil']);
  });

  it('reports a one-of group once, naming the group, and not its members again', () => {
    const findings = check(draftOf(make('Product', { name: text('Kettle') }, 'p')));
    expect(findings).toEqual([
      {
        item: 'p',
        steps: [],
        property: 'offers',
        kind: 'missing-required',
        anyOf: ['offers', 'aggregateRating', 'review'],
      },
    ]);
  });

  it('is satisfied by any member of a one-of group', () => {
    const rating = make('AggregateRating', {
      ratingValue: text('4.5', 'number'),
      reviewCount: text('12', 'number'),
      bestRating: text('5', 'number'),
      worstRating: text('1', 'number'),
    });
    const draft = draftOf(make('Product', { name: text('Kettle'), aggregateRating: nested(rating) }));
    expect(check(draft)).toEqual([
      expect.objectContaining({ property: 'offers', kind: 'missing-recommended' }),
    ]);
  });

  it('uses the rules of the place a nested type appears in', () => {
    const product = draftOf(make('Product', { name: text('K'), offers: nested(make('Offer', { url: text('https://x.example', 'url') })) }));
    const event = draftOf(
      make('Event', {
        name: text('Gig'),
        startDate: text('2026-11-02', 'date'),
        location: nested(make('Place', { name: text('Hall') })),
        offers: nested(make('Offer', { url: text('https://x.example', 'url') })),
      }),
    );
    expect(kinds(check(product), 'missing-required')).toEqual(['price']);
    expect(kinds(check(event), 'missing-required')).toEqual(['address']);
  });
});

describe('malformed values', () => {
  const one = (kind: Parameters<typeof text>[1], typed: string) =>
    check(draftOf(make('Thing', { x: text(typed, kind) }, 'a')));

  it('accepts absolute web addresses only', () => {
    expect(one('url', 'https://example.com/a?b=c#d')).toEqual([]);
    expect(one('url', 'http://example.com')).toEqual([]);
    for (const bad of ['htp:/x', 'example.com', '/about', 'javascript:alert(1)', 'https://', 'https://a b']) {
      expect(one('url', bad), bad).toEqual([
        { item: 'a', steps: [], property: 'x', index: 0, kind: 'bad-url' },
      ]);
    }
  });

  it('accepts real dates only', () => {
    expect(one('date', '2026-10-13')).toEqual([]);
    expect(one('date', '2028-02-29')).toEqual([]);
    for (const bad of ['2026-13', '2026-13-01', '2026-02-30', '13/10/2026', '2026-10-13T08:00']) {
      expect(kinds(one('date', bad), 'bad-date'), bad).toEqual(['x']);
    }
  });

  it('accepts a date and time, with or without seconds and zone, or a date alone', () => {
    for (const good of ['2026-11-02T19:00', '2026-11-02T19:00:00', '2026-11-02T19:00:00Z', '2026-11-02T19:00:00-05:00', '2026-11-02']) {
      expect(one('dateTime', good), good).toEqual([]);
    }
    for (const bad of ['2026-11-02 19:00', '2026-11-02T25:00', 'tomorrow', '2026-11-02T19:00T']) {
      expect(kinds(one('dateTime', bad), 'bad-date'), bad).toEqual(['x']);
    }
  });

  it('accepts a time of day', () => {
    expect(one('time', '09:00')).toEqual([]);
    expect(one('time', '17:30:00')).toEqual([]);
    expect(kinds(one('time', '9am'), 'bad-date')).toEqual(['x']);
    expect(kinds(one('time', '24:00'), 'bad-date')).toEqual(['x']);
  });

  it('accepts plain numbers only', () => {
    for (const good of ['0', '42', '-3', '19.50', '007']) expect(one('number', good), good).toEqual([]);
    for (const bad of ['12,50', '$5', '1e3', 'five', '1.', '.5']) {
      expect(kinds(one('number', bad), 'bad-number'), bad).toEqual(['x']);
    }
  });

  it('says nothing about a blank value', () => {
    expect(one('url', '  ')).toEqual([]);
    expect(one('number', '')).toEqual([]);
  });

  it('checks a currency code where the form asks for one', () => {
    const offer = (currency: string) =>
      check(
        draftOf(
          make('Product', {
            name: text('K'),
            offers: nested(
              make('Offer', {
                price: text('5', 'number'),
                priceCurrency: text(currency),
                availability: text('https://schema.org/InStock'),
                priceValidUntil: text('2027-01-01', 'date'),
              }),
            ),
          }),
        ),
      );
    expect(offer('USD')).toEqual([]);
    expect(offer('usd')).toEqual([]);
    expect(kinds(offer('dollars'), 'bad-currency')).toEqual(['priceCurrency']);
    expect(kinds(offer('$'), 'bad-currency')).toEqual(['priceCurrency']);
  });

  it('checks a rating against the scale beside it, or 1 to 5', () => {
    const rated = (value: string, extra: Record<string, ReturnType<typeof text>> = {}) =>
      check(
        draftOf(
          make('Product', {
            name: text('K'),
            offers: nested(make('Offer', { price: text('5', 'number'), priceCurrency: text('USD'), availability: text('https://schema.org/InStock'), priceValidUntil: text('2027-01-01', 'date') })),
            aggregateRating: nested(
              make('AggregateRating', {
                ratingValue: text(value, 'number'),
                ratingCount: text('3', 'number'),
                bestRating: text('5', 'number'),
                worstRating: text('1', 'number'),
                ...extra,
              }),
            ),
          }),
        ),
      );
    expect(rated('4.5')).toEqual([]);
    expect(kinds(rated('7'), 'out-of-range')).toEqual(['ratingValue']);
    expect(kinds(rated('0'), 'out-of-range')).toEqual(['ratingValue']);
    expect(rated('7', { bestRating: text('10', 'number') })).toEqual([]);
    expect(kinds(rated('seven'), 'out-of-range')).toEqual([]);
    expect(kinds(rated('seven'), 'bad-number')).toEqual(['ratingValue']);
  });

  it('reports a reference to an item that is gone, and not one that is there', () => {
    const draft = draftOf(
      make('Organization', { name: text('Acme') }, 'org'),
      make('Movie', { productionCompany: [ref('org'), ref('gone')] }, 'film'),
    );
    expect(check(draft).filter((finding) => finding.item === 'film')).toEqual([
      { item: 'film', steps: [], property: 'productionCompany', index: 1, kind: 'dangling-reference' },
    ]);
  });

  it('does not count a dangling reference as a missing value', () => {
    const draft = draftOf(make('WebSite', { name: ref('gone'), url: text('https://x.example', 'url') }));
    expect(kinds(check(draft), 'missing-required')).toEqual([]);
    expect(kinds(check(draft), 'dangling-reference')).toEqual(['name']);
  });

  it('reports findings in the draft’s order, at any depth', () => {
    const draft = draftOf(
      make('Movie', { url: text('nope', 'url') }, 'a'),
      make('Movie', { about: nested(make('Thing', { about: nested(make('Thing', { url: text('nope', 'url') })) })) }, 'b'),
    );
    expect(check(draft)).toEqual([
      { item: 'a', steps: [], property: 'url', index: 0, kind: 'bad-url' },
      {
        item: 'b',
        steps: [
          { property: 'about', index: 0 },
          { property: 'about', index: 0 },
        ],
        property: 'url',
        index: 0,
        kind: 'bad-url',
      },
    ]);
  });
});

describe('with the vocabulary', () => {
  const vocabulary = parseVocabulary({
    version: 'test',
    types: { Thing: [], Movie: ['Thing'] },
    properties: {
      name: { d: ['Thing'], r: [], c: '' },
      duration: { d: ['Movie'], r: [], c: '' },
    },
    enums: {},
    dataTypes: [],
  })!;

  it('reports a property the type does not have', () => {
    const draft = draftOf(make('Thing', { name: text('x'), duration: text('PT2H') }, 'a'));
    expect(check(draft, vocabulary)).toEqual([
      { item: 'a', steps: [], property: 'duration', kind: 'unknown-property' },
    ]);
    expect(check(draftOf(make('Movie', { duration: text('PT2H') })), vocabulary)).toEqual([]);
  });

  it('says nothing about properties without the vocabulary, or for a type it does not know', () => {
    expect(check(draftOf(make('Thing', { duration: text('PT2H') })))).toEqual([]);
    expect(check(draftOf(make('Gadget', { whatever: text('x') })), vocabulary)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/checks.test.ts`
Expected: FAIL, because `check` is not exported.

- [ ] **Step 3: Write the checks**

`packages/schema-builder/src/checks.ts`:

```ts
import type { Definition, Field } from './definitions.ts';
import { nestedDefinition, topDefinition } from './definitions.ts';
import type { Draft, Item, Step, Value } from './model.ts';
import { blankValue, valuesOf } from './model.ts';
import type { Vocabulary } from './vocabulary.ts';
import { hasProperty } from './vocabulary.ts';

export const FINDING_KINDS = [
  'missing-required',
  'missing-recommended',
  'bad-url',
  'bad-date',
  'bad-number',
  'bad-currency',
  'out-of-range',
  'dangling-reference',
  'unknown-property',
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export interface Finding {
  /** The key of the top-level item. */
  item: string;
  /** The way down from it to the item that holds `property`. */
  steps: Step[];
  property: string;
  /** Which value, when the finding is about one value. */
  index?: number;
  kind: FindingKind;
  /** On a missing-required finding for a one-of group: the properties in the group. */
  anyOf?: string[];
}

const URL_SHAPE = /^https?:\/\/[^\s/?#.][^\s/?#]*([/?#]\S*)?$/i;
const NUMBER_SHAPE = /^-?\d+(\.\d+)?$/;
const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/;
const CURRENCY_SHAPE = /^[A-Za-z]{3}$/;

const isDate = (typed: string): boolean => {
  const match = DATE_SHAPE.exec(typed);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

/** A date and a time joined by T. A date alone is accepted too. */
const isDateTime = (typed: string): boolean => {
  const [date, time, ...rest] = typed.split('T');
  if (date === undefined || rest.length > 0) return false;
  return isDate(date) && (time === undefined || TIME_SHAPE.test(time));
};

const numberOf = (item: Item, property: string, otherwise: number): number => {
  const held = valuesOf(item, property).find((value) => !blankValue(value));
  if (held?.kind !== 'number' || !NUMBER_SHAPE.test(held.text.trim())) return otherwise;
  return Number(held.text.trim());
};

/**
 * Everything worth telling the person about a draft, in the draft's order. Required and
 * recommended apply to guided definitions only. Nothing here stops the output being used.
 */
export const check = (draft: Draft, vocabulary?: Vocabulary): Finding[] => {
  const findings: Finding[] = [];
  const keys = new Set(draft.items.map((item) => item.key));

  const malformed = (value: Value, field: Field | undefined, item: Item): FindingKind | undefined => {
    if (value.kind === 'reference') return keys.has(value.key) ? undefined : 'dangling-reference';
    if (value.kind === 'boolean' || value.kind === 'item') return undefined;
    const typed = value.text.trim();
    switch (value.kind) {
      case 'url':
        return URL_SHAPE.test(typed) ? undefined : 'bad-url';
      case 'date':
        return isDate(typed) ? undefined : 'bad-date';
      case 'dateTime':
        return isDateTime(typed) ? undefined : 'bad-date';
      case 'time':
        return TIME_SHAPE.test(typed) ? undefined : 'bad-date';
      case 'number': {
        if (!NUMBER_SHAPE.test(typed)) return 'bad-number';
        if (field?.format !== 'rating') return undefined;
        const rating = Number(typed);
        const inRange =
          rating >= numberOf(item, 'worstRating', 1) && rating <= numberOf(item, 'bestRating', 5);
        return inRange ? undefined : 'out-of-range';
      }
      default:
        return field?.format === 'currency' && !CURRENCY_SHAPE.test(typed)
          ? 'bad-currency'
          : undefined;
    }
  };

  const walk = (item: Item, definition: Definition | undefined, top: string, steps: Step[]): void => {
    const missing = (property: string): boolean => valuesOf(item, property).every(blankValue);
    const here = { item: top, steps };

    if (definition) {
      const unmet = definition.oneOf.filter((group) => group.every(missing));
      const grouped = new Set(unmet.flat());
      for (const field of definition.fields) {
        if (field.level === 'optional' || grouped.has(field.property)) continue;
        if (!missing(field.property)) continue;
        findings.push({
          ...here,
          property: field.property,
          kind: field.level === 'required' ? 'missing-required' : 'missing-recommended',
        });
      }
      for (const group of unmet) {
        const [first] = group;
        if (first !== undefined) {
          findings.push({ ...here, property: first, kind: 'missing-required', anyOf: group });
        }
      }
    }

    for (const property of item.properties) {
      const field = definition?.fields.find((candidate) => candidate.property === property.name);
      if (
        vocabulary?.types.has(item.type) &&
        !hasProperty(vocabulary, item.type, property.name)
      ) {
        findings.push({ ...here, property: property.name, kind: 'unknown-property' });
      }
      property.values.forEach((value, index) => {
        if (blankValue(value)) return;
        if (value.kind === 'item') {
          walk(value.item, nestedDefinition(field, value.item.type), top, [
            ...steps,
            { property: property.name, index },
          ]);
          return;
        }
        const kind = malformed(value, field, item);
        if (kind) findings.push({ ...here, property: property.name, index, kind });
      });
    }
  };

  for (const item of draft.items) walk(item, topDefinition(item.type), item.key, []);
  return findings;
};
```

Add `export * from './checks.ts';` to `packages/schema-builder/src/index.ts`, in alphabetical order.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm --filter @pokerji/schema-builder test && pnpm --filter @pokerji/schema-builder typecheck`
Expected: every test passes; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/schema-builder
git commit -m "feat: check a draft for missing and malformed values

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Stored drafts

**Files:**
- Create: `packages/schema-builder/src/storage.ts`
- Modify: `packages/schema-builder/src/index.ts`
- Test: `packages/schema-builder/test/storage.test.ts`

**Interfaces:**
- Consumes: `Draft`, `Item`, `Value`, `TEXT_KINDS` (Task 1); `draftProblem`, `LIMITS` (Task 1).
- Produces:
  - `STORAGE_KEY = 'pj-schema-draft'`, `STORAGE_VERSION = 1`
  - `type OutputForm = 'script' | 'json'`, `interface Stored { draft: Draft; form: OutputForm }`
  - `pack(stored: Stored): string`
  - `unpack(text: string | null | undefined): Stored | undefined`. Never throws. Gives `undefined` for anything that is not a stored draft within every limit.

The package does not touch local storage itself; the page reads and writes the string.

- [ ] **Step 1: Write the failing test**

`packages/schema-builder/test/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../src/index.ts';
import { LIMITS, pack, STORAGE_KEY, STORAGE_VERSION, unpack } from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const stored = (draft: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: STORAGE_VERSION, form: 'script', draft, ...extra });

describe('stored drafts', () => {
  it('uses the key the privacy page names', () => {
    expect(STORAGE_KEY).toBe('pj-schema-draft');
  });

  it('reads back exactly what was packed', () => {
    const draft = draftOf(
      make('Organization', { name: text('Acme') }, 'org'),
      {
        ...make(
          'Article',
          {
            headline: text('Hi'),
            datePublished: text('2026-10-13', 'date'),
            isAccessibleForFree: { kind: 'boolean', on: true },
            publisher: ref('org'),
            author: nested(make('Person', { name: text('Ada') }, 'p')),
          },
          'art',
        ),
        id: '#article',
      },
    );
    expect(unpack(pack({ draft, form: 'json' }))).toEqual({ draft, form: 'json' });
  });

  it('gives nothing for nothing', () => {
    expect(unpack(null)).toBeUndefined();
    expect(unpack(undefined)).toBeUndefined();
    expect(unpack('')).toBeUndefined();
  });

  it('gives nothing for text that is not JSON, or JSON that is not a draft', () => {
    for (const bad of ['{', 'null', '[]', '"draft"', '42', '{"version":1}', '{"draft":{"items":[]}}']) {
      expect(unpack(bad), bad).toBeUndefined();
    }
  });

  it('gives nothing for another version', () => {
    expect(unpack(stored({ items: [] }, { version: 2 }))).toBeUndefined();
    expect(unpack(stored({ items: [] }, { version: '1' }))).toBeUndefined();
    expect(unpack(stored({ items: [] }))).toEqual({ draft: { items: [] }, form: 'script' });
  });

  it('gives nothing for an unknown output form', () => {
    expect(unpack(stored({ items: [] }, { form: 'xml' }))).toBeUndefined();
  });

  it('gives nothing for a value of an unknown kind or the wrong shape', () => {
    const withValue = (value: unknown) =>
      stored({ items: [{ key: 'a', type: 'Thing', id: '', properties: [{ name: 'x', values: [value] }] }] });
    expect(unpack(withValue({ kind: 'text', text: 'ok' }))).toBeDefined();
    for (const bad of [
      { kind: 'html', text: '<b>' },
      { kind: 'text', text: 5 },
      { kind: 'text' },
      { kind: 'boolean', on: 'yes' },
      { kind: 'item', item: null },
      { kind: 'reference' },
      'plain',
      null,
    ]) {
      expect(unpack(withValue(bad)), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('gives nothing for fields it does not know', () => {
    expect(
      unpack(stored({ items: [{ key: 'a', type: 'Thing', id: '', properties: [], extra: 1 }] })),
    ).toBeUndefined();
    expect(
      unpack(stored({ items: [{ key: 'a', type: 'Thing', id: '', properties: [{ name: 'x', values: [{ kind: 'text', text: 'y', html: '<b>' }] }] }] })),
    ).toBeUndefined();
  });

  it('gives nothing for an item with no key or no type, or a property with no values', () => {
    expect(unpack(stored({ items: [{ key: '', type: 'Thing', id: '', properties: [] }] }))).toBeUndefined();
    expect(unpack(stored({ items: [{ key: 'a', type: '', id: '', properties: [] }] }))).toBeUndefined();
    expect(
      unpack(stored({ items: [{ key: 'a', type: 'Thing', id: '', properties: [{ name: 'x', values: [] }] }] })),
    ).toBeUndefined();
  });

  it('gives nothing for a draft past any limit', () => {
    const many = Array.from({ length: LIMITS.items + 1 }, (_, n) => make('Thing', {}, `k${n}`));
    expect(unpack(stored({ items: many }))).toBeUndefined();

    const long = make('Thing', { name: text('x'.repeat(LIMITS.text + 1)) }, 'a');
    expect(unpack(stored({ items: [long] }))).toBeUndefined();

    const wide = make('Thing', { name: Array.from({ length: LIMITS.values + 1 }, () => text('x')) }, 'a');
    expect(unpack(stored({ items: [wide] }))).toBeUndefined();

    const twins = [make('Thing', {}, 'same'), make('Thing', {}, 'same')];
    expect(unpack(stored({ items: twins }))).toBeUndefined();
  });

  it('gives nothing for a draft nested too deep, however deep, without throwing', () => {
    const chain = (depth: number): Item =>
      depth === 1 ? make('Thing') : make('Thing', { about: nested(chain(depth - 1)) });
    expect(unpack(stored({ items: [chain(LIMITS.depth)] }))).toBeDefined();
    expect(unpack(stored({ items: [chain(LIMITS.depth + 1)] }))).toBeUndefined();
    expect(unpack(stored({ items: [chain(50)] }))).toBeUndefined();

    const absurd = `${'{"a":'.repeat(20_000)}1${'}'.repeat(20_000)}`;
    expect(() => unpack(absurd)).not.toThrow();
    expect(unpack(absurd)).toBeUndefined();
  });

  it('gives nothing for text too large to be a draft, without parsing it', () => {
    expect(unpack(' '.repeat(6_000_000))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/storage.test.ts`
Expected: FAIL, because `unpack` is not exported.

- [ ] **Step 3: Write the storage functions**

`packages/schema-builder/src/storage.ts`:

```ts
import { z } from 'zod';
import { draftProblem } from './changes.ts';
import { LIMITS } from './limits.ts';
import type { Draft, Item, Value } from './model.ts';
import { TEXT_KINDS } from './model.ts';

export const STORAGE_KEY = 'pj-schema-draft';
export const STORAGE_VERSION = 1;

export type OutputForm = 'script' | 'json';

export interface Stored {
  draft: Draft;
  form: OutputForm;
}

/** Larger than any draft within the limits can be. Anything longer is not read at all. */
const LARGEST = 5_000_000;

const Name = z.string().min(1).max(LIMITS.name);

const StoredValue: z.ZodType<Value> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.enum(TEXT_KINDS), text: z.string() }),
    z.strictObject({ kind: z.literal('boolean'), on: z.boolean() }),
    z.strictObject({ kind: z.literal('item'), item: StoredItem }),
    z.strictObject({ kind: z.literal('reference'), key: z.string() }),
  ]),
);

const StoredItem: z.ZodType<Item> = z.lazy(() =>
  z.strictObject({
    key: Name,
    type: Name,
    id: z.string(),
    properties: z.array(z.strictObject({ name: Name, values: z.array(StoredValue).min(1) })),
  }),
);

const Envelope = z.strictObject({
  version: z.literal(STORAGE_VERSION),
  form: z.enum(['script', 'json']),
  draft: z.strictObject({ items: z.array(StoredItem) }),
});

export const pack = (stored: Stored): string =>
  JSON.stringify({ version: STORAGE_VERSION, form: stored.form, draft: stored.draft });

/**
 * A stored draft read back. What is in storage is not trusted: a person, an extension or an
 * older version of the app may have written anything. Whatever is not a draft of this version
 * within every limit gives nothing, and this never throws.
 */
export const unpack = (text: string | null | undefined): Stored | undefined => {
  if (!text || text.length > LARGEST) return undefined;
  try {
    const parsed = Envelope.safeParse(JSON.parse(text));
    if (!parsed.success) return undefined;
    const { draft, form } = parsed.data;
    return draftProblem(draft) === undefined ? { draft, form } : undefined;
  } catch {
    // Not JSON, or nested so deep that reading it ran out of stack.
    return undefined;
  }
};
```

Add `export * from './storage.ts';` to `packages/schema-builder/src/index.ts`, in alphabetical order.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm --filter @pokerji/schema-builder test && pnpm --filter @pokerji/schema-builder typecheck`
Expected: every test passes; the typecheck prints nothing.

If the typecheck objects that the recursive schemas do not match `z.ZodType<Value>` or `z.ZodType<Item>`, check the Zod 4.6 documentation for recursive types and keep the same behaviour: unknown keys refused, the four value shapes, at least one value per property.

- [ ] **Step 5: Commit**

```bash
git add packages/schema-builder
git commit -m "feat: pack a draft for storage and read it back without trusting it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Fields for the editor, and the ten types end to end

**Files:**
- Create: `packages/schema-builder/src/fields.ts`
- Modify: `packages/schema-builder/src/index.ts`
- Test: `packages/schema-builder/test/fields.test.ts`, `packages/schema-builder/test/guided.test.ts`

**Interfaces:**
- Consumes: `Draft`, `Item`, `ItemPath`, `ValueKind`, `valuesOf` (Task 1); `Definition`, `Field`, `topDefinition`, `nestedDefinition` (Task 2); `serialize` (Task 3); `Vocabulary`, `expects`, `describeProperty`, `hasProperty` (Task 4); `check` (Task 5).
- Produces:
  - `definitionAt(draft: Draft, at: ItemPath): Definition | undefined`: the guided definition in force for the item at a path, found by walking down from the top-level item.
  - `propertyField(item: Item, property: string, vocabulary?: Vocabulary): Field`: a field for a property that no guided definition covers. With the vocabulary, its kinds, choices and hint come from there; without it, its kinds are those of the values the item already holds, or text.
  - `fieldsFor(item: Item, definition: Definition | undefined, vocabulary?: Vocabulary): Field[]`: the guided fields in order, then one field for each further property the item holds, in the order they were added.
  - `accepts(type: string, definition: Definition | undefined, vocabulary: Vocabulary | undefined, property: string): boolean`: whether an item of `type` can keep `property`. This is the `keeps` argument of `setType`.

- [ ] **Step 1: Write the failing tests**

`packages/schema-builder/test/fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  accepts,
  DEFINITIONS,
  definitionAt,
  fieldsFor,
  parseVocabulary,
  propertyField,
  topDefinition,
} from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const vocabulary = parseVocabulary({
  version: 'test',
  types: { Thing: [], WebSite: ['Thing'], Enumeration: ['Thing'], Genre: ['Enumeration'], Text: [], URL: ['Text'] },
  properties: {
    name: { d: ['Thing'], r: ['Text'], c: 'The name of the item.' },
    url: { d: ['Thing'], r: ['URL'], c: '' },
    alternateName: { d: ['Thing'], r: ['Text'], c: '' },
    about: { d: ['WebSite'], r: ['Thing'], c: 'The subject matter.' },
    genre: { d: ['WebSite'], r: ['Genre'], c: '' },
  },
  enums: { Genre: ['Comedy'] },
  dataTypes: ['Text'],
})!;

describe('definitionAt', () => {
  const draft = draftOf(
    make(
      'Product',
      {
        offers: nested(make('Offer')),
        review: nested(make('Review', { reviewRating: nested(make('Rating')) })),
        isRelatedTo: nested(make('Product')),
      },
      'p',
    ),
    make('Movie', {}, 'm'),
  );
  const at = (...steps: [string, number][]) => ({
    key: 'p',
    steps: steps.map(([property, index]) => ({ property, index })),
  });

  it('finds the definition for a top-level item', () => {
    expect(definitionAt(draft, at())?.id).toBe('Product');
    expect(definitionAt(draft, { key: 'm', steps: [] })).toBeUndefined();
  });

  it('finds the definition a nested item is edited with', () => {
    expect(definitionAt(draft, at(['offers', 0]))?.id).toBe('Product.Offer');
    expect(definitionAt(draft, at(['review', 0], ['reviewRating', 0]))?.id).toBe('Rating');
  });

  it('finds none under a property the form does not guide, or off the end of a path', () => {
    expect(definitionAt(draft, at(['isRelatedTo', 0]))).toBeUndefined();
    expect(definitionAt(draft, at(['offers', 3]))).toBeUndefined();
    expect(definitionAt(draft, { key: 'gone', steps: [] })).toBeUndefined();
  });
});

describe('fieldsFor', () => {
  it('lists the guided fields, then further properties in the order they were added', () => {
    const item = make('WebSite', { genre: text('x'), name: text('pokerji'), about: text('y') });
    const fields = fieldsFor(item, topDefinition('WebSite'), vocabulary);
    expect(fields.map((field) => field.property)).toEqual([
      'name',
      'url',
      'alternateName',
      'genre',
      'about',
    ]);
    expect(fields[0]?.level).toBe('required');
    expect(fields[3]?.level).toBe('optional');
  });

  it('lists only what an unguided item holds', () => {
    const item = make('Thing', { url: text('https://x.example', 'url') });
    expect(fieldsFor(item, undefined, vocabulary).map((field) => field.property)).toEqual(['url']);
    expect(fieldsFor(make('Thing'), undefined, vocabulary)).toEqual([]);
  });
});

describe('propertyField', () => {
  it('describes a property from the vocabulary', () => {
    expect(propertyField(make('WebSite'), 'about', vocabulary)).toEqual({
      property: 'about',
      label: 'about',
      hint: 'The subject matter.',
      kinds: ['item', 'reference'],
      level: 'optional',
      repeats: true,
    });
    expect(propertyField(make('WebSite'), 'genre', vocabulary)).toMatchObject({
      kinds: ['text'],
      choices: ['https://schema.org/Comedy'],
    });
  });

  it('falls back to the kinds already held when the vocabulary is not loaded', () => {
    const item = make('Thing', { about: [nested(make('Thing')), ref('x'), nested(make('Thing'))] });
    expect(propertyField(item, 'about')).toEqual({
      property: 'about',
      label: 'about',
      hint: '',
      kinds: ['item', 'reference'],
      level: 'optional',
      repeats: true,
    });
    expect(propertyField(make('Thing'), 'anything').kinds).toEqual(['text']);
  });

  it('keeps a kind the item already holds, even if the vocabulary does not expect it', () => {
    const item = make('WebSite', { about: text('typed') });
    expect(propertyField(item, 'about', vocabulary).kinds).toEqual(['item', 'reference', 'text']);
  });
});

describe('accepts', () => {
  it('keeps a property the guided form has', () => {
    expect(accepts('WebSite', DEFINITIONS.WebSite, undefined, 'name')).toBe(true);
    expect(accepts('WebSite', DEFINITIONS.WebSite, undefined, 'about')).toBe(false);
  });

  it('keeps a property the vocabulary gives the type', () => {
    expect(accepts('WebSite', DEFINITIONS.WebSite, vocabulary, 'about')).toBe(true);
    expect(accepts('Thing', undefined, vocabulary, 'about')).toBe(false);
  });

  it('keeps everything for a type nothing is known about', () => {
    expect(accepts('Gadget', undefined, undefined, 'whatever')).toBe(true);
    expect(accepts('Gadget', undefined, vocabulary, 'whatever')).toBe(true);
  });
});
```

`packages/schema-builder/test/guided.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Draft, JsonObject } from '../src/index.ts';
import { check, GUIDED, parseVocabulary, serialize } from '../src/index.ts';
import { draftOf, make, nested, text } from './helpers.ts';

const vocabulary = parseVocabulary(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../apps/web/static/schema/vocabulary.json', import.meta.url)),
      'utf8',
    ),
  ),
)!;

const url = (address: string) => text(address, 'url');
const number = (typed: string) => text(typed, 'number');
const date = (typed: string) => text(typed, 'date');
const dateTime = (typed: string) => text(typed, 'dateTime');
const person = (name: string) => nested(make('Person', { name: text(name) }));
const postal = () =>
  nested(
    make('PostalAddress', {
      streetAddress: text('1 Main St'),
      addressLocality: text('Hoboken'),
      addressRegion: text('NJ'),
      postalCode: text('07030'),
      addressCountry: text('US'),
    }),
  );
const POSTAL = {
  '@type': 'PostalAddress',
  streetAddress: '1 Main St',
  addressLocality: 'Hoboken',
  addressRegion: 'NJ',
  postalCode: '07030',
  addressCountry: 'US',
};
const CONTEXT = { '@context': 'https://schema.org' };

/** Each guided type filled in, and the markup it should give. */
const CASES: Record<string, { draft: Draft; markup: JsonObject; required: string[] }> = {
  Organization: {
    draft: draftOf(
      make('Organization', {
        sameAs: [url('https://social.example/acme'), url('https://video.example/acme')],
        name: text('Acme'),
        url: url('https://acme.example'),
        logo: url('https://acme.example/logo.png'),
        address: postal(),
        contactPoint: nested(make('ContactPoint', { telephone: text('+1 201 555 0100') })),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Organization',
      name: 'Acme',
      url: 'https://acme.example',
      logo: 'https://acme.example/logo.png',
      address: POSTAL,
      contactPoint: { '@type': 'ContactPoint', telephone: '+1 201 555 0100' },
      sameAs: ['https://social.example/acme', 'https://video.example/acme'],
    },
    required: [],
  },
  LocalBusiness: {
    draft: draftOf(
      make('LocalBusiness', {
        name: text('Acme Bakery'),
        address: postal(),
        geo: nested(make('GeoCoordinates', { latitude: number('40.74399'), longitude: number('-74.03236') })),
        openingHoursSpecification: nested(
          make('OpeningHoursSpecification', {
            dayOfWeek: [text('https://schema.org/Saturday'), text('https://schema.org/Sunday')],
            opens: text('08:00', 'time'),
            closes: text('14:00', 'time'),
          }),
        ),
        priceRange: text('$$'),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'LocalBusiness',
      name: 'Acme Bakery',
      address: POSTAL,
      priceRange: '$$',
      geo: { '@type': 'GeoCoordinates', latitude: 40.74399, longitude: -74.03236 },
      openingHoursSpecification: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['https://schema.org/Saturday', 'https://schema.org/Sunday'],
        opens: '08:00',
        closes: '14:00',
      },
    },
    required: ['name', 'address'],
  },
  WebSite: {
    draft: draftOf(
      make('WebSite', { name: text('Acme'), url: url('https://acme.example/'), alternateName: text('AC') }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'WebSite',
      name: 'Acme',
      url: 'https://acme.example/',
      alternateName: 'AC',
    },
    required: ['name', 'url'],
  },
  BreadcrumbList: {
    draft: draftOf(
      make('BreadcrumbList', {
        itemListElement: [
          nested(make('ListItem', { name: text('Home'), item: url('https://acme.example/') })),
          nested(make('ListItem', { name: text('Bread'), item: url('https://acme.example/bread') })),
          nested(make('ListItem', { name: text('Sourdough') })),
        ],
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://acme.example/' },
        { '@type': 'ListItem', position: 2, name: 'Bread', item: 'https://acme.example/bread' },
        { '@type': 'ListItem', position: 3, name: 'Sourdough' },
      ],
    },
    required: ['itemListElement'],
  },
  Article: {
    draft: draftOf(
      make('BlogPosting', {
        headline: text('How we bake'),
        image: url('https://acme.example/oven.jpg'),
        datePublished: dateTime('2026-10-13T08:00:00+00:00'),
        dateModified: date('2026-10-14'),
        author: [
          nested(make('Person', { name: text('Ada'), url: url('https://acme.example/ada') })),
          nested(make('Organization', { name: text('Acme') })),
        ],
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'BlogPosting',
      headline: 'How we bake',
      image: 'https://acme.example/oven.jpg',
      datePublished: '2026-10-13T08:00:00+00:00',
      dateModified: '2026-10-14',
      author: [
        { '@type': 'Person', name: 'Ada', url: 'https://acme.example/ada' },
        { '@type': 'Organization', name: 'Acme' },
      ],
    },
    required: [],
  },
  FAQPage: {
    draft: draftOf(
      make('FAQPage', {
        mainEntity: [
          nested(
            make('Question', {
              name: text('Do you deliver?'),
              acceptedAnswer: nested(make('Answer', { text: text('Yes, within Hoboken.') })),
            }),
          ),
          nested(
            make('Question', {
              name: text('Is it vegan?'),
              acceptedAnswer: nested(make('Answer', { text: text('The sourdough is.') })),
            }),
          ),
        ],
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Do you deliver?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, within Hoboken.' },
        },
        {
          '@type': 'Question',
          name: 'Is it vegan?',
          acceptedAnswer: { '@type': 'Answer', text: 'The sourdough is.' },
        },
      ],
    },
    required: [],
  },
  Product: {
    draft: draftOf(
      make('Product', {
        name: text('Sourdough loaf'),
        brand: nested(make('Brand', { name: text('Acme') })),
        offers: nested(
          make('Offer', {
            price: number('6.50'),
            priceCurrency: text('USD'),
            availability: text('https://schema.org/InStock'),
            priceValidUntil: date('2027-01-31'),
          }),
        ),
        aggregateRating: nested(
          make('AggregateRating', {
            ratingValue: number('4.6'),
            reviewCount: number('87'),
            bestRating: number('5'),
            worstRating: number('1'),
          }),
        ),
        review: nested(
          make('Review', {
            author: person('Grace'),
            reviewRating: nested(
              make('Rating', { ratingValue: number('5'), bestRating: number('5'), worstRating: number('1') }),
            ),
            datePublished: date('2026-09-30'),
          }),
        ),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Product',
      name: 'Sourdough loaf',
      brand: { '@type': 'Brand', name: 'Acme' },
      offers: {
        '@type': 'Offer',
        price: '6.50',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        priceValidUntil: '2027-01-31',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.6,
        reviewCount: 87,
        bestRating: 5,
        worstRating: 1,
      },
      review: {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Grace' },
        reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 },
        datePublished: '2026-09-30',
      },
    },
    required: ['name', 'offers'],
  },
  Event: {
    draft: draftOf(
      make('Event', {
        name: text('Bread night'),
        startDate: dateTime('2026-11-02T19:00:00-05:00'),
        endDate: dateTime('2026-11-02T21:00:00-05:00'),
        location: nested(make('Place', { name: text('Acme Bakery'), address: postal() })),
        eventStatus: text('https://schema.org/EventScheduled'),
        performer: nested(make('PerformingGroup', { name: text('The Crusts') })),
        offers: nested(
          make('Offer', {
            price: number('0'),
            priceCurrency: text('USD'),
            availability: text('https://schema.org/InStock'),
            validFrom: date('2026-10-01'),
            url: url('https://acme.example/tickets'),
          }),
        ),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Event',
      name: 'Bread night',
      startDate: '2026-11-02T19:00:00-05:00',
      location: { '@type': 'Place', name: 'Acme Bakery', address: POSTAL },
      endDate: '2026-11-02T21:00:00-05:00',
      eventStatus: 'https://schema.org/EventScheduled',
      performer: { '@type': 'PerformingGroup', name: 'The Crusts' },
      offers: {
        '@type': 'Offer',
        price: 0,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        validFrom: '2026-10-01',
        url: 'https://acme.example/tickets',
      },
    },
    required: ['name', 'startDate', 'location'],
  },
  Person: {
    draft: draftOf(
      make('Person', {
        name: text('Ada Lovelace'),
        url: url('https://acme.example/ada'),
        jobTitle: text('Head baker'),
        worksFor: nested(make('Organization', { name: text('Acme') })),
        sameAs: url('https://social.example/ada'),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Person',
      name: 'Ada Lovelace',
      url: 'https://acme.example/ada',
      jobTitle: 'Head baker',
      worksFor: { '@type': 'Organization', name: 'Acme' },
      sameAs: 'https://social.example/ada',
    },
    required: [],
  },
  Recipe: {
    draft: draftOf(
      make('Recipe', {
        name: text('Sourdough'),
        image: nested(make('ImageObject', { url: url('https://acme.example/loaf.jpg'), caption: text('A loaf') })),
        author: person('Ada'),
        prepTime: text('PT30M'),
        cookTime: text('PT45M'),
        recipeYield: text('1 loaf'),
        recipeIngredient: [text('500 g flour'), text('350 g water'), text('10 g salt')],
        recipeInstructions: [
          nested(make('HowToStep', { text: text('Mix everything.') })),
          nested(make('HowToStep', { name: text('Bake'), text: text('Bake at 230 C.') })),
        ],
        nutrition: nested(make('NutritionInformation', { calories: text('120 calories') })),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Recipe',
      name: 'Sourdough',
      image: { '@type': 'ImageObject', url: 'https://acme.example/loaf.jpg', caption: 'A loaf' },
      author: { '@type': 'Person', name: 'Ada' },
      prepTime: 'PT30M',
      cookTime: 'PT45M',
      recipeYield: '1 loaf',
      recipeIngredient: ['500 g flour', '350 g water', '10 g salt'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Mix everything.' },
        { '@type': 'HowToStep', text: 'Bake at 230 C.', name: 'Bake' },
      ],
      nutrition: { '@type': 'NutritionInformation', calories: '120 calories' },
    },
    required: ['name', 'image'],
  },
};

describe('each guided type', () => {
  it('has a case here', () => {
    expect(Object.keys(CASES)).toEqual(GUIDED);
  });

  it.each(GUIDED)('%s, filled in, gives the expected markup in the form’s order', (id) => {
    const { draft, markup } = CASES[id]!;
    const out = serialize(draft);
    expect(out).toEqual(markup);
    expect(JSON.stringify(out)).toBe(JSON.stringify(markup));
  });

  it.each(GUIDED)('%s, filled in, has nothing required missing and nothing malformed', (id) => {
    const findings = check(CASES[id]!.draft, vocabulary);
    expect(findings.filter((finding) => finding.kind !== 'missing-recommended')).toEqual([]);
  });

  it.each(GUIDED)('%s, empty, is missing exactly its required fields', (id) => {
    const findings = check(draftOf(make(id)), vocabulary);
    expect(
      findings.filter((finding) => finding.kind === 'missing-required').map((finding) => finding.property),
    ).toEqual(CASES[id]!.required);
    expect(
      findings.filter((finding) => !finding.kind.startsWith('missing-')),
    ).toEqual([]);
  });
});
```

Two expectations in `guided.test.ts` are deliberate and worth knowing before they surprise you:

- The Product offer's price is typed `6.50`, which does not read back as typed when parsed (`6.5`), so it is written as the string `"6.50"`. The Event offer's `0` is written as the number `0`.
- `JSON.stringify(out)` is compared with `JSON.stringify(markup)` to pin the order of every key, which `toEqual` ignores. Each `markup` above is therefore written in the guided form's field order, not the order the draft was built in.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/schema-builder exec vitest run test/fields.test.ts test/guided.test.ts`
Expected: `fields.test.ts` fails because `fieldsFor` is not exported. `guided.test.ts` already passes, since it uses only earlier tasks; if any of its cases fails, fix the definition or the serialiser before going on, and do not change the expected markup unless it contradicts `RULES.md` or the spec.

- [ ] **Step 3: Write the field functions**

`packages/schema-builder/src/fields.ts`:

```ts
import type { Definition, Field } from './definitions.ts';
import { nestedDefinition, topDefinition } from './definitions.ts';
import type { Draft, Item, ItemPath, ValueKind } from './model.ts';
import { valuesOf } from './model.ts';
import type { Vocabulary } from './vocabulary.ts';
import { describeProperty, expects, hasProperty } from './vocabulary.ts';

/**
 * The guided definition in force for the item at a path. A nested item's definition depends
 * on where it sits: an Offer inside a Product and one inside an Event have different rules.
 */
export const definitionAt = (draft: Draft, at: ItemPath): Definition | undefined => {
  let item = draft.items.find((candidate) => candidate.key === at.key);
  let definition = item ? topDefinition(item.type) : undefined;
  for (const step of at.steps) {
    if (!item) return undefined;
    const value = valuesOf(item, step.property)[step.index];
    if (value?.kind !== 'item') return undefined;
    const field = definition?.fields.find((candidate) => candidate.property === step.property);
    item = value.item;
    definition = nestedDefinition(field, item.type);
  }
  return item ? definition : undefined;
};

/**
 * A field for a property no guided definition covers. With the vocabulary it takes what the
 * property expects; without, the kinds of value the item already holds. A kind already held
 * is always kept, so a value can never be left without an input.
 */
export const propertyField = (item: Item, property: string, vocabulary?: Vocabulary): Field => {
  const held = valuesOf(item, property).map((value) => value.kind);
  const expected = vocabulary ? expects(vocabulary, property) : undefined;
  const kinds: ValueKind[] = [...new Set([...(expected?.kinds ?? []), ...held])];
  return {
    property,
    label: property,
    hint: vocabulary ? describeProperty(vocabulary, property) : '',
    kinds: kinds.length > 0 ? kinds : ['text'],
    level: 'optional',
    repeats: true,
    ...(expected && expected.choices.length > 0 ? { choices: expected.choices } : {}),
  };
};

/** What the editor shows for an item: the guided fields, then every further property it holds. */
export const fieldsFor = (
  item: Item,
  definition: Definition | undefined,
  vocabulary?: Vocabulary,
): Field[] => {
  const guided = definition?.fields ?? [];
  const covered = new Set(guided.map((field) => field.property));
  return [
    ...guided,
    ...item.properties
      .filter((property) => !covered.has(property.name))
      .map((property) => propertyField(item, property.name, vocabulary)),
  ];
};

/**
 * Whether an item of `type` can keep `property` when its type changes. A property is kept if
 * the guided form has it or the vocabulary gives it to the type. For a type nothing is known
 * about, everything is kept: there are no grounds to drop it.
 */
export const accepts = (
  type: string,
  definition: Definition | undefined,
  vocabulary: Vocabulary | undefined,
  property: string,
): boolean => {
  if (definition?.fields.some((field) => field.property === property)) return true;
  const known = vocabulary?.types.has(type) ?? false;
  if (!definition && !known) return true;
  return known && vocabulary !== undefined && hasProperty(vocabulary, type, property);
};
```

Replace `packages/schema-builder/src/index.ts` with the full list:

```ts
export * from './changes.ts';
export * from './checks.ts';
export * from './definitions.ts';
export * from './fields.ts';
export * from './limits.ts';
export * from './model.ts';
export * from './serialize.ts';
export * from './storage.ts';
export * from './vocabulary.ts';
```

- [ ] **Step 4: Run everything**

Run: `pnpm --filter @pokerji/schema-builder test && pnpm typecheck && pnpm format:check`
Expected: every test in the package passes; the typecheck passes for every package in the workspace; Prettier reports every file formatted.

Then run the whole suite's tests that need no services, to confirm nothing else moved:

Run: `pnpm --filter @pokerji/protocol test && pnpm --filter @pokerji/poker-engine test`
Expected: PASS, unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/schema-builder
git commit -m "feat: the editor's field lists, and the ten guided types end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After this plan

Plan 2 is written once this lands. Before it can be written, the builder's visual direction goes through Impeccable and is recorded beside the spec, as planning poker's was. Plan 2 then covers the `/schema` page, the home page, top bar, sitemap and privacy page changes, the browser tests, the screenshots, the document updates (`PRODUCT.md`, `README.md`, `CLAUDE.md`, `DESIGN.md`), and the Octopus code review and security audit.
