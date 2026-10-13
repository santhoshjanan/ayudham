# Schema Markup Builder Page (Plan 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the schema markup builder on the site at `/schema`, in the existing design, with the rest of the site updated to a suite of two tools, and have it reviewed.

**Architecture:** `packages/schema-builder` (Plan 1) holds every rule. This plan adds three small pure helpers to it, then a thin page in `apps/web`: one state class that calls the package, a handful of Svelte components that render it, and no server code. The page is a sibling of the live room: a band, a floor (the editor) and a rail (the markup) that becomes a dock on narrow screens.

**Tech Stack:** SvelteKit 3 with Svelte 5 runes, TypeScript 7, Playwright 1.63, Vitest 5, pnpm 11.25.

**Spec:** `docs/superpowers/specs/2026-10-13-schema-builder-design.md` (behaviour) and `docs/superpowers/specs/2026-10-13-schema-builder-design-direction.md` (design). `DESIGN.md` is the visual authority.

## Where this plan sits

| Plan | Delivers | State |
|---|---|---|
| 1. Core | `packages/schema-builder` and the vendored vocabulary | Done, on `feat/schema-builder` |
| **2. Page and release (this plan)** | The `/schema` page, site changes, browser tests, screenshots, documents, reviews | Now |

## Global Constraints

- Work happens on branch `feat/schema-builder`. Nothing is pushed or merged by this plan.
- The owner's instruction: hold on to the existing design; add only missing components, matching the existing ones. No token in `apps/web/src/app.css` changes. No existing rule in it is edited; rules are only added. No existing component is restyled.
- No inline styles: no `style` attributes and no Svelte `transition:`, `in:`, `out:` or `animate:` directives. The Content Security Policy forbids them and the browser tests run against a build, where it is in force.
- No raw colours in components. Use the tokens (`var(--ink)`, `var(--line)` and so on).
- One yellow button on the builder: Copy. Red (`.danger`) only on Remove and Clear, always with the word. Findings are never red.
- Nothing typed into the builder may be sent anywhere. The page has no form action, no endpoint and no cookie. The only request it makes after loading is `GET /schema/vocabulary.json`, and only when the escape hatch is opened or a restored draft needs it.
- Local storage key `pj-schema-draft`, read only through `unpack` from the package.
- The page is public and indexable. It uses `Seo.svelte`, has exactly one `h1`, and is in the sitemap.
- Both themes to the same standard. Check every visual change in light and dark.
- The library alias in `apps/web` is `#lib`, and imports through it carry the file extension (`#lib/schema/ids.ts`).
- Every new browser context in a test is created through `visitor()`.
- Browser tests need Postgres and Valkey: run `pnpm services:up` first (Docker must be running).
- The code blocks in this plan are not wrapped the way Prettier wants. Run `pnpm format` before every commit, then `pnpm format:check`.
- Dependencies: pnpm enforces a minimum release age. If a just-published version is refused, pin the previous release; do not add a `minimumReleaseAgeExclude` entry.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- If a Svelte 5 or SvelteKit 3 API in this plan does not exist as written, check the current documentation and use the equivalent; do not downgrade.

## Review Focus

Conditions the spec implies that are easy to miss. Each has a test in the task named.

1. Typing into a field that has no value yet creates the value on the first keystroke: the input must keep focus and the caret, or typing a word becomes impossible. (Task 2)
2. A value containing `</script>` is shown in the code block as text and never becomes markup on our own page. (Task 2)
3. The vocabulary request fails or is blocked: guided forms keep working, and Try again recovers without a reload. (Task 3)
4. A finding for a field the person cannot currently see (its item is closed, or the sheet covers the page on a phone) still lands focus on the field. (Task 4)
5. A draft is restored whose free-form item needs the vocabulary: the vocabulary is fetched at once and the page does not show the item's fields as broken in the meantime. (Task 3)

## File Structure

```
packages/schema-builder/
  src/markup.ts                         markupParts: the markup split into names, values and marks
  src/words.ts                          typeLabel, itemTitle, findingWords, REFUSAL_WORDS
  src/fields.ts                         + needsVocabulary
  test/markup.test.ts  test/words.test.ts  test/fields.test.ts (extended)
apps/web/
  package.json                          + @pokerji/schema-builder, @axe-core/playwright
  src/app.css                           + textarea, checkbox and .compact rules (added, nothing edited)
  src/lib/ui/CopyButton.svelte          + primary, disabled, onfail
  src/lib/schema/ids.ts                 pathId, fieldId
  src/lib/schema/values.ts              specs: the kinds of value a field offers, and blank values
  src/lib/schema/builder.svelte.ts      Builder: the page's state, calling the package
  src/lib/schema/Builder.svelte         the floor, the rail and dock, the chooser, the dialog
  src/lib/schema/ItemPanel.svelte       one top-level item
  src/lib/schema/ItemFields.svelte      the fields of an item, at any depth
  src/lib/schema/FieldRow.svelte        one field: label, badge, hint, values
  src/lib/schema/ValueInput.svelte      one value: the right control for its kind
  src/lib/schema/Picker.svelte          search with results in the page
  src/lib/schema/Vocab.svelte           waits for the vocabulary, or offers a retry
  src/lib/schema/Findings.svelte        what to check
  src/routes/schema/+page.svelte        band, builder, explanation
  src/routes/+layout.svelte             + one link in the bar
  src/routes/+page.svelte               + a second programme row; widened hero
  src/routes/privacy/+page.svelte       + a section
  src/routes/sitemap.xml/+server.ts     + /schema
  e2e/schema.spec.ts                    the builder, end to end
  e2e/site.spec.ts                      + /schema in the public-page loops
  scripts/capture-pages.mjs             + the builder's states
PRODUCT.md  README.md  CLAUDE.md  DESIGN.md
```

---

### Task 1: Three helpers in the package

**Files:**
- Create: `packages/schema-builder/src/markup.ts`, `packages/schema-builder/src/words.ts`
- Modify: `packages/schema-builder/src/fields.ts`, `packages/schema-builder/src/index.ts`
- Test: `packages/schema-builder/test/markup.test.ts`, `packages/schema-builder/test/words.test.ts`, `packages/schema-builder/test/fields.test.ts`

**Interfaces:**
- Consumes (Plan 1): `Draft`, `Item`, `Finding`, `Refusal`, `itemAt`, `valuesOf`, `definitionAt`, `topDefinition`, `nestedDefinition`, `DEFINITIONS`.
- Produces:
  - `interface MarkupPart { kind: 'name' | 'value' | 'mark'; text: string }`, `markupParts(text: string): MarkupPart[]`. The parts joined give back `text` exactly.
  - `needsVocabulary(draft: Draft): boolean`: whether any item, at any depth, has a type or a property no guided form covers.
  - `typeLabel(type: string): string`: a guided type's label, or the type name spaced out (`PostalAddress` gives `Postal address`).
  - `itemTitle(item: Item): string`: `typeLabel` and, when the item has a `name` or `headline`, a colon and that text.
  - `interface FindingWords { where: string; text: string }`, `findingWords(draft: Draft, finding: Finding): FindingWords`.
  - `REFUSAL_WORDS: Record<Refusal, string>`.

- [ ] **Step 1: Write the failing tests**

`packages/schema-builder/test/markup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markupParts, toJson, toScriptTag } from '../src/index.ts';
import { draftOf, make, nested, text } from './helpers.ts';

const draft = draftOf(
  make('Product', {
    name: text('A "quoted": name </script>'),
    isFamilyFriendly: { kind: 'boolean', on: true },
    offers: nested(make('Offer', { price: text('9', 'number') })),
  }),
);

describe('markupParts', () => {
  it('gives nothing for nothing', () => {
    expect(markupParts('')).toEqual([]);
  });

  it('gives back the text exactly, in both forms', () => {
    for (const form of [toJson(draft), toScriptTag(draft)]) {
      expect(markupParts(form).map((part) => part.text).join('')).toBe(form);
    }
  });

  it('tells property names from values and from punctuation', () => {
    expect(markupParts('{\n  "name": "Ada",\n  "age": 36\n}')).toEqual([
      { kind: 'mark', text: '{\n  ' },
      { kind: 'name', text: '"name"' },
      { kind: 'mark', text: ': ' },
      { kind: 'value', text: '"Ada"' },
      { kind: 'mark', text: ',\n  ' },
      { kind: 'name', text: '"age"' },
      { kind: 'mark', text: ': ' },
      { kind: 'value', text: '36' },
      { kind: 'mark', text: '\n}' },
    ]);
  });

  it('keeps a value whole when it holds quotes, colons and angle brackets', () => {
    const values = markupParts(toJson(draft)).filter((part) => part.kind === 'value');
    expect(values.map((part) => part.text)).toEqual([
      '"https://schema.org"',
      '"Product"',
      '"A \\"quoted\\": name </script>"',
      'true',
      '"Offer"',
      '9',
    ]);
  });

  it('treats the script element around the JSON as punctuation', () => {
    const parts = markupParts(toScriptTag(draft));
    expect(parts[0]).toEqual({ kind: 'mark', text: '<script type="application/ld+json">\n{\n  ' });
    expect(parts.at(-1)).toEqual({ kind: 'mark', text: '\n}\n</script>' });
  });

  it('treats text that is not markup as punctuation', () => {
    expect(markupParts('nothing here')).toEqual([{ kind: 'mark', text: 'nothing here' }]);
  });
});
```

`packages/schema-builder/test/words.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Finding } from '../src/index.ts';
import { check, findingWords, itemTitle, REFUSAL_WORDS, REFUSALS, typeLabel } from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

describe('typeLabel', () => {
  it('uses a guided type’s label', () => {
    expect(typeLabel('LocalBusiness')).toBe('Local business');
    expect(typeLabel('FAQPage')).toBe('FAQ page');
  });

  it('spaces out any other type name', () => {
    expect(typeLabel('PostalAddress')).toBe('Postal address');
    expect(typeLabel('BlogPosting')).toBe('Blog posting');
    expect(typeLabel('Movie')).toBe('Movie');
  });
});

describe('itemTitle', () => {
  it('adds the name or headline when there is one', () => {
    expect(itemTitle(make('Organization', { name: text('Acme') }))).toBe('Organization: Acme');
    expect(itemTitle(make('Article', { headline: text(' Hi ') }))).toBe('Article: Hi');
    expect(itemTitle(make('Organization', { name: text('  ') }))).toBe('Organization');
    expect(itemTitle(make('Movie'))).toBe('Movie');
  });
});

describe('findingWords', () => {
  const words = (draft: ReturnType<typeof draftOf>, pick: (finding: Finding) => boolean) =>
    findingWords(draft, check(draft).find(pick)!);

  it('names the field by its label', () => {
    const draft = draftOf(make('WebSite', { name: text('Acme') }));
    expect(words(draft, (f) => f.property === 'url')).toEqual({
      where: 'Website: Acme',
      text: 'Home page is required.',
    });
    expect(words(draft, (f) => f.property === 'alternateName').text).toBe(
      'Other names is recommended.',
    );
  });

  it('says where a nested field is', () => {
    const draft = draftOf(
      make('Product', { name: text('Kettle'), offers: nested(make('Offer', { priceCurrency: text('USD') })) }),
    );
    expect(words(draft, (f) => f.property === 'price')).toEqual({
      where: 'Product: Kettle › Offer',
      text: 'Price is required.',
    });
  });

  it('lists the choices of an at-least-one group', () => {
    const draft = draftOf(make('Product', { name: text('Kettle') }));
    expect(words(draft, (f) => f.anyOf !== undefined).text).toBe(
      'Add at least one of: Offer, Average rating, Review.',
    );
  });

  it('has a sentence for every kind of malformed value', () => {
    const draft = draftOf(
      make('Movie', {
        url: text('nope', 'url'),
        dateCreated: text('nope', 'date'),
        duration: text('nope', 'number'),
        about: ref('gone'),
      }),
    );
    const sentences = check(draft).map((finding) => findingWords(draft, finding).text);
    expect(sentences).toEqual([
      'url is not a full web address. It should start with https://.',
      'dateCreated is not a date or time in the expected form, such as 2026-10-13.',
      'duration is not a plain number, such as 19.99.',
      'about refers to an item that has been removed.',
    ]);
  });

  it('has a sentence for a currency, a rating and an unknown property', () => {
    const at = { item: 'k', steps: [] };
    const draft = draftOf(make('Movie', {}, 'k'));
    const text = (finding: Finding) => findingWords(draft, finding).text;
    expect(text({ ...at, property: 'priceCurrency', index: 0, kind: 'bad-currency' })).toBe(
      'priceCurrency should be a three-letter currency code, such as USD.',
    );
    expect(text({ ...at, property: 'ratingValue', index: 0, kind: 'out-of-range' })).toBe(
      'ratingValue is outside the rating scale.',
    );
    expect(text({ ...at, property: 'bogus', kind: 'unknown-property' })).toBe(
      'Movie has no property called bogus.',
    );
  });

  it('still answers for a finding whose item is gone', () => {
    const finding: Finding = { item: 'gone', steps: [], property: 'name', kind: 'missing-required' };
    expect(findingWords(draftOf(), finding)).toEqual({ where: '', text: 'name is required.' });
  });
});

describe('REFUSAL_WORDS', () => {
  it('has a sentence for every refusal', () => {
    for (const refusal of REFUSALS) {
      expect(REFUSAL_WORDS[refusal], refusal).toMatch(/^[A-Z].+\.$/);
    }
  });
});
```

Add to the end of `packages/schema-builder/test/fields.test.ts`, and add `needsVocabulary` to its import from `'../src/index.ts'`:

```ts
describe('needsVocabulary', () => {
  it('is false for an empty draft and for guided items with guided fields', () => {
    expect(needsVocabulary(draftOf())).toBe(false);
    expect(
      needsVocabulary(
        draftOf(make('Product', { name: text('K'), offers: nested(make('Offer', { price: text('1', 'number') })) })),
      ),
    ).toBe(false);
  });

  it('is true for a type outside the ten', () => {
    expect(needsVocabulary(draftOf(make('Movie')))).toBe(true);
  });

  it('is true for a property the guided form does not have, at any depth', () => {
    expect(needsVocabulary(draftOf(make('WebSite', { inLanguage: text('en') })))).toBe(true);
    expect(
      needsVocabulary(
        draftOf(make('Product', { offers: nested(make('Offer', { seller: text('Acme') })) })),
      ),
    ).toBe(true);
  });

  it('is true for a nested item the guided form has no definition for', () => {
    expect(needsVocabulary(draftOf(make('Product', { offers: nested(make('Demand')) })))).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/schema-builder test`
Expected: FAIL. `markup.test.ts` and `words.test.ts` fail because `markupParts`, `typeLabel` and the rest are not exported; the new `needsVocabulary` tests fail for the same reason.

- [ ] **Step 3: Write the helpers**

`packages/schema-builder/src/markup.ts`:

```ts
export interface MarkupPart {
  kind: 'name' | 'value' | 'mark';
  text: string;
}

const TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;

/**
 * The markup cut into property names, values and everything else, for showing it in two
 * inks. The parts joined give back the text exactly. A script element around the JSON
 * counts as everything else.
 */
export const markupParts = (text: string): MarkupPart[] => {
  const parts: MarkupPart[] = [];
  const push = (kind: MarkupPart['kind'], piece: string): void => {
    if (piece === '') return;
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += piece;
    else parts.push({ kind, text: piece });
  };

  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open < 0 || close < open) {
    push('mark', text);
    return parts;
  }

  const body = text.slice(open, close + 1);
  push('mark', text.slice(0, open));
  let at = 0;
  for (const match of body.matchAll(TOKEN)) {
    push('mark', body.slice(at, match.index));
    at = match.index + match[0].length;
    const named = match[0].startsWith('"') && /^\s*:/.test(body.slice(at));
    push(named ? 'name' : 'value', match[0]);
  }
  push('mark', body.slice(at));
  push('mark', text.slice(close + 1));
  return parts;
};
```

`packages/schema-builder/src/words.ts`:

```ts
import type { Refusal } from './changes.ts';
import type { Finding } from './checks.ts';
import { topDefinition } from './definitions.ts';
import { definitionAt } from './fields.ts';
import { LIMITS } from './limits.ts';
import type { Draft, Item } from './model.ts';
import { itemAt, valuesOf } from './model.ts';

/** A type's name as people read it: the guided label, or the name spaced out. */
export const typeLabel = (type: string): string => {
  const definition = topDefinition(type);
  if (definition?.type === type) return definition.label;
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0) + spaced.slice(1).toLowerCase();
};

/** What an item is called in a list: its type and, if it has one, its name. */
export const itemTitle = (item: Item): string => {
  for (const property of ['name', 'headline']) {
    const value = valuesOf(item, property)[0];
    if (value && 'text' in value && value.text.trim() !== '') {
      return `${typeLabel(item.type)}: ${value.text.trim()}`;
    }
  }
  return typeLabel(item.type);
};

export interface FindingWords {
  /** Where the finding is: the top-level item, then each nested item down to it. */
  where: string;
  text: string;
}

/** A finding as a sentence, with the field named by the label the form gives it. */
export const findingWords = (draft: Draft, finding: Finding): FindingWords => {
  const at = { key: finding.item, steps: finding.steps };
  const top = draft.items.find((item) => item.key === finding.item);
  const holder = itemAt(draft, at);
  const definition = definitionAt(draft, at);
  const labelOf = (property: string): string =>
    definition?.fields.find((field) => field.property === property)?.label ?? property;
  const label = labelOf(finding.property);

  const trail = top ? [itemTitle(top)] : [];
  for (let depth = 1; depth <= finding.steps.length; depth += 1) {
    const nested = itemAt(draft, { key: finding.item, steps: finding.steps.slice(0, depth) });
    if (nested) trail.push(typeLabel(nested.type));
  }

  const sentence = (): string => {
    switch (finding.kind) {
      case 'missing-required':
        return finding.anyOf
          ? `Add at least one of: ${finding.anyOf.map(labelOf).join(', ')}.`
          : `${label} is required.`;
      case 'missing-recommended':
        return `${label} is recommended.`;
      case 'bad-url':
        return `${label} is not a full web address. It should start with https://.`;
      case 'bad-date':
        return `${label} is not a date or time in the expected form, such as 2026-10-13.`;
      case 'bad-number':
        return `${label} is not a plain number, such as 19.99.`;
      case 'bad-currency':
        return `${label} should be a three-letter currency code, such as USD.`;
      case 'out-of-range':
        return `${label} is outside the rating scale.`;
      case 'dangling-reference':
        return `${label} refers to an item that has been removed.`;
      case 'unknown-property':
        return `${holder ? typeLabel(holder.type) : 'This type'} has no property called ${finding.property}.`;
    }
  };

  return { where: trail.join(' › '), text: sentence() };
};

export const REFUSAL_WORDS: Record<Refusal, string> = {
  'too-many-items': `A draft holds at most ${LIMITS.items} items.`,
  'too-deep': `Items can be nested ${LIMITS.depth} deep at most.`,
  'too-many-values': `A property holds at most ${LIMITS.values} values.`,
  'too-many-properties': `An item holds at most ${LIMITS.properties} properties.`,
  'too-long': `A value can be ${LIMITS.text.toLocaleString('en')} characters at most.`,
  'not-found': 'That part of the draft is no longer there.',
  'duplicate-key': 'That item is already in the draft.',
};
```

Add to the end of `packages/schema-builder/src/fields.ts`:

```ts
/**
 * Whether showing this draft needs the vocabulary: some item, at any depth, has a type or a
 * property that no guided form covers.
 */
export const needsVocabulary = (draft: Draft): boolean => {
  const walk = (item: Item, definition: Definition | undefined): boolean => {
    if (!definition) return true;
    return item.properties.some((property) => {
      const field = definition.fields.find((candidate) => candidate.property === property.name);
      if (!field) return true;
      return property.values.some(
        (value) => value.kind === 'item' && walk(value.item, nestedDefinition(field, value.item.type)),
      );
    });
  };
  return draft.items.some((item) => walk(item, topDefinition(item.type)));
};
```

Add two lines to `packages/schema-builder/src/index.ts`, keeping alphabetical order:

```ts
export * from './markup.ts';
```

```ts
export * from './words.ts';
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm format && pnpm --filter @pokerji/schema-builder test && pnpm --filter @pokerji/schema-builder typecheck`
Expected: every test passes; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/schema-builder
git commit -m "feat: words for findings, parts for the markup, and when a draft needs the vocabulary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The page, with guided forms

The builder working for the ten guided types: choose a type, fill in fields at any depth, see the markup, copy it, download it, and find the draft again after a reload. The escape hatch, the findings and the narrow layout follow in Tasks 3 and 4.

**Files:**
- Modify: `apps/web/package.json`, `apps/web/src/app.css`, `apps/web/src/lib/ui/CopyButton.svelte`
- Create: `apps/web/src/lib/schema/ids.ts`, `apps/web/src/lib/schema/values.ts`, `apps/web/src/lib/schema/builder.svelte.ts`
- Create: `apps/web/src/lib/schema/Builder.svelte`, `apps/web/src/lib/schema/ItemPanel.svelte`, `apps/web/src/lib/schema/ItemFields.svelte`, `apps/web/src/lib/schema/FieldRow.svelte`, `apps/web/src/lib/schema/ValueInput.svelte`
- Create: `apps/web/src/routes/schema/+page.svelte`
- Test: `apps/web/e2e/schema.spec.ts`

**Interfaces:**
- Consumes: everything `@pokerji/schema-builder` exports.
- Produces:
  - `pathId(at: ItemPath): string`, `fieldId(at: ItemPath, property: string, index: number): string`. `fieldId` is the DOM id of the control for a value; Task 4 focuses it.
  - `type Spec = string`: a text kind, `'boolean'`, `'reference'`, or `'item:<Type>'`. `specOf(value)`, `blankFor(spec, carry?)`, `convert(value, spec)`, `specsFor(field, vocabulary, others): { id: Spec; label: string }[]`, `specLabel(spec)`.
  - `class Builder` with state `draft`, `form`, `vocabulary`, `loading: 'idle' | 'loading' | 'ready' | 'failed'`, `refusal`, `stored`, `pending`, `closed`, derived `output` and `findings`, and methods `addItem(type): string | undefined`, `removeItem(key)`, `moveItem(key, by)`, `retype(at, type)`, `addValue(at, property, value)`, `setValue(at, step, value)`, `removeValue(at, step)`, `moveValue(at, step, by)`, `setForm(form)`, `clear()`, `confirm()`, `restore()`, `flush()`, `loadVocabulary()`.
  - `Builder.svelte` sets `data-ready` on its root once it has restored the draft. Tests wait for it.
  - `CopyButton` gains optional props `primary`, `disabled` and `onfail`.

- [ ] **Step 1: Add the package to the app**

In `apps/web/package.json`, add to `devDependencies`, in alphabetical order with the other workspace packages:

```json
    "@pokerji/schema-builder": "workspace:*",
```

Run: `pnpm install`
Expected: the package is linked; nothing new is downloaded.

- [ ] **Step 2: Write the failing browser tests**

`apps/web/e2e/schema.spec.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.7.${visitors >> 8}.${visitors & 255}` },
  };
};

const WIDE = { width: 1280, height: 900 };

/** A page on the builder, hydrated, with the clipboard allowed. */
const open = async (browser: Browser, viewport = WIDE): Promise<Page> => {
  const context = await browser.newContext({
    ...visitor(),
    viewport,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto('/schema');
  await page.locator('[data-ready]').waitFor();
  return page;
};

const markup = (page: Page) => page.getByLabel('The markup', { exact: true });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('pj-schema-draft'));
const rawJson = async (page: Page) => {
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  return JSON.parse((await markup(page).textContent()) ?? '');
};

test('a guided item becomes markup that can be copied in both forms', async ({ browser }) => {
  const page = await open(browser);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
  await expect(page.getByText('The markup appears here')).toBeVisible();

  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  await page.getByLabel('Home page', { exact: true }).fill('https://acme.example/');

  await page.getByRole('button', { name: 'Copy markup' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const tag = await clipboard(page);
  expect(tag.startsWith('<script type="application/ld+json">\n{')).toBe(true);
  expect(tag.endsWith('}\n</script>')).toBe(true);

  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(JSON.parse(await clipboard(page))).toEqual({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Acme',
    url: 'https://acme.example/',
  });
});

test('typing a word into an empty field keeps the caret in the field', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  const name = page.getByLabel('Site name', { exact: true });
  await name.click();
  await page.keyboard.type('Acme Bakery');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Acme Bakery');
});

test('nested items, repeated values and a choice all reach the markup', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Kettle');
  await page.getByRole('button', { name: 'Add offer' }).click();
  await page.getByLabel('Price', { exact: true }).fill('19.99');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Availability', { exact: true }).selectOption({ label: 'In stock' });
  await page.getByRole('button', { name: 'Add another', exact: true }).click();
  await page.getByRole('group', { name: 'Offer' }).nth(1).getByLabel('Price', { exact: true }).fill('24.5');

  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Kettle',
    offers: [
      {
        '@type': 'Offer',
        price: 19.99,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
      { '@type': 'Offer', price: 24.5 },
    ],
  });

  await page.getByRole('button', { name: 'Move Offer 2 up' }).click();
  expect((await rawJson(page)).offers[0]).toEqual({ '@type': 'Offer', price: 24.5 });
  await page.getByRole('button', { name: 'Remove Offer 1' }).click();
  expect((await rawJson(page)).offers).toMatchObject({ price: 19.99 });
});

test('two items become one graph, and one can refer to the other', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Organization', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Acme');
  await page.getByRole('button', { name: 'Article', exact: true }).click();

  const article = page.getByTestId('item').nth(1);
  await article.getByLabel('Headline', { exact: true }).fill('How we bake');
  await article.getByText('More fields').click();
  await article.getByLabel('Kind of value for Publisher').selectOption({ label: 'An item from this page' });
  await article.getByLabel('Publisher', { exact: true }).selectOption({ label: 'Organization: Acme' });

  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': '#organization', name: 'Acme' },
      { '@type': 'Article', headline: 'How we bake', publisher: { '@id': '#organization' } },
    ],
  });

  await article.getByRole('button', { name: 'Move Article up' }).click();
  expect((await rawJson(page))['@graph'][0]['@type']).toBe('Article');
});

test('an article can be switched to a blog posting without losing its fields', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Article', exact: true }).click();
  await page.getByLabel('Headline', { exact: true }).fill('How we bake');
  await page.getByLabel('Type', { exact: true }).selectOption('BlogPosting');
  expect(await rawJson(page)).toMatchObject({ '@type': 'BlogPosting', headline: 'How we bake' });
});

test('markup typed into a value is shown as text and cannot end the script element', async ({
  browser,
}) => {
  const page = await open(browser);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  const hostile = '</script><img src=x onerror=alert(1)><b>bold</b>';
  await page.getByLabel('Site name', { exact: true }).fill(hostile);

  await expect(markup(page).locator('img, b')).toHaveCount(0);
  await expect(markup(page)).toContainText('\\u003c/script>');
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const tag = await clipboard(page);
  const inside = tag.slice('<script type="application/ld+json">'.length, -'</script>'.length);
  expect(inside).not.toContain('<');
  expect(JSON.parse(inside).name).toBe(hostile);
  expect(errors).toEqual([]);
});

test('the markup can be downloaded in both forms', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');

  const [html] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(html.suggestedFilename()).toBe('schema.html');
  expect(await readFile(await html.path(), 'utf8')).toContain('<script type="application/ld+json">');

  await page.getByRole('button', { name: 'Raw JSON' }).click();
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(json.suggestedFilename()).toBe('schema.jsonld');
  expect(JSON.parse(await readFile(await json.path(), 'utf8'))).toMatchObject({ name: 'Acme' });
});

test('the draft survives a reload, and Clear removes it', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await expect.poll(() => stored(page)).toContain('Acme');

  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await expect(page.getByLabel('Site name', { exact: true })).toHaveValue('Acme');
  await expect(page.getByRole('button', { name: 'Raw JSON' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clear the whole draft?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Site name', { exact: true })).toHaveValue('Acme');

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear' }).click();
  await expect(page.getByRole('heading', { name: 'What are you describing?' })).toBeVisible();
  await expect.poll(() => stored(page)).toBeNull();
});

test('a stored draft that is broken gives an empty page, not an error', async ({ browser }) => {
  const page = await open(browser);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const broken of ['{not json', '{"version":99,"form":"script","draft":{"items":[]}}', '[]']) {
    await page.evaluate((value) => localStorage.setItem('pj-schema-draft', value), broken);
    await page.reload();
    await page.locator('[data-ready]').waitFor();
    await expect(page.getByRole('heading', { name: 'What are you describing?' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('nothing typed into the builder is sent anywhere', async ({ browser }) => {
  const page = await open(browser);
  const sent: string[] = [];
  page.on('request', (request) => sent.push(`${request.url()} ${request.postData() ?? ''}`));
  const secret = 'zebra-quartz-7731';

  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Add offer' }).click();
  await page.getByLabel('Price', { exact: true }).fill('7731.77');
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await expect.poll(() => stored(page)).toContain(secret);
  await page.waitForTimeout(500);

  expect(sent.filter((line) => line.includes(secret) || line.includes('7731.77'))).toEqual([]);
  expect(sent.some((line) => line.includes('/schema/vocabulary.json'))).toBe(false);
});

test('the builder never breaks the content security policy', async ({ browser }) => {
  const page = await open(browser);
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) refused.push(message.text());
  });
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Kettle');
  await page.getByRole('button', { name: 'Add offer' }).click();
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(refused).toEqual([]);
});

test('without JavaScript the page says what it is and that it needs JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ ...visitor(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/schema');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
  // Playwright's text search skips noscript, so the element is found by its tag.
  await expect(page.locator('noscript p')).toBeVisible();
  await expect(page.locator('noscript p')).toContainText('The builder needs JavaScript');
  await expect(page.getByRole('button', { name: 'Local business' })).toBeVisible();
  await expect(page.getByText('never sent to this site')).toBeVisible();
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm services:up && pnpm --filter @pokerji/web e2e schema.spec.ts`
Expected: FAIL. Every test fails at `page.locator('[data-ready]').waitFor()` or at the heading, because `/schema` answers 404.

- [ ] **Step 4: Add the shared styles**

Add to the end of `apps/web/src/app.css`. Nothing above it is changed.

```css
/* ---- Added for the schema builder: three controls in the existing language ---- */

/* A multi-line field: the input's style on a textarea. */
textarea {
  width: 100%;
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--field-line);
  border-radius: var(--radius);
  padding: 0.6rem 0.7rem;
  min-height: 5.5rem;
  resize: vertical;
}
textarea:hover {
  border-color: var(--ink);
}

/* A checkbox, tinted like the radios. */
input[type='checkbox'] {
  accent-color: var(--stage);
  width: 1.1rem;
  height: 1.1rem;
  margin: 0 0.4rem 0 0;
  vertical-align: -0.12em;
}

/* A compact button, at the height of the bar's copy button, for controls that repeat. */
.compact {
  min-height: 2.25rem;
  padding: 0.2rem 0.7rem;
  font-size: 0.95rem;
}
```

- [ ] **Step 5: Extend the copy button**

Replace `apps/web/src/lib/ui/CopyButton.svelte` with:

```svelte
<script lang="ts">
  let {
    text,
    label,
    primary = false,
    disabled = false,
    onfail,
  }: {
    text: string;
    label: string;
    /** The page's one next step. */
    primary?: boolean;
    disabled?: boolean;
    /** Called when the browser refuses the clipboard. */
    onfail?: () => void;
  } = $props();
  let copied = $state(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2_000);
    } catch {
      // The text is on the page to select by hand.
      onfail?.();
    }
  };
</script>

<button type="button" class:primary {disabled} onclick={copy}>{copied ? 'Copied' : label}</button>
<span class="sr-only" role="status">{copied ? 'Copied' : ''}</span>
```

- [ ] **Step 6: Write the ids and the value kinds**

`apps/web/src/lib/schema/ids.ts`:

```ts
import type { ItemPath } from '@pokerji/schema-builder';

/** An item's place in the draft as one string, for building DOM ids. */
export const pathId = (at: ItemPath): string =>
  [at.key, ...at.steps.flatMap((step) => [step.property, step.index])].join('-');

/** The DOM id of the control for one value of a property. A finding focuses it. */
export const fieldId = (at: ItemPath, property: string, index: number): string =>
  `f-${pathId(at)}-${property}-${index}`;
```

`apps/web/src/lib/schema/values.ts`:

```ts
import {
  expects,
  newItem,
  TEXT_KINDS,
  typeLabel,
  type Field,
  type TextKind,
  type Value,
  type Vocabulary,
} from '@pokerji/schema-builder';

/**
 * A kind of value a field offers, as the person chooses it: a text kind, 'boolean',
 * 'reference', or 'item:' followed by the type of a nested item.
 */
export type Spec = string;

export interface SpecOption {
  id: Spec;
  label: string;
}

const WORDS: Record<string, string> = {
  text: 'Text',
  url: 'Web address',
  number: 'Number',
  boolean: 'Yes or no',
  date: 'Date',
  dateTime: 'Date and time',
  time: 'Time',
  reference: 'An item from this page',
};

/** The most nested types offered for a property that only the vocabulary describes. */
const MOST_TYPES = 8;

const isTextKind = (spec: Spec): spec is TextKind =>
  (TEXT_KINDS as readonly string[]).includes(spec);

export const specOf = (value: Value): Spec =>
  value.kind === 'item' ? `item:${value.item.type}` : value.kind;

export const specLabel = (spec: Spec): string =>
  spec.startsWith('item:') ? typeLabel(spec.slice(5)) : (WORDS[spec] ?? spec);

/** An empty value of a kind. Text carries over when one text kind replaces another. */
export const blankFor = (spec: Spec, carry = ''): Value => {
  if (spec.startsWith('item:')) {
    return { kind: 'item', item: newItem(crypto.randomUUID(), spec.slice(5)) };
  }
  if (spec === 'reference') return { kind: 'reference', key: '' };
  if (spec === 'boolean') return { kind: 'boolean', on: true };
  return { kind: isTextKind(spec) ? spec : 'text', text: carry };
};

export const convert = (value: Value | undefined, spec: Spec): Value =>
  blankFor(spec, value && 'text' in value ? value.text : '');

/**
 * The kinds of value a field offers, first the one a new value starts as. A field that takes
 * an item also takes a reference, once there is another item on the page to refer to.
 */
export const specsFor = (
  field: Field,
  vocabulary: Vocabulary | undefined,
  others: boolean,
): SpecOption[] => {
  const options: SpecOption[] = [];
  const add = (id: Spec) => {
    if (!options.some((option) => option.id === id)) options.push({ id, label: specLabel(id) });
  };
  for (const kind of field.kinds) {
    if (kind === 'reference') continue;
    if (kind !== 'item') {
      add(kind);
      continue;
    }
    const types = field.nested
      ? Object.keys(field.nested)
      : vocabulary
        ? expects(vocabulary, field.property).itemTypes.slice(0, MOST_TYPES)
        : [];
    for (const type of types) add(`item:${type}`);
  }
  const takesItems = field.kinds.includes('item') || field.kinds.includes('reference');
  if (takesItems && others) add('reference');
  if (options.length === 0) add('text');
  return options;
};
```

- [ ] **Step 7: Write the state**

`apps/web/src/lib/schema/builder.svelte.ts`:

```ts
import {
  accepts,
  addItem,
  addValue,
  check,
  emptyDraft,
  itemAt,
  moveItem,
  moveValue,
  needsVocabulary,
  newItem,
  pack,
  parseVocabulary,
  refersTo,
  removeItem,
  removeValue,
  setType,
  setValue,
  STORAGE_KEY,
  toJson,
  topDefinition,
  toScriptTag,
  unpack,
  type Change,
  type Draft,
  type ItemPath,
  type OutputForm,
  type Refusal,
  type Step,
  type Value,
  type Vocabulary,
} from '@pokerji/schema-builder';

/** Something the person is asked to confirm before it happens. */
export type Pending =
  | { kind: 'clear' }
  | { kind: 'remove'; key: string }
  | { kind: 'retype'; at: ItemPath; type: string; dropped: string[] };

const VOCABULARY = '/schema/vocabulary.json';
const SAVE_AFTER = 300;

/**
 * The builder page's state. Every rule lives in the package; this holds the draft, calls the
 * package to change it, and keeps a copy in the browser's own storage. Nothing here sends
 * the draft anywhere.
 */
export class Builder {
  draft = $state.raw<Draft>(emptyDraft());
  form = $state<OutputForm>('script');
  vocabulary = $state.raw<Vocabulary | undefined>(undefined);
  loading = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  /** Why the last change was refused, if it was. */
  refusal = $state<Refusal | undefined>(undefined);
  /** False once the browser has refused to store the draft. */
  stored = $state(true);
  pending = $state<Pending | null>(null);
  /** The top-level items the person has closed, by key. */
  closed = $state<Record<string, boolean>>({});

  output = $derived(this.form === 'script' ? toScriptTag(this.draft) : toJson(this.draft));
  findings = $derived(check(this.draft, this.vocabulary));

  #timer: ReturnType<typeof setTimeout> | undefined;

  #apply(change: Change): boolean {
    if (change.refused) {
      this.refusal = change.refused;
      return false;
    }
    this.refusal = undefined;
    this.draft = change.draft;
    this.#save();
    return true;
  }

  /** Adds a top-level item and gives back its key, or nothing if the draft is full. */
  addItem(type: string): string | undefined {
    const key = crypto.randomUUID();
    return this.#apply(addItem(this.draft, newItem(key, type))) ? key : undefined;
  }

  /** Removes a top-level item, asking first if anything refers to it. */
  removeItem(key: string): void {
    if (refersTo(this.draft, key)) this.pending = { kind: 'remove', key };
    else this.#apply(removeItem(this.draft, key));
  }

  moveItem(key: string, by: -1 | 1): void {
    this.#apply(moveItem(this.draft, key, by));
  }

  /** Changes a top-level item's type, asking first if properties would be lost. */
  retype(at: ItemPath, type: string): void {
    const item = itemAt(this.draft, at);
    if (!item || item.type === type) return;
    const dropped = item.properties
      .filter((property) => !this.#keeps(type, property.name))
      .map((property) => property.name);
    if (dropped.length > 0) this.pending = { kind: 'retype', at, type, dropped };
    else this.#retype(at, type);
  }

  #keeps(type: string, property: string): boolean {
    return accepts(type, topDefinition(type), this.vocabulary, property);
  }

  #retype(at: ItemPath, type: string): void {
    this.#apply(setType(this.draft, at, type, (property) => this.#keeps(type, property)));
  }

  addValue(at: ItemPath, property: string, value: Value): void {
    this.#apply(addValue(this.draft, at, property, value));
  }

  setValue(at: ItemPath, step: Step, value: Value): void {
    this.#apply(setValue(this.draft, at, step, value));
  }

  removeValue(at: ItemPath, step: Step): void {
    this.#apply(removeValue(this.draft, at, step));
  }

  moveValue(at: ItemPath, step: Step, by: -1 | 1): void {
    this.#apply(moveValue(this.draft, at, step, by));
  }

  setForm(form: OutputForm): void {
    this.form = form;
    this.#save();
  }

  /** Asks before emptying the draft. */
  clear(): void {
    this.pending = { kind: 'clear' };
  }

  /** Carries out whatever is waiting for a yes. */
  confirm(): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    if (pending.kind === 'remove') this.#apply(removeItem(this.draft, pending.key));
    if (pending.kind === 'retype') this.#retype(pending.at, pending.type);
    if (pending.kind === 'clear') {
      this.draft = emptyDraft();
      this.refusal = undefined;
      this.closed = {};
      this.flush();
    }
  }

  /** Reads the stored draft, if there is a usable one. Call once, in the browser. */
  restore(): void {
    try {
      const found = unpack(localStorage.getItem(STORAGE_KEY));
      if (!found) return;
      this.draft = found.draft;
      this.form = found.form;
      if (needsVocabulary(found.draft)) void this.loadVocabulary();
    } catch {
      this.stored = false;
    }
  }

  #save(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), SAVE_AFTER);
  }

  /** Writes the draft to the browser's storage now. An empty draft removes the entry. */
  flush(): void {
    clearTimeout(this.#timer);
    try {
      if (this.draft.items.length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pack({ draft: this.draft, form: this.form }));
      this.stored = true;
    } catch {
      this.stored = false;
    }
  }

  /** Fetches the vocabulary from this site, once. Safe to call again after a failure. */
  async loadVocabulary(): Promise<void> {
    if (this.loading === 'loading' || this.loading === 'ready') return;
    this.loading = 'loading';
    try {
      const response = await fetch(VOCABULARY);
      const parsed = response.ok ? parseVocabulary(await response.json()) : undefined;
      this.vocabulary = parsed;
      this.loading = parsed ? 'ready' : 'failed';
    } catch {
      this.loading = 'failed';
    }
  }
}
```

- [ ] **Step 8: Write one value's control**

`apps/web/src/lib/schema/ValueInput.svelte`:

```svelte
<script lang="ts">
  import {
    itemTitle,
    LIMITS,
    nestedDefinition,
    typeLabel,
    type Field,
    type ItemPath,
    type TextKind,
    type Value,
  } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import { fieldId } from './ids.ts';
  import ItemFields from './ItemFields.svelte';
  import { blankFor, convert, specLabel, specOf, type SpecOption } from './values.ts';

  let {
    builder,
    at,
    field,
    index,
    value,
    depth,
    specs,
    count,
    describedby,
  }: {
    builder: Builder;
    at: ItemPath;
    field: Field;
    index: number;
    /** Nothing yet, for the one empty control a field with no values shows. */
    value: Value | undefined;
    depth: number;
    specs: SpecOption[];
    /** How many values the property has. */
    count: number;
    describedby: string | undefined;
  } = $props();

  // Properties whose text runs to sentences.
  const LONG = ['description', 'text', 'reviewBody', 'articleBody'];
  const PLACEHOLDERS: Partial<Record<TextKind, string>> = {
    url: 'https://',
    date: 'YYYY-MM-DD',
    dateTime: 'YYYY-MM-DDTHH:MM:SS+00:00',
    time: 'HH:MM',
  };

  const id = $derived(fieldId(at, field.property, index));
  const step = $derived({ property: field.property, index });
  const spec = $derived(value ? specOf(value) : (specs[0]?.id ?? 'text'));
  // A value keeps its own kind on offer even if the field would not offer it now.
  const options = $derived(
    specs.some((option) => option.id === spec) ? specs : [...specs, { id: spec, label: specLabel(spec) }],
  );
  const name = $derived(count > 1 ? `${field.label} ${index + 1}` : field.label);
  // The first control is named by the field's label element; the rest name themselves.
  const label = $derived(index === 0 ? undefined : name);
  const text = $derived(value && 'text' in value ? value.text : '');
  const textKind = $derived<TextKind>(value && 'text' in value ? value.kind : (spec as TextKind));
  const others = $derived(builder.draft.items.filter((other) => other.key !== at.key));

  const write = (next: Value) => {
    if (value === undefined) builder.addValue(at, field.property, next);
    else builder.setValue(at, step, next);
  };
  const tick = (on: boolean) => {
    if (on) write({ kind: 'boolean', on: true });
    else if (value !== undefined) builder.removeValue(at, step);
  };
  const choiceLabel = (choice: string) => typeLabel(choice.slice(choice.lastIndexOf('/') + 1));
</script>

<div class="value">
  {#if options.length > 1}
    <select
      class="kind"
      aria-label="Kind of value for {name}"
      value={spec}
      onchange={(event) => write(convert(value, event.currentTarget.value))}
    >
      {#each options as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  {/if}

  {#if spec.startsWith('item:')}
    {#if value?.kind === 'item'}
      <fieldset class="nested">
        <legend>{typeLabel(value.item.type)}</legend>
        <ItemFields
          {builder}
          at={{ key: at.key, steps: [...at.steps, step] }}
          item={value.item}
          definition={nestedDefinition(field, value.item.type)}
          depth={depth + 1}
        />
      </fieldset>
    {:else}
      <button type="button" {id} disabled={depth >= LIMITS.depth} onclick={() => write(blankFor(spec))}
        >Add {field.label.toLowerCase()}</button
      >
      {#if depth >= LIMITS.depth}
        <p class="hint">Items can be nested {LIMITS.depth} deep at most.</p>
      {/if}
    {/if}
  {:else if spec === 'reference'}
    <select
      {id}
      aria-label={label}
      aria-describedby={describedby}
      value={value?.kind === 'reference' ? value.key : ''}
      onchange={(event) => write({ kind: 'reference', key: event.currentTarget.value })}
    >
      <option value="">Choose an item</option>
      {#each others as other (other.key)}
        <option value={other.key}>{itemTitle(other)}</option>
      {/each}
    </select>
  {:else if spec === 'boolean'}
    <input
      type="checkbox"
      {id}
      aria-label={label}
      aria-describedby={describedby}
      checked={value?.kind === 'boolean' && value.on}
      onchange={(event) => tick(event.currentTarget.checked)}
    />
  {:else if field.choices}
    <select
      {id}
      aria-label={label}
      aria-describedby={describedby}
      value={text}
      onchange={(event) => write({ kind: textKind, text: event.currentTarget.value })}
    >
      <option value="">Not set</option>
      {#each field.choices as choice (choice)}
        <option value={choice}>{choiceLabel(choice)}</option>
      {/each}
    </select>
  {:else if spec === 'text' && LONG.includes(field.property)}
    <textarea
      {id}
      aria-label={label}
      aria-describedby={describedby}
      maxlength={LIMITS.text}
      value={text}
      oninput={(event) => write({ kind: textKind, text: event.currentTarget.value })}
    ></textarea>
  {:else}
    <input
      {id}
      type="text"
      aria-label={label}
      aria-describedby={describedby}
      autocomplete="off"
      spellcheck={textKind === 'text'}
      inputmode={textKind === 'number' ? 'decimal' : textKind === 'url' ? 'url' : 'text'}
      placeholder={PLACEHOLDERS[textKind]}
      maxlength={LIMITS.text}
      value={text}
      oninput={(event) => write({ kind: textKind, text: event.currentTarget.value })}
    />
  {/if}

  {#if value !== undefined && (count > 1 || field.repeats || value.kind === 'item' || value.kind === 'reference')}
    <div class="actions">
      {#if count > 1}
        <button
          type="button"
          class="compact"
          aria-label="Move {name} up"
          disabled={index === 0}
          onclick={() => builder.moveValue(at, step, -1)}>Up</button
        >
        <button
          type="button"
          class="compact"
          aria-label="Move {name} down"
          disabled={index === count - 1}
          onclick={() => builder.moveValue(at, step, 1)}>Down</button
        >
      {/if}
      <button
        type="button"
        class="compact danger"
        aria-label="Remove {name}"
        onclick={() => builder.removeValue(at, step)}>Remove</button
      >
    </div>
  {/if}
</div>

<style>
  .value {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }
  .kind {
    width: auto;
    justify-self: start;
    min-height: 2.25rem;
    padding-block: 0.2rem;
    font-size: 0.95rem;
  }
  /* An item inside an item: stepped in and bounded by a line. Not a panel in a panel. */
  .nested {
    margin: 0;
    padding: 0.9rem 1rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  .nested legend {
    padding-inline: 0.4rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.25rem;
    line-height: 1.05;
  }
  @media (max-width: 40rem) {
    .nested {
      padding: 0.7rem 0.6rem 0.2rem;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>
```

- [ ] **Step 9: Write one field**

`apps/web/src/lib/schema/FieldRow.svelte`:

```svelte
<script lang="ts">
  import {
    LIMITS,
    valuesOf,
    type Field,
    type Item,
    type ItemPath,
    type Value,
  } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import { fieldId } from './ids.ts';
  import ValueInput from './ValueInput.svelte';
  import { blankFor, specOf, specsFor } from './values.ts';

  let {
    builder,
    at,
    item,
    field,
    depth,
  }: { builder: Builder; at: ItemPath; item: Item; field: Field; depth: number } = $props();

  const values = $derived(valuesOf(item, field.property));
  // A field with no value still shows one control. It is the same element before and after
  // the first keystroke creates the value, so the caret stays where it is.
  const slots = $derived<(Value | undefined)[]>(values.length > 0 ? values : [undefined]);
  const others = $derived(builder.draft.items.some((other) => other.key !== at.key));
  const specs = $derived(specsFor(field, builder.vocabulary, others));
  const firstId = $derived(fieldId(at, field.property, 0));
  const hintId = $derived(`${firstId}-hint`);
  const first = $derived(slots[0] ? specOf(slots[0]) : (specs[0]?.id ?? 'text'));
  // A nested item is named by its own legend, and an Add button by its own words.
  const plain = $derived(!first.startsWith('item:'));
  const full = $derived(values.length >= LIMITS.values);
</script>

<div class="field">
  <div class="head">
    {#if plain}
      <label for={firstId}>{field.label}</label>
    {:else}
      <span class="label">{field.label}</span>
    {/if}
    {#if field.level === 'required'}
      <span class="badge owner">Required</span>
    {:else if field.level === 'recommended'}
      <span class="badge">Recommended</span>
    {/if}
  </div>
  {#if field.hint}
    <p class="hint" id={hintId}>{field.hint}</p>
  {/if}
  {#each slots as value, index (index)}
    <ValueInput
      {builder}
      {at}
      {field}
      {index}
      {value}
      {depth}
      {specs}
      count={values.length}
      describedby={field.hint ? hintId : undefined}
    />
  {/each}
  {#if field.repeats && values.length > 0}
    <button
      type="button"
      class="compact"
      disabled={full}
      onclick={() => builder.addValue(at, field.property, blankFor(specs[0]?.id ?? 'text'))}
      >Add another</button
    >
    {#if full}
      <p class="hint">A property holds at most {LIMITS.values} values.</p>
    {/if}
  {/if}
</div>

<style>
  .field {
    margin-bottom: 1.1rem;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.3rem;
  }
  /* Inside a nested group the site's fieldset rule would thin and inline the label. */
  .head label,
  .head .label {
    display: inline;
    margin: 0;
    font-weight: 650;
  }
  .field .hint {
    margin: 0 0 0.4rem;
  }
</style>
```

- [ ] **Step 10: Write an item's fields**

`apps/web/src/lib/schema/ItemFields.svelte`:

```svelte
<script lang="ts">
  import {
    fieldsFor,
    type Definition,
    type Field,
    type Item,
    type ItemPath,
  } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import FieldRow from './FieldRow.svelte';

  let {
    builder,
    at,
    item,
    definition,
    depth,
  }: {
    builder: Builder;
    at: ItemPath;
    item: Item;
    /** The guided form in force here, if there is one. */
    definition: Definition | undefined;
    /** 1 for a top-level item. */
    depth: number;
  } = $props();

  const fields = $derived(fieldsFor(item, definition, builder.vocabulary));
  const guided = $derived(new Set((definition?.fields ?? []).map((field) => field.property)));
  const level = (wanted: Field['level']) =>
    fields.filter((field) => guided.has(field.property) && field.level === wanted);
  const added = $derived(fields.filter((field) => !guided.has(field.property)));
  // Required, then recommended, then whatever was added from the vocabulary.
  const main = $derived([...level('required'), ...level('recommended'), ...added]);
  // A field stays in its group whether or not it has a value, so typing never moves it.
  const more = $derived(level('optional'));
  const moreHeld = $derived(
    more.some((field) => item.properties.some((property) => property.name === field.property)),
  );
</script>

{#each main as field (field.property)}
  <FieldRow {builder} {at} {item} {field} {depth} />
{/each}

{#if more.length > 0}
  <details class="more" open={moreHeld}>
    <summary>More fields</summary>
    {#each more as field (field.property)}
      <FieldRow {builder} {at} {item} {field} {depth} />
    {/each}
  </details>
{/if}

<style>
  .more {
    margin-bottom: 0.9rem;
    border-top: 1px solid var(--line);
    padding-top: 0.6rem;
  }
  .more summary {
    cursor: pointer;
    font-weight: 650;
    margin-bottom: 0.9rem;
  }
</style>
```

- [ ] **Step 11: Write a top-level item**

`apps/web/src/lib/schema/ItemPanel.svelte`:

```svelte
<script lang="ts">
  import { topDefinition, typeLabel, valuesOf, type Item } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import { pathId } from './ids.ts';
  import ItemFields from './ItemFields.svelte';

  let {
    builder,
    item,
    index,
    count,
  }: { builder: Builder; item: Item; index: number; count: number } = $props();

  const at = $derived({ key: item.key, steps: [] });
  const definition = $derived(topDefinition(item.type));
  const variants = $derived(definition ? [definition.type, ...definition.variants] : []);
  const label = $derived(typeLabel(item.type));
  const title = $derived.by(() => {
    for (const property of ['name', 'headline']) {
      const value = valuesOf(item, property)[0];
      if (value && 'text' in value && value.text.trim() !== '') return value.text.trim();
    }
    return '';
  });
  const typeId = $derived(`type-${pathId(at)}`);
</script>

<details
  class="item"
  data-testid="item"
  data-key={item.key}
  open={!builder.closed[item.key]}
  ontoggle={(event) => (builder.closed[item.key] = !event.currentTarget.open)}
>
  <summary>
    <span class="type">{label}</span>
    {#if title}<span class="name">{title}</span>{/if}
  </summary>

  <div class="body">
    {#if definition?.note}
      <p class="hint">{definition.note}</p>
    {/if}
    {#if !definition}
      <p class="hint">
        There are no required or recommended rules for this type, so nothing here is reported as
        missing.
      </p>
    {/if}

    <div class="tools">
      {#if variants.length > 1}
        <div class="variant">
          <label for={typeId}>Type</label>
          <select
            id={typeId}
            value={item.type}
            onchange={(event) => builder.retype(at, event.currentTarget.value)}
          >
            {#each variants as variant (variant)}
              <option value={variant}>{variant}</option>
            {/each}
          </select>
        </div>
      {/if}
      {#if count > 1}
        <button
          type="button"
          class="compact"
          aria-label="Move {label} up"
          disabled={index === 0}
          onclick={() => builder.moveItem(item.key, -1)}>Up</button
        >
        <button
          type="button"
          class="compact"
          aria-label="Move {label} down"
          disabled={index === count - 1}
          onclick={() => builder.moveItem(item.key, 1)}>Down</button
        >
      {/if}
      <button
        type="button"
        class="compact danger"
        aria-label="Remove this {label}"
        onclick={() => builder.removeItem(item.key)}>Remove item</button
      >
    </div>

    <ItemFields {builder} {at} {item} {definition} depth={1} />
  </div>
</details>

<style>
  /* The panel: surface, a 1px line, the one radius, no shadow. */
  .item {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    margin-bottom: 1rem;
  }
  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.75rem;
    padding: 0.9rem 1.25rem;
    cursor: pointer;
  }
  .type {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    line-height: 1.05;
    letter-spacing: 0.005em;
  }
  .name {
    color: var(--ink-soft);
    overflow-wrap: anywhere;
  }
  .body {
    padding: 0.4rem 1.25rem 0.4rem;
    border-top: 1px solid var(--line);
  }
  .body > .hint {
    margin: 0.7rem 0 0;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.4rem;
    margin: 0.9rem 0 1.1rem;
  }
  .variant {
    margin-right: auto;
  }
  .variant label {
    font-size: 0.95rem;
  }
  .variant select {
    width: auto;
  }
</style>
```

- [ ] **Step 12: Write the builder**

`apps/web/src/lib/schema/Builder.svelte`:

```svelte
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    DEFINITIONS,
    GUIDED,
    LIMITS,
    markupParts,
    REFUSAL_WORDS,
    RULES_CHECKED,
    typeLabel,
  } from '@pokerji/schema-builder';
  import CopyButton from '#lib/ui/CopyButton.svelte';
  import { Builder } from './builder.svelte.ts';
  import ItemPanel from './ItemPanel.svelte';

  const builder = new Builder();
  let ready = $state(false);
  let dialog = $state<HTMLDialogElement>();
  let copyRefused = $state(false);

  const items = $derived(builder.draft.items);
  const full = $derived(items.length >= LIMITS.items);
  const parts = $derived(markupParts(builder.output));

  onMount(() => {
    builder.restore();
    ready = true;
    // The last change is written when the page is left, however soon after it was made.
    const flush = () => builder.flush();
    addEventListener('pagehide', flush);
    return () => removeEventListener('pagehide', flush);
  });

  // The confirmation dialog follows `pending`.
  $effect(() => {
    if (!dialog) return;
    if (builder.pending && !dialog.open) dialog.showModal();
    if (!builder.pending && dialog.open) dialog.close();
  });

  const add = async (type: string) => {
    const key = builder.addItem(type);
    if (!key) return;
    await tick();
    document.querySelector<HTMLElement>(`[data-key="${key}"] summary`)?.focus();
  };

  const download = () => {
    const script = builder.form === 'script';
    const url = URL.createObjectURL(
      new Blob([builder.output], { type: script ? 'text/html' : 'application/ld+json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = script ? 'schema.html' : 'schema.jsonld';
    link.click();
    URL.revokeObjectURL(url);
  };
</script>

<div class="floor" data-ready={ready ? '' : undefined}>
  <div class="editor">
    {#if !builder.stored}
      <p role="status">
        Your browser is not letting this page keep a copy of the draft. It will be lost when you
        close or reload the page.
      </p>
    {/if}
    {#if builder.refusal}
      <p role="status">{REFUSAL_WORDS[builder.refusal]}</p>
    {/if}

    {#each items as item, index (item.key)}
      <ItemPanel {builder} {item} {index} count={items.length} />
    {/each}

    <section class="chooser" aria-labelledby="chooser-heading">
      <h2 id="chooser-heading">{items.length > 0 ? 'Add an item' : 'What are you describing?'}</h2>
      {#if full}
        <p class="hint">A draft holds at most {LIMITS.items} items.</p>
      {/if}
      <div class="types">
        {#each GUIDED as id (id)}
          <button type="button" disabled={full} onclick={() => add(id)}
            >{DEFINITIONS[id]?.label ?? id}</button
          >
        {/each}
      </div>
      {#if items.length > 0}
        <p class="clear">
          <button type="button" class="danger" onclick={() => builder.clear()}>Clear</button>
        </p>
      {/if}
    </section>
  </div>

  <aside class="output" aria-labelledby="markup-heading">
    <div class="bar">
      <CopyButton
        text={builder.output}
        label="Copy markup"
        primary
        disabled={builder.output === ''}
        onfail={() => (copyRefused = true)}
      />
    </div>
    <div class="sheet" id="markup-sheet">
      <h2 id="markup-heading">Markup</h2>
      {#if copyRefused}
        <p role="status">Copying was refused. Select the markup below and copy it by hand.</p>
      {/if}
      <div class="forms" role="group" aria-label="Form of the markup">
        <button
          type="button"
          class="compact"
          aria-pressed={builder.form === 'script'}
          onclick={() => builder.setForm('script')}>Script tag</button
        >
        <button
          type="button"
          class="compact"
          aria-pressed={builder.form === 'json'}
          onclick={() => builder.setForm('json')}>Raw JSON</button
        >
        <button type="button" class="compact" disabled={builder.output === ''} onclick={download}
          >Download</button
        >
      </div>
      {#if builder.output}
        <!-- A scrolling region has to be reachable by keyboard to be scrolled by it. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- prettier-ignore -->
        <pre class="code" role="region" tabindex="0" aria-label="The markup"><code>{#each parts as part, index (index)}<span class={part.kind}>{part.text}</span>{/each}</code></pre>
      {:else}
        <p class="empty">The markup appears here as you fill in the form.</p>
      {/if}
      <p class="hint">
        Required and recommended fields follow Google’s published guidance, last checked
        {RULES_CHECKED}. Meeting them does not guarantee a search result. To test markup, paste it
        into
        <a href="https://search.google.com/test/rich-results" rel="noopener">Google’s Rich Results Test</a>
        or the
        <a href="https://validator.schema.org/" rel="noopener">Schema.org validator</a>.
      </p>
    </div>
  </aside>
</div>

<dialog bind:this={dialog} onclose={() => (builder.pending = null)} aria-labelledby="confirm-heading">
  {#if builder.pending}
    {#if builder.pending.kind === 'clear'}
      <h2 id="confirm-heading">Clear the whole draft?</h2>
      <p>Every item on this page is removed, and the copy kept in this browser with it.</p>
    {:else if builder.pending.kind === 'remove'}
      <h2 id="confirm-heading">Remove this item?</h2>
      <p>
        Other items refer to it. Those references are left out of the markup until you point them
        somewhere else.
      </p>
    {:else}
      <h2 id="confirm-heading">Change the type to {typeLabel(builder.pending.type)}?</h2>
      <p>
        These properties do not belong to that type and will be removed:
        {builder.pending.dropped.join(', ')}.
      </p>
    {/if}
    <div class="dialog-actions">
      <button type="button" onclick={() => (builder.pending = null)}>Cancel</button>
      <button type="button" class="danger" onclick={() => builder.confirm()}
        >{builder.pending.kind === 'clear'
          ? 'Yes, clear'
          : builder.pending.kind === 'remove'
            ? 'Yes, remove'
            : 'Yes, change'}</button
      >
    </div>
  {/if}
</dialog>

<style>
  /* ---- The floor: the editor, and the markup's rail on one edge, as in the room ---- */
  .floor {
    display: grid;
    gap: 2rem;
    padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 6vw, 5rem);
    align-items: start;
  }
  @media (min-width: 64rem) {
    .floor {
      grid-template-columns: minmax(0, 40rem) minmax(22rem, 36rem);
      gap: 2.5rem;
    }
  }
  .editor {
    min-width: 0;
  }
  .editor > [role='status'] {
    margin-bottom: 1rem;
  }

  .chooser h2 {
    margin-top: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .clear {
    margin: 2.75rem 0 0;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
  }

  /* ---- The rail: the markup, staying in view while the editor scrolls ---- */
  .output {
    display: grid;
    gap: 0.6rem;
    padding: 1.1rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  @media (min-width: 64rem) {
    .output {
      position: sticky;
      top: 1rem;
      max-height: calc(100dvh - 2rem);
      overflow-y: auto;
    }
  }
  .bar {
    display: grid;
    gap: 0.6rem;
  }
  /* The rail's first control is the next thing to do, set as the room's Reveal is. */
  .bar :global(button) {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: 0.03em;
    min-height: 3.5rem;
  }
  .sheet {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  .sheet h2 {
    margin: 0.4rem 0 0;
    font-size: 1.25rem;
  }
  .forms {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .forms button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
  .forms button:last-child {
    margin-left: auto;
  }

  /* ---- The code block: system monospace, two inks, no new colour ---- */
  .code {
    margin: 0;
    padding: 0.75rem 0.9rem;
    max-height: 60dvh;
    overflow: auto;
    background: var(--ground);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.875rem;
    line-height: 1.55;
    white-space: pre;
    tab-size: 2;
  }
  .code code {
    display: inline;
    padding: 0;
    border: 0;
    background: none;
    font-size: inherit;
    overflow-wrap: normal;
  }
  .code .name {
    font-weight: 650;
  }
  .code .mark {
    color: var(--ink-soft);
  }
  /* Not there yet: the dashed outline of an empty seat. */
  .empty {
    margin: 0;
    padding: 1.5rem 1rem;
    border: 2px dashed var(--line);
    border-radius: var(--radius);
    color: var(--ink-soft);
  }
  .sheet .hint {
    margin: 0.4rem 0 0;
  }

  /* ---- Confirmation, as in the room ---- */
  dialog {
    width: min(100% - 2rem, 28rem);
    padding: 1.5rem;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  dialog::backdrop {
    background: rgb(17 20 23 / 0.55);
  }
  dialog h2 {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
  }
  .dialog-actions {
    display: flex;
    justify-content: end;
    gap: 0.6rem;
    margin-top: 1.25rem;
  }
</style>
```

The dialog's backdrop uses the same raw value the room's dialog uses (`rgb(17 20 23 / 0.55)`). It is copied, not new; `DESIGN.md` records it as "a 55% ink backdrop".

- [ ] **Step 13: Write the page**

`apps/web/src/routes/schema/+page.svelte`:

```svelte
<script lang="ts">
  import Builder from '#lib/schema/Builder.svelte';
  import Seo from '#lib/ui/Seo.svelte';
</script>

<Seo
  title="Schema markup builder: free JSON-LD generator · pokerji"
  description="Build Schema.org JSON-LD for articles, products, events, local businesses and more. Free, no sign-up, and nothing you type leaves your browser."
/>

<header class="band">
  <div class="band-inner flush">
    <h1>Schema markup builder</h1>
    <p>
      Fill in a form, copy the JSON-LD, paste it into your page. Nothing you type leaves your
      browser.
    </p>
  </div>
</header>

<main class="bleed">
  <noscript>
    <p class="noscript" role="status">
      The builder needs JavaScript, because it runs in your browser and nowhere else. Turn
      JavaScript on for this site to use it.
    </p>
  </noscript>

  <Builder />

  <section class="about">
    <h2>What this builds</h2>
    <p>
      Structured data tells search engines and other readers what a page is about: that it
      describes a product with a price, an event on a date, or a business at an address. This
      builder writes it as JSON-LD, the form Schema.org and Google recommend, for you to paste
      into your page’s HTML.
    </p>
    <p>
      Ten common types have guided forms that say what search engines require and recommend. Any
      other Schema.org type, and any property of any type, can be added from the full vocabulary.
      Several items can be built together and refer to each other.
    </p>

    <h2>Where your markup goes</h2>
    <p>
      Nowhere. What you type is never sent to this site. Your draft is kept in this browser, on
      this device, so that a reload does not lose it, until you press Clear.
      <a href="/privacy">Read exactly what is stored</a>
    </p>
    <p class="hint">
      The list of types and properties is adapted from
      <a href="https://schema.org/" rel="noopener">Schema.org</a>, under the
      <a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noopener"
        >Creative Commons Attribution-ShareAlike 3.0 licence</a
      >. <a href="/schema/LICENSES.md">What was changed</a>
    </p>
  </section>
</main>

<style>
  /* The band's words share the floor's gutter, as the room's stage does. */
  .band-inner.flush {
    width: auto;
    margin: 0;
    padding-inline: clamp(1rem, 6vw, 5rem);
  }
  .noscript {
    margin: 1.5rem clamp(1rem, 6vw, 5rem) 0;
    max-width: 40rem;
  }
  .about {
    max-width: calc(40rem + 2 * clamp(1rem, 6vw, 5rem));
    padding: 0 clamp(1rem, 6vw, 5rem) 5rem;
  }
  .about h2:first-child {
    margin-top: 1rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--line);
  }
</style>
```

- [ ] **Step 14: Run the typecheck and the tests**

Run: `pnpm format && pnpm --filter @pokerji/web typecheck`
Expected: 0 errors, 0 warnings.

Run: `pnpm --filter @pokerji/web e2e schema.spec.ts`
Expected: every test in the file passes.

Then the rest of the browser suite, because `CopyButton` and `app.css` are shared:

Run: `pnpm --filter @pokerji/web e2e`
Expected: every test passes.

- [ ] **Step 15: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: the schema markup builder page, with guided forms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The escape hatch

Any Schema.org type, and any property of any type, from the vocabulary; and changing an item's type.

**Files:**
- Create: `apps/web/src/lib/schema/Picker.svelte`, `apps/web/src/lib/schema/Vocab.svelte`
- Modify: `apps/web/src/lib/schema/Builder.svelte`, `apps/web/src/lib/schema/ItemFields.svelte`, `apps/web/src/lib/schema/ItemPanel.svelte`
- Test: `apps/web/e2e/schema.spec.ts`

**Interfaces:**
- Consumes: `Builder.loadVocabulary()`, `Builder.vocabulary`, `Builder.loading`, `Builder.retype()` (Task 2); `searchTypes`, `searchProperties`, `describeProperty`, `expects`, `LIMITS` from the package; `blankFor`, `pathId`.
- Produces:
  - `Picker.svelte`, props `{ id: string; label: string; search: (query: string) => string[]; describe?: (name: string) => string; onpick: (name: string) => void }`. Results are buttons in a list with class `results`; each holds the name in a `<b>`.
  - `Vocab.svelte`, props `{ builder: Builder; children: Snippet<[Vocabulary]> }`. Renders its children with the vocabulary once it is loaded; a loading line before; a message and a "Try again" button after a failure.

- [ ] **Step 1: Write the failing browser tests**

Add to the end of `apps/web/e2e/schema.spec.ts`:

```ts
const result = (page: Page, name: string) =>
  page.locator('.results button', { has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) });

test('the vocabulary is fetched only when the escape hatch is opened', async ({ browser }) => {
  const page = await open(browser);
  const asked: string[] = [];
  page.on('request', (request) => asked.push(new URL(request.url()).pathname));

  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  expect(asked).not.toContain('/schema/vocabulary.json');

  await page.getByRole('button', { name: 'Another type' }).click();
  await page.getByLabel('Search Schema.org types').fill('movie');
  await result(page, 'Movie').click();
  expect(asked.filter((path) => path === '/schema/vocabulary.json')).toHaveLength(1);

  const movie = page.getByTestId('item').nth(1);
  await expect(movie).toContainText('There are no required or recommended rules for this type');
  await movie.getByRole('button', { name: 'Add another property' }).click();
  await movie.getByLabel('Search properties of Movie').fill('duration');
  await result(page, 'duration').click();
  await movie.getByLabel('duration', { exact: true }).fill('PT2H');

  await movie.getByRole('button', { name: 'Add another property' }).click();
  await movie.getByLabel('Search properties of Movie').fill('director');
  await result(page, 'director').click();
  // A nested item of a type with no guided form starts empty: its properties are added too.
  const person = movie.getByRole('group', { name: 'Person' });
  await person.getByRole('button', { name: 'Add another property' }).click();
  await person.getByLabel('Search properties of Person').fill('name');
  await result(page, 'name').click();
  await person.getByLabel('name', { exact: true }).fill('Ada');

  expect((await rawJson(page))['@graph'][1]).toEqual({
    '@type': 'Movie',
    duration: 'PT2H',
    director: { '@type': 'Person', name: 'Ada' },
  });
  expect(asked.filter((path) => path === '/schema/vocabulary.json')).toHaveLength(1);
});

test('a guided item can take a property from the vocabulary', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByRole('button', { name: 'Add another property' }).click();
  await page.getByLabel('Search properties of Website').fill('inLanguage');
  await expect(result(page, 'inLanguage')).toContainText('The language of the content');
  await result(page, 'inLanguage').click();
  await page.getByLabel('inLanguage', { exact: true }).fill('en');
  expect(await rawJson(page)).toMatchObject({ '@type': 'WebSite', inLanguage: 'en' });
});

test('when the vocabulary cannot be loaded the guided forms still work, and it can be retried', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.route('**/schema/vocabulary.json', (route) => route.abort());
  await page.getByRole('button', { name: 'Another type' }).click();
  await expect(page.getByText('The Schema.org vocabulary could not be loaded')).toBeVisible();

  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  expect(await rawJson(page)).toMatchObject({ name: 'Acme' });

  await page.unroute('**/schema/vocabulary.json');
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByLabel('Search Schema.org types')).toBeVisible();
});

test('a restored draft with a type outside the ten fetches the vocabulary at once', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Another type' }).click();
  await page.getByLabel('Search Schema.org types').fill('movie');
  await result(page, 'Movie').click();
  const movie = page.getByTestId('item').first();
  await movie.getByRole('button', { name: 'Add another property' }).click();
  await movie.getByLabel('Search properties of Movie').fill('duration');
  await result(page, 'duration').click();
  await movie.getByLabel('duration', { exact: true }).fill('PT2H');
  await expect.poll(() => stored(page)).toContain('PT2H');

  const asked: string[] = [];
  page.on('request', (request) => asked.push(new URL(request.url()).pathname));
  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await expect(page.getByLabel('duration', { exact: true })).toHaveValue('PT2H');
  await expect.poll(() => asked).toContain('/schema/vocabulary.json');
  // Once it has loaded, the field carries the vocabulary's description.
  await expect(page.getByText('The duration of the item')).toBeVisible();
});

test('changing a type asks before it drops properties', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Kettle');
  await page.getByText('More fields').click();
  await page.getByLabel('SKU', { exact: true }).fill('K-1');

  const change = async (query: string, type: string) => {
    await page.getByRole('button', { name: 'Change type' }).click();
    await page.getByLabel('Search Schema.org types').fill(query);
    await result(page, type).click();
  };

  // A person has a name but no SKU.
  await change('person', 'Person');
  await expect(page.getByRole('heading', { name: 'Change the type to Person?' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('sku');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await rawJson(page)).toMatchObject({ '@type': 'Product', sku: 'K-1' });

  await change('person', 'Person');
  await page.getByRole('button', { name: 'Yes, change' }).click();
  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Kettle',
  });

  // An organization has a name too, so nothing is lost and nothing is asked.
  await change('organization', 'Organization');
  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Kettle',
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/web e2e schema.spec.ts`
Expected: the five new tests fail, the first at `getByRole('button', { name: 'Another type' })`. The Task 2 tests still pass.

- [ ] **Step 3: Write the picker and the vocabulary gate**

`apps/web/src/lib/schema/Picker.svelte`:

```svelte
<script lang="ts">
  let {
    id,
    label,
    search,
    describe,
    onpick,
  }: {
    id: string;
    label: string;
    search: (query: string) => string[];
    /** A line about a result, shown under its name. */
    describe?: (name: string) => string;
    onpick: (name: string) => void;
  } = $props();

  let query = $state('');
  const results = $derived(search(query));
</script>

<div class="picker">
  <label for={id}>{label}</label>
  <input {id} type="search" autocomplete="off" spellcheck="false" bind:value={query} />
  <ul class="results">
    {#each results as name (name)}
      <li>
        <button type="button" onclick={() => onpick(name)}>
          <b>{name}</b>
          {#if describe && describe(name)}
            <span>{describe(name)}</span>
          {/if}
        </button>
      </li>
    {:else}
      <li class="hint">Nothing matches.</li>
    {/each}
  </ul>
</div>

<style>
  .picker {
    margin-bottom: 1.1rem;
  }
  /* Results sit in the page beneath the field: a ruled list, nothing floating. */
  .results {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    max-height: 22rem;
    overflow-y: auto;
    border-top: 1px solid var(--line);
  }
  .results li {
    border-bottom: 1px solid var(--line);
  }
  .results li.hint {
    padding: 0.6rem 0;
  }
  .results button {
    display: grid;
    gap: 0.1rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 0.6rem;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 0;
    font-weight: 400;
  }
  .results button:hover:not(:disabled) {
    background: var(--ink);
    color: var(--ground);
  }
  .results b {
    font-weight: 650;
  }
  .results span {
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  .results button:hover span {
    color: inherit;
  }
</style>
```

`apps/web/src/lib/schema/Vocab.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Vocabulary } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';

  // Shows what needs the vocabulary once it is here; says so while it is not.
  let { builder, children }: { builder: Builder; children: Snippet<[Vocabulary]> } = $props();
</script>

{#if builder.vocabulary}
  {@render children(builder.vocabulary)}
{:else if builder.loading === 'failed'}
  <p role="status">
    The Schema.org vocabulary could not be loaded, so types and properties cannot be searched.
    The guided forms still work.
    <button type="button" class="compact" onclick={() => builder.loadVocabulary()}>Try again</button>
  </p>
{:else}
  <p class="hint" role="status">Loading the vocabulary…</p>
{/if}
```

- [ ] **Step 4: Offer any type in the chooser**

In `apps/web/src/lib/schema/Builder.svelte`:

Add `searchTypes` to the import from `'@pokerji/schema-builder'`, and add two imports beside `ItemPanel`:

```ts
  import Picker from './Picker.svelte';
  import Vocab from './Vocab.svelte';
```

Add after `let copyRefused = $state(false);`:

```ts
  let pickingType = $state(false);

  const toggleTypes = () => {
    pickingType = !pickingType;
    if (pickingType) void builder.loadVocabulary();
  };
```

Replace the `<div class="types">…</div>` block with:

```svelte
      <div class="types">
        {#each GUIDED as id (id)}
          <button type="button" disabled={full} onclick={() => add(id)}
            >{DEFINITIONS[id]?.label ?? id}</button
          >
        {/each}
        <button type="button" disabled={full} aria-expanded={pickingType} onclick={toggleTypes}
          >Another type</button
        >
      </div>
      {#if pickingType}
        <div class="any">
          <Vocab {builder}>
            {#snippet children(vocabulary)}
              <Picker
                id="type-search"
                label="Search Schema.org types"
                search={(query) => searchTypes(vocabulary, query)}
                onpick={(type) => {
                  pickingType = false;
                  void add(type);
                }}
              />
            {/snippet}
          </Vocab>
        </div>
      {/if}
```

Add to its `<style>`, after the `.types` rule:

```css
  .any {
    margin-top: 1.1rem;
  }
```

- [ ] **Step 5: Offer any property on an item**

In `apps/web/src/lib/schema/ItemFields.svelte`:

Replace the import from `'@pokerji/schema-builder'` with:

```ts
  import {
    describeProperty,
    expects,
    fieldsFor,
    LIMITS,
    searchProperties,
    typeLabel,
    type Definition,
    type Field,
    type Item,
    type ItemPath,
    type Vocabulary,
  } from '@pokerji/schema-builder';
```

Add beside the `FieldRow` import:

```ts
  import { pathId } from './ids.ts';
  import Picker from './Picker.svelte';
  import { blankFor } from './values.ts';
  import Vocab from './Vocab.svelte';
```

Add at the end of the script:

```ts
  let adding = $state(false);
  const full = $derived(item.properties.length >= LIMITS.properties);

  const toggle = () => {
    adding = !adding;
    if (adding) void builder.loadVocabulary();
  };
  /** Properties of this type that the item does not show yet. */
  const search = (vocabulary: Vocabulary, query: string) =>
    searchProperties(vocabulary, item.type, query, 40)
      .filter((name) => !fields.some((field) => field.property === name))
      .slice(0, 20);
  /** Adds a property with one empty value of the simplest kind it takes. */
  const pick = (vocabulary: Vocabulary, name: string) => {
    const expected = expects(vocabulary, name);
    const first = expected.kinds[0] ?? 'text';
    const spec = first === 'item' ? `item:${expected.itemTypes[0] ?? 'Thing'}` : first;
    builder.addValue(at, name, blankFor(spec));
    adding = false;
  };
```

Add to the end of the markup, before `<style>`:

```svelte
<div class="add">
  <button type="button" class="compact" disabled={full} aria-expanded={adding} onclick={toggle}
    >Add another property</button
  >
  {#if full}
    <p class="hint">An item holds at most {LIMITS.properties} properties.</p>
  {/if}
  {#if adding}
    <Vocab {builder}>
      {#snippet children(vocabulary)}
        <Picker
          id="property-search-{pathId(at)}"
          label="Search properties of {typeLabel(item.type)}"
          search={(query) => search(vocabulary, query)}
          describe={(name) => describeProperty(vocabulary, name)}
          onpick={(name) => pick(vocabulary, name)}
        />
      {/snippet}
    </Vocab>
  {/if}
</div>
```

Add to its `<style>`:

```css
  .add {
    display: grid;
    gap: 0.6rem;
    justify-items: start;
    margin-bottom: 0.9rem;
  }
  .add :global(.picker),
  .add :global([role='status']) {
    justify-self: stretch;
  }
```

- [ ] **Step 6: Let a top-level item change its type**

In `apps/web/src/lib/schema/ItemPanel.svelte`:

Replace the import from `'@pokerji/schema-builder'` with:

```ts
  import {
    searchTypes,
    topDefinition,
    typeLabel,
    valuesOf,
    type Item,
  } from '@pokerji/schema-builder';
```

Add beside the `ItemFields` import:

```ts
  import Picker from './Picker.svelte';
  import Vocab from './Vocab.svelte';
```

Add at the end of the script:

```ts
  let retyping = $state(false);
  const toggleRetype = () => {
    retyping = !retyping;
    if (retyping) void builder.loadVocabulary();
  };
```

In the `.tools` block, add this button immediately before the "Remove item" button:

```svelte
      <button type="button" class="compact" aria-expanded={retyping} onclick={toggleRetype}
        >Change type</button
      >
```

Add immediately after the closing `</div>` of `.tools`:

```svelte
    {#if retyping}
      <Vocab {builder}>
        {#snippet children(vocabulary)}
          <Picker
            id="retype-search-{pathId(at)}"
            label="Search Schema.org types"
            search={(query) => searchTypes(vocabulary, query)}
            onpick={(type) => {
              retyping = false;
              builder.retype(at, type);
            }}
          />
        {/snippet}
      </Vocab>
    {/if}
```

- [ ] **Step 7: Run the typecheck and the tests**

Run: `pnpm format && pnpm --filter @pokerji/web typecheck && pnpm --filter @pokerji/web e2e schema.spec.ts`
Expected: 0 errors and 0 warnings; every test in the file passes.

The test "changing a type asks before it drops properties" opens two pickers labelled "Search Schema.org types" only one at a time. If Playwright reports a strict-mode violation because the chooser's picker is also open, the test opened it by mistake; the page is right.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat: any Schema.org type and property in the builder, from the vocabulary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Findings, and the dock on narrow screens

**Files:**
- Create: `apps/web/src/lib/schema/Findings.svelte`
- Modify: `apps/web/src/lib/schema/Builder.svelte`, `apps/web/package.json`
- Test: `apps/web/e2e/schema.spec.ts`

**Interfaces:**
- Consumes: `Builder.findings`, `Builder.draft`, `Builder.closed`; `findingWords`, `Finding` from the package; `fieldId`.
- Produces: `Findings.svelte`, props `{ builder: Builder; onreveal: (finding: Finding) => void }`. Each finding is a button whose text is its place and its sentence.

- [ ] **Step 1: Add the accessibility scanner**

Run: `pnpm --filter @pokerji/web add -D @axe-core/playwright`
Expected: one development dependency added to `apps/web/package.json`. If pnpm refuses the newest version for being too recently published, install the release before it by its exact version.

- [ ] **Step 2: Write the failing browser tests**

Add to the imports at the top of `apps/web/e2e/schema.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
```

Add to the end of the file:

```ts
const NARROW = { width: 390, height: 844 };
// WCAG 2.2 AA, the standard the design direction names.
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
const findings = (page: Page) => page.getByRole('region', { name: 'What to check' });

test('findings say what is missing and take you to the field', async ({ browser }) => {
  const page = await open(browser);
  await expect(findings(page)).toContainText('Nothing to check yet');

  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await expect(findings(page)).toContainText('2 required');
  await expect(findings(page).getByRole('button', { name: /Name is required/ })).toBeVisible();
  await expect(
    findings(page).getByRole('button', { name: /Add at least one of: Offer, Average rating, Review/ }),
  ).toBeVisible();

  await findings(page).getByRole('button', { name: /Name is required/ }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.type('Kettle');
  await expect(findings(page).getByRole('button', { name: /Name is required/ })).toHaveCount(0);

  await findings(page).getByRole('button', { name: /Add at least one of/ }).click();
  await expect(page.getByRole('button', { name: 'Add offer' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByLabel('Price', { exact: true }).fill('12,50');
  await expect(
    findings(page).getByRole('button', { name: /Price is not a plain number/ }),
  ).toContainText('Product: Kettle › Offer');
  await expect(findings(page).locator('.badge', { hasText: 'Check' })).toHaveCount(1);
});

test('a finding opens a closed item before it moves focus', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByTestId('item').locator('summary').click();
  await expect(page.getByLabel('Site name', { exact: true })).toBeHidden();
  await findings(page).getByRole('button', { name: /Site name is required/ }).click();
  await expect(page.getByLabel('Site name', { exact: true })).toBeFocused();
});

test('findings are never told apart by colour alone, and never red', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  const rows = findings(page).getByRole('button');
  await expect(rows.first()).toContainText('Required');
  await expect(rows.last()).toContainText('Recommended');
  // No finding, and nothing inside one, is drawn in the colour kept for flags and deletion.
  const reds = await rows.evaluateAll((buttons) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--danger-text)';
    document.body.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return buttons
      .flatMap((button) => [button, ...button.querySelectorAll('*')])
      .filter((node) => getComputedStyle(node).color === danger).length;
  });
  expect(reds).toBe(0);
});
  expect(red).not.toBe('');
  for (const colour of colours) expect(colour).not.toBe('rgb(184, 28, 49)');
});

test('on a narrow screen Copy is docked and the markup opens as a sheet', async ({ browser }) => {
  const page = await open(browser, NARROW);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');

  const copy = page.getByRole('button', { name: 'Copy markup' });
  await expect(copy).toBeVisible();
  await expect(copy).toBeInViewport();
  await expect(markup(page)).toBeHidden();

  await page.getByRole('button', { name: 'Markup', exact: true }).click();
  await expect(markup(page)).toBeVisible();
  await expect(markup(page)).toContainText('"Acme"');
  await expect(findings(page)).toBeVisible();

  // A finding closes the sheet, which would otherwise cover the field it leads to.
  await findings(page).getByRole('button', { name: /Home page is required/ }).click();
  await expect(markup(page)).toBeHidden();
  await expect(page.getByLabel('Home page', { exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Markup', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(markup(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Markup', exact: true })).toBeFocused();

  // The footer is still there, and can be scrolled clear of the dock.
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  const dockTop = (await page.locator('.output').boundingBox())!.y;
  const footerBox = (await footer.boundingBox())!;
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(dockTop + 1);
  // The page itself never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('on a wide screen there is no sheet button and the markup is always shown', async ({
  browser,
}) => {
  const page = await open(browser);
  await expect(page.getByRole('button', { name: 'Markup', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await expect(markup(page)).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [
    ['wide', WIDE],
    ['narrow', NARROW],
  ] as const) {
    test(`the builder has no accessibility violations (${colorScheme}, ${name})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ ...visitor(), viewport, colorScheme });
      const page = await context.newPage();
      await page.goto('/schema');
      await page.locator('[data-ready]').waitFor();
      expect((await scan(page)).violations).toEqual([]);

      await page.getByRole('button', { name: 'Product', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill('Kettle');
      await page.getByRole('button', { name: 'Add offer' }).click();
      await page.getByLabel('Price', { exact: true }).fill('19.99');
      await page.getByRole('button', { name: 'Another type' }).click();
      await page.getByLabel('Search Schema.org types').waitFor();
      if (name === 'narrow') await page.getByRole('button', { name: 'Markup', exact: true }).click();
      expect((await scan(page)).violations).toEqual([]);
    });
  }
}
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @pokerji/web e2e schema.spec.ts`
Expected: the findings tests fail at `getByRole('region', { name: 'What to check' })`; the narrow test fails at `getByRole('button', { name: 'Markup', exact: true })`. The accessibility tests may pass or fail at this point; read any violations they report, since Step 6 must end with none.

- [ ] **Step 4: Write the findings**

`apps/web/src/lib/schema/Findings.svelte`:

```svelte
<script lang="ts">
  import { findingWords, type Finding } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';

  let { builder, onreveal }: { builder: Builder; onreveal: (finding: Finding) => void } = $props();

  const rows = $derived(
    builder.findings.map((finding) => ({ finding, ...findingWords(builder.draft, finding) })),
  );
  const count = (kind: Finding['kind']) =>
    builder.findings.filter((finding) => finding.kind === kind).length;
  const required = $derived(count('missing-required'));
  const recommended = $derived(count('missing-recommended'));
  const other = $derived(builder.findings.length - required - recommended);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // The count is said in words, so the badges are not the only thing that tells them apart.
  const summary = $derived(
    [
      required > 0 ? `${plural(required, 'required field is', 'required fields are')} empty.` : '',
      recommended > 0
        ? `${plural(recommended, 'recommended field is', 'recommended fields are')} empty.`
        : '',
      other > 0 ? `${plural(other, 'value needs', 'values need')} checking.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  const tag = (finding: Finding) =>
    finding.kind === 'missing-required'
      ? { word: 'Required', style: 'owner' }
      : finding.kind === 'missing-recommended'
        ? { word: 'Recommended', style: '' }
        : { word: 'Check', style: 'quiet' };
</script>

<section class="findings" aria-labelledby="findings-heading">
  <h2 id="findings-heading">What to check</h2>
  {#if builder.draft.items.length === 0}
    <p class="hint">Nothing to check yet.</p>
  {:else if rows.length === 0}
    <p class="hint">Nothing is missing, and every value is in the form it should be.</p>
  {:else}
    <p class="summary">{summary}</p>
    <ul>
      {#each rows as row, index (index)}
        <li>
          <button type="button" onclick={() => onreveal(row.finding)}>
            <span class="badge {tag(row.finding).style}">{tag(row.finding).word}</span>
            <span class="text">{row.text}</span>
            <span class="where">{row.where}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .findings h2 {
    margin: 0.9rem 0 0.4rem;
    font-size: 1.25rem;
  }
  .summary,
  .findings .hint {
    margin: 0 0 0.4rem;
  }
  /* A ledger: one finding to a ruled line, as the home page's promises are. */
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  li {
    border-bottom: 1px solid var(--line);
  }
  li button {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 0.1rem 0.6rem;
    width: 100%;
    padding: 0.6rem 0.2rem;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 0;
    font-weight: 400;
  }
  li button:hover:not(:disabled) {
    background: none;
    color: inherit;
  }
  li button:hover .text {
    text-decoration: underline;
    text-decoration-thickness: 0.09em;
    text-underline-offset: 0.2em;
  }
  .where {
    grid-column: 2;
    font-size: 0.95rem;
    color: var(--ink-soft);
    overflow-wrap: anywhere;
  }
</style>
```

- [ ] **Step 5: Put the findings in the rail, and turn the rail into a dock when narrow**

In `apps/web/src/lib/schema/Builder.svelte`:

Add `type Finding` to the import from `'@pokerji/schema-builder'`, and add these imports beside the others:

```ts
  import Findings from './Findings.svelte';
  import { fieldId } from './ids.ts';
```

Add after the `toggleTypes` function:

```ts
  let sheetOpen = $state(false);
  let sheetToggle = $state<HTMLButtonElement>();

  const closeSheet = async () => {
    sheetOpen = false;
    await tick();
    sheetToggle?.focus();
  };

  /** Opens the item a finding is in and puts focus on the field it is about. */
  const reveal = async (finding: Finding) => {
    builder.closed[finding.item] = false;
    sheetOpen = false;
    await tick();
    const at = { key: finding.item, steps: finding.steps };
    document.getElementById(fieldId(at, finding.property, finding.index ?? 0))?.focus();
  };
```

Replace the opening tag of the aside with:

```svelte
  <aside class="output" class:open={sheetOpen} aria-labelledby="markup-heading">
```

Replace the `<div class="bar">…</div>` block with:

```svelte
    <div class="bar">
      <CopyButton
        text={builder.output}
        label="Copy markup"
        primary
        disabled={builder.output === ''}
        onfail={() => (copyRefused = true)}
      />
      <button
        bind:this={sheetToggle}
        type="button"
        class="sheet-toggle"
        aria-expanded={sheetOpen}
        aria-controls="markup-sheet"
        onclick={() => (sheetOpen ? closeSheet() : (sheetOpen = true))}
        >{sheetOpen ? 'Close' : 'Markup'}</button
      >
    </div>
```

Add immediately before the closing `</div>` of `.sheet`, after the hint paragraph:

```svelte
      <Findings {builder} onreveal={reveal} />
```

Move that hint paragraph (the one that begins "Required and recommended fields follow") so that it comes after `<Findings … />`: the findings sit under the markup, and the note about where the rules come from sits under the findings.

Replace the `.bar :global(button)` rule in `<style>` with these rules, and add the rest after the `.sheet .hint` rule:

```css
  /* The rail's first control is the next thing to do, set as the room's Reveal is. */
  .bar :global(button.primary) {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: 0.03em;
    min-height: 3.5rem;
  }
  .sheet-toggle {
    display: none;
  }

  /* ---- Below 64rem the rail is a dock on the bottom edge, as the moderator's is ---- */
  @media (max-width: 63.99rem) {
    .floor {
      /* The dock is fixed, so it takes no room in the grid. */
      grid-template-columns: minmax(0, 1fr);
    }
    .output {
      position: fixed;
      z-index: 5;
      inset: auto 0 0 0;
      display: flex;
      /* The bar comes first in the page and sits at the bottom, under the thumb. */
      flex-direction: column-reverse;
      gap: 0;
      padding: 0.6rem clamp(1rem, 6vw, 5rem) calc(0.6rem + env(safe-area-inset-bottom));
      border: 0;
      border-top: 1px solid var(--line);
      border-radius: 0;
      box-shadow: 0 -6px 18px rgb(17 20 23 / 0.1);
    }
    .bar {
      grid-template-columns: 1fr auto;
    }
    .bar :global(button.primary) {
      font-size: 1.35rem;
      min-height: 3rem;
    }
    .sheet-toggle {
      display: block;
      min-height: 3rem;
    }
    .sheet {
      display: none;
    }
    .output.open .sheet {
      display: grid;
      max-height: 60dvh;
      overflow-y: auto;
      padding-bottom: 0.75rem;
    }
    .code {
      max-height: 40dvh;
    }
    /* Room beneath the page, so the footer can be scrolled clear of the dock. */
    :global(.shell:has(.output)) {
      padding-bottom: calc(5rem + env(safe-area-inset-bottom));
    }
  }
```

The dock's shadow is the value `DESIGN.md` records for the room's dock.

- [ ] **Step 6: Run the typecheck and the tests, and clear any accessibility violation**

Run: `pnpm format && pnpm --filter @pokerji/web typecheck && pnpm --filter @pokerji/web e2e schema.spec.ts`
Expected: 0 errors and 0 warnings; every test in the file passes, the four accessibility tests included.

If an accessibility test reports a violation, fix the page, not the test: the report names the rule and the element. Do not disable a rule. If a violation comes from something outside the builder (the site bar or the footer), stop and record it for the owner instead of changing those.

- [ ] **Step 7: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: findings in the builder, and a dock for the markup on narrow screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The rest of the site

**Files:**
- Modify: `apps/web/src/routes/+layout.svelte`, `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/privacy/+page.svelte`, `apps/web/src/routes/sitemap.xml/+server.ts`
- Test: `apps/web/e2e/site.spec.ts`

**Interfaces:**
- Consumes: the `/schema` page (Task 2).
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Write the failing tests**

In `apps/web/e2e/site.spec.ts`, change each of the three loops over the public pages so that `/schema` is among them:

- In "every public page ends with links to the source and to its maker": `for (const path of ['/', '/poker', '/schema', '/privacy']) {`
- In "public pages describe themselves to search engines and link previews": `for (const path of ['/', '/poker', '/schema', '/privacy']) {`
- In "rooms are kept out of search engines, by header and by robots.txt": `for (const path of ['/', '/poker', '/schema', '/privacy'])`

In that last test, add after `expect(text).not.toMatch(/^Disallow: \/$/m);`:

```ts
  expect(text).not.toContain('Disallow: /schema');
```

Add to the end of the file:

```ts
test('the site offers both tools from the bar and from the home page', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Site' });
  await expect(bar.getByRole('link', { name: 'Planning poker' })).toHaveAttribute('href', '/poker');
  await expect(bar.getByRole('link', { name: 'Schema markup' })).toHaveAttribute('href', '/schema');
  await expect(bar.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');

  await expect(page.getByRole('heading', { level: 2, name: 'Planning poker' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Schema markup builder' })).toBeVisible();
  await page.getByRole('link', { name: 'Build markup' }).click();
  await expect(page).toHaveURL(/\/schema$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
});

test('on a phone the bar keeps the wordmark, Privacy and the theme toggle', async ({ browser }) => {
  const context = await browser.newContext({ ...visitor(), viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Site' });
  await expect(bar.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Planning poker' })).toBeHidden();
  await expect(bar.getByRole('link', { name: 'Schema markup' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('the privacy page says what the builder does with what is typed', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'The schema markup builder' })).toBeVisible();
  await expect(page.getByText('never sent to this site')).toBeVisible();
  await expect(page.getByText('pj-schema-draft')).toBeVisible();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/web e2e site.spec.ts`
Expected: FAIL. The sitemap test fails because `/schema` is not listed; the three new tests fail at the "Schema markup" link and the new heading. The footer and description tests already pass for `/schema`.

- [ ] **Step 3: Add the link to the bar**

In `apps/web/src/routes/+layout.svelte`, replace the site navigation:

```svelte
      <nav aria-label="Site">
        <a href="/poker">Planning poker</a>
        <a href="/schema">Schema markup</a>
        <a href="/privacy">Privacy</a>
      </nav>
```

In its `<style>`, inside `@media (max-width: 34rem)`, replace the selector `nav[aria-label='Site'] a:first-child,` with:

```css
    /* The tools are a tap away on the home page, which the wordmark opens. */
    nav[aria-label='Site'] a:not(:last-child),
```

- [ ] **Step 4: Add the builder to the home page**

In `apps/web/src/routes/+page.svelte`:

Replace the `<Seo … />` element with:

```svelte
<Seo
  title="pokerji: free planning poker and schema markup builder, no sign-up"
  description="Free tools without the sign-up: real-time planning poker for agile teams and a Schema.org JSON-LD markup builder. No account, no trackers."
/>
```

Replace the band's heading and paragraph with:

```svelte
      <h1>Planning poker and schema markup, without the sign-up.</h1>
      <p>
        Free small tools for teams. No accounts, no trackers: open one, use it, get on with the
        work.
      </p>
```

Add a second `<li>` to the `<ul class="programme">`, after the planning poker one:

```svelte
    <li>
      <div>
        <h2>Schema markup builder</h2>
        <p>
          Build Schema.org JSON-LD for articles, products, events, local businesses and more.
          Fill in a form and copy the markup; nothing you type leaves your browser.
        </p>
      </div>
      <a class="button" href="/schema">Build markup</a>
    </li>
```

- [ ] **Step 5: Add the page to the sitemap**

In `apps/web/src/routes/sitemap.xml/+server.ts`:

```ts
const PAGES = ['/', '/poker', '/schema', '/privacy'];
```

- [ ] **Step 6: Add the section to the privacy page**

In `apps/web/src/routes/privacy/+page.svelte`, add immediately before the closing `</main>`:

```svelte
  <h2>The schema markup builder</h2>
  <p>
    The builder at <a href="/schema">/schema</a> runs in your browser. What you type into it is
    never sent to this site: there is no form, no upload and no account behind it.
  </p>
  <p>
    Your draft is kept in your browser’s own storage, on your device, so that a reload does not
    lose it. It stays there until you press Clear or clear your browser’s data. Anyone who uses
    the same browser profile can see it.
  </p>
  <p>
    The builder links to Google’s Rich Results Test and to the Schema.org validator. Nothing is
    sent to either unless you go there and paste your markup yourself.
  </p>
  <p class="how">
    <b>How:</b> the page makes no request that carries your text. The only thing it fetches after
    it has loaded is the list of Schema.org types, a file served by this site. The draft is one
    entry in your browser’s local storage, named <code class="inline">pj-schema-draft</code>.
  </p>
```

Add a `<style>` block to the end of that file (it has none today; if it has one by the time you get here, add the rule to it):

```svelte
<style>
  /* A name in a sentence: the site's code style without its block layout. */
  .inline {
    display: inline;
    padding: 0.05rem 0.3rem;
  }
</style>
```

- [ ] **Step 7: Run the typecheck and the whole browser suite**

Run: `pnpm format && pnpm --filter @pokerji/web typecheck && pnpm --filter @pokerji/web e2e`
Expected: 0 errors and 0 warnings; every browser test passes, including the existing "the home page headline says what the tool is", which still finds "planning poker" in the heading.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat: the builder in the bar, on the home page, in the sitemap and on the privacy page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Screenshots and documents

**Files:**
- Modify: `apps/web/scripts/capture-pages.mjs`
- Modify: `PRODUCT.md`, `README.md`, `CLAUDE.md`, `DESIGN.md`

**Interfaces:**
- Consumes: the finished page.
- Produces: screenshots under `apps/web/.impeccable/review/` (git-ignored), and documents that describe a suite of two tools.

- [ ] **Step 1: Capture the builder's states**

In `apps/web/scripts/capture-pages.mjs`, add inside `pages()`, immediately after the line `await shot(mo, 'privacy');`:

```js
  await mo.goto(`${base}/schema`);
  await mo.locator('[data-ready]').waitFor();
  await shot(mo, 'schema-empty');
  await mo.getByRole('button', { name: 'Product', exact: true }).click();
  await mo.getByLabel('Name', { exact: true }).fill('Sourdough loaf');
  await mo.getByRole('button', { name: 'Add offer' }).click();
  await mo.getByLabel('Price', { exact: true }).fill('6.50');
  await mo.getByLabel('Currency', { exact: true }).fill('USD');
  await mo.getByRole('button', { name: 'Organization', exact: true }).click();
  await mo.getByTestId('item').nth(1).getByLabel('Name', { exact: true }).fill('Acme Bakery');
  await shot(mo, 'schema-filled');
  await mo.getByRole('button', { name: 'Another type' }).click();
  await mo.getByLabel('Search Schema.org types').fill('rest');
  await shot(mo, 'schema-picker');
  if (viewport.width < 1024) {
    await mo.getByRole('button', { name: 'Markup', exact: true }).click();
    await mo.screenshot({ path: `${out}/${name}-schema-sheet.png` });
  }
  await mo.getByRole('button', { name: 'Clear', exact: true }).click();
  await mo.screenshot({ path: `${out}/${name}-schema-confirm.png` });
  await mo.getByRole('button', { name: 'Yes, clear' }).click();
```

Change the last two calls of the file so that each theme is captured at each width:

```js
await pages('pages-desktop-light', { width: 1440, height: 900 }, 'light');
await pages('pages-desktop-dark', { width: 1440, height: 900 }, 'dark');
await pages('pages-mobile-light', { width: 390, height: 844 }, 'light');
await pages('pages-mobile-dark', { width: 390, height: 844 }, 'dark');
```

- [ ] **Step 2: Take the screenshots and look at them once**

Build the app and start it on 127.0.0.1:4398 with the environment `apps/web/scripts/smoke.sh` uses (read that file for the variables), then from `apps/web`:

Run: `node scripts/capture-pages.mjs`
Expected: `captured`, and files named `pages-*-schema-*.png` in `apps/web/.impeccable/review/`.

Look at every `schema` screenshot, in both themes and at both widths, against `DESIGN.md` and the direction document. Check in particular:

- One yellow button on the page, and it is Copy.
- Red only on Remove and Clear.
- The band's title and the first item share a left edge.
- Nothing is cut off, overlaps, or scrolls the page sideways at 390px.
- Dark is as legible as light: badges, the code block's two inks, dashed outlines, disabled buttons.
- The dock does not cover the last field or the footer when the page is scrolled to its end.

Fix everything this one round shows in one batch, rerun the capture once to confirm, and stop. Record anything left that is a matter of taste, not a defect, for the owner.

Also look at `pages-*-home.png` and `pages-*-privacy.png`: the second programme row and the new privacy section should look like their neighbours. Planning poker's own screenshots should be unchanged from before this plan.

- [ ] **Step 3: Update PRODUCT.md**

Replace the "Product Purpose" section's paragraph with:

```markdown
pokerji is a suite of small tools, each free and without an account. Its first tool is a public, realtime planning poker service: create a room, share the link, estimate stories together. Success there is a team going from opening the site to a revealed round in under a minute. Its second is a Schema.org markup builder: fill in a form, copy JSON-LD for your own site. Success there is markup on the clipboard without having read any documentation.
```

Add to the end of the "Users" section:

```markdown

The markup builder is used by one person at a time: a site owner or marketer who does not know the Schema.org vocabulary, or a developer who does, usually at a desk.
```

Add to the "Capabilities and Constraints" list, after the first two bullets:

```markdown
- The markup builder's behaviour is specified in `docs/superpowers/specs/2026-10-13-schema-builder-design.md`. It runs entirely in the browser: nothing typed into it reaches the server. Surface: `/schema`.
```

Replace the sentence in "Stack" that ends "they move to a shared package when a second suite tool needs them." so that it ends:

```markdown
they are shared by both tools from there, and move to a package of their own only if a tool outside `apps/web` needs them.
```

- [ ] **Step 4: Update README.md**

Read the README first. Then:

- In its opening description, where it says what pokerji is, say that it is a suite with two tools and name both, in one or two sentences in the README's own voice.
- In the packages table, add a row after `packages/poker-engine`:

```markdown
| [`packages/schema-builder`](packages/schema-builder) | The markup builder's rules as pure functions: the draft, the JSON-LD it becomes, the ten guided types, the checks, and a reader for the bundled Schema.org vocabulary |
```

- Where the README lists what the app stores or its privacy position, add one sentence: the markup builder stores nothing on the server and sends nothing typed into it.

Do not add screenshots; the owner adds those.

- [ ] **Step 5: Update CLAUDE.md**

In the "Status" section, add a sentence after the first:

```markdown
The second tool, the Schema.org markup builder at `/schema`, is built too; it runs entirely in the browser.
```

In "Commands", add after the poker-engine examples:

```markdown
- The markup builder's package: `pnpm --filter @pokerji/schema-builder test`
```

In "Architecture", add these bullets after the `packages/poker-engine` bullet:

```markdown
- `packages/schema-builder`: the markup builder's rules as pure functions over an immutable draft. `serialize` writes JSON-LD, `check` reports what is missing or malformed, `unpack` reads a stored draft without trusting it. No I/O, no DOM; a test (`purity.test.ts`) enforces that.
- The builder's page (`apps/web/src/routes/schema`, components in `apps/web/src/lib/schema`) has no server code: no form action, no endpoint, no cookie. Nothing typed into it may be sent anywhere; a browser test checks that no request carries typed text. Keep it that way.
- The script-tag form of the markup writes every `<` as `\u003c` (`toScriptTag`), so nothing typed can end the script element on the site it is pasted into. Typed values are rendered as text only, never as HTML.
- The builder's draft lives in local storage under `pj-schema-draft` and is read only through `unpack`, which enforces every limit in `LIMITS`.
- The Schema.org vocabulary is vendored as `apps/web/static/schema/vocabulary.json`, made by `packages/schema-builder/scripts/compact-vocabulary.ts` from a pinned release and recorded with its checksum in `apps/web/static/schema/LICENSES.md` (a test compares them). It is fetched from this site only when the escape hatch is opened. Nothing is fetched from schema.org at build or run time. To move to a new release, follow `LICENSES.md`.
- A guided type's required and recommended levels come from `packages/schema-builder/RULES.md`. Change a level, that file and `RULES_CHECKED` together.
```

In the bullet that begins "Public pages (home, `/poker`, `/privacy`)", add `/schema` to the list of public pages.

- [ ] **Step 6: Update DESIGN.md**

Add a section before "## Do's and Don'ts":

```markdown
## The markup builder

The builder at `/schema` is a sibling of the live room: a band in place of the stage, then a floor (the editor) and a rail (the markup). It adds no colour, typeface, radius or shadow.

- **Layout:** from 64rem, two columns: the editor up to 40rem wide and the rail between 22rem and 36rem, which stays in view while the editor scrolls. Below 64rem the rail is a dock on the bottom edge: Copy at full width, and a Markup button that opens the markup and the findings as a sheet up to 60dvh tall. The page reserves room beneath itself so the footer can be scrolled clear of the dock.
- **The next step:** Copy is the page's one yellow button, set as the room's Reveal is (display face, 800, 1.5rem in the rail and 1.35rem in the dock).
- **Items:** each top-level item is a panel that opens and closes, headed by its type in the display face (800, 1.5rem) and its name in soft ink.
- **Nested group:** an item inside an item is a `fieldset` with its legend in the display face (800, 1.25rem), bounded by a 1px line and stepped in by its own padding. It has no fill: it is not a panel inside a panel.
- **Required and Recommended:** role badges after the field's label. Required is filled (the Owner badge), Recommended is outlined, and an optional field has none. In the findings a third, dashed badge reads Check.
- **Findings:** a ledger, one finding to a ruled line. Each is a button that opens its item and moves focus to its field. Never red, and never told apart by colour alone: the badge carries a word and the count is stated in a sentence above.
- **Code block:** the markup in the system monospace at 0.875rem on the ground colour, bounded by a 1px line. Two inks and no new colour: property names in ink at 650, values in ink, punctuation in soft ink. It scrolls inside itself; the page never scrolls sideways.
- **Search with results:** an ordinary field with its matches in a ruled list directly beneath it, in the flow of the page. Each result is the name at 650 and, for a property, one line about it in soft ink. Nothing floats over the page.
- **Compact button:** 2.25rem tall at 0.95rem, the size of the bar's copy button, for Up, Down, Remove, Add another and the form switch. Always words, never icons.
- **Multi-line field and checkbox:** the input's style on a `textarea`; a native checkbox tinted Pool Aqua like the radios.
- **Not there yet:** before there is markup, a 2px dashed outline in the line colour, as an empty seat is drawn.

### Named Rules
**The Sibling Rule.** A new tool is assembled from this system as it stands. It adds only the components the system lacks, derived from the ones it has, and records them here.

**The Row's Own Step Rule.** On the suite home, each row of the programme carries its own yellow link, because each row is its own next step. Everywhere else the Moving Yellow Rule holds: one yellow button to a screen.
```

In the "Layout" section, add to the breakpoints sentence, after "64rem (rail in place of bar)": ` — the same breakpoint turns the markup builder's rail into its dock`.

In "Do's", add:

```markdown
- **Do** build a new tool from the components already here, and record any you had to add.
```

- [ ] **Step 7: Check and commit**

Run: `pnpm format:check && pnpm test && pnpm typecheck`
Expected: Prettier reports every file formatted; every package's tests pass (`packages/poker-server` needs the services from `pnpm services:up`); the typecheck passes.

```bash
git add apps/web/scripts PRODUCT.md README.md CLAUDE.md DESIGN.md
git commit -m "docs: the suite has two tools; screenshots of the builder's states

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Review

The review checkpoint the owner's workflow calls for. Both reviewers run on the whole branch, `main..feat/schema-builder`.

**Files:**
- Modify: whatever the reviews find.

**Interfaces:**
- Consumes: the finished branch.
- Produces: a reviewed branch and a list of what was found, fixed and left.

- [ ] **Step 1: Run the Octopus code review**

Dispatch `octo:skills:octopus-code-review` on the diff `main..feat/schema-builder`. Give it the two spec paths, both plan paths, this plan's and Plan 1's Review Focus sections, and these points to check deliberately:

- Typing into a field with no value yet keeps focus and the caret.
- A finding lands focus on its field when the item is closed, or the sheet is open on a narrow screen.
- The vocabulary failing to load leaves the guided forms working.
- A restored draft needing the vocabulary fetches it at once.
- No existing rule in `apps/web/src/app.css` was edited, and planning poker's pages are unchanged.

- [ ] **Step 2: Run the Octopus security audit**

Dispatch `octo:skills:octopus-security-audit` on the same diff. Give it the spec's sections 9 (local storage) and 10 (privacy and trust boundaries), and these points to check deliberately:

- Nothing typed into the builder can leave the browser: no request, no URL, no log.
- Nothing typed can become markup on our own page (the code block, item titles, findings, the dialog, option labels).
- The script-tag form cannot be broken out of by a typed value.
- A hostile or oversized value in local storage cannot throw, hang the page or be rendered as HTML.
- The vocabulary file is parsed through its schema before use, and its strings are rendered as text only.
- The Content Security Policy is unchanged, and the page needs no exception to it.
- The two outbound links carry no referrer and load nothing.
- The new development dependency (`@axe-core/playwright`) does not reach the production image.

- [ ] **Step 3: Act on the findings, once**

Sort the findings by what a person using the site would get if each shipped, not by the reviewer's label.

- Anything that breaks a promise the page makes (privacy, safety of the markup, losing a draft, a control that cannot be reached by keyboard) is fixed now. For each: write the test that shows it, watch it fail, fix it, watch it pass.
- Anything else goes in a list for the owner, with a one-line reason.

Then run everything:

Run: `pnpm format:check && pnpm test && pnpm typecheck && pnpm --filter @pokerji/web e2e`
Expected: all pass.

- [ ] **Step 4: Commit the fixes**

```bash
git add -A
git commit -m "fix: apply the code review and security audit to the schema builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If the reviews found nothing to fix, there is nothing to commit; say so in the report.

- [ ] **Step 5: Report**

Tell the owner: what each review found, what was fixed and how it was proven, what was left and why, and that the branch is ready for them to merge or to look at first. Deployment is the owner's action.
