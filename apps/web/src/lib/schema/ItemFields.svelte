<script lang="ts">
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
  import type { Builder } from './builder.svelte.ts';
  import FieldRow from './FieldRow.svelte';
  import { pathId } from './ids.ts';
  import Picker from './Picker.svelte';
  import { blankFor } from './values.ts';
  import Vocab from './Vocab.svelte';

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
</style>
