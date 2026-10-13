<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    DEFINITIONS,
    GUIDED,
    LIMITS,
    markupParts,
    REFUSAL_WORDS,
    searchTypes,
    type Finding,
    RULES_CHECKED,
    typeLabel,
  } from '@pokerji/schema-builder';
  import CopyButton from '#lib/ui/CopyButton.svelte';
  import { Builder } from './builder.svelte.ts';
  import Findings from './Findings.svelte';
  import { fieldId } from './ids.ts';
  import ItemPanel from './ItemPanel.svelte';
  import Picker from './Picker.svelte';
  import Vocab from './Vocab.svelte';

  const builder = new Builder();
  let ready = $state(false);
  let dialog = $state<HTMLDialogElement>();
  let copyRefused = $state(false);
  let pickingType = $state(false);

  const toggleTypes = () => {
    pickingType = !pickingType;
    if (pickingType) void builder.loadVocabulary();
  };

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
      {#if items.length > 0}
        <p class="clear">
          <button type="button" class="danger" onclick={() => builder.clear()}>Clear</button>
        </p>
      {/if}
    </section>
  </div>

  <aside class="output" class:open={sheetOpen} aria-labelledby="markup-heading">
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
      <Findings {builder} onreveal={reveal} />
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
  .any {
    margin-top: 1.1rem;
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
