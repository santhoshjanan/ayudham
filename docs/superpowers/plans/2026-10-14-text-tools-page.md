# Text Tools Page and Release (Plan 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/text` page on top of `packages/text-tools`, add it to the bar, the home page, the sitemap and the privacy page, prove in a browser that nothing typed or generated leaves or is stored, and take it through review.

**Architecture:** A thin SvelteKit page with no server code. One small component per tool, each holding only its options and calling the package; a shared `Frame` lays out the floor and the rail and owns the yellow button, the result rows and the status box. The tools render only after the page has mounted in the browser, so the server never generates a value.

**Tech Stack:** SvelteKit 3, Svelte 5 (runes), TypeScript, Playwright with axe, pnpm 11.25, Node 24+.

**Spec:** `docs/superpowers/specs/2026-10-14-text-tools-design.md` (behaviour) and `docs/superpowers/specs/2026-10-14-text-tools-design-direction.md` (design). Read both. Read `DESIGN.md` before any UI step.

## Where this plan sits

Plan 1 (`2026-10-14-text-tools-core.md`) is done: `packages/text-tools` exists on branch `feat/text-tools` with 190 passing tests, and the EFF word list is vendored at `apps/web/static/text/`. This plan is the rest.

Unlike Plan 1, the code in this plan has not been run. Treat each code block as the intended design: if `svelte-check`, the build or a browser test disagrees, fix the code to satisfy the spec and record what changed.

Facts established on 2026-10-14 while writing this plan:

- `Dockerfile` copies all of `packages/`, so the new package reaches the image without a change. `compose-dev.yaml` and `docker-compose.yaml` are not touched.
- On a phone the bar already hides every site link except Privacy (`apps/web/src/routes/+layout.svelte`, the rule under `max-width: 34rem`), so a fourth link cannot make it overflow.
- `CopyButton` has no way to give a button its own accessible name or the compact size; Task 1 adds both as optional properties.
- The system has no checkbox. On-or-off options are toggle buttons with `aria-pressed`, as Script tag and Raw JSON are in the builder.
- The class name `toggle` is taken by the theme toggle in the bar. Do not reuse it.
- Browser tests build the app and serve it on `127.0.0.1:4173`; they need Postgres and Valkey (`pnpm services:up`).

## Global Constraints

- No server code for this tool: no `+page.server.ts`, no `+server.ts`, no form action, no cookie, no metric, no log line.
- Nothing typed or generated is written to `localStorage`, `sessionStorage`, a cookie, the query string or the path. Only the tool's name goes in the fragment.
- The tools render only after `onMount`. The server's HTML for `/text` must never contain a generated value.
- `Math.random` is not used anywhere. Randomness is `random` from `apps/web/src/lib/text/random.ts`.
- Typed and generated values are rendered as text (`{value}`), never with `{@html}`.
- Every text input and `textarea` on the page sets `spellcheck="false"`, `autocomplete="off"`, `autocapitalize="off"` and `autocorrect="off"`.
- No inline styles: no `style` attribute and no Svelte `transition:`, `in:`, `out:` or `animate:`.
- No raw colours in components; tokens from `apps/web/src/app.css` only. No new token.
- One yellow button on the page, and it is the rail's first control. No red on this page.
- Imports through `#lib` carry the file extension. Package imports are `@pokerji/text-tools`.
- No new dependency.
- Every new browser context in a test uses `visitor()`.
- Format with `pnpm format` before each commit. End commit messages with the session's attribution line.
- Do not add a proxy configuration, a deployment script or anything specific to a server.

## Review Focus

Conditions the spec implies but does not spell out, most likely first. Each has a test in the task named.

1. **The server generating a secret.** SvelteKit renders pages on the server, where a random source exists. A reasonable person expects a password never to be made anywhere but their browser. Test in Task 1 (the page's HTML holds no result).
2. **A number field left empty or holding a letter.** The field gives the page no number. The person expects a sentence naming the limits and the last good results still there, not a blank rail or a crash. Test in Task 2.
3. **Opening a link straight to a tool, and using Back.** `/text#hash` must open Hash on first load; Back must return to the tool before. Test in Task 3.
4. **A very long result on a phone.** A 256-character password or a 100,000-character Base64 value must wrap inside its row and never make the page scroll sideways. Test in Task 4.
5. **The word list arriving damaged or not at all.** The passphrase tool must say so and offer Try again; every other tool must keep working. Test in Task 2.

## File Structure

```
apps/web/
  package.json                          + @pokerji/text-tools
  src/app.css                           + three layout classes for the text tools
  src/lib/ui/CopyButton.svelte          + optional `about` and `compact`
  src/lib/text/
    tools.ts            the list of tools, the fragment reader, Row, say, joined
    random.ts           the browser's random source
    wordlist.svelte.ts  fetches and checks the word list, once
    Frame.svelte        floor and rail; the yellow button, results, status
    ResultRow.svelte    one result on a ruled line
    ToolRow.svelte      the Generate and Convert rows of links
    NumberField.svelte  a labelled number input with its limits
    Toggle.svelte       an on-or-off button
    TextBox.svelte      a labelled textarea with the page's field rules
    Password.svelte  Passphrase.svelte  RandomString.svelte  Numbers.svelte
    Identifier.svelte  Chance.svelte
    Case.svelte  Slug.svelte  Encode.svelte  Hash.svelte  Lines.svelte  Count.svelte
  src/routes/text/+page.svelte          the page
  src/routes/+layout.svelte             + bar link
  src/routes/+page.svelte               heading, third row, title
  src/routes/privacy/+page.svelte       + a section
  src/routes/sitemap.xml/+server.ts     + /text
  e2e/text.spec.ts                      new
  e2e/site.spec.ts                      updated for three tools
  scripts/capture-pages.mjs             + the text tools' states
PRODUCT.md  DESIGN.md  CLAUDE.md  README.md   updated
```

---

### Task 1: The page shell and the password tool

**Files:**
- Modify: `apps/web/package.json`, `apps/web/src/app.css`, `apps/web/src/lib/ui/CopyButton.svelte`
- Create: `apps/web/src/lib/text/tools.ts`, `random.ts`, `Frame.svelte`, `ResultRow.svelte`, `ToolRow.svelte`, `NumberField.svelte`, `Toggle.svelte`, `Password.svelte`
- Create: `apps/web/src/routes/text/+page.svelte`
- Test: `apps/web/e2e/text.spec.ts`

**Interfaces:**
- Consumes from `@pokerji/text-tools`: `LIMITS`, `many`, `password`, `passwordBits`, `PASSWORD_DEFAULTS`, `explain`, `type Problem`, `type RandomSource`.
- Produces, from `tools.ts`: `TOOLS` (each `{ id, group, label }`), `GROUPS`, `type ToolId`, `toolFrom(hash: string): ToolId`, `type Row = { name?: string; value: string; plain?: boolean }`, `say(problem: Problem, range?: string): string`, `joined(rows: Row[]): string`.
- Produces, from `random.ts`: `random: RandomSource`.
- Produces `Frame` with properties `title: string`, `blurb: string`, `rows: Row[]`, `problem?: string`, `strength?: number`, `waiting: string`, `again?: () => void`, `retry?: () => void`, `made?: string`, `children: Snippet` (the options) and `note?: Snippet`.
- Produces `NumberField` (`id`, `label`, `min`, `max`, bindable `value`), `Toggle` (`label`, bindable `on`).
- `CopyButton` gains optional `about?: string` (added to the button's accessible name) and `compact?: boolean`.
- Test hooks the later tasks rely on: `[data-ready]` on the tools' wrapper, `data-testid="result"` on each result row with its value in `.value`.

- [ ] **Step 1: Add the package to the web app**

In `apps/web/package.json`, add this line to `devDependencies`, after `@pokerji/schema-builder`:

```json
    "@pokerji/text-tools": "workspace:*",
```

Run: `pnpm install`
Expected: `Done`, with no new package downloaded.

- [ ] **Step 2: Write the failing browser test**

Create `apps/web/e2e/text.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.9.${visitors >> 8}.${visitors & 255}` },
  };
};

const WIDE = { width: 1280, height: 900 };
const NARROW = { width: 390, height: 844 };

/** A page on the text tools, hydrated, with the clipboard allowed. */
const open = async (browser: Browser, hash = '', viewport = WIDE): Promise<Page> => {
  const context = await browser.newContext({
    ...visitor(),
    viewport,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto(`/text${hash}`);
  await page.locator('[data-ready]').waitFor();
  return page;
};

const results = (page: Page) => page.getByTestId('result');
const values = (page: Page) => page.getByTestId('result').locator('.value').allTextContents();
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const rail = (page: Page) => page.getByRole('complementary', { name: 'Results' });
const status = (page: Page) => rail(page).locator('p[role="status"]');
// WCAG 2.2 AA, the standard the design direction names.
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

test('the page opens on a strong password that one press copies', async ({ browser }) => {
  const page = await open(browser);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Text tools');
  await expect(page.getByRole('heading', { level: 2, name: 'Password', exact: true })).toBeVisible();
  await expect(results(page)).toHaveCount(1);
  const [made = ''] = await values(page);
  expect(made).toHaveLength(20);
  await expect(rail(page)).toContainText('128 bits');

  await page.getByRole('button', { name: 'Copy result 1' }).click();
  await expect(page.getByRole('button', { name: 'Copied result 1' })).toBeVisible();
  expect(await clipboard(page)).toBe(made);
});

test('Generate again is the one yellow button, and it makes a new password', async ({ browser }) => {
  const page = await open(browser);
  const [first] = await values(page);
  await expect(page.locator('button.primary, a.button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Generate again' }).click();
  await expect.poll(async () => (await values(page))[0]).not.toBe(first);
});

test('the server never makes a value: the page arrives without one', async ({ browser }) => {
  const context = await browser.newContext(visitor());
  const html = await (await context.request.get('/text')).text();
  expect(html).toContain('Text tools');
  expect(html).not.toContain('data-testid="result"');
  expect(html).not.toContain('Generate again');
});

test('without JavaScript the page says what it is and that it needs JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ ...visitor(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/text');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Text tools');
  // Playwright's text search skips noscript, so the element is found by its tag.
  await expect(page.locator('noscript p')).toContainText('need JavaScript');
  await expect(page.getByText('never sent to this site')).toBeVisible();
  await expect(results(page)).toHaveCount(0);
});
```

`scan`, `NARROW` and `status` are used from Task 2 on; leave them in.

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm services:up && pnpm --filter @pokerji/web exec playwright test e2e/text.spec.ts`
Expected: FAIL. The first two tests time out waiting for `[data-ready]`; the last two fail because `/text` is not found.

- [ ] **Step 4: Give `CopyButton` a name and a compact size**

Replace `apps/web/src/lib/ui/CopyButton.svelte` with:

```svelte
<script lang="ts">
  let {
    text,
    label,
    about,
    primary = false,
    compact = false,
    disabled = false,
    onfail,
  }: {
    text: string;
    label: string;
    /** What this button copies, when the page has several: added to its name for screen readers. */
    about?: string;
    /** The page's one next step. */
    primary?: boolean;
    /** The size of a control that repeats. */
    compact?: boolean;
    disabled?: boolean;
    /** Called when the browser refuses the clipboard. */
    onfail?: () => void;
  } = $props();
  let copied = $state(false);
  const shown = $derived(copied ? 'Copied' : label);

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

<button
  type="button"
  class:primary
  class:compact
  {disabled}
  aria-label={about ? `${shown} ${about}` : undefined}
  onclick={copy}>{shown}</button
>
<span class="sr-only" role="status">{copied ? 'Copied' : ''}</span>
```

- [ ] **Step 5: Add the layout classes**

Append to `apps/web/src/app.css`:

```css
/* ---- Added for the text tools: how a tool's options are set out ---- */

/* One labelled control and its hint. */
.field {
  margin: 0 0 1.1rem;
}
.field .hint {
  display: block;
  margin-top: 0.3rem;
}
/* A number or a choice does not need the column's whole width. */
.field input[type='number'],
.field select {
  max-width: 16rem;
}

/* A set of on-or-off buttons, wrapping as the builder's types do. */
.switches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 1.1rem;
}
```

- [ ] **Step 6: Write the helpers**

Create `apps/web/src/lib/text/tools.ts`:

```ts
import { explain, type Problem } from '@pokerji/text-tools';

export const GROUPS = ['Generate', 'Convert'] as const;

/** Every tool, in the order the page offers them. An id is also the tool's fragment. */
export const TOOLS = [
  { id: 'password', group: 'Generate', label: 'Password' },
  { id: 'passphrase', group: 'Generate', label: 'Passphrase' },
  { id: 'random', group: 'Generate', label: 'Random string' },
  { id: 'number', group: 'Generate', label: 'PIN and number' },
  { id: 'id', group: 'Generate', label: 'Identifier' },
  { id: 'chance', group: 'Generate', label: 'Chance' },
  { id: 'case', group: 'Convert', label: 'Case' },
  { id: 'slug', group: 'Convert', label: 'Slug' },
  { id: 'encode', group: 'Convert', label: 'Encode and decode' },
  { id: 'hash', group: 'Convert', label: 'Hash' },
  { id: 'lines', group: 'Convert', label: 'Lines' },
  { id: 'count', group: 'Convert', label: 'Count' },
] as const;

export type ToolId = (typeof TOOLS)[number]['id'];

/**
 * The tool an address fragment names. The fragment is whatever someone put in a link, so it is
 * only ever compared with the list; anything else opens the first tool.
 */
export function toolFrom(hash: string): ToolId {
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
  return TOOLS.find((tool) => tool.id === name)?.id ?? 'password';
}

/** One result in the rail. `plain` marks a value there is no point copying alone, such as a count. */
export type Row = { name?: string; value: string; plain?: boolean };

/** The sentence for a refusal. A tool supplies its own for an option outside its limits. */
export const say = (problem: Problem, range?: string): string =>
  problem === 'out-of-range' && range ? range : explain(problem);

/** Every result as lines of text, for Copy all. */
export const joined = (rows: Row[]): string =>
  rows.map((row) => (row.name ? `${row.name}: ${row.value}` : row.value)).join('\n');
```

Create `apps/web/src/lib/text/random.ts`:

```ts
import type { RandomSource } from '@pokerji/text-tools';

/**
 * The browser's cryptographic random source, and the only one this page uses. Where a browser
 * has none this throws, which the package answers with a refusal: there is no fallback.
 */
export const random: RandomSource = (count) => crypto.getRandomValues(new Uint8Array(count));
```

- [ ] **Step 7: Write the shared components**

Create `apps/web/src/lib/text/NumberField.svelte`:

```svelte
<script lang="ts">
  let {
    id,
    label,
    min,
    max,
    value = $bindable(),
  }: { id: string; label: string; min: number; max: number; value: number } = $props();
</script>

<p class="field">
  <label for={id}>{label}</label>
  <input
    {id}
    type="number"
    inputmode="numeric"
    {min}
    {max}
    step="1"
    autocomplete="off"
    aria-describedby="{id}-hint"
    bind:value
  />
  <span class="hint" id="{id}-hint">{min.toLocaleString('en')} to {max.toLocaleString('en')}</span>
</p>
```

Create `apps/web/src/lib/text/Toggle.svelte`:

```svelte
<script lang="ts">
  let { label, on = $bindable() }: { label: string; on: boolean } = $props();
</script>

<button type="button" class="compact" aria-pressed={on} onclick={() => (on = !on)}>{label}</button>

<style>
  /* On is the inverted fill, as the builder's Script tag and Raw JSON are. */
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
```

Create `apps/web/src/lib/text/ResultRow.svelte`:

```svelte
<script lang="ts">
  import CopyButton from '#lib/ui/CopyButton.svelte';
  import type { Row } from './tools.ts';

  let { row, about, onfail }: { row: Row; about: string; onfail: () => void } = $props();
</script>

<li data-testid="result">
  <div class="what">
    {#if row.name}<span class="name">{row.name}</span>{/if}
    <span class="value">{row.value}</span>
  </div>
  {#if !row.plain}
    <CopyButton text={row.value} label="Copy" {about} compact {onfail} />
  {/if}
</li>

<style>
  /* One result to a ruled line, as a finding is in the builder. */
  li {
    display: flex;
    gap: 0.75rem;
    align-items: start;
    justify-content: space-between;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--line);
  }
  .what {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .name {
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  /* The code block's type. A value wraps anywhere: nothing is cut short, nothing scrolls sideways. */
  .value {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.875rem;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  li :global(button) {
    flex: none;
  }
</style>
```

Create `apps/web/src/lib/text/Frame.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import CopyButton from '#lib/ui/CopyButton.svelte';
  import ResultRow from './ResultRow.svelte';
  import { joined, type Row } from './tools.ts';

  let {
    title,
    blurb,
    rows,
    problem,
    strength,
    waiting,
    again,
    retry,
    made,
    children,
    note,
  }: {
    title: string;
    blurb: string;
    rows: Row[];
    /** Why there is no result, in a sentence. */
    problem?: string;
    /** Bits, where the tool has a strength to state. */
    strength?: number;
    /** What the rail says before there is a result. */
    waiting: string;
    /** A generator passes this, which makes Generate again the next step. */
    again?: () => void;
    /** Offered beside a problem that trying again might cure. */
    retry?: () => void;
    /** Said once to a screen reader when a generator makes its results. */
    made?: string;
    /** The tool's options. */
    children: Snippet;
    /** Something the person should know about these results. */
    note?: Snippet;
  } = $props();

  let copyRefused = $state(false);
  const refused = () => (copyRefused = true);

  // A generator keeps its last good results while an option is outside its limits.
  let last = $state.raw<Row[]>([]);
  $effect.pre(() => {
    if (rows.length > 0) last = rows;
  });
  const shown = $derived(rows.length > 0 || !again ? rows : last);
  const about = (row: Row, index: number): string => row.name ?? `result ${index + 1}`;
</script>

<div class="floor">
  <section class="options" aria-labelledby="tool-heading">
    <h2 id="tool-heading">{title}</h2>
    <p class="hint">{blurb}</p>
    {@render children()}
  </section>

  <aside class="rail" aria-label="Results">
    <div class="next">
      {#if again}
        <button type="button" class="primary" onclick={again}>Generate again</button>
      {:else}
        <CopyButton
          text={joined(shown)}
          label={shown.length > 1 ? 'Copy all' : 'Copy'}
          primary
          disabled={shown.length === 0}
          onfail={refused}
        />
      {/if}
    </div>
    {#if strength !== undefined}
      <p class="strength">Strength: <b>{strength.toLocaleString('en')} bits</b></p>
    {/if}
    {#if copyRefused}
      <p role="status">Copying was refused. Select the text below and copy it by hand.</p>
    {/if}
    {#if problem}
      <p role="status">{problem}</p>
      {#if retry}
        <p class="retry"><button type="button" onclick={retry}>Try again</button></p>
      {/if}
    {/if}
    {#if shown.length > 0}
      <ul>
        {#each shown as row, index (index)}
          <ResultRow {row} about={about(row, index)} onfail={refused} />
        {/each}
      </ul>
      {#if again && shown.length > 1}
        <p class="all"><CopyButton text={joined(shown)} label="Copy all" onfail={refused} /></p>
      {/if}
    {:else if !problem}
      <p class="empty">{waiting}</p>
    {/if}
    {@render note?.()}
    <span class="sr-only" role="status">{made ?? ''}</span>
  </aside>
</div>

<style>
  /* The floor: the options, and the results' rail on one edge, as in the builder. */
  .floor {
    display: grid;
    gap: 2rem;
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 6vw, 5rem) clamp(1.5rem, 4vw, 3rem);
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
  }
  @media (min-width: 64rem) {
    .floor {
      grid-template-columns: minmax(0, 40rem) minmax(22rem, 36rem);
      gap: 2.5rem;
    }
  }
  .options {
    min-width: 0;
  }
  .options h2 {
    margin-top: 0;
  }
  .options > .hint {
    margin-bottom: 1.4rem;
  }

  /* The rail: the results, staying in view while the options scroll. */
  .rail {
    display: grid;
    gap: 0.6rem;
    padding: 1.1rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  @media (min-width: 64rem) {
    .rail {
      position: sticky;
      top: 1rem;
      max-height: calc(100dvh - 2rem);
      overflow-y: auto;
    }
  }
  .next {
    display: grid;
  }
  /* The rail's first control is the next thing to do, set as the room's Reveal is. */
  .next :global(button.primary) {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: 0.03em;
    min-height: 3.5rem;
  }
  .strength,
  .retry,
  .all {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  .all {
    margin-top: 0.4rem;
  }
  /* Not there yet: the dashed outline of an empty seat. */
  .empty {
    margin: 0;
    padding: 1.5rem 1rem;
    border: 2px dashed var(--line);
    border-radius: var(--radius);
    color: var(--ink-soft);
  }
  .rail :global(.hint) {
    margin: 0.2rem 0 0;
  }
</style>
```

Create `apps/web/src/lib/text/ToolRow.svelte`:

```svelte
<script lang="ts">
  import { GROUPS, TOOLS, type ToolId } from './tools.ts';

  let { current }: { current: ToolId } = $props();
</script>

<nav aria-label="Tools">
  {#each GROUPS as group (group)}
    <div class="group">
      <h2>{group}</h2>
      <ul>
        {#each TOOLS.filter((tool) => tool.group === group) as tool (tool.id)}
          <li>
            <a href="#{tool.id}" aria-current={tool.id === current ? 'true' : undefined}
              >{tool.label}</a
            >
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  nav {
    display: grid;
    gap: 1.1rem;
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 6vw, 5rem) 0;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.25rem;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* A link drawn as the system's compact button: each names a place, the tool's fragment. */
  a {
    display: inline-flex;
    align-items: center;
    min-height: 2.25rem;
    padding: 0.2rem 0.7rem;
    font-size: 0.95rem;
    font-weight: 650;
    text-decoration: none;
    color: var(--ink);
    background: var(--surface);
    border: 1.5px solid var(--ink);
    border-radius: var(--radius);
  }
  a:hover,
  a[aria-current='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
```

- [ ] **Step 8: Write the password tool**

Create `apps/web/src/lib/text/Password.svelte`:

```svelte
<script lang="ts">
  import {
    LIMITS,
    many,
    password,
    passwordBits,
    PASSWORD_DEFAULTS,
  } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import Toggle from './Toggle.svelte';
  import { say } from './tools.ts';

  const options = $state({ ...PASSWORD_DEFAULTS });
  let count = $state(1);
  let turn = $state(0);

  const RANGE = `Length must be ${LIMITS.passwordMin} to ${LIMITS.length}, and how many 1 to ${LIMITS.results}.`;

  // Made again whenever an option changes, and when Generate again adds a turn.
  const made = $derived.by(() => {
    void turn;
    return many(count, () => password(options, random));
  });
  const bits = $derived(passwordBits(options));
</script>

<Frame
  title="Password"
  blurb="Random characters, with at least one of every kind you leave on."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, RANGE)}
  strength={bits.ok ? bits.value : undefined}
  waiting="A password appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <NumberField
    id="t-length"
    label="Length"
    min={LIMITS.passwordMin}
    max={LIMITS.length}
    bind:value={options.length}
  />
  <div class="switches" role="group" aria-label="Characters to use">
    <Toggle label="Lowercase" bind:on={options.lower} />
    <Toggle label="Uppercase" bind:on={options.upper} />
    <Toggle label="Digits" bind:on={options.digits} />
    <Toggle label="Symbols" bind:on={options.symbols} />
  </div>
  <div class="switches">
    <Toggle label="No look-alikes" bind:on={options.plain} />
  </div>
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
```

- [ ] **Step 9: Write the page**

Create `apps/web/src/routes/text/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Password from '#lib/text/Password.svelte';
  import ToolRow from '#lib/text/ToolRow.svelte';
  import { toolFrom, type ToolId } from '#lib/text/tools.ts';
  import Seo from '#lib/ui/Seo.svelte';

  // The tools are drawn only once the page is running in a browser. The server could make a
  // password too, and then it would cross the network: so the server is never asked to.
  let ready = $state(false);
  let tool = $state<ToolId>('password');

  onMount(() => {
    const read = () => (tool = toolFrom(location.hash));
    read();
    ready = true;
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  });
</script>

<Seo
  title="Text tools: password generator, case converter and more · pokerji"
  description="Generate passwords, passphrases, random strings and UUIDs; convert case, Base64, hex and more. Free, no sign-up, and nothing leaves your browser."
/>

<header class="band">
  <div class="band-inner flush">
    <h1>Text tools</h1>
    <p>
      Make a password, an identifier or a random string, or turn text into another form. Nothing
      you type or make leaves your browser.
    </p>
  </div>
</header>

<main class="bleed">
  <noscript>
    <p class="noscript" role="status">
      The text tools need JavaScript, because they run in your browser and nowhere else. Turn
      JavaScript on for this site to use them.
    </p>
  </noscript>

  {#if ready}
    <div data-ready>
      <ToolRow current={tool} />
      <Password />
    </div>
  {/if}

  <section class="about">
    <h2>What these do</h2>
    <p>
      The generators make passwords, passphrases, random strings, PINs, numbers and identifiers,
      and roll dice, flip coins and pick from a list. Every one draws from your browser’s
      cryptographic random source, and no choice is weighted. The strength shown for a password
      or a passphrase is the true figure for the rule that made it.
    </p>
    <p>
      The converters change the case of text, make a slug for an address, encode and decode
      Base64, hex, URL and HTML entities, hash text with SHA-2, tidy a list of lines, and count
      characters, words, lines and bytes.
    </p>

    <h2>Where your text goes</h2>
    <p>
      Nowhere. What you type and what is made are never sent to this site, and nothing is kept:
      not in this browser, not anywhere. Close the tab and it is gone. A value you copy stays on
      your clipboard until you copy something else.
      <a href="/privacy">Read exactly what is stored</a>
    </p>
    <p class="hint">
      Passphrases use the
      <a href="https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases" rel="noopener"
        >EFF long word list</a
      >, by the Electronic Frontier Foundation, under the
      <a href="https://creativecommons.org/licenses/by/3.0/us/" rel="noopener"
        >Creative Commons Attribution 3.0 United States licence</a
      >. <a href="/text/LICENSES.md">The file and its checksum</a>
    </p>
  </section>
</main>

<style>
  /* The band's words share the floor's gutter, as the builder's do. */
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

- [ ] **Step 10: Run the checks**

Run: `pnpm --filter @pokerji/web typecheck`
Expected: `0 ERRORS 0 WARNINGS`. If `autocorrect` or another attribute is refused by the checker anywhere in this plan, keep the attribute and pass it through a spread (`{...{ autocorrect: 'off' }}`); do not drop it.

Run: `pnpm --filter @pokerji/web exec playwright test e2e/text.spec.ts`
Expected: PASS, 4 tests.

Run: `pnpm --filter @pokerji/web exec playwright test e2e/schema.spec.ts`
Expected: PASS. `CopyButton` changed, and the builder uses it.

- [ ] **Step 11: Commit**

```bash
pnpm format
git add apps/web pnpm-lock.yaml
git commit -m "feat: the text tools page, with the password tool"
```

---

### Task 2: The other generators

**Files:**
- Create: `apps/web/src/lib/text/wordlist.svelte.ts`, `Passphrase.svelte`, `RandomString.svelte`, `Numbers.svelte`, `Identifier.svelte`, `Chance.svelte`, `TextBox.svelte`
- Modify: `apps/web/src/routes/text/+page.svelte`
- Test: `apps/web/e2e/text.spec.ts`

**Interfaces:**
- Consumes: `Frame`, `NumberField`, `Toggle`, `random`, `say`, `Row` from Task 1.
- Consumes from `@pokerji/text-tools`: `passphrase`, `passphraseBits`, `PASSPHRASE_DEFAULTS`, `SEPARATORS`, `readWordList`, `WORD_LIST_SHA256`, `toHex`, `randomString`, `stringBits`, `STRING_SIZES`, `pin`, `numberBetween`, `identifier`, `TIMED_IDS`, `dice`, `coins`, `pick`, `many`, `LIMITS`, and their option types.
- Produces: `wordList` (a single object with `state: 'idle' | 'loading' | 'ready' | 'failed'`, `words: string[]`, `load(): Promise<void>`, `retry(): Promise<void>`); `TextBox` (`id`, `label`, bindable `value`, optional `rows`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/e2e/text.spec.ts`:

```ts
test('options change what is made, and several can be made and copied at once', async ({
  browser,
}) => {
  const page = await open(browser);
  for (const off of ['Lowercase', 'Uppercase', 'Symbols']) {
    await page.getByRole('button', { name: off, exact: true }).click();
  }
  await page.getByLabel('Length', { exact: true }).fill('8');
  await page.getByLabel('How many', { exact: true }).fill('5');
  await expect(results(page)).toHaveCount(5);
  const made = await values(page);
  for (const value of made) expect(value).toMatch(/^[0-9]{8}$/);
  await expect(rail(page)).toContainText('26 bits');

  await page.getByRole('button', { name: 'Copy all' }).click();
  expect(await clipboard(page)).toBe(made.join('\n'));

  await page.getByRole('button', { name: 'No look-alikes' }).click();
  await expect(page.getByRole('button', { name: 'No look-alikes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const value of await values(page)) expect(value).toMatch(/^[2-9]{8}$/);
});

test('a number field left empty or out of range names the limit and keeps the last results', async ({
  browser,
}) => {
  const page = await open(browser);
  const [before] = await values(page);
  for (const typed of ['', '7', '257', '12.5']) {
    await page.getByLabel('Length', { exact: true }).fill(typed);
    await expect(status(page)).toContainText('Length must be 8 to 256');
    expect(await values(page)).toEqual([before]);
  }
  await page.getByLabel('Length', { exact: true }).fill('12');
  await expect(status(page)).toHaveCount(0);
  expect((await values(page))[0]).toHaveLength(12);

  for (const off of ['Lowercase', 'Uppercase', 'Digits', 'Symbols']) {
    await page.getByRole('button', { name: off, exact: true }).click();
  }
  await expect(status(page)).toContainText('Choose at least one kind of character');
});

test('the word list is fetched once, and only when the passphrase tool is opened', async ({
  browser,
}) => {
  const page = await open(browser);
  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(new URL(request.url()).pathname));
  await page.getByRole('button', { name: 'Generate again' }).click();
  await page.getByRole('link', { name: 'Random string' }).click();
  await expect(results(page)).toHaveCount(1);
  expect(fetched).toEqual([]);

  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(results(page)).toHaveCount(1);
  const [phrase = ''] = await values(page);
  expect(phrase.split('-')).toHaveLength(6);
  expect(phrase).toMatch(/^[a-z]+(-[a-z]+)+$/);
  await expect(rail(page)).toContainText('77 bits');

  await page.getByRole('button', { name: 'Capitals' }).click();
  await page.getByRole('button', { name: 'Add a digit' }).click();
  await page.getByLabel('Separator').selectOption({ label: 'Full stop' });
  await page.getByLabel('Words', { exact: true }).fill('4');
  const [changed = ''] = await values(page);
  expect(changed.split('.')).toHaveLength(4);
  expect(changed).toMatch(/[0-9]/);
  expect(changed).toMatch(/^[A-Z]/);

  await page.getByRole('link', { name: 'Password' }).click();
  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(results(page)).toHaveCount(1);
  expect(fetched).toEqual(['/text/eff_large_wordlist.txt']);
});

test('a word list that does not arrive, or arrives changed, is refused and can be retried', async ({
  browser,
}) => {
  const page = await open(browser);
  let mode: 'missing' | 'changed' | 'real' = 'missing';
  await page.route('**/text/eff_large_wordlist.txt', async (route) => {
    if (mode === 'missing') return route.abort();
    if (mode === 'real') return route.continue();
    const real = await route.fetch();
    return route.fulfill({ response: real, body: (await real.text()).replace('abacus', 'abacas') });
  });

  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(status(page)).toContainText('word list could not be loaded');
  await expect(results(page)).toHaveCount(0);

  mode = 'changed';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toContainText('word list could not be loaded');
  await expect(results(page)).toHaveCount(0);

  // The other tools are unaffected.
  await page.getByRole('link', { name: 'Password' }).click();
  await expect(results(page)).toHaveCount(1);

  mode = 'real';
  await page.getByRole('link', { name: 'Passphrase' }).click();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(results(page)).toHaveCount(1);
  await expect(status(page)).toHaveCount(0);
});

test('random strings come in every kind', async ({ browser }) => {
  const page = await open(browser, '#random');
  const kind = page.getByLabel('Kind', { exact: true });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9a-f]{32}$/);
  await expect(rail(page)).toContainText('128 bits');

  await kind.selectOption({ label: 'Base64' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  await kind.selectOption({ label: 'Base64URL' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await kind.selectOption({ label: 'Digits' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9]{16}$/);
  await kind.selectOption({ label: 'Letters' });
  await page.getByLabel('Letters', { exact: true }).selectOption({ label: 'Lowercase' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[a-z]{16}$/);
  await kind.selectOption({ label: 'Letters and digits' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9]{24}$/);

  await kind.selectOption({ label: 'Your own characters' });
  await expect(status(page)).toContainText('between 2 and 256 characters');
  await page.getByLabel('Characters to use').fill('xy');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[xy]{16}$/);
  await page.getByLabel('Characters to use').fill('xx');
  await expect(status(page)).toContainText('same character twice');
});

test('PINs, numbers, identifiers and chance all give results', async ({ browser }) => {
  const page = await open(browser, '#number');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9]{6}$/);
  await page.getByLabel('Make', { exact: true }).selectOption({ label: 'A number in a range' });
  await page.getByLabel('From', { exact: true }).fill('10');
  await page.getByLabel('To', { exact: true }).fill('12');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^1[0-2]$/);

  await page.getByRole('link', { name: 'Identifier' }).click();
  const kind = page.getByLabel('Kind', { exact: true });
  await expect
    .poll(async () => (await values(page))[0])
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(rail(page)).not.toContainText('contains the time');
  await kind.selectOption({ label: 'UUID version 7' });
  await expect
    .poll(async () => (await values(page))[0])
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(rail(page)).toContainText('contains the time');
  await kind.selectOption({ label: 'ULID' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  await kind.selectOption({ label: 'Short id' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9_-]{21}$/);

  await page.getByRole('link', { name: 'Chance' }).click();
  await page.getByLabel('Dice', { exact: true }).fill('3');
  await expect(results(page)).toHaveCount(4);
  const rolled = await values(page);
  expect(rolled.slice(0, 3).every((roll) => /^[1-6]$/.test(roll))).toBe(true);
  expect(Number(rolled[3])).toBe(rolled.slice(0, 3).reduce((sum, roll) => sum + Number(roll), 0));

  await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A coin' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^(Heads|Tails)$/);

  await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A list of your own' });
  await expect(status(page)).toContainText('Type at least one line');
  await page.getByLabel('List', { exact: true }).fill('Ann\nBo\nCy\n');
  await page.getByLabel('How many to pick').fill('2');
  await expect(results(page)).toHaveCount(2);
  const picked = await values(page);
  expect(new Set(picked).size).toBe(2);
  expect(picked.every((name) => ['Ann', 'Bo', 'Cy'].includes(name))).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/web exec playwright test e2e/text.spec.ts`
Expected: the first two new tests PASS (the password tool already does this); the other four FAIL, because every tool link still shows the password tool.

- [ ] **Step 3: Write the word list loader**

Create `apps/web/src/lib/text/wordlist.svelte.ts`:

```ts
import { readWordList, toHex, WORD_LIST_SHA256 } from '@pokerji/text-tools';

const FILE = '/text/eff_large_wordlist.txt';

/**
 * The passphrase tool's words: a file served by this site, fetched the first time the tool is
 * opened and never before. Nothing typed or made is sent to get it.
 */
class WordList {
  state = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  words = $state.raw<string[]>([]);

  async load(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      const response = await fetch(FILE);
      if (!response.ok) throw new Error('not served');
      const data = new Uint8Array(await response.arrayBuffer());
      // Checked against the checksum built into the page, then for its shape, before a word is used.
      const sum = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
      if (sum !== WORD_LIST_SHA256) throw new Error('not the list');
      const read = readWordList(new TextDecoder().decode(data));
      if (!read.ok) throw new Error('not the list');
      this.words = read.value;
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  async retry(): Promise<void> {
    if (this.state === 'failed') this.state = 'idle';
    await this.load();
  }
}

export const wordList = new WordList();
```

- [ ] **Step 4: Write the text box**

Create `apps/web/src/lib/text/TextBox.svelte`:

```svelte
<script lang="ts">
  import { LIMITS } from '@pokerji/text-tools';

  let {
    id,
    label,
    value = $bindable(),
    rows = 8,
  }: { id: string; label: string; value: string; rows?: number } = $props();
</script>

<!-- Nothing typed here may reach a spelling service or a browser's saved-form store. -->
<p class="field">
  <label for={id}>{label}</label>
  <textarea
    {id}
    {rows}
    maxlength={LIMITS.text}
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    autocorrect="off"
    bind:value
  ></textarea>
</p>
```

- [ ] **Step 5: Write the five generators**

Create `apps/web/src/lib/text/Passphrase.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    LIMITS,
    many,
    passphrase,
    passphraseBits,
    PASSPHRASE_DEFAULTS,
    type Separator,
  } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import Toggle from './Toggle.svelte';
  import { say } from './tools.ts';
  import { wordList } from './wordlist.svelte.ts';

  const SEPARATOR_NAMES: Array<[Separator, string]> = [
    ['-', 'Hyphen'],
    [' ', 'Space'],
    ['.', 'Full stop'],
    ['_', 'Underscore'],
  ];

  const options = $state({ ...PASSPHRASE_DEFAULTS });
  let count = $state(1);
  let turn = $state(0);

  const RANGE = `Words must be ${LIMITS.wordsMin} to ${LIMITS.wordsMax}, and how many 1 to ${LIMITS.results}.`;

  onMount(() => void wordList.load());

  const made = $derived.by(() => {
    void turn;
    if (wordList.state !== 'ready') return undefined;
    return many(count, () => passphrase(options, wordList.words, random));
  });
  const bits = $derived(passphraseBits(options));
  const problem = $derived(
    wordList.state === 'failed'
      ? 'The word list could not be loaded, so no passphrase was made.'
      : made && !made.ok
        ? say(made.problem, RANGE)
        : undefined,
  );
</script>

<Frame
  title="Passphrase"
  blurb="Random words from a list of 7,776: easier to type and to remember than a password."
  rows={made?.ok ? made.value.map((value) => ({ value })) : []}
  {problem}
  strength={bits.ok ? bits.value : undefined}
  waiting={wordList.state === 'loading' ? 'Loading the word list.' : 'A passphrase appears here.'}
  again={() => (turn += 1)}
  retry={wordList.state === 'failed' ? () => void wordList.retry() : undefined}
  made={made?.ok ? `${made.value.length} made.` : ''}
>
  <NumberField
    id="t-words"
    label="Words"
    min={LIMITS.wordsMin}
    max={LIMITS.wordsMax}
    bind:value={options.words}
  />
  <p class="field">
    <label for="t-separator">Separator</label>
    <select id="t-separator" bind:value={options.separator}>
      {#each SEPARATOR_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  <div class="switches">
    <Toggle label="Capitals" bind:on={options.capitals} />
    <Toggle label="Add a digit" bind:on={options.digit} />
  </div>
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
```

Create `apps/web/src/lib/text/RandomString.svelte`:

```svelte
<script lang="ts">
  import {
    LIMITS,
    many,
    randomString,
    stringBits,
    STRING_SIZES,
    type LetterCase,
    type StringKind,
  } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import { say } from './tools.ts';

  const KIND_NAMES: Array<[StringKind, string]> = [
    ['hex', 'Hex'],
    ['base64', 'Base64'],
    ['base64url', 'Base64URL'],
    ['digits', 'Digits'],
    ['letters', 'Letters'],
    ['alphanumeric', 'Letters and digits'],
    ['own', 'Your own characters'],
  ];
  const LETTER_NAMES: Array<[LetterCase, string]> = [
    ['both', 'Both cases'],
    ['lower', 'Lowercase'],
    ['upper', 'Uppercase'],
  ];

  let kind = $state<StringKind>('hex');
  let size = $state<number>(STRING_SIZES.hex);
  let letters = $state<LetterCase>('both');
  let alphabet = $state('');
  let count = $state(1);
  let turn = $state(0);

  // Hex and both Base64 kinds are sized in bytes; the rest in characters.
  const inBytes = $derived(kind === 'hex' || kind === 'base64' || kind === 'base64url');
  const unit = $derived(inBytes ? 'Bytes' : 'Characters');
  const top = $derived(inBytes ? LIMITS.bytes : LIMITS.length);
  const options = $derived({ kind, size, letters, alphabet });

  const made = $derived.by(() => {
    void turn;
    return many(count, () => randomString(options, random));
  });
  const bits = $derived(stringBits(options));
  const range = $derived(
    `${unit} must be 1 to ${top}, and how many 1 to ${LIMITS.results}.`,
  );

  /** A new kind starts at its own usual size. */
  const chosen = (event: Event & { currentTarget: HTMLSelectElement }) => {
    size = STRING_SIZES[event.currentTarget.value as StringKind] ?? size;
  };
</script>

<Frame
  title="Random string"
  blurb="Random bytes written as hex or Base64, or random characters from a set."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, range)}
  strength={bits.ok ? bits.value : undefined}
  waiting="A random string appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <p class="field">
    <label for="t-kind">Kind</label>
    <select id="t-kind" bind:value={kind} onchange={chosen}>
      {#each KIND_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  {#if kind === 'letters'}
    <p class="field">
      <label for="t-letters">Letters</label>
      <select id="t-letters" bind:value={letters}>
        {#each LETTER_NAMES as [value, name] (value)}
          <option {value}>{name}</option>
        {/each}
      </select>
    </p>
  {/if}
  {#if kind === 'own'}
    <p class="field">
      <label for="t-alphabet">Characters to use</label>
      <input
        id="t-alphabet"
        type="text"
        maxlength={LIMITS.alphabetMax * 2}
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        aria-describedby="t-alphabet-hint"
        bind:value={alphabet}
      />
      <span class="hint" id="t-alphabet-hint"
        >{LIMITS.alphabetMin} to {LIMITS.alphabetMax} different characters, with no spaces.</span
      >
    </p>
  {/if}
  <NumberField id="t-size" label={unit} min={1} max={top} bind:value={size} />
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
```

Create `apps/web/src/lib/text/Numbers.svelte`:

```svelte
<script lang="ts">
  import { LIMITS, many, numberBetween, pin } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import { say } from './tools.ts';

  let mode = $state<'pin' | 'number'>('pin');
  let digits = $state(6);
  let from = $state(1);
  let to = $state(100);
  let count = $state(1);
  let turn = $state(0);

  const made = $derived.by(() => {
    void turn;
    return many<string>(count, () => {
      if (mode === 'pin') return pin(digits, random);
      const drawn = numberBetween(from, to, random);
      return drawn.ok ? { ok: true as const, value: String(drawn.value) } : drawn;
    });
  });
  const range = $derived(
    mode === 'pin'
      ? `Digits must be ${LIMITS.pinMin} to ${LIMITS.pinMax}, and how many 1 to ${LIMITS.results}.`
      : `Both ends must be whole numbers no further from zero than ${LIMITS.bound.toLocaleString('en')}, and how many 1 to ${LIMITS.results}.`,
  );
</script>

<Frame
  title="PIN and number"
  blurb="A PIN of random digits, or a whole number between two ends, both included."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, range)}
  waiting="A number appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <p class="field">
    <label for="t-make">Make</label>
    <select id="t-make" bind:value={mode}>
      <option value="pin">A PIN</option>
      <option value="number">A number in a range</option>
    </select>
  </p>
  {#if mode === 'pin'}
    <NumberField
      id="t-digits"
      label="Digits"
      min={LIMITS.pinMin}
      max={LIMITS.pinMax}
      bind:value={digits}
    />
  {:else}
    <NumberField id="t-from" label="From" min={-LIMITS.bound} max={LIMITS.bound} bind:value={from} />
    <NumberField id="t-to" label="To" min={-LIMITS.bound} max={LIMITS.bound} bind:value={to} />
  {/if}
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
```

Create `apps/web/src/lib/text/Identifier.svelte`:

```svelte
<script lang="ts">
  import { identifier, LIMITS, many, TIMED_IDS, type IdKind } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import { say } from './tools.ts';

  const KIND_NAMES: Array<[IdKind, string]> = [
    ['uuid4', 'UUID version 4'],
    ['uuid7', 'UUID version 7'],
    ['ulid', 'ULID'],
    ['short', 'Short id'],
  ];

  let kind = $state<IdKind>('uuid4');
  let count = $state(1);
  let turn = $state(0);

  const made = $derived.by(() => {
    void turn;
    const now = Date.now();
    return many(count, () => identifier(kind, now, random));
  });
  const timed = $derived(TIMED_IDS.includes(kind));
</script>

<Frame
  title="Identifier"
  blurb="A random identifier for a record, a file or a request."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, `How many must be 1 to ${LIMITS.results}.`)}
  waiting="An identifier appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <p class="field">
    <label for="t-kind">Kind</label>
    <select id="t-kind" bind:value={kind}>
      {#each KIND_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
  {#snippet note()}
    {#if timed}
      <p class="hint">
        This kind of identifier contains the time it was made, to the millisecond. Anyone who
        sees it can read that time.
      </p>
    {/if}
  {/snippet}
</Frame>
```

Create `apps/web/src/lib/text/Chance.svelte`:

```svelte
<script lang="ts">
  import { coins, dice, LIMITS, pick } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import TextBox from './TextBox.svelte';
  import { say, type Row } from './tools.ts';

  let mode = $state<'dice' | 'coin' | 'pick'>('dice');
  let count = $state(1);
  let sides = $state(6);
  let list = $state('');
  let turn = $state(0);

  type Made = { rows: Row[] } | { problem: string };

  const made = $derived.by((): Made => {
    void turn;
    if (mode === 'dice') {
      const rolled = dice(count, sides, random);
      if (!rolled.ok) {
        return {
          problem: say(
            rolled.problem,
            `Dice must be 1 to ${LIMITS.results}, and sides ${LIMITS.sidesMin} to ${LIMITS.sidesMax.toLocaleString('en')}.`,
          ),
        };
      }
      const rows: Row[] = rolled.value.rolls.map((roll) => ({ value: String(roll) }));
      if (rows.length > 1) rows.push({ name: 'Total', value: String(rolled.value.total) });
      return { rows };
    }
    if (mode === 'coin') {
      const flipped = coins(count, random);
      if (!flipped.ok) {
        return { problem: say(flipped.problem, `Flips must be 1 to ${LIMITS.results}.`) };
      }
      return { rows: flipped.value.map((face) => ({ value: face === 'heads' ? 'Heads' : 'Tails' })) };
    }
    const picked = pick(list, count, random);
    if (!picked.ok) {
      return { problem: say(picked.problem, `How many to pick must be 1 to ${LIMITS.results}.`) };
    }
    return { rows: picked.value.map((value) => ({ value })) };
  });
</script>

<Frame
  title="Chance"
  blurb="Roll dice, flip a coin, or pick from a list of your own. No outcome is favoured."
  rows={'rows' in made ? made.rows : []}
  problem={'problem' in made ? made.problem : undefined}
  waiting="The outcome appears here."
  again={() => (turn += 1)}
  made={'rows' in made ? `${made.rows.length} made.` : ''}
>
  <p class="field">
    <label for="t-use">Use</label>
    <select id="t-use" bind:value={mode}>
      <option value="dice">Dice</option>
      <option value="coin">A coin</option>
      <option value="pick">A list of your own</option>
    </select>
  </p>
  {#if mode === 'dice'}
    <NumberField id="t-dice" label="Dice" min={1} max={LIMITS.results} bind:value={count} />
    <NumberField
      id="t-sides"
      label="Sides"
      min={LIMITS.sidesMin}
      max={LIMITS.sidesMax}
      bind:value={sides}
    />
  {:else if mode === 'coin'}
    <NumberField id="t-flips" label="Flips" min={1} max={LIMITS.results} bind:value={count} />
  {:else}
    <TextBox id="t-list" label="List" bind:value={list} />
    <NumberField
      id="t-picks"
      label="How many to pick"
      min={1}
      max={LIMITS.results}
      bind:value={count}
    />
  {/if}
</Frame>
```

- [ ] **Step 6: Open each tool from the page**

In `apps/web/src/routes/text/+page.svelte`, add these imports beside the `Password` import, keeping the list in alphabetical order:

```ts
  import Chance from '#lib/text/Chance.svelte';
  import Identifier from '#lib/text/Identifier.svelte';
  import Numbers from '#lib/text/Numbers.svelte';
  import Passphrase from '#lib/text/Passphrase.svelte';
  import RandomString from '#lib/text/RandomString.svelte';
```

and replace the line `<Password />` with:

```svelte
      {#if tool === 'passphrase'}
        <Passphrase />
      {:else if tool === 'random'}
        <RandomString />
      {:else if tool === 'number'}
        <Numbers />
      {:else if tool === 'id'}
        <Identifier />
      {:else if tool === 'chance'}
        <Chance />
      {:else}
        <Password />
      {/if}
```

- [ ] **Step 7: Run the checks**

Run: `pnpm --filter @pokerji/web typecheck && pnpm --filter @pokerji/web exec playwright test e2e/text.spec.ts`
Expected: `0 ERRORS`; PASS, 10 tests.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add apps/web
git commit -m "feat: passphrases, random strings, numbers, identifiers and chance on the text tools page"
```

---

### Task 3: The converters

**Files:**
- Create: `apps/web/src/lib/text/Case.svelte`, `Slug.svelte`, `Encode.svelte`, `Hash.svelte`, `Lines.svelte`, `Count.svelte`
- Modify: `apps/web/src/routes/text/+page.svelte`
- Test: `apps/web/e2e/text.spec.ts`

**Interfaces:**
- Consumes: `Frame`, `TextBox`, `Toggle`, `random`, `say`, `Row`.
- Consumes from `@pokerji/text-tools`: `allCases`, `CASE_FORMS`, `type CaseForm`, `slug`, `encode`, `decode`, `ENCODINGS`, `type Encoding`, `checkText`, `utf8`, `toHex`, `lines`, `LINE_DEFAULTS`, `LINE_ORDERS`, `type LineOrder`, `count`, `explain`.
- Produces: nothing later tasks consume beyond the page itself.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/e2e/text.spec.ts`:

```ts
const text = (page: Page) => page.getByLabel('Text', { exact: true });
const named = (page: Page, name: string) =>
  results(page)
    .filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) })
    .locator('.value');

test('a link straight to a tool opens it, and Back returns to the tool before', async ({
  browser,
}) => {
  const page = await open(browser, '#hash');
  await expect(page.getByRole('heading', { level: 2, name: 'Hash', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hash' })).toHaveAttribute('aria-current', 'true');

  await page.getByRole('link', { name: 'Slug' }).click();
  await expect(page).toHaveURL(/\/text#slug$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Slug', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 2, name: 'Hash', exact: true })).toBeVisible();

  const stranger = await open(browser, '#<img src=x onerror=alert(1)>');
  await expect(
    stranger.getByRole('heading', { level: 2, name: 'Password', exact: true }),
  ).toBeVisible();
});

test('case shows every form at once, each with its own copy', async ({ browser }) => {
  const page = await open(browser, '#case');
  await expect(rail(page)).toContainText('appear here');
  await expect(rail(page).getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();

  await text(page).fill('parseHTTPResponse2 now');
  await expect(results(page)).toHaveCount(12);
  await expect(named(page, 'camelCase')).toHaveText('parseHttpResponse2Now');
  await expect(named(page, 'PascalCase')).toHaveText('ParseHttpResponse2Now');
  await expect(named(page, 'snake_case')).toHaveText('parse_http_response_2_now');
  await expect(named(page, 'CONSTANT_CASE')).toHaveText('PARSE_HTTP_RESPONSE_2_NOW');
  await expect(named(page, 'kebab-case')).toHaveText('parse-http-response-2-now');
  await expect(named(page, 'Train-Case')).toHaveText('Parse-Http-Response-2-Now');
  await expect(named(page, 'dot.case')).toHaveText('parse.http.response.2.now');
  await expect(named(page, 'path/case')).toHaveText('parse/http/response/2/now');

  await text(page).fill("the return of the iPhone: a buyer's guide");
  await expect(named(page, 'Title Case')).toHaveText("The Return of the iPhone: A Buyer's Guide");
  await expect(named(page, 'Sentence case')).toHaveText(
    "The return of the iPhone: a buyer's guide",
  );
  await expect(named(page, 'UPPER CASE')).toHaveText("THE RETURN OF THE IPHONE: A BUYER'S GUIDE");
  await expect(named(page, 'lower case')).toHaveText("the return of the iphone: a buyer's guide");

  await page.getByRole('button', { name: 'Copy Title Case' }).click();
  expect(await clipboard(page)).toBe("The Return of the iPhone: A Buyer's Guide");
  await page.getByRole('button', { name: 'Copy all' }).click();
  expect(await clipboard(page)).toContain("Title Case: The Return of the iPhone: A Buyer's Guide");
});

test('slug makes an address-safe name, line by line', async ({ browser }) => {
  const page = await open(browser, '#slug');
  await text(page).fill('Crème Brûlée, the Recipe!\nStraße 2');
  await expect(results(page)).toHaveCount(1);
  expect(await values(page)).toEqual(['creme-brulee-the-recipe\nstrasse-2']);
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  expect(await clipboard(page)).toBe('creme-brulee-the-recipe\nstrasse-2');

  await text(page).fill('日本語');
  await expect(rail(page)).toContainText('come out empty');
});

test('encoding and decoding go both ways and say what is wrong', async ({ browser }) => {
  const page = await open(browser, '#encode');
  const form = page.getByLabel('Form', { exact: true });
  await text(page).fill('a b&c/é');
  await expect.poll(() => values(page)).toEqual(['YSBiJmMvw6k=']);
  await form.selectOption({ label: 'Base64URL' });
  await expect.poll(() => values(page)).toEqual(['YSBiJmMvw6k']);
  await form.selectOption({ label: 'Hex' });
  await expect.poll(() => values(page)).toEqual(['61206226632fc3a9']);
  await form.selectOption({ label: 'URL' });
  await expect.poll(() => values(page)).toEqual(['a%20b%26c%2F%C3%A9']);
  await form.selectOption({ label: 'HTML entities' });
  await text(page).fill('<b>Tom & Jerry</b>');
  await expect.poll(() => values(page)).toEqual(['&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;']);

  await page.getByRole('button', { name: 'Decode', exact: true }).click();
  await text(page).fill('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt; &copy;');
  await expect.poll(() => values(page)).toEqual(['<b>Tom & Jerry</b> ©']);
  // What was decoded is shown as text, never as markup.
  await expect(rail(page).locator('b', { hasText: 'Tom' })).toHaveCount(0);

  await form.selectOption({ label: 'Base64' });
  await text(page).fill('YSBiJmMvw6k=');
  await expect.poll(() => values(page)).toEqual(['a b&c/é']);
  await text(page).fill('not base64!');
  await expect(status(page)).toContainText('That is not Base64');
  await expect(results(page)).toHaveCount(0);

  await text(page).fill('/w==');
  await expect.poll(() => values(page)).toEqual(['ff']);
  await expect(rail(page)).toContainText('not text');

  await form.selectOption({ label: 'Hex' });
  await text(page).fill('6');
  await expect(status(page)).toContainText('odd number of digits');
  await form.selectOption({ label: 'URL' });
  await text(page).fill('100%');
  await expect(status(page)).toContainText('not followed by two hex digits');
});

test('hash gives the three SHA-2 sums of the text exactly as typed', async ({ browser }) => {
  const page = await open(browser, '#hash');
  await expect(rail(page)).toContainText('appear here');
  await text(page).fill('abc');
  await expect(results(page)).toHaveCount(3);
  await expect(named(page, 'SHA-256')).toHaveText(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  await expect(named(page, 'SHA-384')).toHaveText(
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  );
  await expect(named(page, 'SHA-512')).toHaveText(
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  );
  await text(page).fill('abc\n');
  await expect(named(page, 'SHA-256')).toHaveText(
    'edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb',
  );
  await expect(rail(page)).toContainText('not a way to store passwords');
  await text(page).fill('');
  await expect(results(page)).toHaveCount(0);
});

test('lines are tidied in a fixed order, and counts are stated', async ({ browser }) => {
  const page = await open(browser, '#lines');
  await text(page).fill('pear\napple\n\npear\nApple\n');
  await expect.poll(() => values(page)).toEqual(['pear\napple\n\npear\nApple']);
  await page.getByRole('button', { name: 'Remove blank lines' }).click();
  await page.getByRole('button', { name: 'Remove repeats' }).click();
  await expect.poll(() => values(page)).toEqual(['pear\napple\nApple']);
  await page.getByRole('button', { name: 'Ignore case' }).click();
  await expect.poll(() => values(page)).toEqual(['pear\napple']);
  await page.getByLabel('Order', { exact: true }).selectOption({ label: 'A to Z' });
  await page.getByRole('button', { name: 'Number the lines' }).click();
  await expect.poll(() => values(page)).toEqual(['1. apple\n2. pear']);
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  expect(await clipboard(page)).toBe('1. apple\n2. pear');

  await page.getByLabel('Order', { exact: true }).selectOption({ label: 'Shuffled' });
  await expect(page.getByRole('button', { name: 'Shuffle again' })).toBeVisible();
  const [shuffled = ''] = await values(page);
  expect(shuffled.split('\n').map((line) => line.replace(/^\d+\. /, '')).sort()).toEqual([
    'apple',
    'pear',
  ]);

  await page.getByRole('link', { name: 'Count' }).click();
  await text(page).fill('Hello, wide world\n👨‍👩‍👧');
  await expect(named(page, 'Characters')).toHaveText('19');
  await expect(named(page, 'Without white space')).toHaveText('16');
  await expect(named(page, 'Words')).toHaveText('4');
  await expect(named(page, 'Lines')).toHaveText('2');
  await expect(named(page, 'Bytes')).toHaveText('36');
  // A count is not something to copy alone; Copy all takes them together.
  await expect(results(page).getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy all' }).click();
  expect(await clipboard(page)).toContain('Words: 4');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/web exec playwright test e2e/text.spec.ts`
Expected: the six new tests FAIL: every converter's link still shows the password tool.

- [ ] **Step 3: Write the six converters**

Create `apps/web/src/lib/text/Case.svelte`:

```svelte
<script lang="ts">
  import { allCases, CASE_FORMS, explain, type CaseForm } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  const NAMES: Record<CaseForm, string> = {
    camel: 'camelCase',
    pascal: 'PascalCase',
    snake: 'snake_case',
    constant: 'CONSTANT_CASE',
    kebab: 'kebab-case',
    train: 'Train-Case',
    dot: 'dot.case',
    path: 'path/case',
    title: 'Title Case',
    sentence: 'Sentence case',
    upper: 'UPPER CASE',
    lower: 'lower case',
  };

  let text = $state('');
  const made = $derived(allCases(text));
</script>

<Frame
  title="Case"
  blurb="The same words in twelve forms. Each line is converted on its own."
  rows={made.ok && text !== ''
    ? CASE_FORMS.map((form) => ({ name: NAMES[form], value: made.value[form] }))
    : []}
  problem={made.ok ? undefined : explain(made.problem)}
  waiting="The twelve forms appear here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
</Frame>
```

Create `apps/web/src/lib/text/Slug.svelte`:

```svelte
<script lang="ts">
  import { explain, slug } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  let text = $state('');
  const made = $derived(slug(text));
  const value = $derived(made.ok ? made.value : '');
  // A line with nothing a slug can keep comes out empty; the page says so.
  const emptied = $derived(text.trim() !== '' && value.split('\n').some((line) => line === ''));
</script>

<Frame
  title="Slug"
  blurb="A name safe for a web address: lowercase letters and digits joined by hyphens."
  rows={value.replaceAll('\n', '') !== '' ? [{ value }] : []}
  problem={made.ok ? undefined : explain(made.problem)}
  waiting="The slug appears here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    {#if emptied}
      <p class="hint">
        Lines with no letters or digits a slug can keep come out empty. Accents are removed;
        other alphabets have no plain form.
      </p>
    {/if}
  {/snippet}
</Frame>
```

Create `apps/web/src/lib/text/Encode.svelte`:

```svelte
<script lang="ts">
  import { decode, encode, explain, type Encoding } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  const FORM_NAMES: Array<[Encoding, string]> = [
    ['base64', 'Base64'],
    ['base64url', 'Base64URL'],
    ['hex', 'Hex'],
    ['url', 'URL'],
    ['entities', 'HTML entities'],
  ];

  let decoding = $state(false);
  let form = $state<Encoding>('base64');
  let text = $state('');

  type Made = { value: string; binary: boolean } | { problem: string } | undefined;

  const made = $derived.by((): Made => {
    if (text === '') return undefined;
    if (decoding) {
      const read = decode(text, form);
      return read.ok
        ? { value: read.value.text, binary: read.value.binary }
        : { problem: explain(read.problem) };
    }
    const written = encode(text, form);
    return written.ok
      ? { value: written.value, binary: false }
      : { problem: explain(written.problem) };
  });
</script>

<Frame
  title="Encode and decode"
  blurb="Text to and from Base64, hex, URL encoding and HTML entities, as UTF-8."
  rows={made && 'value' in made && made.value !== '' ? [{ value: made.value }] : []}
  problem={made && 'problem' in made ? made.problem : undefined}
  waiting="The result appears here as you type."
>
  <div class="switches" role="group" aria-label="Direction">
    <button
      type="button"
      class="compact"
      aria-pressed={!decoding}
      onclick={() => (decoding = false)}>Encode</button
    >
    <button type="button" class="compact" aria-pressed={decoding} onclick={() => (decoding = true)}
      >Decode</button
    >
  </div>
  <p class="field">
    <label for="t-form">Form</label>
    <select id="t-form" bind:value={form}>
      {#each FORM_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    {#if made && 'value' in made && made.binary}
      <p class="hint">These bytes are not text, so they are shown as hex.</p>
    {/if}
  {/snippet}
</Frame>

<style>
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
```

Create `apps/web/src/lib/text/Hash.svelte`:

```svelte
<script lang="ts">
  import { checkText, explain, toHex, utf8 } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';
  import type { Row } from './tools.ts';

  const ALGORITHMS = ['SHA-256', 'SHA-384', 'SHA-512'] as const;

  // Hashing is the browser's own, and some browsers offer it only on a secure page.
  const can = typeof crypto !== 'undefined' && crypto.subtle !== undefined;

  let text = $state('');
  let rows = $state.raw<Row[]>([]);
  const checked = $derived(checkText(text));

  $effect(() => {
    const value = text;
    if (!can || value === '' || !checked.ok) {
      rows = [];
      return;
    }
    // Hashing takes a moment; an answer to text that has since changed is thrown away.
    let stale = false;
    const data = utf8(value) as Uint8Array<ArrayBuffer>;
    void Promise.all(
      ALGORITHMS.map(async (name) => ({
        name,
        value: toHex(new Uint8Array(await crypto.subtle.digest(name, data))),
      })),
    ).then((sums) => {
      if (!stale) rows = sums;
    });
    return () => {
      stale = true;
    };
  });

  const problem = $derived(
    !can
      ? 'This browser cannot make hashes on this page.'
      : checked.ok
        ? undefined
        : explain(checked.problem),
  );
</script>

<Frame
  title="Hash"
  blurb="The SHA-2 sums of the text exactly as typed, as UTF-8, in hex."
  {rows}
  {problem}
  waiting="The three sums appear here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    <p class="hint">
      Every character counts, a line ending included. These hashes check that text has not
      changed; they are not a way to store passwords.
    </p>
  {/snippet}
</Frame>
```

Create `apps/web/src/lib/text/Lines.svelte`:

```svelte
<script lang="ts">
  import { explain, LINE_DEFAULTS, lines, type LineOrder } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import { random } from './random.ts';
  import TextBox from './TextBox.svelte';
  import Toggle from './Toggle.svelte';

  const ORDER_NAMES: Array<[LineOrder, string]> = [
    ['keep', 'As typed'],
    ['az', 'A to Z'],
    ['za', 'Z to A'],
    ['reverse', 'Reversed'],
    ['shuffle', 'Shuffled'],
  ];

  const options = $state({ ...LINE_DEFAULTS, trim: false });
  let text = $state('');
  let turn = $state(0);

  const made = $derived.by(() => {
    void turn;
    return lines(text, options, random);
  });
</script>

<Frame
  title="Lines"
  blurb="Tidy a list, one step after another, in the order the steps are shown."
  rows={made.ok && made.value !== '' ? [{ value: made.value }] : []}
  problem={made.ok ? undefined : explain(made.problem)}
  waiting="The tidied list appears here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  <div class="switches" role="group" aria-label="Steps">
    <Toggle label="Trim each line" bind:on={options.trim} />
    <Toggle label="Remove blank lines" bind:on={options.blanks} />
    <Toggle label="Remove repeats" bind:on={options.unique} />
    <Toggle label="Ignore case" bind:on={options.ignoreCase} />
  </div>
  <p class="field">
    <label for="t-order">Order</label>
    <select id="t-order" bind:value={options.order}>
      {#each ORDER_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  {#if options.order === 'shuffle'}
    <p class="field"><button type="button" onclick={() => (turn += 1)}>Shuffle again</button></p>
  {/if}
  <div class="switches">
    <Toggle label="Number the lines" bind:on={options.number} />
  </div>
</Frame>
```

The package's default is to trim; the page starts with every step off, so the first thing seen is the text as typed.

Create `apps/web/src/lib/text/Count.svelte`:

```svelte
<script lang="ts">
  import { count, explain } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  let text = $state('');
  const made = $derived(count(text));
  const said = (value: number): string => value.toLocaleString('en');
</script>

<Frame
  title="Count"
  blurb="How long the text is, counted five ways."
  rows={made.ok && text !== ''
    ? [
        { name: 'Characters', value: said(made.value.characters), plain: true },
        { name: 'Without white space', value: said(made.value.solid), plain: true },
        { name: 'Words', value: said(made.value.words), plain: true },
        { name: 'Lines', value: said(made.value.lines), plain: true },
        { name: 'Bytes', value: said(made.value.bytes), plain: true },
      ]
    : []}
  problem={made.ok ? undefined : explain(made.problem)}
  waiting="The counts appear here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    <p class="hint">
      A character is what a reader sees as one: an emoji or an accented letter counts once. Bytes
      are counted as UTF-8.
    </p>
  {/snippet}
</Frame>
```

- [ ] **Step 4: Open each converter from the page**

In `apps/web/src/routes/text/+page.svelte`, add these imports in alphabetical order with the others:

```ts
  import Case from '#lib/text/Case.svelte';
  import Count from '#lib/text/Count.svelte';
  import Encode from '#lib/text/Encode.svelte';
  import Hash from '#lib/text/Hash.svelte';
  import Lines from '#lib/text/Lines.svelte';
  import Slug from '#lib/text/Slug.svelte';
```

and add these branches before the final `{:else}`:

```svelte
      {:else if tool === 'case'}
        <Case />
      {:else if tool === 'slug'}
        <Slug />
      {:else if tool === 'encode'}
        <Encode />
      {:else if tool === 'hash'}
        <Hash />
      {:else if tool === 'lines'}
        <Lines />
      {:else if tool === 'count'}
        <Count />
```

- [ ] **Step 5: Run the checks**

Run: `pnpm --filter @pokerji/web typecheck && pnpm --filter @pokerji/web exec playwright test e2e/text.spec.ts`
Expected: `0 ERRORS`; PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add apps/web
git commit -m "feat: case, slug, encoding, hashes, lines and counts on the text tools page"
```

---

### Task 4: Proof that nothing leaves and nothing stays

**Files:**
- Test: `apps/web/e2e/text.spec.ts`

**Interfaces:**
- Consumes: the finished page.
- Produces: no new code if Tasks 1 to 3 hold. A failure here is a defect in the page: fix it in the component that owns it.

- [ ] **Step 1: Write the tests**

Append to `apps/web/e2e/text.spec.ts`:

```ts
const TOOL_IDS = [
  'password',
  'passphrase',
  'random',
  'number',
  'id',
  'chance',
  'case',
  'slug',
  'encode',
  'hash',
  'lines',
  'count',
];
const TYPED = ['case', 'slug', 'encode', 'hash', 'lines', 'count'];

/** Opens every tool in turn, types the secret where there is a box, and gathers every result. */
const useEveryTool = async (page: Page, secret: string): Promise<string[]> => {
  const seen: string[] = [];
  for (const id of TOOL_IDS) {
    await page.goto(`/text#${id}`);
    await expect(page.locator(`a[href="#${id}"]`)).toHaveAttribute('aria-current', 'true');
    if (TYPED.includes(id)) await text(page).fill(secret);
    await expect(results(page).first()).toBeVisible();
    if (!TYPED.includes(id)) await page.getByRole('button', { name: 'Generate again' }).click();
    seen.push(...(await values(page)));
    await rail(page).getByRole('button', { name: /^Copy/ }).first().click();
  }
  return seen;
};

test('nothing typed or made is sent anywhere, and the only fetch is the word list', async ({
  browser,
}) => {
  const page = await open(browser);
  const sent: string[] = [];
  page.on('request', (request) =>
    sent.push(
      `${request.method()} ${request.url()} ${JSON.stringify(request.headers())} ${request.postData() ?? ''}`,
    ),
  );
  const secret = 'zebra-quartz-7731';
  const made = await useEveryTool(page, secret);
  await page.waitForTimeout(500);

  expect(made.length).toBeGreaterThanOrEqual(12);
  // Short values (a die, a coin, a PIN) could match ordinary request text by chance.
  const telling = made.filter((value) => value.length >= 8);
  expect(telling.length).toBeGreaterThanOrEqual(8);
  for (const line of sent) {
    expect(line).not.toContain(secret);
    expect(line).not.toContain(encodeURIComponent(secret));
    for (const value of telling) expect(line, value).not.toContain(value);
  }
  expect(sent.map((line) => new URL(line.split(' ')[1] ?? '').pathname)).toEqual([
    '/text/eff_large_wordlist.txt',
  ]);
});

test('nothing is kept: no storage entry, no cookie, nothing in the address but the tool', async ({
  browser,
}) => {
  const page = await open(browser);
  const kept = () =>
    page.evaluate(() => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
      cookie: document.cookie,
    }));
  const before = await kept();
  await useEveryTool(page, 'zebra-quartz-7731');
  expect(await kept()).toEqual(before);
  expect(new URL(page.url()).search).toBe('');
  expect(new URL(page.url()).pathname).toBe('/text');
  expect(new URL(page.url()).hash).toBe('#count');

  // A reload starts again from nothing.
  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await expect(text(page)).toHaveValue('');
});

test('the text tools never break the content security policy', async ({ browser }) => {
  const page = await open(browser);
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) refused.push(message.text());
  });
  page.on('pageerror', (error) => refused.push(error.message));
  await useEveryTool(page, 'zebra-quartz-7731');
  expect(refused).toEqual([]);
});

test('no field hands what is typed to a spelling service or a saved-form store', async ({
  browser,
}) => {
  const page = await open(browser);
  for (const id of [...TYPED, 'chance', 'random']) {
    await page.goto(`/text#${id}`);
    await expect(page.locator(`a[href="#${id}"]`)).toHaveAttribute('aria-current', 'true');
    if (id === 'chance') {
      await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A list of your own' });
    }
    if (id === 'random') {
      await page.getByLabel('Kind', { exact: true }).selectOption({ label: 'Your own characters' });
    }
    const boxes = page.locator('main textarea, main input[type="text"]');
    expect(await boxes.count(), id).toBeGreaterThan(0);
    for (const box of await boxes.all()) {
      await expect(box).toHaveAttribute('spellcheck', 'false');
      await expect(box).toHaveAttribute('autocomplete', 'off');
      await expect(box).toHaveAttribute('autocapitalize', 'off');
      await expect(box).toHaveAttribute('autocorrect', 'off');
    }
  }
  for (const number of await page.locator('main input[type="number"]').all()) {
    await expect(number).toHaveAttribute('autocomplete', 'off');
  }
});

test('on a phone the results follow the options and nothing scrolls sideways', async ({
  browser,
}) => {
  const page = await open(browser, '', NARROW);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
  const top = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())?.y ?? 0;
  expect(await top(rail(page))).toBeGreaterThan(await top(page.getByLabel('Length', { exact: true })));

  await page.getByLabel('Length', { exact: true }).fill('256');
  await page.getByLabel('How many', { exact: true }).fill('100');
  await expect(results(page)).toHaveCount(100);
  expect(await wide()).toBeLessThanOrEqual(NARROW.width);

  await page.goto('/text#encode');
  await text(page).fill('x'.repeat(100_000));
  await expect(results(page)).toHaveCount(1);
  expect(await wide()).toBeLessThanOrEqual(NARROW.width);
});

test('every tool meets WCAG 2.2 AA in both themes, and no result is red', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ ...visitor(), viewport: WIDE, colorScheme });
    const page = await context.newPage();
    for (const id of TOOL_IDS) {
      await page.goto(`/text#${id}`);
      await page.locator('[data-ready]').waitFor();
      await expect(page.locator(`a[href="#${id}"]`)).toHaveAttribute('aria-current', 'true');
      if (TYPED.includes(id)) await text(page).fill('Hello, wide world');
      await expect(results(page).first()).toBeVisible();
      expect((await scan(page)).violations, `${id} in ${colorScheme}`).toEqual([]);
      await expect(page.locator('main .danger, main [role="alert"]')).toHaveCount(0);
    }
    await context.close();
  }
});

test('a tool can be reached and used with the keyboard alone', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('link', { name: 'Password', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Passphrase' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Passphrase', exact: true }),
  ).toBeVisible();
  // Choosing a tool leaves focus on its link, so the next press steps on.
  await expect(page.getByRole('link', { name: 'Passphrase' })).toBeFocused();
  await expect(results(page)).toHaveCount(1);
  const [first] = await values(page);
  await page.getByRole('button', { name: 'Generate again' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await values(page))[0]).not.toBe(first);
});
```

- [ ] **Step 2: Run them**

Run: `pnpm --filter @pokerji/web exec playwright test e2e/text.spec.ts`
Expected: PASS, 23 tests. For any failure, fix the page (never weaken the test), and say in the commit message what was wrong. Two likely ones:

- The "only fetch is the word list" list holds something else: find what the page requested and remove the cause. A request is never acceptable as an exception here.
- An axe violation about a button's name: `CopyButton`'s `aria-label` must begin with its visible word.

- [ ] **Step 3: Run the whole browser suite**

Run: `pnpm --filter @pokerji/web e2e`
Expected: every spec file passes. The site's own pages are untouched so far, so `site.spec.ts` must still pass as it stands.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add apps/web
git commit -m "test: the text tools send nothing, keep nothing and meet WCAG 2.2 AA"
```

---

### Task 5: The rest of the site

**Files:**
- Modify: `apps/web/src/routes/+layout.svelte`, `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/privacy/+page.svelte`, `apps/web/src/routes/sitemap.xml/+server.ts`
- Test: `apps/web/e2e/site.spec.ts`

**Interfaces:**
- Consumes: the `/text` page.
- The privacy section must not contain the words "never sent to this site": an existing test finds the builder's sentence by that text and would then match two.
- Produces: the bar link "Text tools"; the home heading "Small tools, without the sign-up."; a home row headed "Text tools" with the link "Open the tools"; a privacy section headed "The text tools"; `/text` in the sitemap.

- [ ] **Step 1: Change the site tests first**

In `apps/web/e2e/site.spec.ts`:

Replace the test named `the home page headline says what the tool is` with:

```ts
test('the home page headline says what the site is, and its title names every tool', async ({
  browser,
}) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Small tools, without the sign-up.',
  );
  for (const tool of [/planning poker/i, /schema markup/i, /text tools/i]) {
    expect(await page.title()).toMatch(tool);
  }
});
```

In the test `public pages describe themselves to search engines and link previews`, change the list of paths to:

```ts
  for (const path of ['/', '/poker', '/schema', '/text', '/privacy']) {
```

In the sitemap check, change the list of paths the same way:

```ts
  for (const path of ['/', '/poker', '/schema', '/text', '/privacy'])
```

Replace the test named `the site offers both tools from the bar and from the home page` with:

```ts
test('the site offers every tool from the bar and from the home page', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Site' });
  await expect(bar.getByRole('link', { name: 'Planning poker' })).toHaveAttribute('href', '/poker');
  await expect(bar.getByRole('link', { name: 'Schema markup' })).toHaveAttribute('href', '/schema');
  await expect(bar.getByRole('link', { name: 'Text tools' })).toHaveAttribute('href', '/text');
  await expect(bar.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');

  await expect(page.getByRole('heading', { level: 2, name: 'Planning poker' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Schema markup builder' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Text tools' })).toBeVisible();
  // Each row of the programme carries its own next step.
  await expect(page.locator('.programme a.button')).toHaveCount(3);

  await page.getByRole('link', { name: 'Open the tools' }).click();
  await expect(page).toHaveURL(/\/text$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Text tools');
  await bar.getByRole('link', { name: 'Schema markup' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
});
```

In the test `on a phone the bar keeps the wordmark, Privacy and the theme toggle`, add after the `Schema markup` line:

```ts
  await expect(bar.getByRole('link', { name: 'Text tools' })).toBeHidden();
```

Add at the end of the file:

```ts
test('the privacy page says the text tools send nothing and keep nothing', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/privacy');
  const heading = page.getByRole('heading', { name: 'The text tools' });
  await expect(heading).toBeVisible();
  await expect(page.getByText('nothing is sent to this site and nothing is kept')).toBeVisible();
  await expect(page.getByText('EFF long word list')).toBeVisible();
});

test('the text tools are a public page, and nothing beneath them is listed', async ({ browser }) => {
  const context = await browser.newContext(visitor());
  const page = await context.request.get('/text');
  expect(page.status()).toBe(200);
  expect(page.headers()['x-robots-tag']).toBeUndefined();
  expect(page.headers()['set-cookie']).toBeUndefined();
  const list = await context.request.get('/text/eff_large_wordlist.txt');
  expect(list.status()).toBe(200);
  expect((await list.body()).length).toBe(108_800);
  expect((await context.request.get('/text/LICENSES.md')).status()).toBe(200);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @pokerji/web exec playwright test e2e/site.spec.ts`
Expected: FAIL in the headline test, the search-engine test (the sitemap has no `/text`), the every-tool test and the privacy test. The last new test passes already.

- [ ] **Step 3: Add the bar link**

In `apps/web/src/routes/+layout.svelte`, in the `nav` named "Site", add a line after the Schema markup link:

```svelte
        <a href="/text">Text tools</a>
```

Privacy must stay the last link: the phone rule keeps only the last one.

- [ ] **Step 4: Change the home page**

In `apps/web/src/routes/+page.svelte`:

Replace the `Seo` element with:

```svelte
<Seo
  title="pokerji: free planning poker, schema markup builder and text tools, no sign-up"
  description="Free tools without the sign-up: planning poker for agile teams, a Schema.org JSON-LD builder, and password and text tools. No account, no trackers."
/>
```

Replace the heading line with:

```svelte
      <h1>Small tools, without the sign-up.</h1>
```

and replace the paragraph beneath it with:

```svelte
      <p>
        Free small tools, for a team or for one. No accounts, no trackers: open one, use it, get
        on with the work.
      </p>
```

Add a third item to the `programme` list, after the Schema markup builder item:

```svelte
    <li>
      <div>
        <h2>Text tools</h2>
        <p>
          Passwords, passphrases, random strings and identifiers; case, Base64, hex, hashes and
          more. Everything is made in your browser, and nothing is sent or kept.
        </p>
      </div>
      <a class="button" href="/text">Open the tools</a>
    </li>
```

The description must stay at 160 characters or fewer; the search-engine test checks it.

- [ ] **Step 5: List the page in the sitemap**

In `apps/web/src/routes/sitemap.xml/+server.ts`, replace the `PAGES` line with:

```ts
const PAGES = ['/', '/poker', '/schema', '/text', '/privacy'];
```

- [ ] **Step 6: Add the privacy section**

In `apps/web/src/routes/privacy/+page.svelte`, add after the last paragraph of "The schema markup builder" section, before `</main>`:

```svelte
  <h2>The text tools</h2>
  <p>
    The generators and converters at <a href="/text">/text</a> run in your browser. What you
    type into them and what they make stay there: nothing is sent to this site and nothing is
    kept. There is no account, no draft and no saved setting. Close the tab and it is gone.
  </p>
  <p>
    A value you copy is on your device’s clipboard, like anything else you copy, until you copy
    something else. The address of the page says which tool is open and nothing more.
  </p>
  <p>
    Passphrases are made from the EFF long word list, by the Electronic Frontier Foundation,
    under the Creative Commons Attribution 3.0 United States licence. The file is served by this
    site; nothing is fetched from anyone else.
  </p>
  <p class="how">
    <b>How:</b> the page makes no request that carries what you typed or made. The only thing it
    fetches after it has loaded is the word list, and only when you open the passphrase tool; it
    checks that file against a checksum built into the page before using a word. The tools are
    not drawn on the server at all, so the server never makes a password. Every random choice
    comes from your browser’s cryptographic random source.
  </p>
```

- [ ] **Step 7: Run the checks**

Run: `pnpm --filter @pokerji/web typecheck && pnpm --filter @pokerji/web e2e`
Expected: `0 ERRORS`; every spec file passes.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add apps/web
git commit -m "feat: the text tools in the bar, on the home page, in the sitemap and on the privacy page"
```

---

### Task 6: Look at it

**Files:**
- Modify: `apps/web/scripts/capture-pages.mjs`
- Possibly modify: components under `apps/web/src/lib/text/`, to fix what the screenshots show

**Interfaces:**
- Consumes: a build listening on `127.0.0.1:4398` (the environment is in `apps/web/scripts/smoke.sh`).
- Produces: screenshots named `pages-<device>-<theme>-text-*.png` in `apps/web/.impeccable/review/`.

- [ ] **Step 1: Capture the text tools' states**

In `apps/web/scripts/capture-pages.mjs`, add after the line `await mo.getByRole('button', { name: 'Yes, clear' }).click();`:

```js
  // The text tools: a generator, several results, a converter empty and filled, a refusal.
  const tool = async (id) => {
    await mo.goto(`${base}/text#${id}`);
    await mo.locator(`a[href="#${id}"][aria-current="true"]`).waitFor();
  };
  await mo.goto(`${base}/text`);
  await mo.locator('[data-ready]').waitFor();
  await shot(mo, 'text-password');
  await mo.getByLabel('How many', { exact: true }).fill('5');
  await mo.getByLabel('Length', { exact: true }).fill('64');
  await shot(mo, 'text-password-many');
  await mo.getByLabel('Length', { exact: true }).fill('4');
  await shot(mo, 'text-password-refused');
  await tool('passphrase');
  await mo.getByTestId('result').first().waitFor();
  await shot(mo, 'text-passphrase');
  await tool('id');
  await mo.getByLabel('Kind', { exact: true }).selectOption({ label: 'UUID version 7' });
  await shot(mo, 'text-identifier');
  await tool('case');
  await shot(mo, 'text-case-empty');
  await mo.getByLabel('Text', { exact: true }).fill("the return of the iPhone: a buyer's guide");
  await shot(mo, 'text-case');
  await tool('encode');
  await mo.getByRole('button', { name: 'Decode', exact: true }).click();
  await mo.getByLabel('Text', { exact: true }).fill('not base64!');
  await shot(mo, 'text-encode-refused');
  await tool('lines');
  await mo.getByLabel('Text', { exact: true }).fill('pear\napple\nfig\napple');
  await mo.getByRole('button', { name: 'Remove repeats' }).click();
  await mo.getByLabel('Order', { exact: true }).selectOption({ label: 'A to Z' });
  await shot(mo, 'text-lines');
  await tool('count');
  await mo.getByLabel('Text', { exact: true }).fill('Hello, wide world');
  await shot(mo, 'text-count');
```

- [ ] **Step 2: Build, serve and capture**

Read `apps/web/scripts/smoke.sh` for the environment a build on port 4398 needs, start the build with that environment in the background, then:

```bash
cd apps/web
node scripts/capture-pages.mjs
```

Expected: `captured`, and 40 new files named `pages-*-text-*.png` (ten states, two widths, two themes). Stop the server afterwards.

- [ ] **Step 3: Inspect, once**

Open the desktop and phone captures of `text-password`, `text-password-many`, `text-case` and `text-encode-refused`, in light and in dark, and the home page captures. Check against `DESIGN.md` and the design direction:

- one yellow button on the page, and it is the rail's first control;
- no red anywhere on `/text`;
- the open tool's link holds the inverted fill, readable in both themes;
- the tool rows wrap cleanly on the phone and share the band's gutter;
- on the desktop the rail sits beside the options and is not taller than the window with one result;
- a 64-character password wraps inside its row; the Copy button keeps its size;
- the dashed "not yet" outline shows on the empty converter;
- the home page's three rows are evenly set and each has its yellow link.

Then run the mechanical detector once:

```bash
/Users/santhoshj/.claude/skills/impeccable/scripts/impeccable detect --json apps/web/src/lib/text apps/web/src/routes/text
```

Fix everything the screenshots and the detector show in one batch, in the component that owns it, using existing tokens only. Capture once more to confirm, and stop there.

- [ ] **Step 4: Run the browser tests again and commit**

Run: `pnpm --filter @pokerji/web typecheck && pnpm --filter @pokerji/web e2e`
Expected: PASS.

```bash
pnpm format
git add apps/web
git commit -m "docs: screenshots of the text tools' states"
```

---

### Task 7: The documents

**Files:**
- Modify: `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: the page as built. Where the build differs from the wording below, write what was built.

- [ ] **Step 1: `PRODUCT.md`**

- In "Stack", change "they are shared by both tools from there" to "they are shared by every tool from there".
- In "Users", add a paragraph: "The text tools are used by one person in the middle of other work, most often a developer or an administrator at a desk: they open the page, take one result and leave."
- In "Product Purpose", change "Its second is" sentence's paragraph to end with: "Its third is a set of text generators and converters: passwords, passphrases, random strings, identifiers, case, encoding, hashes. Success there is a strong password on the clipboard with one press."
- In "Capabilities and Constraints", add: "The text tools' behaviour is specified in `docs/superpowers/specs/2026-10-14-text-tools-design.md`. They run entirely in the browser: nothing typed or made reaches the server, and nothing is stored anywhere. Surface: `/text`."

- [ ] **Step 2: `DESIGN.md`**

Add this section after "The markup builder" section and its Named Rules, before "Do's and Don'ts":

```markdown
## The text tools

The tools at `/text` are a sibling of the markup builder: a band, two rows of tools, then a floor (what you set or type) and a rail (what you take away). They add no colour, typeface, radius or shadow, and no checkbox.

- **Layout:** from 64rem, two columns with the builder's measurements: the options up to 40rem wide and the rail between 22rem and 36rem, which stays in view. Below 64rem the rail follows the options in one column. There is no dock: it would cover the text being typed.
- **The next step:** the rail's first control is the page's one yellow button, set as the room's Reveal is. It reads Generate again on a generator, Copy on a converter with one result and Copy all on a converter with several. No red appears on this page.
- **Tool row:** a `nav` of links drawn as compact buttons, in two rows that wrap, headed Generate and Convert in the display face (800, 1.25rem). The open tool's link carries `aria-current` and the inverted fill. They are links because each names a place, the tool's fragment.
- **Result row:** one result to a ruled line: an optional name in soft ink at 0.95rem, the value in the system monospace at 0.875rem, and a compact Copy at the right. The value wraps anywhere; nothing is cut short and nothing scrolls sideways. A count has no button of its own.
- **On or off:** a compact button with `aria-pressed`; on is the inverted fill. Used for every yes-or-no option.
- **Strength:** a sentence ("Strength: 128 bits"), never a meter, a bar or a colour.
- **Not there yet:** the dashed outline, as in the builder.
- **A refusal:** the status box with a sentence that names the limit. A generator keeps its last good results beneath it.
```

Add to the builder's Named Rules block, or directly after the section above:

```markdown
**The First Control Rule.** In a rail, the yellow button comes first and is the next step. It changes its word with the tool, never its place.
```

Then check for drift between `DESIGN.md` and its sidecar:

```bash
/Users/santhoshj/.claude/skills/impeccable/scripts/impeccable context --target apps/web/src/routes/text | grep -A6 CONTEXT_STALE
```

Expected: no `CONTEXT_STALE` line. If there is one, report it in the final message; do not repair it as a side effect.

- [ ] **Step 3: `CLAUDE.md`**

In "Status", after the sentence about the Schema.org markup builder, add: "The third tool, the text generators and converters at `/text`, is built too; it also runs entirely in the browser."

In "Commands", after the markup builder's package line, add:

```markdown
- The text tools' package: `pnpm --filter @pokerji/text-tools test`
```

In "Architecture", after the block of bullets about the builder, add:

```markdown
- `packages/text-tools`: the text tools' rules as pure functions: unbiased sampling, the generators, the converters and the word list reader. No I/O, no DOM, no dependency. Randomness and the clock are arguments (`random`, `now`), never reached for; a test (`purity.test.ts`) enforces that and allows only the package's own files to be imported. Every exported function returns a `Result` and none throws.
- Every random choice goes through `below` in `packages/text-tools/src/random.ts`, which draws again instead of taking a remainder. Never use `Math.random` or a remainder of a random value, in the package or the page.
- A strength figure must be the true one for the rule. `passwordBits` counts the allowed passwords exactly; change a rule and its figure together.
- The text tools' page (`apps/web/src/routes/text`, components in `apps/web/src/lib/text`) has no server code, like the builder's. It also stores nothing: no local or session storage, no cookie, nothing in the address but the open tool's name in the fragment. Browser tests check that no request carries anything typed or made and that nothing is stored. Keep it that way.
- The tools are drawn only after the page has mounted in a browser (`ready` in the page). The server could make a password too, and it would then cross the network, so it is never asked to; a test checks the page's HTML holds no result.
- The EFF long word list is vendored exactly as published at `apps/web/static/text/eff_large_wordlist.txt`, with its checksum in `LICENSES.md` beside it and in `WORD_LIST_SHA256` (a test compares the three). The page fetches it from this site only when the passphrase tool is opened, and checks its checksum and its shape before using a word.
- The text tools' fields set `spellcheck="false"`, `autocomplete="off"`, `autocapitalize="off"` and `autocorrect="off"`, and typed and generated values are rendered as text only, never as HTML.
```

In the bullet that lists the public pages, change "(home, `/poker`, `/schema`, `/privacy`)" to "(home, `/poker`, `/schema`, `/text`, `/privacy`)".

- [ ] **Step 4: `README.md`**

After "The markup builder" section, add:

```markdown
## The text tools

At `/text`. Generators: passwords (with an exact strength figure and an option to leave out look-alike characters), passphrases from the EFF long word list, random strings in hex, Base64 and other alphabets, PINs and numbers, UUID v4 and v7, ULID and short identifiers, dice, coins and picks from a list. Converters: twelve case forms, slugs, Base64, hex, URL and HTML entity encoding both ways, SHA-2 hashes, line tools and counts.

They run entirely in your browser. Every random choice comes from the browser's cryptographic random source, without bias. Nothing typed or made is sent to the server, and nothing is stored anywhere.
```

In the "How it is built" table, add a row after the `schema-builder` row:

```markdown
| [`packages/text-tools`](packages/text-tools) | The text tools' rules as pure functions: unbiased sampling, the generators, the converters and a reader for the bundled word list |
```

and change the `apps/web` row's last words from "the live room and the markup builder's page" to "the live room, the markup builder's page and the text tools' page".

Read the top of `README.md` and bring any sentence that says the suite has two tools up to date.

- [ ] **Step 5: Check and commit**

Run: `pnpm format:check && pnpm test && pnpm typecheck`
Expected: all pass.

```bash
git add PRODUCT.md DESIGN.md CLAUDE.md README.md
git commit -m "docs: the suite has three tools"
```

---

### Task 8: Review and release check

**Files:**
- Possibly modify: anything the reviews find

**Interfaces:**
- Consumes: the whole branch, `main..HEAD`.

- [ ] **Step 1: Code review**

Dispatch the `octo:skills:octopus-code-review` agent on `main..HEAD`, with both spec paths, both plan paths, this plan's Review Focus and the minors deferred from Plan 1's review, which are:

- title case counts a punctuation-only token as a first, last or after-colon word (`- the quick fox` keeps "the" small);
- upper, lower and sentence case keep `\r\n` while the other forms write `\n`;
- `&#150;` decodes to a control character where browsers show a dash, and numbers over 8 digits are left as typed;
- Base64 decoding accepts some malformed padding (`=`, `QUI==`) and non-zero trailing bits;
- hex decoding strips colons and spaces anywhere, not only between bytes;
- `passphrase` trusts its list on length alone;
- the word list reader checks the shape of dice numbers, not that each is distinct;
- `below`'s uniformity is tested exhaustively only for a one-byte bound.

 Ask for findings with file and line, a concrete input, and actual against expected behaviour.

- [ ] **Step 2: Security audit**

Dispatch the `octo:skills:octopus-security-audit` agent on `main..HEAD`. Ask it to check, in particular:

- that no path exists by which typed or generated text reaches a request, a log, storage or the address;
- that the server cannot render a generated value;
- that every random choice is unbiased and fails closed;
- that every value is rendered as text, and that decoding HTML entities cannot inject markup;
- that the address fragment cannot select anything but a listed tool;
- that the word list is verified before use, and what happens when it is not;
- that the Content Security Policy still holds on `/text`, with no new source allowed;
- that no regular expression can stall the page on 100,000 characters.

- [ ] **Step 3: Fix what they find**

Sort the findings by their effect on a person using the tools. Fix every Critical and Important one, each with a test that fails first. Record each Minor that is not fixed, to report to the owner.

- [ ] **Step 4: The release check**

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm --filter @pokerji/web e2e
pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke
docker build -t pokerji-text-check .
```

Expected: all pass, and the image builds. Remove the image afterwards with `docker rmi pokerji-text-check`.

- [ ] **Step 5: Commit, and hand back**

```bash
git add -A apps packages docs PRODUCT.md DESIGN.md CLAUDE.md README.md
git commit -m "fix: apply the code review and security audit to the text tools"
```

Report to the owner: what was built, the test counts, every finding fixed, every Minor left, and every decision taken on their behalf. Merging to `main` and deploying are the owner's actions; ask before merging.
