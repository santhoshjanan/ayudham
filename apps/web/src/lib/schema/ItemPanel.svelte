<script lang="ts">
  import {
    LIMITS,
    searchTypes,
    topDefinition,
    typeLabel,
    valuesOf,
    type Item,
  } from '@ayudham/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import { pathId } from './ids.ts';
  import ItemFields from './ItemFields.svelte';
  import Picker from './Picker.svelte';
  import Vocab from './Vocab.svelte';

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
  const ownId = $derived(`id-${pathId(at)}`);
  let retyping = $state(false);
  const toggleRetype = () => {
    retyping = !retyping;
    if (retyping) void builder.loadVocabulary();
  };
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
      <button type="button" class="compact" aria-expanded={retyping} onclick={toggleRetype}
        >Change type</button
      >
      <button
        type="button"
        class="compact danger"
        aria-label="Remove this {label}"
        onclick={() => builder.removeItem(item.key)}>Remove item</button
      >
    </div>
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

    <ItemFields {builder} {at} {item} {definition} depth={1} />

    <div class="identifier">
      <label for={ownId}>Identifier</label>
      <p class="hint" id="{ownId}-hint">
        Optional. An address that names this item, written as its <code class="inline">@id</code>,
        such as https://example.com/#organization. Left empty, an item that another refers to is
        given one such as #organization, which is relative to the page the markup is put on.
      </p>
      <input
        id={ownId}
        type="text"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="{ownId}-hint"
        maxlength={LIMITS.text}
        value={item.id}
        oninput={(event) => builder.setId(at, event.currentTarget.value)}
      />
    </div>
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
  .identifier {
    margin: 0.2rem 0 1.1rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }
  .identifier .hint {
    margin: 0 0 0.4rem;
  }
  .identifier .inline {
    display: inline;
    padding: 0.05rem 0.3rem;
  }
</style>
